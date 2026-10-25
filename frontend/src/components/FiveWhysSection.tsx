import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  updateDraftField,
  updateContentField,
  setReviewDecision,
  setSelectedExcerpt,
} from '../store/investigationSlice';
import { FiveWhysDetailItem } from '../types';
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';

export const FiveWhysSection: React.FC = () => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);

  const fiveWhysList: FiveWhysDetailItem[] =
    current.content?.five_whys && current.content.five_whys.length > 0
      ? current.content.five_whys
      : (current.five_whys_steps || []).map((s) => ({
          step_number: s.step_number,
          question: s.question,
          answer: s.answer,
          category: s.category,
          evidence_reference: s.evidence_reference,
          is_unresolved: false,
        }));

  const reviewDecisions = current.content?.human_review_decisions || {};

  const handleUpdateStep = (index: number, updates: Partial<FiveWhysDetailItem>) => {
    const updated = fiveWhysList.map((step, i) =>
      i === index ? { ...step, ...updates } : step
    );
    dispatch(updateContentField({ section: 'five_whys', value: updated }));
  };

  const handleAddStep = () => {
    const nextNum = fiveWhysList.length + 1;
    const newStep: FiveWhysDetailItem = {
      step_number: nextNum,
      question: `Why did step ${nextNum - 1} occur?`,
      answer: '',
      category: nextNum <= 2 ? 'PHYSICAL' : nextNum <= 4 ? 'HUMAN' : 'SYSTEMIC',
      evidence_reference: '',
      is_unresolved: false,
    };
    dispatch(
      updateContentField({
        section: 'five_whys',
        value: [...fiveWhysList, newStep],
      })
    );
  };

  const handleRemoveStep = (index: number) => {
    const updated = fiveWhysList
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, step_number: i + 1 }));
    dispatch(updateContentField({ section: 'five_whys', value: updated }));
  };

  const handleReviewDecision = (
    index: number,
    decisionState: 'ACCEPTED' | 'EDITED' | 'REJECTED'
  ) => {
    const itemKey = `five_whys:${index}`;
    dispatch(
      setReviewDecision({
        itemKey,
        decisionState,
        decidedBy: current.investigator_name || 'Investigator',
      })
    );
  };

  const openCitationExcerpt = (evidenceRef?: string) => {
    if (!evidenceRef) return;
    const srcDoc = (current.source_documents || []).find((d) =>
      d.segments?.some((s) => s.segment_id === evidenceRef)
    );
    const seg = srcDoc?.segments?.find((s) => s.segment_id === evidenceRef);

    dispatch(
      setSelectedExcerpt({
        segmentId: evidenceRef,
        documentTitle: srcDoc?.display_name || 'Attached Evidence',
        pageNumber: seg?.page_number,
        paragraphIndex: seg?.paragraph_index,
        text: seg?.text || `Referenced evidence: ${evidenceRef}`,
        status: 'SUPPORTED',
      })
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Root Cause Conclusion Card */}
      <div
        className="card-surface"
        style={{
          borderLeft: '4px solid var(--color-teal)',
          background: 'var(--color-teal-bg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.4rem' }}>
          <CheckCircle2 size={16} color="var(--color-teal)" />
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-teal-dark)' }}>
            Systemic Root Cause Summary (FDA Q7 & ICH Q10 Target)
          </h4>
        </div>
        <textarea
          value={current.root_cause_summary || ''}
          onChange={(e) =>
            dispatch(updateDraftField({ field: 'root_cause_summary', value: e.target.value }))
          }
          placeholder="Systemic root cause derived from deductive progression (e.g. Inadequate PM interval on PRV-201 elastomer diaphragm)..."
          rows={3}
          className="form-textarea"
          style={{ fontSize: '0.8125rem' }}
        />
      </div>

      {/* 5 Whys Progression Chain */}
      <div className="card-surface">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              Deductive 5 Whys Progression Chain
            </h3>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Stops when evidence runs out. Unresolved links are flagged rather than inventing fake answers.
            </p>
          </div>
          <button
            onClick={handleAddStep}
            className="btn btn-secondary btn-sm"
            aria-label="Add why step"
          >
            <Plus size={13} /> Add Why Step
          </button>
        </div>

        {fiveWhysList.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
            }}
          >
            No 5 Whys steps recorded yet. Attach an evidence source and run analysis to populate automatically.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {fiveWhysList.map((step, idx) => {
              const itemKey = `five_whys:${idx}`;
              const decision = reviewDecisions[itemKey]?.decision_state;

              return (
                <div
                  key={idx}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem',
                    background: step.is_unresolved ? 'var(--color-amber-bg)' : 'var(--bg-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                  }}
                >
                  {/* Step Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        className="badge font-mono"
                        style={{
                          background: 'var(--bg-surface-subtle)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '0.7rem',
                        }}
                      >
                        Why #{step.step_number || idx + 1}
                      </span>

                      {step.is_unresolved ? (
                        <span
                          className="badge"
                          style={{
                            background: 'var(--color-amber-bg)',
                            color: 'var(--color-amber)',
                            border: '1px solid var(--color-amber-border)',
                          }}
                        >
                          <AlertCircle size={10} /> Unresolved (Evidence Boundary)
                        </span>
                      ) : (
                        <span className="badge font-mono badge-draft">
                          {step.category || 'PHYSICAL'}
                        </span>
                      )}

                      {/* Evidence Reference Chip */}
                      {step.evidence_reference && (
                        <button
                          type="button"
                          onClick={() => openCitationExcerpt(step.evidence_reference)}
                          className="citation-chip"
                          title="Click to view supporting source excerpt"
                        >
                          Ref: [{step.evidence_reference}]
                        </button>
                      )}
                    </div>

                    {/* Step Actions: Review Controls (Accept, Edit, Reject) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {decision && (
                        <span
                          className={`badge ${
                            decision === 'ACCEPTED'
                              ? 'badge-approved'
                              : decision === 'REJECTED'
                              ? 'badge-draft'
                              : 'badge-review'
                          }`}
                          style={{ fontSize: '0.62rem' }}
                        >
                          {decision}
                        </span>
                      )}

                      <button
                        onClick={() => handleReviewDecision(idx, 'ACCEPTED')}
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: '0.15rem 0.4rem',
                          fontSize: '0.68rem',
                          color: decision === 'ACCEPTED' ? 'var(--color-green)' : undefined,
                        }}
                        title="Accept AI proposed answer"
                      >
                        <Check size={11} /> Accept
                      </button>

                      <button
                        onClick={() => handleReviewDecision(idx, 'REJECTED')}
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: '0.15rem 0.4rem',
                          fontSize: '0.68rem',
                          color: decision === 'REJECTED' ? 'var(--color-red)' : undefined,
                        }}
                        title="Reject proposed step"
                      >
                        <X size={11} /> Reject
                      </button>

                      <button
                        onClick={() => handleRemoveStep(idx)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.15rem 0.35rem', color: 'var(--text-muted)' }}
                        title="Delete step"
                        aria-label={`Delete Why step ${idx + 1}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Question */}
                  <div>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>
                      Question:
                    </label>
                    <input
                      type="text"
                      value={step.question}
                      onChange={(e) => {
                        handleUpdateStep(idx, { question: e.target.value });
                        handleReviewDecision(idx, 'EDITED');
                      }}
                      className="form-input"
                      style={{ fontSize: '0.78rem' }}
                    />
                  </div>

                  {/* Proposed Answer */}
                  <div>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>
                      Proposed Evidence-Based Answer:
                    </label>
                    <textarea
                      value={step.answer}
                      onChange={(e) => {
                        handleUpdateStep(idx, { answer: e.target.value });
                        handleReviewDecision(idx, 'EDITED');
                      }}
                      placeholder="Ground answer in empirical records..."
                      rows={2}
                      className="form-textarea"
                      style={{ fontSize: '0.78rem' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
