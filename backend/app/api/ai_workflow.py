import logging
from typing import Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status

from app.schemas.ai import (
    ExtractionRequest,
    ExtractedContext,
    FiveWhysRequest,
    FiveWhysResponse,
    IshikawaRequest,
    IshikawaResponse,
    EvidenceEvaluationRequest,
    EvidenceEvaluationResponse,
    CapaGenerationRequest,
    CapaGenerationResponse,
    FullWorkflowRequest,
    FullWorkflowResponse,
)
from app.services.pdf_parser import extract_text_from_pdf_bytes
from app.services.langgraph_rca import (
    run_extraction_step,
    run_five_whys_step,
    run_ishikawa_step,
    run_evidence_evaluation_step,
    run_capa_step,
    execute_full_rca_workflow,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI RCA Assistant"])


@router.post("/extract", response_model=ExtractedContext)
async def extract_incident_context(payload: ExtractionRequest):
    """
    Step 1: Ingests unstructured incident narrative or email and extracts structured deviation parameters.
    """
    if not payload.text_content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text content cannot be empty."
        )
    return run_extraction_step(payload.text_content, payload.source_name or "Pasted Text")


@router.post("/parse-pdf", response_model=Dict[str, Any])
async def upload_pdf_evidence(
    file: UploadFile = File(...)
):
    """
    Uploads a PDF deviation or laboratory report, extracts text content,
    and runs initial context extraction.
    """
    if not file.filename.lower().endswith(".pdf") and not file.content_type.startswith("application/pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a PDF document."
        )
    try:
        content_bytes = await file.read()
        extracted_text = extract_text_from_pdf_bytes(content_bytes)
        context = run_extraction_step(extracted_text, file.filename)
        return {
            "filename": file.filename,
            "raw_text": extracted_text,
            "extracted_context": context,
        }
    except Exception as e:
        logger.error(f"Error parsing uploaded PDF: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to extract text from PDF: {str(e)}"
        )


@router.post("/five-whys", response_model=FiveWhysResponse)
async def generate_five_whys(payload: FiveWhysRequest):
    """
    Step 2: Constructs a structured 5 Whys deductive reasoning tree progressing from symptoms to systemic cause.
    """
    if not payload.observed_event.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Observed event is required for 5 Whys analysis."
        )
    return run_five_whys_step(
        observed_event=payload.observed_event,
        unit_op=payload.unit_operation or "",
        immediate_containment=payload.immediate_containment or "",
        context_text=payload.context_text or ""
    )


@router.post("/ishikawa", response_model=IshikawaResponse)
async def generate_ishikawa_factors(payload: IshikawaRequest):
    """
    Step 3: Performs a 6M Ishikawa (Fishbone) analysis across Machine, Material, Method, Measurement, Man, Environment.
    """
    if not payload.observed_event.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Observed event is required for Ishikawa analysis."
        )
    return run_ishikawa_step(
        observed_event=payload.observed_event,
        root_cause_summary=payload.root_cause_summary or "",
        context_text=payload.context_text or ""
    )


@router.post("/evidence-evaluation", response_model=EvidenceEvaluationResponse)
async def evaluate_evidence(payload: EvidenceEvaluationRequest):
    """
    Step 4: Assesses evidence completeness, contrasts supporting vs contradictory data, and flags missing GMP records.
    """
    return run_evidence_evaluation_step(
        observed_event=payload.observed_event,
        root_cause_summary=payload.root_cause_summary or "",
        context_text=payload.context_text
    )


@router.post("/capa", response_model=CapaGenerationResponse)
async def generate_capas(payload: CapaGenerationRequest):
    """
    Step 5: Formulates an ICH Q10-compliant CAPA matrix (Containment, Corrective, Preventive) with Effectiveness Checks.
    """
    if not payload.observed_event.strip() or not payload.root_cause_summary.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both observed event and root cause summary are required for CAPA generation."
        )
    return run_capa_step(
        observed_event=payload.observed_event,
        root_cause_summary=payload.root_cause_summary,
        contributing_factors=payload.contributing_factors or [],
        unit_op=payload.unit_operation or ""
    )


@router.post("/full-auto-draft", response_model=FullWorkflowResponse)
async def execute_full_auto_draft(payload: FullWorkflowRequest):
    """
    Executes the entire LangGraph AI Root Cause Analysis workflow in a single coordinated sequence.
    """
    if not payload.text_content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Input text content cannot be empty."
        )
    return execute_full_rca_workflow(payload.text_content, payload.source_name or "Incident Record")
