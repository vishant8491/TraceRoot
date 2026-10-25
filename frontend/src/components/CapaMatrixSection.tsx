import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  addCapaItem,
  updateCapaItem,
  removeCapaItem,
} from '../store/investigationSlice';
import { CapaType, CapaStatus } from '../types';
import { Plus, Trash2 } from 'lucide-react';

const CAPA_SECTIONS: { type: CapaType; label: string; description: string; color: string }[] = [
  {
    type: 'CONTAINMENT',
    label: 'Immediate Containment Actions',
    description: 'Short-term barrier controls (e.g. Quarantine holds, batch stop) to prevent exposure. Does not fix root cause.',
    color: 'var(--color-red)',
  },
  {
    type: 'CORRECTIVE',
    label: 'Corrective Actions (Root Cause Remediation)',
    description: 'Remedies the verified physical/operational failure mechanism to prevent recurrence on this line.',
    color: 'var(--color-teal)',
  },
  {
    type: 'PREVENTIVE',
    label: 'Preventive Actions (Systemic Prevention)',
    description: 'Proactive quality system, PM, or procedural updates applied across other production lines and campaigns.',
    color: 'var(--color-green)',
  },
];

export const CapaMatrixSection: React.FC = () => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);
  const items = current.capa_items || [];

  const handleAddItem = (type: CapaType) => {
    dispatch(
      addCapaItem({
        capa_type: type,
        action_description: `New ${type.toLowerCase()} action description...`,
        owner: 'Responsible Lead',
        target_date: '30 Days',
        effectiveness_criteria: 'Pre-defined quantitative criteria to confirm success...',
        status: 'PROPOSED',
      })
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>ICH Q10 Corrective & Preventive Action (CAPA) Matrix</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Enforces regulatory separation between temporary containment and permanent corrective/preventive actions, with mandatory effectiveness verification.
        </p>
      </div>

      {CAPA_SECTIONS.map(({ type, label, description, color }) => {
        const sectionItems = items
          .map((item, originalIndex) => ({ ...item, originalIndex }))
          .filter((item) => item.capa_type === type);

        return (
          <div
            key={type}
            className="glass-card"
            style={{ borderLeft: `4px solid ${color}` }}
          >
            <div className="glass-card-header">
              <div>
                <h4 style={{ fontSize: '0.925rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{description}</p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleAddItem(type)}
                style={{ fontSize: '0.725rem' }}
              >
                <Plus size={13} /> Add {type}
              </button>
            </div>

            {sectionItems.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                No {type.toLowerCase()} items proposed yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {sectionItems.map((item) => (
                  <div
                    key={item.originalIndex}
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
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <textarea
                        value={item.action_description}
                        onChange={(e) =>
                          dispatch(
                            updateCapaItem({
                              index: item.originalIndex,
                              item: { action_description: e.target.value },
                            })
                          )
                        }
                        rows={2}
                        className="form-textarea"
                        style={{ fontSize: '0.825rem', flex: 1 }}
                      />

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <select
                          value={item.status}
                          onChange={(e) =>
                            dispatch(
                              updateCapaItem({
                                index: item.originalIndex,
                                item: { status: e.target.value as CapaStatus },
                              })
                            )
                          }
                          className="form-select"
                          style={{ fontSize: '0.725rem', padding: '0.2rem 0.5rem', width: 'auto' }}
                        >
                          <option value="PROPOSED">PROPOSED</option>
                          <option value="IMPLEMENTED">IMPLEMENTED</option>
                          <option value="VERIFIED">VERIFIED</option>
                        </select>

                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => dispatch(removeCapaItem(item.originalIndex))}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 2fr', gap: '0.6rem' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.68rem' }}>
                          Owner / Responsible Lead:
                        </label>
                        <input
                          type="text"
                          value={item.owner || ''}
                          onChange={(e) =>
                            dispatch(
                              updateCapaItem({
                                index: item.originalIndex,
                                item: { owner: e.target.value },
                              })
                            )
                          }
                          placeholder="e.g. Lead Instrument Engineer"
                          className="form-input"
                          style={{ fontSize: '0.75rem' }}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: '0.68rem' }}>
                          Target Completion Date:
                        </label>
                        <input
                          type="text"
                          value={item.target_date || ''}
                          onChange={(e) =>
                            dispatch(
                              updateCapaItem({
                                index: item.originalIndex,
                                item: { target_date: e.target.value },
                              })
                            )
                          }
                          placeholder="e.g. 14 Days / 2026-11-15"
                          className="form-input"
                          style={{ fontSize: '0.75rem' }}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: '0.68rem', color: 'var(--color-teal)' }}>
                          Effectiveness Check Criteria (ICH Q10 Mandate):
                        </label>
                        <input
                          type="text"
                          value={item.effectiveness_criteria || ''}
                          onChange={(e) =>
                            dispatch(
                              updateCapaItem({
                                index: item.originalIndex,
                                item: { effectiveness_criteria: e.target.value },
                              })
                            )
                          }
                          placeholder="Predefined metric to verify root cause was permanently eliminated"
                          className="form-input font-mono"
                          style={{ fontSize: '0.75rem' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
