import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  updateContentField,
  recordCauseConclusion,
  setSelectedExcerpt,
  setReviewDecision,
} from '../store/investigationSlice';
import { PotentialCauseItem, ContributingFactorItem } from '../types';
import {
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';

export const PotentialCausesSection: React.FC = () => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);

  const potentialCauses: PotentialCauseItem[] = current.content?.potential_causes || [];
  const contributingFactors: ContributingFactorItem[] = current.content?.contributing_factors || [];
  const reviewDecisions = current.content?.human_review_decisions || {};

  // Conclusion recording state
  const [activeConclusionCause, setActiveConclusionCause] = useState<PotentialCauseItem | null>(null);
  const [conclusionStatus, setConclusionStatus] = useState<'VERIFIED' | 'RULED_OUT'>('VERIFIED');
  const [conclusionReviewer, setConclusionReviewer] = useState(current.investigator_name || '');
  const [conclusionRationale, setConclusionRationale] = useState('');
  const [conclusionRef, setConclusionRef] = useState('');
  const [conclusionError, setConclusionError] = useState<string | null>(null);

  const handleOpenConclusionModal = (cause: PotentialCauseItem) => {
    setActiveConclusionCause(cause);
    setConclusionStatus(cause.status === 'VERIFIED' ? 'VERIFIED' : 'VERIFIED');
    setConclusionReviewer(cause.conclusion_details?.reviewer_name || current.investigator_name || '');
    setConclusionRationale(cause.conclusion_details?.rationale || '');
    setConclusionRef(cause.conclusion_details?.evidence_reference || cause.source_references?.[0] || '');
    setConclusionError(null);
  };

  const handleSaveConclusion = () => {
    if (!conclusionReviewer.trim()) {
      setConclusionError('Reviewer name is required to record a formal conclusion.');
      return;
    }
    if (!conclusionRationale.trim()) {
      setConclusionError('Scientific verification rationale is required.');
      return;
    }
    if (!activeConclusionCause) return;

    dispatch(
      recordCauseConclusion({
        causeId: activeConclusionCause.id,
        status: conclusionStatus,
        reviewerName: conclusionReviewer.trim(),
        rationale: conclusionRationale.trim(),
        evidenceReference: conclusionRef.trim(),
      })
    );

    setActiveConclusionCause(null);
  };

  const handleAddCause = () => {
    const newCause: PotentialCauseItem = {
      id: `cause-${Date.now()}`,
      cause: 'New investigative hypothesis description...',
      category: 'Machine / Equipment',
      evidence_strength: 'LIMITED',
      rationale: 'Investigator preliminary hypothesis based on physical inspection.',
      next_verification_step: 'Conduct physical calibration or log audit.',
      status: 'HYPOTHESIS',
    };
    dispatch(
      updateContentField({
        section: 'potential_causes',
        value: [...potentialCauses, newCause],
      })
    );
  };

  const handleUpdateCause = (id: string, updates: Partial<PotentialCauseItem>) => {
    const updated = potentialCauses.map((c) => (c.id === id ? { ...c, ...updates } : c));
    dispatch(updateContentField({ section: 'potential_causes', value: updated }));
  };

  const handleRemoveCause = (id: string) => {
    const updated = potentialCauses.filter((c) => c.id !== id);
    dispatch(updateContentField({ section: 'potential_causes', value: updated }));
  };

  const handleReviewDecision = (causeId: string, decisionState: 'ACCEPTED' | 'EDITED' | 'REJECTED') => {
    dispatch(
      setReviewDecision({
        itemKey: `cause:${causeId}`,
        decisionState,
        decidedBy: current.investigator_name || 'Investigator',
      })
    );
  };

  const openCitationExcerpt = (ref?: string) => {
    if (!ref) return;
    const srcDoc = (current.source_documents || []).find((d) =>
      d.segments?.some((s) => s.segment_id === ref)
    );
    const seg = srcDoc?.segments?.find((s) => s.segment_id === ref);

    dispatch(
      setSelectedExcerpt({
        segmentId: ref,
        documentTitle: srcDoc?.display_name || 'Attached Evidence',
        pageNumber: seg?.page_number,
        paragraphIndex: seg?.paragraph_index,
        text: seg?.text || `Referenced evidence: ${ref}`,
        status: 'SUPPORTED',
      })
    );
  };

  const getStrengthBadge = (strength: 'LIMITED' | 'MODERATE' | 'STRONG') => {
    switch (strength) {
      case 'STRONG':
        return {
          bg: 'var(--color-green-bg)',
          color: 'var(--color-green)',
          border: '1px solid var(--color-green-border)',
          label: 'Strength: Strong Evidence',
        };
      case 'MODERATE':
        return {
          bg: 'var(--color-teal-bg)',
          color: 'var(--color-teal-dark)',
          border: '1px solid var(--color-teal-border)',
          label: 'Strength: Moderate Evidence',
        };
      case 'LIMITED':
      default:
        return {
          bg: 'var(--color-amber-bg)',
          color: 'var(--color-amber)',
          border: '1px solid var(--color-amber-border)',
          label: 'Strength: Limited Evidence',
        };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 1rem',
        }}
      >
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            Root Cause Hypotheses & Evidence Strength Assessment
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            AI hypotheses remain HYPOTHESIS by default until deliberate investigator conclusion. Categorical evidence strength; no calibrated fake percentages.
          </p>
        </div>
        <button onClick={handleAddCause} className="btn btn-secondary btn-sm">
          <Plus size={13} /> Add Hypothesis
        </button>
      </div>

      {/* Potential Causes List */}
      {potentialCauses.length === 0 ? (
        <div
          style={{
            padding: '2.5rem 1rem',
            textAlign: 'center',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
          }}
        >
          No potential causes formulated yet. Run AI analysis from the assistant to evaluate hypotheses.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {potentialCauses.map((cause) => {
            const strengthBadge = getStrengthBadge(cause.evidence_strength);
            const effectiveStatus = cause.status || 'HYPOTHESIS';
            const isVerified = effectiveStatus === 'VERIFIED';
            const isRuledOut = effectiveStatus === 'RULED_OUT';
            const decision = reviewDecisions[`cause:${cause.id}`]?.decision_state;

            return (
              <div
                key={cause.id}
                className="card-surface"
                style={{
                  borderLeft: isVerified
                    ? '4px solid var(--color-green)'
                    : isRuledOut
                    ? '4px solid var(--text-muted)'
                    : '4px solid var(--color-teal)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}
              >
                {/* Cause Card Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span
                      className="badge font-mono"
                      style={{
                        background: 'var(--bg-surface-subtle)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {cause.id}
                    </span>

                    <span className="badge font-mono badge-draft">
                      {cause.category}
                    </span>

                    {/* Categorical Evidence Strength Badge */}
                    <span
                      className="badge font-mono"
                      style={{
                        background: strengthBadge.bg,
                        color: strengthBadge.color,
                        border: strengthBadge.border,
                      }}
                    >
                      {strengthBadge.label}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`badge ${
                        isVerified
                          ? 'badge-approved'
                          : isRuledOut
                          ? 'badge-draft'
                          : 'badge-review'
                      }`}
                    >
                      {effectiveStatus}
                    </span>

                    {cause.source_references && cause.source_references.length > 0 && (
                      <button
                        type="button"
                        onClick={() => openCitationExcerpt(cause.source_references?.[0])}
                        className="citation-chip"
                      >
                        Ref: [{cause.source_references.join(', ')}]
                      </button>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {decision && (
                      <span className="badge badge-approved" style={{ fontSize: '0.62rem' }}>
                        {decision}
                      </span>
                    )}

                    <button
                      onClick={() => handleReviewDecision(cause.id, 'ACCEPTED')}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.15rem 0.45rem', fontSize: '0.68rem' }}
                      title="Accept hypothesis proposal"
                    >
                      <Check size={11} /> Accept
                    </button>

                    <button
                      onClick={() => handleReviewDecision(cause.id, 'REJECTED')}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.15rem 0.45rem', fontSize: '0.68rem' }}
                      title="Reject hypothesis"
                    >
                      <X size={11} /> Reject
                    </button>

                    <button
                      onClick={() => handleOpenConclusionModal(cause)}
                      className="btn btn-primary btn-sm"
                      style={{ padding: '0.15rem 0.55rem', fontSize: '0.68rem' }}
                    >
                      <ShieldCheck size={12} /> Record Conclusion
                    </button>

                    <button
                      onClick={() => handleRemoveCause(cause.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.15rem 0.35rem', color: 'var(--text-muted)' }}
                      title="Delete hypothesis"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Cause Description */}
                <div>
                  <label className="form-label" style={{ fontSize: '0.72rem' }}>
                    Potential Cause Description:
                  </label>
                  <textarea
                    value={cause.cause}
                    onChange={(e) => {
                      handleUpdateCause(cause.id, { cause: e.target.value });
                      handleReviewDecision(cause.id, 'EDITED');
                    }}
                    rows={2}
                    className="form-textarea"
                    style={{ fontSize: '0.8125rem' }}
                  />
                </div>

                {/* Evidence Rationale & Counter-Evidence Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.75rem' }}>
                  <div
                    style={{
                      padding: '0.55rem',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--color-teal-dark)', marginBottom: '0.2rem' }}>
                      Evidence-Based Rationale:
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {cause.rationale || 'Grounding in empirical telemetry or test records.'}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '0.55rem',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                      Counter-Evidence / Unsubstantiated Claims:
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {cause.counter_evidence || 'None documented; consistent with available telemetry.'}
                    </div>
                  </div>
                </div>

                {/* Next Verification Step */}
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-teal-dark)',
                    background: 'var(--color-teal-bg)',
                    padding: '0.45rem 0.65rem',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--color-teal-border)',
                  }}
                >
                  <strong>Next Verification Step:</strong> {cause.next_verification_step}
                </div>

                {/* Deliberate Conclusion Record Display if recorded */}
                {cause.conclusion_details && (
                  <div
                    style={{
                      background: isVerified ? 'var(--color-green-bg)' : 'var(--bg-surface-subtle)',
                      border: `1px solid ${isVerified ? 'var(--color-green-border)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-xs)',
                      padding: '0.55rem 0.75rem',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <strong style={{ color: isVerified ? 'var(--color-green)' : 'var(--text-secondary)' }}>
                        {isVerified ? '✓ Verified Root Cause Conclusion' : '✗ Ruled-Out Conclusion'}
                      </strong>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Signed by: {cause.conclusion_details.reviewer_name} (
                        {new Date(cause.conclusion_details.recorded_at).toLocaleDateString()})
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      <strong>Rationale:</strong> {cause.conclusion_details.rationale}
                    </div>
                    {cause.conclusion_details.evidence_reference && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.15rem' }}>
                        Evidence Reference: {cause.conclusion_details.evidence_reference}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Contributing Factors (6M Ishikawa Breakdown) */}
      <div className="card-surface">
        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.4rem' }}>
          Ishikawa Contributing Factors (Secondary Influences)
        </h4>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Distinct from the primary hypothesis; surfaces systemic procedural or environmental factors.
        </p>

        {contributingFactors.length === 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No secondary contributing factors extracted.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.65rem' }}>
            {contributingFactors.map((cf, idx) => (
              <div
                key={idx}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '0.6rem 0.75rem',
                  background: 'var(--bg-surface-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge font-mono badge-draft" style={{ fontSize: '0.65rem' }}>
                    {cf.category}
                  </span>
                  <span
                    className={`badge ${cf.is_contributing ? 'badge-review' : 'badge-draft'}`}
                    style={{ fontSize: '0.62rem' }}
                  >
                    {cf.is_contributing ? 'Contributing' : 'Not Contributing'}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {cf.factor}
                </div>
                {cf.notes && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {cf.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deliberate Conclusion Modal */}
      {activeConclusionCause && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="conclusion-modal-title"
        >
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div
              style={{
                padding: '0.9rem 1.15rem',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <ShieldCheck size={18} color="var(--color-teal)" />
                <h3 id="conclusion-modal-title" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  Record Scientific Conclusion for {activeConclusionCause.id}
                </h3>
              </div>
              <button
                onClick={() => setActiveConclusionCause(null)}
                className="btn btn-secondary btn-sm"
                aria-label="Close conclusion dialog"
                style={{ padding: '0.2rem', height: '24px', width: '24px' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {conclusionError && (
                <div className="error-box" style={{ fontSize: '0.75rem' }}>
                  {conclusionError}
                </div>
              )}

              <div>
                <label className="form-label">Hypothesis Under Evaluation:</label>
                <div
                  style={{
                    padding: '0.55rem',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  {activeConclusionCause.cause}
                </div>
              </div>

              <div>
                <label className="form-label">Deliberate Determination Status:</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setConclusionStatus('VERIFIED')}
                    className={`btn btn-sm ${conclusionStatus === 'VERIFIED' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                  >
                    <CheckCircle2 size={13} /> VERIFIED (Confirm Root Cause)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConclusionStatus('RULED_OUT')}
                    className={`btn btn-sm ${conclusionStatus === 'RULED_OUT' ? 'btn-danger' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                  >
                    <XCircle size={13} /> RULED OUT (Disproven)
                  </button>
                </div>
              </div>

              <div>
                <label className="form-label">
                  Reviewer Display Name <span style={{ color: 'var(--color-red)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Helena Thorne (Lead QA Reviewer)"
                  value={conclusionReviewer}
                  onChange={(e) => setConclusionReviewer(e.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">
                  Scientific Verification Rationale <span style={{ color: 'var(--color-red)' }}>*</span>
                </label>
                <textarea
                  placeholder="Document the physical evidence, audit log check, or testing data confirming or ruling out this hypothesis..."
                  value={conclusionRationale}
                  onChange={(e) => setConclusionRationale(e.target.value)}
                  rows={3}
                  className="form-textarea"
                />
              </div>

              <div>
                <label className="form-label">Supporting Evidence / Test Reference:</label>
                <input
                  type="text"
                  placeholder="e.g. Work Order WO-8924 / SCADA log channel AI-402"
                  value={conclusionRef}
                  onChange={(e) => setConclusionRef(e.target.value)}
                  className="form-input font-mono"
                />
              </div>

              <div
                style={{
                  padding: '0.55rem',
                  background: 'var(--bg-surface-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                }}
              >
                <strong>Regulatory Notice:</strong> AI hypotheses remain hypotheses until an investigator deliberately records a conclusion. Recording a conclusion reflects investigator review and does not imply system verification of professional qualifications.
              </div>
            </div>

            <div
              style={{
                padding: '0.75rem 1.15rem',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.45rem',
              }}
            >
              <button
                onClick={() => setActiveConclusionCause(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button onClick={handleSaveConclusion} className="btn btn-primary btn-sm">
                Save Formal Determination
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
