import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  toggleIshikawaFactor,
  updateIshikawaFactor,
  setIshikawaFactors,
} from '../store/investigationSlice';
import { IshikawaCategory } from '../types';
import { CheckCircle, XCircle, Plus, Cpu, FlaskConical, BookOpen, Gauge, Users, CloudRain } from 'lucide-react';

const CATEGORIES: { key: IshikawaCategory; label: string; icon: any; color: string }[] = [
  { key: 'Machine', label: 'Machine (Equipment & Valves)', icon: Cpu, color: '#38bdf8' },
  { key: 'Material', label: 'Material (Reagents & Solvents)', icon: FlaskConical, color: '#f59e0b' },
  { key: 'Method', label: 'Method (SOPs & Recipe Boundaries)', icon: BookOpen, color: '#10b981' },
  { key: 'Measurement', label: 'Measurement (QC Testing & Probes)', icon: Gauge, color: '#a855f7' },
  { key: 'Man', label: 'Man (Operators & Handover)', icon: Users, color: '#ec4899' },
  { key: 'Environment', label: 'Environment (Utilities & HVAC)', icon: CloudRain, color: '#06b6d4' },
];

export const IshikawaSection: React.FC = () => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);
  const factors = current.ishikawa_factors || [];

  const handleAddFactor = (cat: IshikawaCategory) => {
    const updated = [
      ...factors,
      {
        category: cat,
        factor: `New ${cat} parameter check`,
        is_contributing: false,
        notes: '',
      },
    ];
    dispatch(setIshikawaFactors(updated));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Ishikawa 6M Contributing Factor Matrix</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Systemic evaluation across all 6 manufacturing branches to prevent premature root cause closure.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
        {CATEGORIES.map(({ key, label, icon: Icon, color }) => {
          const categoryFactors = factors
            .map((f, originalIndex) => ({ ...f, originalIndex }))
            .filter((f) => f.category.toLowerCase() === key.toLowerCase());

          return (
            <div
              key={key}
              className="glass-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                borderTop: `3px solid ${color}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon size={16} color={color} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleAddFactor(key)}
                  style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                >
                  <Plus size={11} /> Add
                </button>
              </div>

              {categoryFactors.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No factors evaluated in this branch yet.
                </p>
              ) : (
                categoryFactors.map((item) => (
                  <div
                    key={item.originalIndex}
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.6rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <input
                        type="text"
                        value={item.factor}
                        onChange={(e) =>
                          dispatch(
                            updateIshikawaFactor({
                              index: item.originalIndex,
                              factor: { factor: e.target.value },
                            })
                          )
                        }
                        className="form-input"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                      />
                      <button
                        className="btn btn-sm"
                        onClick={() => dispatch(toggleIshikawaFactor(item.originalIndex))}
                        style={{
                          background: item.is_contributing ? 'var(--color-red-bg)' : 'var(--color-green-bg)',
                          color: item.is_contributing ? 'var(--color-red)' : 'var(--color-green)',
                          border: `1px solid ${item.is_contributing ? 'var(--color-red-border)' : 'var(--color-green-border)'}`,
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.7rem',
                          minWidth: '105px',
                        }}
                      >
                        {item.is_contributing ? (
                          <>
                            <XCircle size={12} /> Contributing
                          </>
                        ) : (
                          <>
                            <CheckCircle size={12} /> Ruled Out
                          </>
                        )}
                      </button>
                    </div>

                    <textarea
                      value={item.notes || ''}
                      onChange={(e) =>
                        dispatch(
                          updateIshikawaFactor({
                            index: item.originalIndex,
                            factor: { notes: e.target.value },
                          })
                        )
                      }
                      placeholder="Rationale / evidentiary basis for contributing status..."
                      rows={2}
                      className="form-textarea"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                    />
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
