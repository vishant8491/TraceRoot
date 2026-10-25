from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, ConfigDict, Field


# --- Domain Enums ---

class InvestigationStatusEnum(str, Enum):
    DRAFT = "DRAFT"
    REVIEWED = "REVIEWED"


class SourceTypeEnum(str, Enum):
    PDF = "PDF"
    TEXT = "TEXT"
    EMAIL = "EMAIL"


class OriginEnum(str, Enum):
    AI = "AI"
    HUMAN = "HUMAN"


class ReviewStateEnum(str, Enum):
    UNREVIEWED = "UNREVIEWED"
    ACCEPTED = "ACCEPTED"
    EDITED = "EDITED"
    REJECTED = "REJECTED"


class EvidenceStatusEnum(str, Enum):
    SUPPORTED = "SUPPORTED"
    INFERRED = "INFERRED"
    NOT_FOUND = "NOT_FOUND"


class AIRunStatusEnum(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


# --- Provenance Models ---

class SourceReference(BaseModel):
    source_id: str = Field(..., description="UUID of the attached SourceDocument")
    segment_id: str = Field(..., description="Identifier of the specific segment/paragraph")
    page_number: Optional[int] = Field(None, description="Page number if applicable (e.g. for PDF sources)")
    quote: str = Field(default="", description="Verbatim or near-verbatim quote from source segment")
    snippet: Optional[str] = Field(None, description="Compatibility alias for quote")
    verified: bool = Field(default=True, description="Whether quote matches referenced segment under whitespace normalization")
    unverified_reason: Optional[str] = Field(None, description="Reason if quote failed verification")
    model_config = ConfigDict(extra="ignore")


class ProvenanceField(BaseModel):
    value: Optional[Any] = Field(None, description="The populated value or text")
    origin: OriginEnum = Field(default=OriginEnum.AI, description="Source of the value: AI or HUMAN")
    review_state: ReviewStateEnum = Field(default=ReviewStateEnum.UNREVIEWED, description="Human review status")
    source_references: List[SourceReference] = Field(default_factory=list, description="Citations supporting this value")
    evidence_status: EvidenceStatusEnum = Field(default=EvidenceStatusEnum.SUPPORTED, description="SUPPORTED, INFERRED, or NOT_FOUND")
    model_config = ConfigDict(extra="ignore")


# --- Analytical Content Models ---

class EvidenceStrengthEnum(str, Enum):
    LIMITED = "LIMITED"
    MODERATE = "MODERATE"
    STRONG = "STRONG"


class EvidenceAssessment(BaseModel):
    observed_facts: List[str] = Field(default_factory=list, description="Factual events and telemetry corroborated by source records")
    reported_allegations: List[str] = Field(default_factory=list, description="Subjective operator claims or narrative statements requiring verification")
    contradictions: List[str] = Field(default_factory=list, description="Discrepancies between sensor logs and human claims")
    missing_evidence: List[str] = Field(default_factory=list, description="Critical unrecorded data or missing test records")
    supporting_points: List[str] = Field(default_factory=list, description="Evidence supporting the observed sequence")
    counter_evidence: List[str] = Field(default_factory=list, description="Evidence contradicting working hypotheses")
    model_config = ConfigDict(extra="ignore")


class FiveWhysItem(BaseModel):
    step_number: int = Field(..., ge=1, le=10)
    question: str = Field(..., min_length=1, max_length=1000)
    answer: str = Field(..., min_length=1, max_length=2000)
    category: str = Field(default="PHYSICAL", description="PHYSICAL, HUMAN, or SYSTEMIC")
    evidence_reference: Optional[str] = Field(None, max_length=500)
    is_unresolved: bool = Field(default=False, description="Flag indicating uncertainty or missing verification when chain stops")
    provenance: Optional[ProvenanceField] = None
    model_config = ConfigDict(extra="ignore")


class PotentialCauseItem(BaseModel):
    id: str = Field(default="", description="Unique identifier for cause (e.g. cause-1)")
    cause: str = Field(..., min_length=1, max_length=1000, description="Cause description")
    description: Optional[str] = Field(None, description="Compatibility alias for cause")
    category: str = Field(default="Process", max_length=100)
    likelihood: str = Field(default="MEDIUM", description="Compatibility alias for evidence strength")
    rationale: str = Field(..., max_length=2000, description="Concise evidence-based rationale")
    evidence_strength: str = Field(default="MODERATE", description="Categorical strength: LIMITED, MODERATE, STRONG (not a calibrated probability)")
    counter_evidence: Optional[str] = Field(None, max_length=1000, description="Observed counter-evidence")
    next_verification_step: Optional[str] = Field(None, max_length=1000, description="Concrete next verification step")
    status: str = Field(default="HYPOTHESIS", description="Default status HYPOTHESIS")
    supporting_references: List[SourceReference] = Field(default_factory=list)
    provenance: Optional[ProvenanceField] = None
    model_config = ConfigDict(extra="ignore")


class ContributingFactorItem(BaseModel):
    id: Optional[str] = Field(None, description="Unique identifier for factor")
    category: str = Field(..., description="Machine, Material, Method, Measurement, Man, Environment")
    factor: str = Field(..., min_length=1, max_length=1000)
    is_contributing: bool = Field(default=False)
    notes: Optional[str] = Field(None, max_length=2000)
    inference_label: Optional[str] = Field(default="SUPPORTED", description="SUPPORTED or INFERRED")
    provenance: Optional[ProvenanceField] = None
    model_config = ConfigDict(extra="ignore")


class EvidenceGapItem(BaseModel):
    id: Optional[str] = Field(None, description="Unique identifier for gap")
    gap_description: str = Field(..., min_length=1, max_length=1000)
    regulatory_rationale: str = Field(..., max_length=2000)
    impact_level: str = Field(default="MEDIUM", description="CRITICAL, HIGH, MEDIUM, or LOW")
    priority: Optional[str] = Field(None, description="Prioritization: CRITICAL, HIGH, MEDIUM, LOW")
    recommended_action: Optional[str] = Field(None, max_length=1000)
    suggested_verification_step: Optional[str] = Field(None, max_length=1000)
    model_config = ConfigDict(extra="ignore")


class CapaSuggestionItem(BaseModel):
    id: str = Field(default="", description="Unique identifier for CAPA (e.g. capa-1)")
    capa_type: str = Field(..., description="CORRECTIVE or PREVENTIVE")
    related_cause_id: Optional[str] = Field(None, description="Cross-reference linking to a PotentialCauseItem.id")
    action_description: str = Field(..., min_length=1, max_length=2000)
    short_rationale: Optional[str] = Field(None, max_length=1000, description="Short rationale connecting action to cause")
    responsible_role: Optional[str] = Field(None, max_length=150, description="Proposed responsible role (do NOT invent named personnel)")
    owner: Optional[str] = Field(None, max_length=150, description="Compatibility alias for responsible_role")
    proposed_due_date: Optional[str] = Field(None, max_length=100, description="Optional proposed due date, clearly labeled")
    target_date: Optional[str] = Field(None, max_length=100, description="Compatibility alias for proposed_due_date")
    effectiveness_criteria: Optional[str] = Field(None, max_length=2000, description="Measurable effectiveness check")
    status: str = Field(default="PROPOSED", description="PROPOSED, IMPLEMENTED, or VERIFIED")
    provenance: Optional[ProvenanceField] = None
    model_config = ConfigDict(extra="ignore")


class HumanReviewDecision(BaseModel):
    decision_state: ReviewStateEnum = Field(..., description="ACCEPTED, EDITED, or REJECTED")
    decided_by: str = Field(..., max_length=150)
    comment: Optional[str] = Field(None, max_length=1000)
    decided_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    model_config = ConfigDict(extra="ignore")


class HumanEditProposal(BaseModel):
    field_name: str = Field(..., description="Field name with human edit protection")
    current_user_value: Optional[str] = Field(None, description="Current value preserved from human edit")
    ai_proposed_value: str = Field(..., description="AI suggested value")
    rationale: str = Field(..., description="Rationale for proposed change")
    source_references: List[SourceReference] = Field(default_factory=list)
    proposed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    model_config = ConfigDict(extra="ignore")


class InvestigationContent(BaseModel):
    field_provenance: Dict[str, ProvenanceField] = Field(default_factory=dict)
    evidence_assessment: Optional[EvidenceAssessment] = None
    five_whys: List[FiveWhysItem] = Field(default_factory=list)
    potential_causes: List[PotentialCauseItem] = Field(default_factory=list)
    contributing_factors: List[ContributingFactorItem] = Field(default_factory=list)
    evidence_gaps: List[EvidenceGapItem] = Field(default_factory=list)
    capa_suggestions: List[CapaSuggestionItem] = Field(default_factory=list)
    human_review_decisions: Dict[str, HumanReviewDecision] = Field(default_factory=dict)
    human_edit_proposals: Dict[str, HumanEditProposal] = Field(default_factory=dict)
    domain_guidance_references: List[Dict[str, Any]] = Field(default_factory=list)
    regulatory_disclaimer: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


# --- Source Document Schemas ---

class TextSegment(BaseModel):
    segment_id: str
    page_number: Optional[int] = None
    paragraph_index: int
    char_offset_start: Optional[int] = None
    char_offset_end: Optional[int] = None
    text: str
    model_config = ConfigDict(extra="ignore")


class SourceDocumentCreate(BaseModel):
    source_type: SourceTypeEnum = Field(default=SourceTypeEnum.TEXT)
    display_name: str = Field(..., min_length=1, max_length=255)
    text_content: Optional[str] = Field(None, description="Raw source text extracted or pasted")
    email_subject: Optional[str] = Field(None, max_length=255)
    email_from: Optional[str] = Field(None, max_length=255)
    email_date: Optional[str] = Field(None, max_length=100)
    email_to: Optional[str] = Field(None, max_length=255)
    model_config = ConfigDict(extra="ignore")


class SourceDocumentResponse(BaseModel):
    id: str
    investigation_id: str
    source_type: str
    display_name: str
    extracted_text: str
    segments: List[TextSegment] = Field(default_factory=list)
    content_hash: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- AI Run Schemas ---

class AnalyzeRequest(BaseModel):
    source_ids: Optional[List[str]] = Field(None, description="Optional subset of sources to evaluate")
    custom_instructions: Optional[str] = Field(None, max_length=1000)
    model_id: Optional[str] = Field(None, description="Configured Groq model ID")
    use_mock: bool = Field(default=False, description="Deterministic mock mode strictly for testing")
    model_config = ConfigDict(extra="ignore", protected_namespaces=())


class AIRunResponse(BaseModel):
    id: str
    investigation_id: str
    draft_version: int
    status: str
    completed_stages: List[str]
    model_id: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    structured_output: Optional[Dict[str, Any]] = None
    failure_code: Optional[str] = None
    failure_message: Optional[str] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


# --- Investigation Request & Response Schemas ---

class InvestigationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    product_name: Optional[str] = Field(None, max_length=150)
    batch_number: Optional[str] = Field(None, max_length=100)
    manufacturing_stage: Optional[str] = Field(None, max_length=150)
    incident_date: Optional[str] = Field(None, max_length=100)
    site_department: Optional[str] = Field(None, max_length=150)
    equipment: Optional[str] = Field(None, max_length=150)
    observed_deviation: Optional[str] = Field(None, description="Factual observed defect or non-conformance")
    expected_condition: Optional[str] = Field(None, description="Specified parameter or validated range")
    actual_condition: Optional[str] = Field(None, description="Measured parameter or excursion reading")
    immediate_containment: Optional[str] = Field(None, description="Quarantine or barrier controls")
    investigator_name: Optional[str] = Field(None, max_length=150)
    model_config = ConfigDict(extra="ignore")


class InvestigationUpdate(BaseModel):
    version: int = Field(..., description="Current version of the loaded investigation for atomic optimistic concurrency")
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    product_name: Optional[str] = Field(None, max_length=150)
    batch_number: Optional[str] = Field(None, max_length=100)
    manufacturing_stage: Optional[str] = Field(None, max_length=150)
    incident_date: Optional[str] = Field(None, max_length=100)
    site_department: Optional[str] = Field(None, max_length=150)
    equipment: Optional[str] = Field(None, max_length=150)
    observed_deviation: Optional[str] = None
    expected_condition: Optional[str] = None
    actual_condition: Optional[str] = None
    immediate_containment: Optional[str] = None
    investigator_name: Optional[str] = Field(None, max_length=150)
    content: Optional[InvestigationContent] = None
    model_config = ConfigDict(extra="ignore")


class InvestigationSummaryResponse(BaseModel):
    id: str
    investigation_number: str
    title: str
    status: str
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    version: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class InvestigationDetailResponse(BaseModel):
    id: str
    investigation_number: str
    title: str
    status: str
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    manufacturing_stage: Optional[str] = None
    incident_date: Optional[str] = None
    site_department: Optional[str] = None
    equipment: Optional[str] = None
    observed_deviation: Optional[str] = None
    expected_condition: Optional[str] = None
    actual_condition: Optional[str] = None
    immediate_containment: Optional[str] = None
    investigator_name: Optional[str] = None
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    version: int
    content: InvestigationContent
    source_documents: List[SourceDocumentResponse] = Field(default_factory=list)
    latest_run: Optional[AIRunResponse] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ReviewRequest(BaseModel):
    version: int = Field(..., description="Current version of the investigation for atomic check")
    reviewer_name: str = Field(..., min_length=1, max_length=150)
    decisions: Dict[str, HumanReviewDecision] = Field(
        default_factory=dict,
        description="Review decision (ACCEPTED, EDITED, REJECTED) for each AI field/item",
    )
    comment: Optional[str] = Field(None, max_length=1000)
    model_config = ConfigDict(extra="ignore")


class ReviewResponse(BaseModel):
    investigation: InvestigationDetailResponse
    disclaimer: str = (
        "REVIEWED indicates that a designated user has reviewed the AI-assisted draft. "
        "It is not qualified regulatory approval or confirmed scientific causality under GMP."
    )
