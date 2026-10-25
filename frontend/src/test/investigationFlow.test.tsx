import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import investigationReducer, {
  setInvestigation,
  setConflictServerVersion,
} from '../store/investigationSlice';
import aiAssistantReducer from '../store/aiAssistantSlice';
import { IncidentSummarySection } from '../components/IncidentSummarySection';
import { EvidenceExcerptModal } from '../components/EvidenceExcerptModal';
import { PotentialCausesSection } from '../components/PotentialCausesSection';
import { CapaSection } from '../components/CapaSection';
import { ReviewModal } from '../components/ReviewModal';
import { ConflictRecoveryModal } from '../components/ConflictRecoveryModal';
import { AiAssistantPanel } from '../components/AiAssistantPanel';
import { Investigation } from '../types';

function createMockInvestigation(): Investigation {
  return {
    id: 'test-inv-001',
    investigation_number: 'INV-2026-0001',
    title: 'Residual Solvent Excursion in Active Pharmaceutical Ingredient',
    status: 'DRAFT',
    product_name: 'Rosuvastatin Calcium API',
    batch_number: 'RSC-2026-801',
    manufacturing_stage: 'Vacuum Tray Drying',
    incident_date: '2026-10-21',
    site_department: 'API Synthesis Plant 3',
    equipment: 'VTD-402',
    observed_deviation: 'Residual THF 0.82% w/w against limit <= 0.50% w/w',
    expected_condition: 'Residual THF <= 0.50% w/w after 18h drying cycle',
    actual_condition: 'High THF level observed in release testing',
    immediate_containment: 'Batch RSC-2026-801 placed on physical QA quarantine',
    investigator_name: 'Dr. Sarah Lin',
    reviewer_name: null,
    reviewed_at: null,
    version: 1,
    content: {
      field_provenance: {
        observed_deviation: {
          value: 'Residual THF 0.82% w/w against limit <= 0.50% w/w',
          origin: 'AI',
          review_state: 'UNREVIEWED',
          source_references: [
            {
              source_id: 'src-1',
              segment_id: 'p1_s2',
              page_number: 1,
              paragraph_index: 1,
              quote: 'residual THF was 0.82% w/w (Limit <= 0.50% w/w)',
              is_quote_verified: true,
            },
          ],
          evidence_status: 'SUPPORTED',
        },
      },
      evidence_assessment: {
        observed_facts: ['Residual THF measured at 0.82% w/w'],
        reported_allegations: ['Operator noted slight hiss near door gasket'],
        contradictions_detected: [],
        missing_evidence_gaps: ['Condenser delta-T data unrecorded'],
        uncertainty_analysis: 'Root cause remains unconfirmed until vacuum seal integrity check',
      },
      five_whys: [
        {
          step_number: 1,
          question: 'Why did the batch fail release specifications?',
          answer: 'Residual THF exceeded 0.50% w/w threshold.',
          evidence_reference: 'QC Analytical Release Sheet Lot 801',
          is_unresolved: false,
          provenance: {
            value: 'Residual THF exceeded 0.50% w/w threshold.',
            origin: 'AI',
            review_state: 'UNREVIEWED',
            source_references: [],
            evidence_status: 'SUPPORTED',
          },
        },
      ],
      potential_causes: [
        {
          id: 'cause-1',
          category: 'Machine',
          cause: 'Vacuum tray dryer door seal micro-leakage causing insufficient vacuum depth',
          evidence_strength: 'MODERATE',
          confidence_score: 0.72,
          supporting_evidence: ['Door gasket replaced 8 months ago without leak test'],
          contrary_evidence: [],
          next_verification_step: 'Conduct helium leak detection on VTD-402 door flange',
          provenance: {
            value: 'Vacuum tray dryer door seal micro-leakage',
            origin: 'AI',
            review_state: 'UNREVIEWED',
            source_references: [],
            evidence_status: 'INFERRED',
          },
        },
      ],
      contributing_factors: [],
      evidence_gaps: [],
      capa_suggestions: [
        {
          id: 'capa-1',
          capa_type: 'CORRECTIVE',
          related_cause_id: 'cause-1',
          action_description: 'Replace silicone door gasket and perform vacuum decay rate qualification test.',
          short_rationale: 'Restores primary vacuum envelope integrity.',
          responsible_role: 'Reliability Engineering Lead',
          proposed_due_date: '2026-11-15',
          effectiveness_criteria: 'Zero vacuum decay excursions across 5 consecutive commercial drying runs.',
          status: 'PROPOSED',
          provenance: {
            value: 'Replace silicone door gasket',
            origin: 'AI',
            review_state: 'UNREVIEWED',
            source_references: [],
            evidence_status: 'INFERRED',
          },
        },
      ],
      human_edit_proposals: {},
      domain_guidance_references: [],
      regulatory_disclaimer: 'Draft for technical review under GMP.',
      human_review_decisions: {},
    },
    source_documents: [
      {
        id: 'src-1',
        investigation_id: 'test-inv-001',
        source_type: 'PDF',
        display_name: 'Deviation_Report_DEV-801.pdf',
        extracted_text: '--- Page 1 ---\nResidual solvent release testing for lot RSC-2026-801.\n\nresidual THF was 0.82% w/w (Limit <= 0.50% w/w).',
        segments: [
          {
            segment_id: 'p1_s1',
            page_number: 1,
            paragraph_index: 0,
            char_offset_start: 0,
            char_offset_end: 72,
            text: 'Residual solvent release testing for lot RSC-2026-801.',
          },
          {
            segment_id: 'p1_s2',
            page_number: 1,
            paragraph_index: 1,
            char_offset_start: 74,
            char_offset_end: 125,
            text: 'residual THF was 0.82% w/w (Limit <= 0.50% w/w).',
          },
        ],
        content_hash: 'abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        created_at: '2026-10-21T10:00:00Z',
      },
    ],
    latest_run: null,
    created_at: '2026-10-21T10:00:00Z',
    updated_at: '2026-10-21T10:00:00Z',
  };
}

function renderWithStore(ui: React.ReactElement, initialInvestigation = createMockInvestigation()) {
  const store = configureStore({
    reducer: {
      investigation: investigationReducer,
      aiAssistant: aiAssistantReducer,
    },
  });
  store.dispatch(setInvestigation(initialInvestigation));
  return {
    store,
    ...render(<Provider store={store}>{ui}</Provider>),
  };
}

describe('TraceRoot Frontend RTL Verification Pass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A4 & E5: Incident Summary renders AI Draft indicator and source citation chip', () => {
    renderWithStore(<IncidentSummarySection />);

    // Check AI Draft indicator
    expect(screen.getByText('AI Draft')).toBeInTheDocument();

    // Check Citation Chip [p1_s2]
    const chip = screen.getByText('[p1_s2]');
    expect(chip).toBeInTheDocument();
  });

  it('A5 & E5: Editing an AI field dispatches human edit and updates provenance', () => {
    const { store } = renderWithStore(<IncidentSummarySection />);

    const textarea = screen.getByDisplayValue('Residual THF 0.82% w/w against limit <= 0.50% w/w');
    fireEvent.change(textarea, {
      target: { value: 'Investigator note: Verified second sample confirmed 0.84% w/w.' },
    });

    const state = store.getState().investigation;
    expect(state.current.observed_deviation).toBe('Investigator note: Verified second sample confirmed 0.84% w/w.');
    expect(state.isDirty).toBe(true);
    expect(state.dirtyFields.observed_deviation).toBe(true);

    // Provenance origin updated to HUMAN and citation removed
    const prov = state.current.content?.field_provenance?.observed_deviation;
    expect(prov?.origin).toBe('HUMAN');
    expect(prov?.review_state).toBe('EDITED');
    expect(prov?.source_references).toEqual([]);
  });

  it('A8 & E4: Clicking citation opens Evidence Excerpt modal with exact verbatim quote and page/paragraph', () => {
    renderWithStore(
      <>
        <IncidentSummarySection />
        <EvidenceExcerptModal />
      </>
    );

    const chip = screen.getByText('[p1_s2]');
    fireEvent.click(chip);

    // Modal opens
    expect(screen.getByText('Evidentiary Source Excerpt')).toBeInTheDocument();
    expect(screen.getByText(/Segment: p1_s2/i)).toBeInTheDocument();
    expect(screen.getByText(/Page 1/i)).toBeInTheDocument();
    expect(screen.getByText('Supported by source')).toBeInTheDocument();
    expect(screen.getByText(/residual THF was 0.82% w\/w/)).toBeInTheDocument();
  });

  it('C9 & E6: Potential Causes renders categorical strength (no fake %) and records deliberate conclusion', async () => {
    const { store } = renderWithStore(<PotentialCausesSection />);

    // Categorical strength badge: Moderate Evidence
    expect(screen.getByText(/Moderate Evidence/i)).toBeInTheDocument();
    // Default status is HYPOTHESIS
    expect(screen.getByText('HYPOTHESIS')).toBeInTheDocument();

    // Click Record Conclusion
    const conclusionBtn = screen.getByRole('button', { name: /Record Conclusion/i });
    fireEvent.click(conclusionBtn);

    // Modal opens
    expect(screen.getByText(/Record Scientific Conclusion/i)).toBeInTheDocument();

    // Fill reviewer signature and rationale
    const nameInput = screen.getByPlaceholderText(/e\.g\. Dr\. Helena Thorne/i);
    fireEvent.change(nameInput, { target: { value: 'Dr. Sarah Lin, Lead Investigator' } });

    const rationaleInput = screen.getByPlaceholderText(/Document the physical evidence/i);
    fireEvent.change(rationaleInput, {
      target: { value: 'Helium leak detector confirmed vacuum seal permeability on flange B.' },
    });

    // Confirm conclusion
    const submitBtn = screen.getByRole('button', { name: /Save Formal Determination/i });
    fireEvent.click(submitBtn);

    // Cause card status transitions to VERIFIED ROOT CAUSE
    const state = store.getState().investigation;
    const causeDecision = state.current.content?.human_review_decisions?.['cause:cause-1'];
    expect(causeDecision).toBeDefined();
    expect(causeDecision?.decision_state).toBe('VERIFIED');
    expect(causeDecision?.decided_by).toBe('Dr. Sarah Lin, Lead Investigator');
  });

  it('C14 & E1: CAPA matrix renders suggested actions with Accept and Reject review controls', () => {
    const { store } = renderWithStore(<CapaSection />);

    // Verifies action description and responsible role
    expect(screen.getByText(/Replace silicone door gasket/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Reliability Engineering Lead/i)).toBeInTheDocument();

    // Click Accept Action
    const acceptBtn = screen.getByRole('button', { name: /Accept/i });
    fireEvent.click(acceptBtn);

    const state = store.getState().investigation;
    const capaDecision = state.current.content?.human_review_decisions?.['capa:capa-1'];
    expect(capaDecision?.decision_state).toBe('ACCEPTED');
  });

  it('E2: Review Modal displays unreviewed item counts and requires reviewer name', () => {
    const onClose = vi.fn();
    renderWithStore(<ReviewModal isOpen={true} onClose={onClose} />);

    // Shows unreviewed count warning
    expect(screen.getByText(/Item\(s\) Pending Individual Review/i)).toBeInTheDocument();

    // Confirm button should be present
    const confirmBtn = screen.getByRole('button', { name: /Accept All Supported & Mark Reviewed/i });
    expect(confirmBtn).toBeInTheDocument();

    // Type reviewer name
    const reviewerInput = screen.getByPlaceholderText(/e\.g\. Dr\. Helena Thorne/i);
    fireEvent.change(reviewerInput, { target: { value: 'Dr. Eleanor Vance, QA Director' } });

    // Reviewer name is set
    expect(reviewerInput).toHaveValue('Dr. Eleanor Vance, QA Director');
  });

  it('D7: Concurrency Conflict Recovery Modal preserves local draft and offers recovery options', () => {
    const store = configureStore({
      reducer: {
        investigation: investigationReducer,
        aiAssistant: aiAssistantReducer,
      },
    });

    const localInv = createMockInvestigation();
    localInv.version = 1;
    localInv.title = 'Local Unsaved Edit in Progress';
    store.dispatch(setInvestigation(localInv));

    const serverInv = createMockInvestigation();
    serverInv.version = 2;
    serverInv.title = 'Remote Server Version from Colleague';
    store.dispatch(setConflictServerVersion(serverInv));

    render(
      <Provider store={store}>
        <ConflictRecoveryModal />
      </Provider>
    );

    // Displays 409 conflict explanation
    expect(screen.getByText(/Version Conflict Detected \(HTTP 409\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Local Unsaved Edit in Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Server Current Version/i)).toBeInTheDocument();

    // Options to recover
    expect(screen.getByRole('button', { name: /Overwrite Server/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save My Edits as New/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accept Server Version/i })).toBeInTheDocument();
  });

  it('B1 & G1: AI Assistant Panel includes synthetic demo presets with [SYNTHETIC TEST DATA] badge', () => {
    renderWithStore(<AiAssistantPanel />);

    // Check tabs
    expect(screen.getByRole('tab', { name: /PDF Report/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Paste Text/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Paste Email/i })).toBeInTheDocument();

    // Check synthetic test data badge or selector
    expect(screen.getByText(/\[SYNTHETIC\] Sample 1/i)).toBeInTheDocument();

    // Switch to Paste Email tab
    const emailTab = screen.getByRole('tab', { name: /Paste Email/i });
    fireEvent.click(emailTab);

    expect(screen.getByPlaceholderText(/From: lead@pharma\.com/i)).toBeInTheDocument();
  });
});
