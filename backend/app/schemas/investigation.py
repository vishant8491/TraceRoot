from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.common import (
    InvestigationStatus,
    EvidenceSourceType,
    FiveWhysCategory,
    IshikawaCategory,
    CapaType,
    CapaStatus,
    ImpactLevel,
)


class EvidenceItemBase(BaseModel):
    source_type: EvidenceSourceType = EvidenceSourceType.PASTED_TEXT
    title: str = "Evidence Record"
    content: str
    supporting_points: List[str] = Field(default_factory=list)
    contradictory_points: List[str] = Field(default_factory=list)


class EvidenceItemCreate(EvidenceItemBase):
    pass


class EvidenceItemResponse(EvidenceItemBase):
    id: str
    investigation_id: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class FiveWhysStepBase(BaseModel):
    step_number: int
    question: str
    answer: str
    category: FiveWhysCategory = FiveWhysCategory.PHYSICAL
    evidence_reference: Optional[str] = None


class FiveWhysStepCreate(FiveWhysStepBase):
    pass


class FiveWhysStepResponse(FiveWhysStepBase):
    id: str
    investigation_id: str
    model_config = ConfigDict(from_attributes=True)


class IshikawaFactorBase(BaseModel):
    category: IshikawaCategory
    factor: str
    is_contributing: bool = False
    notes: Optional[str] = None


class IshikawaFactorCreate(IshikawaFactorBase):
    pass


class IshikawaFactorResponse(IshikawaFactorBase):
    id: str
    investigation_id: str
    model_config = ConfigDict(from_attributes=True)


class CapaItemBase(BaseModel):
    capa_type: CapaType
    action_description: str
    owner: Optional[str] = None
    target_date: Optional[str] = None
    effectiveness_criteria: Optional[str] = None
    status: CapaStatus = CapaStatus.PROPOSED


class CapaItemCreate(CapaItemBase):
    pass


class CapaItemResponse(CapaItemBase):
    id: str
    investigation_id: str
    model_config = ConfigDict(from_attributes=True)


class MissingEvidenceItemBase(BaseModel):
    missing_item: str
    rationale: str
    impact_level: ImpactLevel = ImpactLevel.MEDIUM
    recommended_action: Optional[str] = None


class MissingEvidenceItemCreate(MissingEvidenceItemBase):
    pass


class MissingEvidenceItemResponse(MissingEvidenceItemBase):
    id: str
    investigation_id: str
    model_config = ConfigDict(from_attributes=True)


class InvestigationBase(BaseModel):
    title: str = "Untitled Investigation"
    deviation_number: Optional[str] = None
    facility: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    unit_operation: Optional[str] = None
    incident_date: Optional[str] = None
    reported_by: Optional[str] = None
    investigation_lead: Optional[str] = None
    status: InvestigationStatus = InvestigationStatus.DRAFT
    observed_event: Optional[str] = None
    immediate_containment: Optional[str] = None
    suspected_timeline: Optional[str] = None
    root_cause_summary: Optional[str] = None
    uncertainty_notes: Optional[str] = None


class InvestigationCreate(InvestigationBase):
    pass


class InvestigationUpdate(BaseModel):
    title: Optional[str] = None
    deviation_number: Optional[str] = None
    facility: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    unit_operation: Optional[str] = None
    incident_date: Optional[str] = None
    reported_by: Optional[str] = None
    investigation_lead: Optional[str] = None
    status: Optional[InvestigationStatus] = None
    observed_event: Optional[str] = None
    immediate_containment: Optional[str] = None
    suspected_timeline: Optional[str] = None
    root_cause_summary: Optional[str] = None
    uncertainty_notes: Optional[str] = None

    # Full collection updates for saving complete workspace state
    evidence_items: Optional[List[EvidenceItemCreate]] = None
    five_whys_steps: Optional[List[FiveWhysStepCreate]] = None
    ishikawa_factors: Optional[List[IshikawaFactorCreate]] = None
    missing_evidence_items: Optional[List[MissingEvidenceItemCreate]] = None
    capa_items: Optional[List[CapaItemCreate]] = None


class InvestigationSummaryResponse(BaseModel):
    id: str
    title: str
    deviation_number: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class InvestigationDetailResponse(InvestigationBase):
    id: str
    created_at: datetime
    updated_at: datetime
    evidence_items: List[EvidenceItemResponse] = Field(default_factory=list)
    five_whys_steps: List[FiveWhysStepResponse] = Field(default_factory=list)
    ishikawa_factors: List[IshikawaFactorResponse] = Field(default_factory=list)
    missing_evidence_items: List[MissingEvidenceItemResponse] = Field(default_factory=list)
    capa_items: List[CapaItemResponse] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)
