import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  setMissingEvidence,
  addMissingEvidence,
  removeMissingEvidence,
  updateDraftField,
} from '../store/investigationSlice';
import { ImpactLevel } from '../types';
import { ShieldAlert, CheckCircle2, XCircle, Plus, Trash2, HelpCircle } from 'lucide-react';

export const EvidenceEvaluationSection: React.FC = () => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);
  const missingItems = current.missing_evidence_items || [];
  const evidenceList = current.evidence_items || [];

  // Aggregate supporting and contradictory points across all evidence items
  const allSupporting = evidenceList.flatMap((ev) => ev.supporting_points || []);
  const allContradictory = evidenceList.flatMap((ev) => ev.contradictory_points || []);

  const handleAddMissingItem = () => {
    dispatch(
      addMissingEvidence({
        missing_item: 'New Missing Record / Document',
        rationale: 'Required for GMP compliance under FDA Q7 / ICH Q10.',
        impact_level: 'MEDIUM',
        recommended_action: 'Retrieve and verify document before final QA sign-off.',
      })
    );
  };

  const getImpactBadge = (level: ImpactLevel) => {
    switch (level) {
      case 'HIGH':
        return { background: 'var(--color-red-bg)', color: 'var(--color-red)', border: '1px solid var(--color-red-border)' };
      case 'MEDIUM':
        return { background: 'var(--color-amber-bg)', color: 'var(--color-amber)', border: '1px solid var(--color-amber-border)' };
      case 'LOW':
        return { background: 'var(--color-teal-bg)', color: 'var(--color-teal-dark)', border: '1px solid var(--color-teal-border)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Supporting vs Contradictory Evidence Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Supporting Evidence */}
        <div
          className="glass-card"
          style={{ borderTop: '3px solid var(--color-green)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <CheckCircle2 size={16} color="var(--color-green)" />
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Supporting Evidence Points</h4>
          </div>
          {allSupporting.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No supporting points extracted yet.
            </p>
          ) : (
            <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {allSupporting.map((point, idx) => (
                <li key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Contradictory Evidence */}
        <div
          className="glass-card"
          style={{ borderTop: '3px solid var(--color-amber)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <XCircle size={16} color="var(--color-amber)" />
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Contradictory / Ruled-Out Facts</h4>
          </div>
          {allContradictory.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No contradictory evidence points cataloged.
            </p>
          ) : (
            <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {allContradictory.map((point, idx) => (
                <li key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Missing Evidence & Regulatory Gaps Table */}
      <div className="glass-card">
        <div className="glass-card-header">
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={16} color="var(--color-teal)" /> Missing Evidence & Regulatory Documentation Gaps
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Identifies unattached records required under FDA Q7 §13.13 and ICH Q10 prior to investigation closeout.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleAddMissingItem}>
            <Plus size={13} /> Add Missing Record
          </button>
        </div>

        {missingItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '0.85rem' }}>No evidence gaps flagged.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {missingItems.map((item, idx) => {
              const impactStyle = getImpactBadge(item.impact_level);
              return (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
                      <span
                        className="badge"
                        style={{ ...impactStyle, fontSize: '0.65rem' }}
                      >
                        {item.impact_level} IMPACT
                      </span>
                      <input
                        type="text"
                        value={item.missing_item}
                        onChange={(e) => {
                          const updated = [...missingItems];
                          updated[idx] = { ...updated[idx], missing_item: e.target.value };
                          dispatch(setMissingEvidence(updated));
                        }}
                        className="form-input"
                        style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}
                      />
                    </div>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => dispatch(removeMissingEvidence(idx))}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.68rem' }}>
                        Regulatory Rationale:
                      </label>
                      <textarea
                        value={item.rationale}
                        onChange={(e) => {
                          const updated = [...missingItems];
                          updated[idx] = { ...updated[idx], rationale: e.target.value };
                          dispatch(setMissingEvidence(updated));
                        }}
                        rows={2}
                        className="form-textarea"
                        style={{ fontSize: '0.75rem' }}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.68rem' }}>
                        Recommended Action:
                      </label>
                      <textarea
                        value={item.recommended_action || ''}
                        onChange={(e) => {
                          const updated = [...missingItems];
                          updated[idx] = { ...updated[idx], recommended_action: e.target.value };
                          dispatch(setMissingEvidence(updated));
                        }}
                        rows={2}
                        className="form-textarea"
                        style={{ fontSize: '0.75rem' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Uncertainty & Residual Risk Notes */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <HelpCircle size={16} color="var(--color-amber)" />
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Investigation Uncertainty & Residual Risk</h4>
        </div>
        <textarea
          value={current.uncertainty_notes || ''}
          onChange={(e) =>
            dispatch(updateDraftField({ field: 'uncertainty_notes', value: e.target.value }))
          }
          placeholder="Document unresolved questions, assumptions, or risk evaluations regarding adjacent lots..."
          rows={3}
          className="form-textarea"
          style={{ fontSize: '0.85rem' }}
        />
      </div>
    </div>
  );
};
