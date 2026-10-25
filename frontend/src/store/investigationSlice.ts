import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  Investigation,
  InvestigationSummary,
  InvestigationTab,
  EvidenceExcerptRef,
  FiveWhysStep,
  IshikawaFactor,
  MissingEvidenceItem,
  CapaItem,
  CapaType,
} from '../types';

export const createDefaultInvestigation = (): Investigation => ({
  title: 'New API Deviation Investigation',
  deviation_number: '',
  facility: 'API Manufacturing Block B',
  product_name: '',
  batch_number: '',
  manufacturing_stage: '',
  unit_operation: '',
  incident_date: new Date().toISOString().slice(0, 10),
  site_department: 'Synthesis & Isolation',
  equipment: '',
  reported_by: '',
  investigation_lead: '',
  investigator_name: '',
  status: 'DRAFT',
  observed_event: '',
  observed_deviation: '',
  expected_condition: '',
  actual_condition: '',
  immediate_containment: '',
  suspected_timeline: '',
  root_cause_summary: '',
  uncertainty_notes: '',
  version: 1,
  content: {
    field_provenance: {},
    evidence_assessment: {
      observed_facts: [],
      reported_allegations: [],
      contradictions: [],
      missing_evidence: [],
      supporting_points: [],
      counter_evidence: [],
    },
    five_whys: [],
    potential_causes: [],
    contributing_factors: [],
    evidence_gaps: [],
    capa_suggestions: [],
    human_edit_proposals: {},
    human_review_decisions: {},
  },
  source_documents: [],
  evidence_items: [],
  five_whys_steps: [],
  ishikawa_factors: [],
  missing_evidence_items: [],
  capa_items: [],
});

interface InvestigationState {
  current: Investigation;
  isDirty: boolean;
  dirtyFields: Record<string, boolean>;
  isSaving: boolean;
  saveError: string | null;
  lastSavedAt: string | null;
  summaries: InvestigationSummary[];
  isLoadingSummaries: boolean;
  activeTab: InvestigationTab;
  selectedExcerpt: EvidenceExcerptRef | null;
  conflictServerVersion: Investigation | null;
  activeRequestId: string | null;
}

const initialState: InvestigationState = {
  current: createDefaultInvestigation(),
  isDirty: false,
  dirtyFields: {},
  isSaving: false,
  saveError: null,
  lastSavedAt: null,
  summaries: [],
  isLoadingSummaries: false,
  activeTab: 'summary',
  selectedExcerpt: null,
  conflictServerVersion: null,
  activeRequestId: null,
};

export const investigationSlice = createSlice({
  name: 'investigation',
  initialState,
  reducers: {
    setInvestigation(state, action: PayloadAction<Investigation>) {
      const inv = action.payload;
      // Sync legacy lists with content if needed
      if (inv.content?.five_whys && (!inv.five_whys_steps || inv.five_whys_steps.length === 0)) {
        inv.five_whys_steps = inv.content.five_whys.map((fw) => ({
          step_number: fw.step_number,
          question: fw.question,
          answer: fw.answer,
          category: (fw.category as any) || 'PHYSICAL',
          evidence_reference: fw.evidence_reference,
        }));
      }
      if (inv.content?.contributing_factors && (!inv.ishikawa_factors || inv.ishikawa_factors.length === 0)) {
        inv.ishikawa_factors = inv.content.contributing_factors.map((cf) => ({
          category: (cf.category as any) || 'Method',
          factor: cf.factor,
          is_contributing: cf.is_contributing,
          notes: cf.notes,
        }));
      }
      if (inv.content?.evidence_gaps && (!inv.missing_evidence_items || inv.missing_evidence_items.length === 0)) {
        inv.missing_evidence_items = inv.content.evidence_gaps.map((eg) => ({
          missing_item: eg.information_needed,
          rationale: eg.why_it_matters,
          impact_level: (eg.priority as any) || 'MEDIUM',
          recommended_action: eg.suggested_verification_step,
        }));
      }
      if (inv.content?.capa_suggestions && (!inv.capa_items || inv.capa_items.length === 0)) {
        inv.capa_items = inv.content.capa_suggestions.map((cs) => ({
          capa_type: (cs.capa_type || cs.type || 'CORRECTIVE') as CapaType,
          action_description: cs.action_description || cs.proposed_action || '',
          owner: cs.responsible_role,
          target_date: cs.proposed_due_date,
          effectiveness_criteria: cs.effectiveness_criteria || cs.effectiveness_check,
          status: 'PROPOSED',
        }));
      }

      state.current = inv;
      state.isDirty = false;
      state.dirtyFields = {};
      state.saveError = null;
      state.conflictServerVersion = null;
    },

    resetInvestigation(state) {
      state.current = createDefaultInvestigation();
      state.isDirty = false;
      state.dirtyFields = {};
      state.saveError = null;
      state.conflictServerVersion = null;
    },

    updateDraftField<K extends keyof Investigation>(
      state: InvestigationState,
      action: PayloadAction<{ field: K; value: Investigation[K] }>
    ) {
      const { field, value } = action.payload;
      state.current[field] = value;
      state.isDirty = true;
      state.dirtyFields[field as string] = true;

      // Update provenance inside content if metadata field
      if (state.current.content) {
        if (!state.current.content.field_provenance) {
          state.current.content.field_provenance = {};
        }
        state.current.content.field_provenance[field as string] = {
          field_name: field as string,
          value: value,
          origin: 'HUMAN',
          review_state: 'EDITED',
          source_references: [],
          evidence_status: value ? 'SUPPORTED' : 'NOT_APPLICABLE',
        };
      }
    },

    updateContentField(
      state,
      action: PayloadAction<{ section: string; value: any }>
    ) {
      if (!state.current.content) {
        state.current.content = {};
      }
      (state.current.content as any)[action.payload.section] = action.payload.value;
      state.isDirty = true;
    },

    removeEvidence(state, action: PayloadAction<number>) {
      if (state.current.evidence_items) {
        state.current.evidence_items.splice(action.payload, 1);
        state.isDirty = true;
      }
    },

    // Record formal deliberate conclusion for a potential cause
    recordCauseConclusion(
      state,
      action: PayloadAction<{
        causeId: string;
        status: 'VERIFIED' | 'RULED_OUT' | 'HYPOTHESIS';
        reviewerName: string;
        rationale: string;
        evidenceReference: string;
      }>
    ) {
      const causes = state.current.content?.potential_causes || [];
      const cause = causes.find((c) => c.id === action.payload.causeId);
      if (cause) {
        cause.status = action.payload.status;
        cause.conclusion_details = {
          reviewer_name: action.payload.reviewerName,
          rationale: action.payload.rationale,
          evidence_reference: action.payload.evidenceReference,
          recorded_at: new Date().toISOString(),
        };
        if (state.current.content) {
          if (!state.current.content.human_review_decisions) {
            state.current.content.human_review_decisions = {};
          }
          state.current.content.human_review_decisions[`cause:${action.payload.causeId}`] = {
            decision_state: action.payload.status,
            decided_by: action.payload.reviewerName,
            comment: action.payload.rationale,
          };
        }
        state.isDirty = true;
      }
    },

    // Record review decision on an item (Accept / Edit / Reject)
    setReviewDecision(
      state,
      action: PayloadAction<{
        itemKey: string;
        decisionState: 'ACCEPTED' | 'EDITED' | 'REJECTED';
        decidedBy: string;
        comment?: string;
      }>
    ) {
      if (!state.current.content) {
        state.current.content = {};
      }
      if (!state.current.content.human_review_decisions) {
        state.current.content.human_review_decisions = {};
      }
      state.current.content.human_review_decisions[action.payload.itemKey] = {
        decision_state: action.payload.decisionState,
        decided_by: action.payload.decidedBy,
        comment: action.payload.comment,
      };
      state.isDirty = true;
    },

    // Evidence Excerpt Viewer
    setSelectedExcerpt(state, action: PayloadAction<EvidenceExcerptRef | null>) {
      state.selectedExcerpt = action.payload;
    },
    clearSelectedExcerpt(state) {
      state.selectedExcerpt = null;
    },

    // 409 Conflict Recovery
    setConflictServerVersion(state, action: PayloadAction<Investigation | null>) {
      state.conflictServerVersion = action.payload;
      state.isSaving = false;
    },

    setActiveTab(state, action: PayloadAction<InvestigationTab>) {
      state.activeTab = action.payload;
    },

    setSummaries(state, action: PayloadAction<InvestigationSummary[]>) {
      state.summaries = action.payload;
      state.isLoadingSummaries = false;
    },
    setLoadingSummaries(state, action: PayloadAction<boolean>) {
      state.isLoadingSummaries = action.payload;
    },

    setSaving(state, action: PayloadAction<boolean>) {
      state.isSaving = action.payload;
    },
    saveSuccess(state, action: PayloadAction<{ id: string; updatedAt: string; version?: number }>) {
      state.current.id = action.payload.id;
      state.current.updated_at = action.payload.updatedAt;
      if (action.payload.version !== undefined) {
        state.current.version = action.payload.version;
      }
      state.isSaving = false;
      state.isDirty = false;
      state.dirtyFields = {};
      state.lastSavedAt = action.payload.updatedAt;
      state.saveError = null;
      state.conflictServerVersion = null;
    },
    saveFailed(state, action: PayloadAction<string>) {
      state.isSaving = false;
      state.saveError = action.payload;
    },

    markReviewedSuccess(state, action: PayloadAction<{ reviewerName: string; reviewedAt: string; version: number }>) {
      state.current.status = 'REVIEWED';
      state.current.reviewer_name = action.payload.reviewerName;
      state.current.reviewed_at = action.payload.reviewedAt;
      state.current.version = action.payload.version;
      state.isDirty = false;
      state.dirtyFields = {};
    },

    setActiveRequestId(state, action: PayloadAction<string | null>) {
      state.activeRequestId = action.payload;
    },

    // Source Documents
    addSourceDocument(state, action: PayloadAction<any>) {
      if (!state.current.source_documents) {
        state.current.source_documents = [];
      }
      state.current.source_documents.push(action.payload);
      state.isDirty = true;
    },

    // Legacy Helpers for Compatibility
    setFiveWhys(state, action: PayloadAction<{ root_cause_summary?: string; steps: FiveWhysStep[] }>) {
      if (action.payload.root_cause_summary) {
        state.current.root_cause_summary = action.payload.root_cause_summary;
      }
      state.current.five_whys_steps = action.payload.steps;
      state.isDirty = true;
    },
    updateFiveWhysStep(state, action: PayloadAction<{ index: number; step: Partial<FiveWhysStep> }>) {
      const idx = action.payload.index;
      if (state.current.five_whys_steps && state.current.five_whys_steps[idx]) {
        state.current.five_whys_steps[idx] = {
          ...state.current.five_whys_steps[idx],
          ...action.payload.step,
        };
        state.isDirty = true;
      }
    },
    addFiveWhysStep(state, action: PayloadAction<FiveWhysStep>) {
      if (!state.current.five_whys_steps) state.current.five_whys_steps = [];
      state.current.five_whys_steps.push(action.payload);
      state.isDirty = true;
    },
    removeFiveWhysStep(state, action: PayloadAction<number>) {
      if (state.current.five_whys_steps) {
        state.current.five_whys_steps.splice(action.payload, 1);
        state.current.five_whys_steps.forEach((step, i) => {
          step.step_number = i + 1;
        });
        state.isDirty = true;
      }
    },

    setIshikawaFactors(state, action: PayloadAction<IshikawaFactor[]>) {
      state.current.ishikawa_factors = action.payload;
      state.isDirty = true;
    },
    toggleIshikawaFactor(state, action: PayloadAction<number>) {
      if (state.current.ishikawa_factors && state.current.ishikawa_factors[action.payload]) {
        state.current.ishikawa_factors[action.payload].is_contributing =
          !state.current.ishikawa_factors[action.payload].is_contributing;
        state.isDirty = true;
      }
    },
    updateIshikawaFactor(state, action: PayloadAction<{ index: number; factor: Partial<IshikawaFactor> }>) {
      const idx = action.payload.index;
      if (state.current.ishikawa_factors && state.current.ishikawa_factors[idx]) {
        state.current.ishikawa_factors[idx] = {
          ...state.current.ishikawa_factors[idx],
          ...action.payload.factor,
        };
        state.isDirty = true;
      }
    },

    setMissingEvidence(state, action: PayloadAction<MissingEvidenceItem[]>) {
      state.current.missing_evidence_items = action.payload;
      state.isDirty = true;
    },
    addMissingEvidence(state, action: PayloadAction<MissingEvidenceItem>) {
      if (!state.current.missing_evidence_items) state.current.missing_evidence_items = [];
      state.current.missing_evidence_items.push(action.payload);
      state.isDirty = true;
    },
    removeMissingEvidence(state, action: PayloadAction<number>) {
      if (state.current.missing_evidence_items) {
        state.current.missing_evidence_items.splice(action.payload, 1);
        state.isDirty = true;
      }
    },

    setCapaItems(state, action: PayloadAction<CapaItem[]>) {
      state.current.capa_items = action.payload;
      state.isDirty = true;
    },
    addCapaItem(state, action: PayloadAction<CapaItem>) {
      if (!state.current.capa_items) state.current.capa_items = [];
      state.current.capa_items.push(action.payload);
      state.isDirty = true;
    },
    updateCapaItem(state, action: PayloadAction<{ index: number; item: Partial<CapaItem> }>) {
      const idx = action.payload.index;
      if (state.current.capa_items && state.current.capa_items[idx]) {
        state.current.capa_items[idx] = {
          ...state.current.capa_items[idx],
          ...action.payload.item,
        };
        state.isDirty = true;
      }
    },
    removeCapaItem(state, action: PayloadAction<number>) {
      if (state.current.capa_items) {
        state.current.capa_items.splice(action.payload, 1);
        state.isDirty = true;
      }
    },
  },
});

export const {
  setInvestigation,
  resetInvestigation,
  updateDraftField,
  updateContentField,
  recordCauseConclusion,
  setReviewDecision,
  setSelectedExcerpt,
  clearSelectedExcerpt,
  setConflictServerVersion,
  setActiveTab,
  setSummaries,
  setLoadingSummaries,
  setSaving,
  saveSuccess,
  saveFailed,
  markReviewedSuccess,
  setActiveRequestId,
  addSourceDocument,
  setFiveWhys,
  updateFiveWhysStep,
  addFiveWhysStep,
  removeFiveWhysStep,
  setIshikawaFactors,
  toggleIshikawaFactor,
  updateIshikawaFactor,
  setMissingEvidence,
  addMissingEvidence,
  removeMissingEvidence,
  setCapaItems,
  addCapaItem,
  updateCapaItem,
  removeCapaItem,
  removeEvidence,
} = investigationSlice.actions;

export default investigationSlice.reducer;
