import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.investigation import Investigation
from app.models.evidence import EvidenceItem
from app.models.five_whys import FiveWhysStep
from app.models.ishikawa import IshikawaFactor
from app.models.capa import CapaItem, MissingEvidenceItem
from app.schemas.investigation import (
    InvestigationCreate,
    InvestigationUpdate,
    InvestigationSummaryResponse,
    InvestigationDetailResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investigations", tags=["Investigations"])


@router.get("", response_model=List[InvestigationSummaryResponse])
async def list_investigations(db: AsyncSession = Depends(get_db)):
    """
    List all RCA investigations ordered by most recently updated.
    """
    stmt = select(Investigation).order_by(Investigation.updated_at.desc())
    result = await db.execute(stmt)
    records = result.scalars().all()
    return records


@router.post("", response_model=InvestigationDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_investigation(
    payload: InvestigationCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Initialize a new RCA investigation workspace.
    """
    investigation = Investigation(
        title=payload.title,
        deviation_number=payload.deviation_number,
        facility=payload.facility,
        product_name=payload.product_name,
        batch_number=payload.batch_number,
        unit_operation=payload.unit_operation,
        incident_date=payload.incident_date,
        reported_by=payload.reported_by,
        investigation_lead=payload.investigation_lead,
        status=payload.status.value if payload.status else "DRAFT",
        observed_event=payload.observed_event,
        immediate_containment=payload.immediate_containment,
        suspected_timeline=payload.suspected_timeline,
        root_cause_summary=payload.root_cause_summary,
        uncertainty_notes=payload.uncertainty_notes,
    )
    db.add(investigation)
    await db.commit()
    await db.refresh(investigation)
    return investigation


@router.get("/{investigation_id}", response_model=InvestigationDetailResponse)
async def get_investigation(
    investigation_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve full investigation workspace by ID with all analytical trees and evidence.
    """
    stmt = (
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(
            selectinload(Investigation.evidence_items),
            selectinload(Investigation.five_whys_steps),
            selectinload(Investigation.ishikawa_factors),
            selectinload(Investigation.missing_evidence_items),
            selectinload(Investigation.capa_items),
        )
    )
    result = await db.execute(stmt)
    investigation = result.scalar_one_or_none()
    if not investigation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Investigation '{investigation_id}' not found"
        )
    return investigation


@router.put("/{investigation_id}", response_model=InvestigationDetailResponse)
async def update_investigation(
    investigation_id: str,
    payload: InvestigationUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Save complete RCA workspace draft: updates metadata, observations, and reconciles nested collections.
    """
    stmt = (
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(
            selectinload(Investigation.evidence_items),
            selectinload(Investigation.five_whys_steps),
            selectinload(Investigation.ishikawa_factors),
            selectinload(Investigation.missing_evidence_items),
            selectinload(Investigation.capa_items),
        )
    )
    result = await db.execute(stmt)
    investigation = result.scalar_one_or_none()
    if not investigation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Investigation '{investigation_id}' not found"
        )

    # Update top-level scalar fields
    for field in [
        "title", "deviation_number", "facility", "product_name",
        "batch_number", "unit_operation", "incident_date", "reported_by",
        "investigation_lead", "observed_event", "immediate_containment",
        "suspected_timeline", "root_cause_summary", "uncertainty_notes"
    ]:
        val = getattr(payload, field)
        if val is not None:
            setattr(investigation, field, val)

    if payload.status is not None:
        investigation.status = payload.status.value

    # Reconcile Evidence Items
    if payload.evidence_items is not None:
        investigation.evidence_items.clear()
        for ev in payload.evidence_items:
            investigation.evidence_items.append(EvidenceItem(
                source_type=ev.source_type.value,
                title=ev.title,
                content=ev.content,
                supporting_points=ev.supporting_points,
                contradictory_points=ev.contradictory_points,
            ))

    # Reconcile 5 Whys steps
    if payload.five_whys_steps is not None:
        investigation.five_whys_steps.clear()
        for step in payload.five_whys_steps:
            investigation.five_whys_steps.append(FiveWhysStep(
                step_number=step.step_number,
                question=step.question,
                answer=step.answer,
                category=step.category.value if hasattr(step.category, "value") else str(step.category),
                evidence_reference=step.evidence_reference,
            ))

    # Reconcile Ishikawa factors
    if payload.ishikawa_factors is not None:
        investigation.ishikawa_factors.clear()
        for f in payload.ishikawa_factors:
            investigation.ishikawa_factors.append(IshikawaFactor(
                category=f.category.value if hasattr(f.category, "value") else str(f.category),
                factor=f.factor,
                is_contributing=f.is_contributing,
                notes=f.notes,
            ))

    # Reconcile Missing Evidence Items
    if payload.missing_evidence_items is not None:
        investigation.missing_evidence_items.clear()
        for m in payload.missing_evidence_items:
            investigation.missing_evidence_items.append(MissingEvidenceItem(
                missing_item=m.missing_item,
                rationale=m.rationale,
                impact_level=m.impact_level.value if hasattr(m.impact_level, "value") else str(m.impact_level),
                recommended_action=m.recommended_action,
            ))

    # Reconcile CAPA items
    if payload.capa_items is not None:
        investigation.capa_items.clear()
        for c in payload.capa_items:
            investigation.capa_items.append(CapaItem(
                capa_type=c.capa_type.value if hasattr(c.capa_type, "value") else str(c.capa_type),
                action_description=c.action_description,
                owner=c.owner,
                target_date=c.target_date,
                effectiveness_criteria=c.effectiveness_criteria,
                status=c.status.value if hasattr(c.status, "value") else str(c.status),
            ))

    await db.commit()
    await db.refresh(investigation)
    return investigation


@router.delete("/{investigation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_investigation(
    investigation_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete an investigation and all attached analytical artifacts.
    """
    stmt = select(Investigation).where(Investigation.id == investigation_id)
    result = await db.execute(stmt)
    investigation = result.scalar_one_or_none()
    if not investigation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Investigation '{investigation_id}' not found"
        )
    await db.delete(investigation)
    await db.commit()
    return None
