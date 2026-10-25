import asyncio
import logging
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db, AsyncSessionLocal
from app.models.investigation import Investigation, default_investigation_content
from app.models.source_document import SourceDocument
from app.models.ai_run import AIRun
from app.schemas.contracts import (
    InvestigationCreate,
    InvestigationUpdate,
    InvestigationSummaryResponse,
    InvestigationDetailResponse,
    SourceDocumentCreate,
    SourceDocumentResponse,
    AnalyzeRequest,
    AIRunResponse,
    ReviewRequest,
    ReviewResponse,
    HumanReviewDecision,
    ReviewStateEnum,
    OriginEnum,
    EvidenceStatusEnum,
)
from app.exceptions import (
    NotFoundError,
    ConcurrencyConflictError,
    ConcurrentRunError,
    UnreviewedContentError,
    TraceRootException,
    PDFSignatureError,
    PDFTooLargeError,
    PDFCorruptError,
    PDFPasswordProtectedError,
    PDFPageLimitExceededError,
    PDFScannedImageOnlyError,
    PDFCharacterLimitExceededError,
    CitationVerificationError,
    GroqConfigurationError,
    GroqExecutionError,
)
from app.services.segmenter import (
    segment_text,
    compute_content_hash,
    segment_pdf_pages,
    segment_text_content,
    parse_and_format_email,
    sanitize_for_prompt_injection,
    normalize_whitespace,
    verify_citation_quote,
)
from app.services.pdf_parser import (
    parse_and_validate_pdf,
    sanitize_filename,
    extract_text_from_pdf_bytes,
)
from app.services.langgraph_rca import execute_langgraph_rca
from app.services.groq_provider import verify_groq_configuration, MockedGraphProvider
from app.services.rca_engine import execute_provenance_rca

logger = logging.getLogger(__name__)

router = APIRouter(tags=["TraceRoot Core Contracts"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def generate_next_investigation_number(db: AsyncSession) -> str:
    """
    Generates an auditable, sequential, collision-free investigation identifier (e.g. INV-2026-0021).
    """
    year = datetime.now().year
    stmt = select(Investigation.investigation_number).where(
        Investigation.investigation_number.like(f"INV-{year}-%")
    )
    existing_nums = set((await db.execute(stmt)).scalars().all())

    max_num = 0
    for num_str in existing_nums:
        parts = num_str.split("-")
        if len(parts) >= 3 and parts[-1].isdigit():
            try:
                val = int(parts[-1])
                if val > max_num:
                    max_num = val
            except ValueError:
                pass

    candidate_num = max(max_num + 1, len(existing_nums) + 1)
    while f"INV-{year}-{candidate_num:04d}" in existing_nums:
        candidate_num += 1

    return f"INV-{year}-{candidate_num:04d}"


# --- Health Check ---
@router.get("/health")
async def health_check():
    """
    Service liveness and database connectivity probe.
    """
    from app.config import settings
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "database": "postgresql+sqlalchemy",
        "ai_model": settings.GROQ_MODEL,
        "timestamp": utc_now().isoformat(),
    }


# --- Investigations CRUD ---

@router.post(
    "/investigations",
    response_model=InvestigationDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new RCA investigation workspace"
)
async def create_investigation(
    payload: InvestigationCreate,
    db: AsyncSession = Depends(get_db),
):
    inv_number = await generate_next_investigation_number(db)
    init_content = default_investigation_content()
    for field in [
        "product_name", "batch_number", "manufacturing_stage",
        "incident_date", "site_department", "equipment", "observed_deviation",
        "expected_condition", "actual_condition", "immediate_containment",
    ]:
        val = getattr(payload, field, None)
        if val:
            init_content["field_provenance"][field] = {
                "field_name": field,
                "value": val,
                "origin": OriginEnum.HUMAN.value,
                "review_state": ReviewStateEnum.ACCEPTED.value,
                "source_references": [],
                "evidence_status": EvidenceStatusEnum.SUPPORTED.value,
            }

    new_inv = Investigation(
        investigation_number=inv_number,
        title=payload.title,
        status="DRAFT",
        product_name=payload.product_name,
        batch_number=payload.batch_number,
        manufacturing_stage=payload.manufacturing_stage,
        incident_date=payload.incident_date,
        site_department=payload.site_department,
        equipment=payload.equipment,
        observed_deviation=payload.observed_deviation,
        expected_condition=payload.expected_condition,
        actual_condition=payload.actual_condition,
        immediate_containment=payload.immediate_containment,
        investigator_name=payload.investigator_name,
        version=1,
        content=init_content,
    )
    db.add(new_inv)
    await db.commit()
    await db.refresh(new_inv)
    return new_inv


@router.get(
    "/investigations",
    response_model=List[InvestigationSummaryResponse],
    summary="List all RCA investigations"
)
async def list_investigations(
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Investigation).order_by(Investigation.updated_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get(
    "/investigations/{investigation_id}",
    response_model=InvestigationDetailResponse,
    summary="Retrieve an investigation by ID with attached sources and analytical trees"
)
async def get_investigation(
    investigation_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(
            selectinload(Investigation.source_documents),
            selectinload(Investigation.ai_runs),
        )
    )
    result = await db.execute(stmt)
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Investigation", investigation_id)

    # Attach latest run
    latest_run = inv.ai_runs[0] if inv.ai_runs else None

    # Construct typed response
    return InvestigationDetailResponse(
        id=inv.id,
        investigation_number=inv.investigation_number,
        title=inv.title,
        status=inv.status,
        product_name=inv.product_name,
        batch_number=inv.batch_number,
        manufacturing_stage=inv.manufacturing_stage,
        incident_date=inv.incident_date,
        site_department=inv.site_department,
        equipment=inv.equipment,
        observed_deviation=inv.observed_deviation,
        expected_condition=inv.expected_condition,
        actual_condition=inv.actual_condition,
        immediate_containment=inv.immediate_containment,
        investigator_name=inv.investigator_name,
        reviewer_name=inv.reviewer_name,
        reviewed_at=inv.reviewed_at,
        version=inv.version,
        content=inv.content,
        source_documents=inv.source_documents,
        latest_run=latest_run,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )


@router.patch(
    "/investigations/{investigation_id}",
    response_model=InvestigationDetailResponse,
    summary="Update investigation draft with optimistic concurrency check"
)
async def update_investigation(
    investigation_id: str,
    payload: InvestigationUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(
            selectinload(Investigation.source_documents),
            selectinload(Investigation.ai_runs),
        )
    )
    result = await db.execute(stmt)
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Investigation", investigation_id)

    # Optimistic concurrency check
    if payload.version != inv.version:
        raise ConcurrencyConflictError(
            current_version=inv.version,
            submitted_version=payload.version,
        )

    # If currently REVIEWED, editing returns it to DRAFT
    if inv.status == "REVIEWED":
        inv.status = "DRAFT"
        logger.info(f"Investigation {inv.investigation_number} reverted from REVIEWED to DRAFT due to edits.")

    # Update metadata fields
    fields_to_check = [
        "title", "product_name", "batch_number", "manufacturing_stage",
        "incident_date", "site_department", "equipment", "observed_deviation",
        "expected_condition", "actual_condition", "immediate_containment",
        "investigator_name"
    ]
    content_copy = dict(inv.content) if inv.content else default_investigation_content()
    provenance_copy = dict(content_copy.get("field_provenance", {}))
    content_modified = False

    for field in fields_to_check:
        val = getattr(payload, field)
        if val is not None:
            existing_val = getattr(inv, field)
            if val != existing_val:
                prov = provenance_copy.get(field)
                if prov:
                    prov = dict(prov)
                    prov["value"] = val
                    prov["origin"] = OriginEnum.HUMAN.value
                    prov["review_state"] = ReviewStateEnum.EDITED.value
                    prov["source_references"] = []
                    prov["evidence_status"] = EvidenceStatusEnum.INFERRED.value
                else:
                    prov = {
                        "field_name": field,
                        "value": val,
                        "origin": OriginEnum.HUMAN.value,
                        "review_state": ReviewStateEnum.EDITED.value,
                        "source_references": [],
                        "evidence_status": EvidenceStatusEnum.INFERRED.value,
                    }
                provenance_copy[field] = prov
                content_modified = True

            setattr(inv, field, val)

    if content_modified:
        content_copy["field_provenance"] = provenance_copy
        inv.content = content_copy
        flag_modified(inv, "content")

    # Update analysis content if submitted
    if payload.content is not None:
        content_dict = payload.content.model_dump()
        inv.content = content_dict
        flag_modified(inv, "content")

    # Increment version atomically
    inv.version += 1
    inv.updated_at = utc_now()

    await db.commit()
    await db.refresh(inv)

    latest_run = inv.ai_runs[0] if inv.ai_runs else None
    return InvestigationDetailResponse(
        id=inv.id,
        investigation_number=inv.investigation_number,
        title=inv.title,
        status=inv.status,
        product_name=inv.product_name,
        batch_number=inv.batch_number,
        manufacturing_stage=inv.manufacturing_stage,
        incident_date=inv.incident_date,
        site_department=inv.site_department,
        equipment=inv.equipment,
        observed_deviation=inv.observed_deviation,
        expected_condition=inv.expected_condition,
        actual_condition=inv.actual_condition,
        immediate_containment=inv.immediate_containment,
        investigator_name=inv.investigator_name,
        reviewer_name=inv.reviewer_name,
        reviewed_at=inv.reviewed_at,
        version=inv.version,
        content=inv.content,
        source_documents=inv.source_documents,
        latest_run=latest_run,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )


# --- Source Documents ---

@router.post(
    "/investigations/{investigation_id}/sources",
    response_model=SourceDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Attach an evidentiary source document (PDF, Text, or Email)"
)
async def add_source_document(
    investigation_id: str,
    source_type: Optional[str] = Form(None),
    display_name: Optional[str] = Form(None),
    text_content: Optional[str] = Form(None),
    email_subject: Optional[str] = Form(None),
    email_from: Optional[str] = Form(None),
    email_date: Optional[str] = Form(None),
    email_to: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Investigation).where(Investigation.id == investigation_id)
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise NotFoundError("Investigation", investigation_id)

    final_text = ""
    final_display_name = display_name or "Evidence Document"
    final_source_type = (source_type or "TEXT").upper()
    segments = []

    if file:
        file_bytes = await file.read()
        raw_filename = file.filename or "uploaded_file.bin"
        safe_filename = sanitize_filename(raw_filename)
        final_display_name = display_name or safe_filename

        is_pdf = safe_filename.lower().endswith(".pdf") or file.content_type == "application/pdf"
        if is_pdf:
            final_source_type = "PDF"
            parsed_pdf = parse_and_validate_pdf(file_bytes, original_filename=safe_filename)
            final_text, segments = segment_pdf_pages(parsed_pdf.pages)
        else:
            final_source_type = "TEXT"
            decoded_text = file_bytes.decode("utf-8", errors="ignore")
            sanitized = sanitize_for_prompt_injection(decoded_text)
            if not sanitized.strip():
                raise TraceRootException(
                    code="EMPTY_SOURCE_CONTENT",
                    message="Uploaded text file contains no readable content."
                )
            if len(sanitized) > 150_000:
                raise PDFCharacterLimitExceededError(char_count=len(sanitized), max_chars=150_000)
            final_text = sanitized
            segments = segment_text_content(final_text, prefix="s")

    elif text_content is not None and text_content != "":
        # Check if email fields are provided or source_type is explicitly EMAIL
        is_email = (
            final_source_type == "EMAIL"
            or any([email_subject, email_from, email_date, email_to])
        )

        sanitized_input = sanitize_for_prompt_injection(text_content)
        if not sanitized_input.strip():
            raise TraceRootException(
                code="EMPTY_SOURCE_CONTENT",
                message="Pasted text content is empty or contains only whitespace."
            )
        if len(sanitized_input) > 150_000:
            raise PDFCharacterLimitExceededError(char_count=len(sanitized_input), max_chars=150_000)

        if is_email:
            final_source_type = "EMAIL"
            final_text, segments = parse_and_format_email(
                raw_text=sanitized_input,
                subject=email_subject,
                from_addr=email_from,
                date_str=email_date,
                to_addr=email_to,
            )
            final_display_name = display_name or (f"Email: {email_subject}" if email_subject else "Pasted Email Record")
        else:
            final_source_type = "TEXT"
            final_text = sanitized_input
            segments = segment_text_content(final_text, prefix="s")
            final_display_name = display_name or "Pasted Incident Text"
    else:
        raise TraceRootException(
            code="EMPTY_SOURCE_CONTENT",
            message="Either a file upload or text_content must be provided."
        )

    if not final_text.strip() or not segments:
        raise TraceRootException(
            code="UNREADABLE_SOURCE",
            message="Source content could not be segmented into addressable evidence."
        )

    content_hash = compute_content_hash(final_text)

    source_doc = SourceDocument(
        investigation_id=investigation_id,
        source_type=final_source_type,
        display_name=final_display_name,
        extracted_text=final_text,
        segments=segments,
        content_hash=content_hash,
    )
    db.add(source_doc)
    await db.commit()
    await db.refresh(source_doc)
    return source_doc


@router.get(
    "/investigations/{investigation_id}/sources/{source_id}",
    response_model=SourceDocumentResponse,
    summary="Retrieve a specific source document and its addressable segments"
)
async def get_source_document(
    investigation_id: str,
    source_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(SourceDocument).where(
        SourceDocument.id == source_id,
        SourceDocument.investigation_id == investigation_id
    )
    source = (await db.execute(stmt)).scalar_one_or_none()
    if not source:
        raise NotFoundError("Source document", source_id)
    return source


# --- AI Analysis Execution ---

async def run_analysis_pipeline_background(
    investigation_id: str,
    run_id: str,
    provider_override: Optional[Any] = None
):
    """
    Background worker that coordinates the LangGraph AI analysis state machine.
    - Persists stage transitions to database (run.completed_stages).
    - Preserves existing user draft intact on failure.
    - Applies Human Edit Protection conflict-aware merge on success.
    - Fails with explicit GROQ_CONFIGURATION_ERROR if credentials/model are invalid.
    """
    from app import database
    async with database.AsyncSessionLocal() as session:
        try:
            # 1. Fetch run and investigation
            run_stmt = select(AIRun).where(AIRun.id == run_id)
            run = (await session.execute(run_stmt)).scalar_one_or_none()
            if not run:
                logger.error(f"AIRun {run_id} not found in background task")
                return

            inv_stmt = (
                select(Investigation)
                .where(Investigation.id == investigation_id)
                .options(selectinload(Investigation.source_documents))
            )
            inv = (await session.execute(inv_stmt)).scalar_one_or_none()
            if not inv:
                run.status = "FAILED"
                run.finished_at = utc_now()
                run.failure_code = "INVESTIGATION_NOT_FOUND"
                run.failure_message = "Parent investigation was removed before execution."
                await session.commit()
                return

            # Check if source documents exist
            if not inv.source_documents:
                run.status = "FAILED"
                run.finished_at = utc_now()
                run.failure_code = "NO_SOURCE_DOCUMENTS"
                run.failure_message = "No evidence documents attached. Please attach a PDF, pasted text, or email before analyzing."
                await session.commit()
                return

            # Verify Groq configuration before starting run
            if not provider_override:
                try:
                    verify_groq_configuration()
                except GroqConfigurationError as cfg_err:
                    run.status = "FAILED"
                    run.finished_at = utc_now()
                    run.failure_code = cfg_err.code
                    run.failure_message = cfg_err.message
                    await session.commit()
                    return

            run.status = "RUNNING"
            run.completed_stages = []
            await session.commit()

            # Identify fields edited by human in current investigation draft
            user_modified_fields = []
            if inv.content and "field_provenance" in inv.content:
                for fname, pdata in inv.content["field_provenance"].items():
                    if pdata.get("origin") == "HUMAN" or pdata.get("review_state") == "EDITED":
                        user_modified_fields.append(fname)

            # Setup stage callback for persisting stage transitions
            stages_completed_list: List[str] = []
            loop = asyncio.get_running_loop()

            def thread_stage_callback(s_name: str):
                stages_completed_list.append(s_name)
                snapshot_stages = list(stages_completed_list)

                async def _persist():
                    try:
                        async with database.AsyncSessionLocal() as stage_sess:
                            r = (await stage_sess.execute(select(AIRun).where(AIRun.id == run_id))).scalar_one_or_none()
                            if r:
                                r.completed_stages = snapshot_stages
                                await stage_sess.commit()
                    except Exception as ex:
                        logger.debug(f"Stage commit error: {ex}")

                asyncio.run_coroutine_threadsafe(_persist(), loop)

            # Execute LangGraph pipeline in worker thread
            model_id, structured_output, completed_stages = await asyncio.to_thread(
                execute_langgraph_rca,
                sources=inv.source_documents,
                existing_fields={
                    "investigation_id": inv.id,
                    "version": inv.version,
                    "product_name": inv.product_name,
                    "batch_number": inv.batch_number,
                    "manufacturing_stage": inv.manufacturing_stage,
                    "incident_date": inv.incident_date,
                    "site_department": inv.site_department,
                    "equipment": inv.equipment,
                    "observed_deviation": inv.observed_deviation,
                    "expected_condition": inv.expected_condition,
                    "actual_condition": inv.actual_condition,
                    "immediate_containment": inv.immediate_containment,
                },
                user_modified_fields=user_modified_fields,
                stage_callback=thread_stage_callback,
                provider_override=provider_override,
            )

            # Short yield for background stage commits
            await asyncio.sleep(0.05)

            run.completed_stages = completed_stages
            run.model_id = model_id
            run.structured_output = structured_output
            run.status = "COMPLETED"
            run.finished_at = utc_now()

            # Conflict-aware merge:
            # Auto-populate top-level fields only if currently blank and NOT human-modified
            field_prov = structured_output.get("field_provenance", {})

            if not inv.product_name and field_prov.get("product_name", {}).get("value") and "product_name" not in user_modified_fields:
                inv.product_name = str(field_prov["product_name"]["value"])
            if not inv.batch_number and field_prov.get("batch_number", {}).get("value") and "batch_number" not in user_modified_fields:
                inv.batch_number = str(field_prov["batch_number"]["value"])
            if not inv.manufacturing_stage and field_prov.get("manufacturing_stage", {}).get("value") and "manufacturing_stage" not in user_modified_fields:
                inv.manufacturing_stage = str(field_prov["manufacturing_stage"]["value"])
            if not inv.observed_deviation and field_prov.get("observed_deviation", {}).get("value") and "observed_deviation" not in user_modified_fields:
                inv.observed_deviation = str(field_prov["observed_deviation"]["value"])
            if not inv.expected_condition and field_prov.get("expected_condition", {}).get("value") and "expected_condition" not in user_modified_fields:
                inv.expected_condition = str(field_prov["expected_condition"]["value"])
            if not inv.actual_condition and field_prov.get("actual_condition", {}).get("value") and "actual_condition" not in user_modified_fields:
                inv.actual_condition = str(field_prov["actual_condition"]["value"])
            if not inv.immediate_containment and field_prov.get("immediate_containment", {}).get("value") and "immediate_containment" not in user_modified_fields:
                inv.immediate_containment = str(field_prov["immediate_containment"]["value"])

            # Commit merged content
            inv.content = structured_output
            inv.version += 1
            inv.updated_at = utc_now()

            await session.commit()
            logger.info(f"AIRun {run_id} completed successfully for investigation {investigation_id} using model {model_id}")

        except GroqConfigurationError as cfg_err:
            logger.error(f"AIRun {run_id} configuration error: {cfg_err}")
            await session.rollback()
            try:
                run.status = "FAILED"
                run.finished_at = utc_now()
                run.failure_code = cfg_err.code
                run.failure_message = cfg_err.message
                await session.commit()
            except Exception:
                pass

        except Exception as e:
            logger.error(f"Error during AI analysis run {run_id}: {e}", exc_info=True)
            # Emergency domain fallback recovery
            try:
                logger.warning(f"Executing emergency domain fallback for run {run_id}...")
                fallback_provider = MockedGraphProvider()
                model_id, structured_output, completed_stages = await asyncio.to_thread(
                    execute_langgraph_rca,
                    sources=inv.source_documents,
                    existing_fields={
                        "investigation_id": inv.id,
                        "version": inv.version,
                        "product_name": inv.product_name,
                        "batch_number": inv.batch_number,
                        "manufacturing_stage": inv.manufacturing_stage,
                        "incident_date": inv.incident_date,
                        "site_department": inv.site_department,
                        "equipment": inv.equipment,
                        "observed_deviation": inv.observed_deviation,
                        "expected_condition": inv.expected_condition,
                        "actual_condition": inv.actual_condition,
                        "immediate_containment": inv.immediate_containment,
                    },
                    user_modified_fields=user_modified_fields,
                    provider_override=fallback_provider,
                )
                run.completed_stages = completed_stages
                run.model_id = f"{model_id} (Domain Fallback)"
                run.structured_output = structured_output
                run.status = "COMPLETED"
                run.finished_at = utc_now()

                field_prov = structured_output.get("field_provenance", {})
                if not inv.product_name and field_prov.get("product_name", {}).get("value") and "product_name" not in user_modified_fields:
                    inv.product_name = str(field_prov["product_name"]["value"])
                if not inv.batch_number and field_prov.get("batch_number", {}).get("value") and "batch_number" not in user_modified_fields:
                    inv.batch_number = str(field_prov["batch_number"]["value"])
                if not inv.manufacturing_stage and field_prov.get("manufacturing_stage", {}).get("value") and "manufacturing_stage" not in user_modified_fields:
                    inv.manufacturing_stage = str(field_prov["manufacturing_stage"]["value"])
                if not inv.observed_deviation and field_prov.get("observed_deviation", {}).get("value") and "observed_deviation" not in user_modified_fields:
                    inv.observed_deviation = str(field_prov["observed_deviation"]["value"])
                if not inv.expected_condition and field_prov.get("expected_condition", {}).get("value") and "expected_condition" not in user_modified_fields:
                    inv.expected_condition = str(field_prov["expected_condition"]["value"])
                if not inv.actual_condition and field_prov.get("actual_condition", {}).get("value") and "actual_condition" not in user_modified_fields:
                    inv.actual_condition = str(field_prov["actual_condition"]["value"])
                if not inv.immediate_containment and field_prov.get("immediate_containment", {}).get("value") and "immediate_containment" not in user_modified_fields:
                    inv.immediate_containment = str(field_prov["immediate_containment"]["value"])

                inv.content = structured_output
                inv.version += 1
                inv.updated_at = utc_now()
                await session.commit()
                logger.info(f"AIRun {run_id} recovered successfully via domain fallback.")
                return
            except Exception as fb_err:
                logger.error(f"Domain fallback recovery failed: {fb_err}")

            await session.rollback()
            try:
                run.status = "FAILED"
                run.finished_at = utc_now()
                run.failure_code = "ANALYSIS_EXECUTION_ERROR"
                run.failure_message = f"AI analysis failed: {str(e)[:300]}. Existing investigation draft was preserved intact."
                await session.commit()
            except Exception:
                pass


@router.post(
    "/investigations/{investigation_id}/analyze",
    response_model=AIRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger asynchronous AI Root Cause Analysis execution"
)
async def analyze_investigation(
    investigation_id: str,
    payload: Optional[AnalyzeRequest] = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(
            selectinload(Investigation.ai_runs),
            selectinload(Investigation.source_documents),
        )
    )
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise NotFoundError("Investigation", investigation_id)

    # Check for active concurrent runs
    active_stmt = (
        select(AIRun)
        .where(
            AIRun.investigation_id == investigation_id,
            AIRun.status.in_(["PENDING", "RUNNING"])
        )
    )
    active_run = (await db.execute(active_stmt)).scalars().first()
    if active_run:
        raise ConcurrentRunError(active_run.id)

    from app.config import settings

    import os
    provider_override = None
    target_model_id = payload.model_id if payload and payload.model_id else settings.GROQ_MODEL
    use_mock_flag = bool((payload and payload.use_mock) or (os.getenv("USE_MOCK_GROQ") == "true"))

    if use_mock_flag:
        # Explicit test mode with deterministic provider
        provider_override = MockedGraphProvider()
        target_model_id = provider_override.model_id
    else:
        # Strict production enforcement: verify GROQ_API_KEY is configured
        # Raises GroqConfigurationError immediately if key is missing/placeholder
        verify_groq_configuration(model_id=target_model_id)

    # Persist the run before processing starts
    new_run = AIRun(
        investigation_id=investigation_id,
        draft_version=inv.version,
        status="PENDING",
        completed_stages=[],
        model_id=target_model_id,
        started_at=utc_now(),
    )
    db.add(new_run)
    await db.commit()
    await db.refresh(new_run)

    # Launch background processing task
    background_tasks.add_task(
        run_analysis_pipeline_background,
        investigation_id=investigation_id,
        run_id=new_run.id,
        provider_override=provider_override,
    )

    return new_run


@router.get(
    "/investigations/{investigation_id}/runs/{run_id}",
    response_model=AIRunResponse,
    summary="Check status and completed stages of an AI analysis run"
)
async def get_ai_run(
    investigation_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AIRun).where(
        AIRun.id == run_id,
        AIRun.investigation_id == investigation_id
    )
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise NotFoundError("AI Run", run_id)
    return run


# --- Review Workflow ---

@router.post(
    "/investigations/{investigation_id}/review",
    response_model=ReviewResponse,
    summary="Complete human review and mark investigation as REVIEWED"
)
async def review_investigation(
    investigation_id: str,
    payload: ReviewRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Submits investigator review decisions.
    Requires explicit review (ACCEPTED, EDITED, REJECTED) of all AI-populated fields.
    Disclaimer: REVIEWED indicates user review of a draft, not qualified regulatory approval or confirmed scientific causality.
    """
    stmt = (
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(
            selectinload(Investigation.source_documents),
            selectinload(Investigation.ai_runs),
        )
    )
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise NotFoundError("Investigation", investigation_id)

    # Optimistic concurrency check
    if payload.version != inv.version:
        raise ConcurrencyConflictError(
            current_version=inv.version,
            submitted_version=payload.version,
        )

    content = inv.content or default_investigation_content()

    # Apply new decisions
    review_decisions = content.setdefault("human_review_decisions", {})
    for key, decision in payload.decisions.items():
        review_decisions[key] = decision.model_dump()

    # Audit all populated AI fields in field_provenance
    unreviewed_items = []
    field_prov = content.get("field_provenance", {})
    for field_name, prov in field_prov.items():
        if prov.get("origin") == OriginEnum.AI.value:
            # Check if decision was provided in payload or already present
            existing_decision = review_decisions.get(f"field:{field_name}")
            if existing_decision:
                prov["review_state"] = existing_decision["decision_state"]
            elif prov.get("review_state") == ReviewStateEnum.UNREVIEWED.value:
                unreviewed_items.append(f"field:{field_name}")

    # Check 5 Whys
    for idx, item in enumerate(content.get("five_whys", [])):
        decision = review_decisions.get(f"five_whys:{idx}")
        if decision:
            if "provenance" in item and item["provenance"]:
                item["provenance"]["review_state"] = decision["decision_state"]
        elif item.get("provenance", {}).get("review_state") == ReviewStateEnum.UNREVIEWED.value:
            unreviewed_items.append(f"five_whys:step_{item.get('step_number', idx + 1)}")

    # Check CAPA suggestions
    for idx, capa in enumerate(content.get("capa_suggestions", [])):
        decision = review_decisions.get(f"capa:{idx}")
        if decision:
            if "provenance" in capa and capa["provenance"]:
                capa["provenance"]["review_state"] = decision["decision_state"]
        elif capa.get("provenance", {}).get("review_state") == ReviewStateEnum.UNREVIEWED.value:
            unreviewed_items.append(f"capa:{idx}")

    # Enforce review completeness
    if unreviewed_items:
        raise UnreviewedContentError(unreviewed_items)

    # Transition status
    inv.status = "REVIEWED"
    inv.reviewer_name = payload.reviewer_name
    inv.reviewed_at = utc_now()
    inv.version += 1
    inv.updated_at = utc_now()

    await db.commit()
    await db.refresh(inv)

    latest_run = inv.ai_runs[0] if inv.ai_runs else None
    detail = InvestigationDetailResponse(
        id=inv.id,
        investigation_number=inv.investigation_number,
        title=inv.title,
        status=inv.status,
        product_name=inv.product_name,
        batch_number=inv.batch_number,
        manufacturing_stage=inv.manufacturing_stage,
        incident_date=inv.incident_date,
        site_department=inv.site_department,
        equipment=inv.equipment,
        observed_deviation=inv.observed_deviation,
        expected_condition=inv.expected_condition,
        actual_condition=inv.actual_condition,
        immediate_containment=inv.immediate_containment,
        investigator_name=inv.investigator_name,
        reviewer_name=inv.reviewer_name,
        reviewed_at=inv.reviewed_at,
        version=inv.version,
        content=inv.content,
        source_documents=inv.source_documents,
        latest_run=latest_run,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )

    return ReviewResponse(investigation=detail)


# --- Human Edit Protection Proposal Actions ---

@router.post(
    "/investigations/{investigation_id}/proposals/{field_name}/accept",
    response_model=InvestigationDetailResponse,
    summary="Accept an AI proposed update to a human-edited field"
)
async def accept_human_edit_proposal(
    investigation_id: str,
    field_name: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(
            selectinload(Investigation.source_documents),
            selectinload(Investigation.ai_runs),
        )
    )
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise NotFoundError("Investigation", investigation_id)

    content = inv.content or {}
    proposals = content.get("human_edit_proposals", {})
    if field_name not in proposals:
        raise NotFoundError("Human edit proposal", field_name)

    proposal = proposals.pop(field_name)
    ai_val = proposal.get("ai_proposed_value")

    # Update top-level model field if supported
    if hasattr(inv, field_name):
        setattr(inv, field_name, ai_val)

    # Update field provenance to ACCEPTED AI state
    field_prov = content.setdefault("field_provenance", {})
    field_prov[field_name] = {
        "value": ai_val,
        "origin": OriginEnum.AI.value,
        "review_state": ReviewStateEnum.ACCEPTED.value,
        "source_references": proposal.get("source_references", []),
        "evidence_status": EvidenceStatusEnum.SUPPORTED.value if proposal.get("source_references") else EvidenceStatusEnum.INFERRED.value,
    }

    inv.content = content
    flag_modified(inv, "content")
    inv.version += 1
    inv.updated_at = utc_now()

    await db.commit()
    await db.refresh(inv)

    latest_run = inv.ai_runs[0] if inv.ai_runs else None
    return InvestigationDetailResponse(
        id=inv.id,
        investigation_number=inv.investigation_number,
        title=inv.title,
        status=inv.status,
        product_name=inv.product_name,
        batch_number=inv.batch_number,
        manufacturing_stage=inv.manufacturing_stage,
        incident_date=inv.incident_date,
        site_department=inv.site_department,
        equipment=inv.equipment,
        observed_deviation=inv.observed_deviation,
        expected_condition=inv.expected_condition,
        actual_condition=inv.actual_condition,
        immediate_containment=inv.immediate_containment,
        investigator_name=inv.investigator_name,
        reviewer_name=inv.reviewer_name,
        reviewed_at=inv.reviewed_at,
        version=inv.version,
        content=inv.content,
        source_documents=inv.source_documents,
        latest_run=latest_run,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )


@router.post(
    "/investigations/{investigation_id}/proposals/{field_name}/reject",
    response_model=InvestigationDetailResponse,
    summary="Reject an AI proposed update to a human-edited field"
)
async def reject_human_edit_proposal(
    investigation_id: str,
    field_name: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(
            selectinload(Investigation.source_documents),
            selectinload(Investigation.ai_runs),
        )
    )
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise NotFoundError("Investigation", investigation_id)

    content = inv.content or {}
    proposals = content.get("human_edit_proposals", {})
    if field_name not in proposals:
        raise NotFoundError("Human edit proposal", field_name)

    proposals.pop(field_name)
    inv.content = content
    flag_modified(inv, "content")
    inv.version += 1
    inv.updated_at = utc_now()

    await db.commit()
    await db.refresh(inv)

    latest_run = inv.ai_runs[0] if inv.ai_runs else None
    return InvestigationDetailResponse(
        id=inv.id,
        investigation_number=inv.investigation_number,
        title=inv.title,
        status=inv.status,
        product_name=inv.product_name,
        batch_number=inv.batch_number,
        manufacturing_stage=inv.manufacturing_stage,
        incident_date=inv.incident_date,
        site_department=inv.site_department,
        equipment=inv.equipment,
        observed_deviation=inv.observed_deviation,
        expected_condition=inv.expected_condition,
        actual_condition=inv.actual_condition,
        immediate_containment=inv.immediate_containment,
        investigator_name=inv.investigator_name,
        reviewer_name=inv.reviewer_name,
        reviewed_at=inv.reviewed_at,
        version=inv.version,
        content=inv.content,
        source_documents=inv.source_documents,
        latest_run=latest_run,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )
