from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.investigation import (
    FiveWhysStepCreate,
    IshikawaFactorCreate,
    MissingEvidenceItemCreate,
    CapaItemCreate,
)


class ExtractionRequest(BaseModel):
    text_content: str
    source_name: Optional[str] = "Pasted Narrative"


class ExtractedContext(BaseModel):
    title: str = "Investigation"
    deviation_number: Optional[str] = None
    facility: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    unit_operation: Optional[str] = None
    incident_date: Optional[str] = None
    reported_by: Optional[str] = None
    investigation_lead: Optional[str] = None
    observed_event: str
    immediate_containment: str
    suspected_timeline: Optional[str] = None
    initial_hypotheses: List[str] = Field(default_factory=list)
    supporting_points: List[str] = Field(default_factory=list)
    contradictory_points: List[str] = Field(default_factory=list)


class FiveWhysRequest(BaseModel):
    observed_event: str
    immediate_containment: Optional[str] = None
    context_text: Optional[str] = None
    unit_operation: Optional[str] = None


class FiveWhysResponse(BaseModel):
    root_cause_summary: str
    steps: List[FiveWhysStepCreate] = Field(default_factory=list)


class IshikawaRequest(BaseModel):
    observed_event: str
    root_cause_summary: Optional[str] = None
    context_text: Optional[str] = None


class IshikawaResponse(BaseModel):
    factors: List[IshikawaFactorCreate] = Field(default_factory=list)


class EvidenceEvaluationRequest(BaseModel):
    observed_event: str
    root_cause_summary: Optional[str] = None
    context_text: str


class EvidenceEvaluationResponse(BaseModel):
    supporting_points: List[str] = Field(default_factory=list)
    contradictory_points: List[str] = Field(default_factory=list)
    missing_evidence_items: List[MissingEvidenceItemCreate] = Field(default_factory=list)
    uncertainty_notes: Optional[str] = None


class CapaGenerationRequest(BaseModel):
    observed_event: str
    root_cause_summary: str
    contributing_factors: Optional[List[str]] = None
    unit_operation: Optional[str] = None


class CapaGenerationResponse(BaseModel):
    items: List[CapaItemCreate] = Field(default_factory=list)


class FullWorkflowRequest(BaseModel):
    text_content: str
    source_name: Optional[str] = "Incident Document"


class FullWorkflowResponse(BaseModel):
    extracted_context: ExtractedContext
    root_cause_summary: str
    five_whys_steps: List[FiveWhysStepCreate] = Field(default_factory=list)
    ishikawa_factors: List[IshikawaFactorCreate] = Field(default_factory=list)
    missing_evidence_items: List[MissingEvidenceItemCreate] = Field(default_factory=list)
    capa_items: List[CapaItemCreate] = Field(default_factory=list)
    uncertainty_notes: Optional[str] = None
