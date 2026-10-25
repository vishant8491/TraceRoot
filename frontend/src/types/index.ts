export type InvestigationStatus = 'DRAFT' | 'REVIEWED' | 'UNDER_REVIEW' | 'CAPA_APPROVED' | 'CLOSED';

export type EvidenceSourceType = 'PASTED_TEXT' | 'UPLOADED_PDF' | 'EMAIL';

export type FiveWhysCategory = 'PHYSICAL' | 'HUMAN' | 'SYSTEMIC';

export type IshikawaCategory = 'Machine' | 'Material' | 'Method' | 'Measurement' | 'Man' | 'Environment';

export type CapaType = 'CONTAINMENT' | 'CORRECTIVE' | 'PREVENTIVE';

export type CapaStatus = 'PROPOSED' | 'IMPLEMENTED' | 'VERIFIED';

export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type InvestigationTab = 'summary' | 'evidence' | 'five_whys' | 'causes' | 'capa';

export interface SourceReference {
  source_id?: string;
  segment_id: string;
  page_number?: number;
  paragraph_index?: number;
  quote?: string;
  snippet?: string;
  verified?: boolean;
  is_quote_verified?: boolean;
}

export interface FieldProvenance {
  field_name?: string;
  value: any;
  origin: 'AI' | 'HUMAN';
  review_state: 'UNREVIEWED' | 'ACCEPTED' | 'EDITED' | 'REJECTED';
  source_references: (string | SourceReference)[];
  evidence_status: 'SUPPORTED' | 'INFERRED' | 'NOT_APPLICABLE' | 'NOT_FOUND';
}

export interface SourceSegment {
  segment_id: string;
  page_number?: number;
  paragraph_index?: number;
  char_offset_start?: number;
  char_offset_end?: number;
  text: string;
}

export interface SourceDocument {
  id: string;
  investigation_id: string;
  source_type: string;
  display_name: string;
  extracted_text: string;
  segments: SourceSegment[];
  content_hash: string;
  created_at: string;
}

export interface EvidenceExcerptRef {
  segmentId: string;
  documentTitle: string;
  pageNumber?: number;
  paragraphIndex?: number;
  text: string;
  status: 'SUPPORTED' | 'INFERRED' | 'NEEDED';
  fieldName?: string;
}

export interface EvidenceAssessmentData {
  observed_facts?: string[];
  reported_allegations?: string[];
  contradictions?: string[];
  missing_evidence?: string[];
  supporting_points?: string[];
  counter_evidence?: string[];
  contradictions_detected?: string[];
  missing_evidence_gaps?: string[];
  uncertainty_analysis?: string;
}

export interface PotentialCauseItem {
  id: string;
  cause: string;
  category: string;
  evidence_strength: 'LIMITED' | 'MODERATE' | 'STRONG';
  confidence_score?: number;
  rationale?: string;
  counter_evidence?: string;
  contrary_evidence?: string | string[];
  supporting_evidence?: string[];
  next_verification_step: string;
  status?: 'HYPOTHESIS' | 'VERIFIED' | 'RULED_OUT';
  conclusion_details?: {
    reviewer_name: string;
    rationale: string;
    evidence_reference: string;
    recorded_at: string;
  };
  source_references?: string[];
  provenance?: any;
}

export interface FiveWhysDetailItem {
  step_number: number;
  question: string;
  answer: string;
  category?: string;
  evidence_reference?: string;
  is_unresolved?: boolean;
  decision?: 'ACCEPTED' | 'EDITED' | 'REJECTED';
  provenance?: any;
}

export interface ContributingFactorItem {
  category: string;
  factor: string;
  is_contributing: boolean;
  notes?: string;
  source_reference?: string;
}

export interface EvidenceGapItem {
  information_needed: string;
  why_it_matters: string;
  suggested_verification_step: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface CapaDetailItem {
  id: string;
  type?: 'CORRECTIVE' | 'PREVENTIVE';
  capa_type?: 'CORRECTIVE' | 'PREVENTIVE';
  related_cause_id?: string;
  proposed_action?: string;
  action_description?: string;
  rationale?: string;
  short_rationale?: string;
  responsible_role?: string;
  proposed_due_date?: string;
  effectiveness_check?: string;
  effectiveness_criteria?: string;
  status?: 'PROPOSED' | 'ACCEPTED' | 'REJECTED';
  decision?: 'ACCEPTED' | 'EDITED' | 'REJECTED';
  provenance?: any;
}

export interface HumanEditProposal {
  field_name: string;
  current_user_value: string;
  ai_proposed_value: string;
  rationale: string;
  source_references: string[];
  proposed_at: string;
}

export interface InvestigationContent {
  field_provenance?: Record<string, FieldProvenance>;
  evidence_assessment?: EvidenceAssessmentData;
  five_whys?: FiveWhysDetailItem[];
  potential_causes?: PotentialCauseItem[];
  contributing_factors?: ContributingFactorItem[];
  evidence_gaps?: EvidenceGapItem[];
  capa_suggestions?: CapaDetailItem[];
  human_edit_proposals?: Record<string, HumanEditProposal>;
  human_review_decisions?: Record<string, {
    decision_state: 'ACCEPTED' | 'EDITED' | 'REJECTED' | 'VERIFIED' | 'RULED_OUT' | 'HYPOTHESIS';
    decided_by: string;
    comment?: string;
  }>;
  regulatory_disclaimer?: string;
  domain_guidance_references?: string[];
}

export interface EvidenceItem {
  id?: string;
  source_type: EvidenceSourceType;
  title: string;
  content: string;
  supporting_points: string[];
  contradictory_points: string[];
}

export interface FiveWhysStep {
  id?: string;
  step_number: number;
  question: string;
  answer: string;
  category: FiveWhysCategory;
  evidence_reference?: string;
}

export interface IshikawaFactor {
  id?: string;
  category: IshikawaCategory;
  factor: string;
  is_contributing: boolean;
  notes?: string;
}

export interface MissingEvidenceItem {
  id?: string;
  missing_item: string;
  rationale: string;
  impact_level: ImpactLevel;
  recommended_action?: string;
}

export interface CapaItem {
  id?: string;
  capa_type: CapaType;
  action_description: string;
  owner?: string;
  target_date?: string;
  effectiveness_criteria?: string;
  status: CapaStatus;
}

export interface Investigation {
  id?: string;
  investigation_number?: string;
  title: string;
  version?: number;
  deviation_number?: string;
  facility?: string;
  product_name?: string;
  batch_number?: string;
  manufacturing_stage?: string;
  unit_operation?: string;
  incident_date?: string;
  site_department?: string;
  equipment?: string;
  reported_by?: string;
  investigation_lead?: string;
  investigator_name?: string;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  status: InvestigationStatus;
  observed_event?: string;
  observed_deviation?: string;
  expected_condition?: string;
  actual_condition?: string;
  immediate_containment?: string;
  suspected_timeline?: string;
  root_cause_summary?: string;
  uncertainty_notes?: string;
  created_at?: string;
  updated_at?: string;
  content?: InvestigationContent;
  source_documents?: SourceDocument[];
  latest_run?: any;
  evidence_items?: EvidenceItem[];
  five_whys_steps?: FiveWhysStep[];
  ishikawa_factors?: IshikawaFactor[];
  missing_evidence_items?: MissingEvidenceItem[];
  capa_items?: CapaItem[];
}

export interface InvestigationSummary {
  id: string;
  investigation_number?: string;
  title: string;
  deviation_number?: string;
  product_name?: string;
  batch_number?: string;
  status: string;
  version?: number;
  created_at: string;
  updated_at: string;
}

export interface ExtractedContext {
  title: string;
  deviation_number?: string;
  facility?: string;
  product_name?: string;
  batch_number?: string;
  unit_operation?: string;
  incident_date?: string;
  reported_by?: string;
  investigation_lead?: string;
  observed_event: string;
  immediate_containment: string;
  suspected_timeline?: string;
  initial_hypotheses: string[];
  supporting_points: string[];
  contradictory_points: string[];
}

export interface FullWorkflowResponse {
  extracted_context: ExtractedContext;
  root_cause_summary: string;
  five_whys_steps: FiveWhysStep[];
  ishikawa_factors: IshikawaFactor[];
  missing_evidence_items: MissingEvidenceItem[];
  capa_items: CapaItem[];
  uncertainty_notes?: string;
}
