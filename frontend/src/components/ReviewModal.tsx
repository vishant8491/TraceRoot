import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setInvestigation, markReviewedSuccess } from '../store/investigationSlice';
import { api } from '../services/api';
import {
  CheckCircle2,
  X,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);

  const [reviewerName, setReviewerName] = useState(current.investigator_name || '');
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Check unreviewed items in content
  const content = current.content || {};
  const unreviewedFields: string[] = [];

  // Check field provenance
  if (content.field_provenance) {
    Object.entries(content.field_provenance).forEach(([fName, prov]) => {
      if (prov.review_state === 'UNREVIEWED') {
        unreviewedFields.push(`Field: ${fName.replace(/_/g, ' ')}`);
      }
    });
  }

  // Check 5 whys
  const fiveWhys = content.five_whys || [];
  fiveWhys.forEach((fw, idx) => {
    if (!content.human_review_decisions?.[`five_whys:${idx}`]) {
      unreviewedFields.push(`5 Whys Step ${fw.step_number || idx + 1}`);
    }
  });

  // Check CAPA suggestions
  const capas = content.capa_suggestions || [];
  capas.forEach((c, idx) => {
    if (!content.human_review_decisions?.[`capa:${idx}`]) {
      const capaDesc = c.proposed_action || (c as any).action_description || `Action #${idx + 1}`;
      unreviewedFields.push(`CAPA: ${capaDesc.slice(0, 35)}...`);
    }
  });

  const handleCompleteReview = async (autoAcceptRemaining: boolean) => {
    if (!reviewerName.trim()) {
      setErrorMsg('Reviewer display name is required for GMP audit trail accountability.');
      return;
    }
    if (!current.id) {
      setErrorMsg('Please save the investigation before performing formal review.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const decisions: Record<string, any> = {
        ...(content.human_review_decisions || {}),
      };

      if (autoAcceptRemaining) {
        // Auto-accept unreviewed fields
        if (content.field_provenance) {
          Object.keys(content.field_provenance).forEach((fName) => {
            decisions[`field:${fName}`] = {
              decision_state: 'ACCEPTED',
              decided_by: reviewerName.trim(),
              comment: 'Auto-accepted during final formal review.',
            };
          });
        }
        // Auto-accept 5 whys
        fiveWhys.forEach((_, idx) => {
          if (!decisions[`five_whys:${idx}`]) {
            decisions[`five_whys:${idx}`] = {
              decision_state: 'ACCEPTED',
              decided_by: reviewerName.trim(),
            };
          }
        });
        // Auto-accept CAPA
        capas.forEach((_, idx) => {
          if (!decisions[`capa:${idx}`]) {
            decisions[`capa:${idx}`] = {
              decision_state: 'ACCEPTED',
              decided_by: reviewerName.trim(),
            };
          }
        });
      }

      const result = await api.submitReview(current.id, {
        version: current.version || 1,
        reviewer_name: reviewerName.trim(),
        decisions: decisions,
        comment: reviewComment.trim() || undefined,
      });

      dispatch(setInvestigation(result.investigation));
      dispatch(
        markReviewedSuccess({
          reviewerName: reviewerName.trim(),
          reviewedAt: new Date().toISOString(),
          version: result.investigation.version || 2,
        })
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Formal review submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-dialog-title"
    >
      <div className="modal-content" style={{ maxWidth: '520px' }}>
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ClipboardCheck size={18} color="var(--color-teal)" />
            <h3 id="review-dialog-title" style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              Formal Investigation Review & Sign-Off
            </h3>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            aria-label="Close review dialog"
            style={{ padding: '0.2rem', height: '24px', width: '24px' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {errorMsg && (
            <div className="error-box" style={{ fontSize: '0.75rem', display: 'flex', gap: '0.4rem' }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Unreviewed items warning if any */}
          {unreviewedFields.length > 0 && (
            <div className="amber-evidence-box" style={{ fontSize: '0.75rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <AlertTriangle size={14} /> {unreviewedFields.length} Item(s) Pending Individual Review
              </div>
              <p style={{ marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
                Regulatory standards require deliberate review of all AI draft proposals prior to closure. You can choose to accept all remaining supported items now or close and review each individually.
              </p>
              <div style={{ maxHeight: '80px', overflowY: 'auto', fontSize: '0.7rem', color: 'var(--color-amber)' }}>
                {unreviewedFields.slice(0, 5).map((f, i) => (
                  <div key={i}>• {f}</div>
                ))}
                {unreviewedFields.length > 5 && (
                  <div>...and {unreviewedFields.length - 5} more items</div>
                )}
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Reviewer Display Name <span style={{ color: 'var(--color-red)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Dr. Helena Thorne (Lead QA Reviewer)"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="form-input"
              autoFocus
            />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
              Accountable signer for 21 CFR Part 11 audit records.
            </span>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Review Rationale / Notes</label>
            <textarea
              placeholder="Summary of scientific concurrence, verification rationale, and approval remarks..."
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={3}
              className="form-textarea"
            />
          </div>

          {/* Regulatory Disclaimer */}
          <div
            style={{
              padding: '0.65rem',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.68rem',
              color: 'var(--text-muted)',
              lineHeight: '1.4',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
              Regulatory Accountability Notice:
            </div>
            Recording this review marks the investigation as REVIEWED and locks AI auto-mutation.
            Recording a conclusion reflects investigator review and does not imply system verification of professional qualifications.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            background: 'var(--bg-surface)',
          }}
        >
          <button onClick={onClose} disabled={isSubmitting} className="btn btn-secondary btn-sm">
            Cancel
          </button>

          {unreviewedFields.length > 0 ? (
            <button
              onClick={() => handleCompleteReview(true)}
              disabled={isSubmitting}
              className="btn btn-primary btn-sm"
            >
              <CheckCircle2 size={13} /> Accept All Supported & Mark Reviewed
            </button>
          ) : (
            <button
              onClick={() => handleCompleteReview(false)}
              disabled={isSubmitting}
              className="btn btn-primary btn-sm"
            >
              <CheckCircle2 size={13} /> Confirm & Mark Reviewed
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
