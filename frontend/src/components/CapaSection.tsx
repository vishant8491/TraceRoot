import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { updateContentField, setReviewDecision } from '../store/investigationSlice';
import { CapaDetailItem } from '../types';
import {
  Plus,
  Trash2,
  Check,
  X,
} from 'lucide-react';

const SECTIONS = [
  {
    type: 'CORRECTIVE' as const,
    title: 'Corrective Actions (Physical & Operational Remediation)',
    desc: 'Remediates the verified failure mechanism to eliminate recurrence on this unit operation.',
    accentColor: 'var(--color-teal)',
  },
  {
    type: 'PREVENTIVE' as const,
    title: 'Preventive Actions (Systemic & Facility-Wide Prevention)',
    desc: 'Proactive procedural, preventive maintenance, or quality system upgrades across API manufacturing.',
    accentColor: 'var(--color-green)',
  },
];

export const CapaSection: React.FC = () => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);

  const capaList: CapaDetailItem[] = current.content?.capa_suggestions || [];
  const reviewDecisions = current.content?.human_review_decisions || {};

  const handleUpdateItem = (id: string, updates: Partial<CapaDetailItem>) => {
    const updated = capaList.map((item) => (item.id === id ? { ...item, ...updates } : item));
    dispatch(updateContentField({ section: 'capa_suggestions', value: updated }));
  };

  const handleAddItem = (type: 'CORRECTIVE' | 'PREVENTIVE') => {
    const newItem: CapaDetailItem = {
      id: `capa-${Date.now()}`,
      type: type,
      related_cause_id: current.content?.potential_causes?.[0]?.id || 'cause-1',
      proposed_action: `New ${type.toLowerCase()} action proposal...`,
      rationale: 'Directly addresses identified root cause mechanism.',
      responsible_role: 'Maintenance Engineering Lead',
      proposed_due_date: '30 Calendar Days',
      effectiveness_check: 'Empirical verification criteria to prove remediation success...',
      status: 'PROPOSED',
    };
    dispatch(
      updateContentField({
        section: 'capa_suggestions',
        value: [...capaList, newItem],
      })
    );
  };

  const handleRemoveItem = (id: string) => {
    const updated = capaList.filter((item) => item.id !== id);
    dispatch(updateContentField({ section: 'capa_suggestions', value: updated }));
  };

  const handleReviewDecision = (capaId: string, decisionState: 'ACCEPTED' | 'EDITED' | 'REJECTED') => {
    dispatch(
      setReviewDecision({
        itemKey: `capa:${capaId}`,
        decisionState,
        decidedBy: current.investigator_name || 'Investigator',
      })
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* CAPA Notice */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            ICH Q10 Corrective & Preventive Action (CAPA) Proposals
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Proposals remain editable drafts. Specific assigned personnel, SOP revisions, or approved deadlines are not invented by the AI.
          </p>
        </div>
      </div>

      {SECTIONS.map(({ type, title, desc, accentColor }) => {
        const items = capaList.filter((c) => (c.type || (c as any).capa_type) === type);

        return (
          <div key={type} className="card-surface" style={{ borderLeft: `4px solid ${accentColor}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>{title}</h4>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{desc}</p>
              </div>
              <button
                onClick={() => handleAddItem(type)}
                className="btn btn-secondary btn-sm"
              >
                <Plus size={12} /> Add {type === 'CORRECTIVE' ? 'Corrective' : 'Preventive'}
              </button>
            </div>

            {items.length === 0 ? (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                No {type.toLowerCase()} actions proposed yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {items.map((item) => {
                  const decision = reviewDecisions[`capa:${item.id}`]?.decision_state;

                  return (
                    <div
                      key={item.id}
                      style={{
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '0.75rem',
                        background: 'var(--bg-surface-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}
                    >
                      {/* Header with Linked Cause ID & Review Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span className="badge font-mono badge-draft" style={{ fontSize: '0.68rem' }}>
                            {item.id}
                          </span>

                          {item.related_cause_id && (
                            <span
                              className="badge font-mono"
                              style={{
                                background: 'var(--color-teal-bg)',
                                color: 'var(--color-teal-dark)',
                                border: '1px solid var(--color-teal-border)',
                                fontSize: '0.65rem',
                              }}
                            >
                              Linked Cause: {item.related_cause_id}
                            </span>
                          )}

                          <span className="badge font-mono badge-draft" style={{ fontSize: '0.62rem' }}>
                            {item.status || 'PROPOSED'}
                          </span>
                        </div>

                        {/* Review Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {decision && (
                            <span className="badge badge-approved" style={{ fontSize: '0.62rem' }}>
                              {decision}
                            </span>
                          )}

                          <button
                            onClick={() => handleReviewDecision(item.id, 'ACCEPTED')}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.15rem 0.45rem', fontSize: '0.68rem' }}
                            title="Accept CAPA proposal"
                          >
                            <Check size={11} /> Accept
                          </button>

                          <button
                            onClick={() => handleReviewDecision(item.id, 'REJECTED')}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.15rem 0.45rem', fontSize: '0.68rem' }}
                            title="Reject CAPA proposal"
                          >
                            <X size={11} /> Reject
                          </button>

                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.15rem 0.35rem', color: 'var(--text-muted)' }}
                            title="Delete CAPA item"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Proposed Action Textarea */}
                      <div>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>
                          Proposed Action Description:
                        </label>
                        <textarea
                          value={item.proposed_action || (item as any).action_description || ''}
                          onChange={(e) => {
                            handleUpdateItem(item.id, { proposed_action: e.target.value });
                            handleReviewDecision(item.id, 'EDITED');
                          }}
                          rows={2}
                          className="form-textarea"
                          style={{ fontSize: '0.78rem' }}
                        />
                      </div>

                      {/* Role & Due Date Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.68rem' }}>
                            Proposed Responsible Role:
                          </label>
                          <input
                            type="text"
                            value={item.responsible_role || ''}
                            onChange={(e) => {
                              handleUpdateItem(item.id, { responsible_role: e.target.value });
                              handleReviewDecision(item.id, 'EDITED');
                            }}
                            placeholder="e.g. Lead Process Engineer"
                            className="form-input"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                          />
                        </div>

                        <div>
                          <label className="form-label" style={{ fontSize: '0.68rem' }}>
                            Proposed Due Date / Window:
                          </label>
                          <input
                            type="text"
                            value={item.proposed_due_date || ''}
                            onChange={(e) => {
                              handleUpdateItem(item.id, { proposed_due_date: e.target.value });
                              handleReviewDecision(item.id, 'EDITED');
                            }}
                            placeholder="e.g. 30 Calendar Days"
                            className="form-input"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                          />
                        </div>
                      </div>

                      {/* Measurable Effectiveness Check */}
                      <div
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '0.5rem 0.65rem',
                        }}
                      >
                        <label className="form-label" style={{ fontSize: '0.68rem', color: 'var(--color-teal-dark)' }}>
                          Measurable Effectiveness Check Criteria (Mandatory for Closure):
                        </label>
                        <textarea
                          value={item.effectiveness_check || (item as any).effectiveness_criteria || ''}
                          onChange={(e) => {
                            handleUpdateItem(item.id, { effectiveness_check: e.target.value });
                            handleReviewDecision(item.id, 'EDITED');
                          }}
                          placeholder="Define quantitative test or sensor criteria to verify non-recurrence..."
                          rows={2}
                          className="form-textarea"
                          style={{ fontSize: '0.75rem' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
