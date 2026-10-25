import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setActiveTab, setInvestigation } from '../store/investigationSlice';
import { api } from '../services/api';
import { IncidentSummarySection } from './IncidentSummarySection';
import { EvidenceSection } from './EvidenceSection';
import { FiveWhysSection } from './FiveWhysSection';
import { PotentialCausesSection } from './PotentialCausesSection';
import { CapaSection } from './CapaSection';
import {
  FileText,
  HelpCircle,
  Network,
  ShieldAlert,
  ClipboardCheck,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { InvestigationTab } from '../types';

export const InvestigationWorkspace: React.FC = () => {
  const dispatch = useDispatch();
  const { current, activeTab } = useSelector((state: RootState) => state.investigation);

  const handleAcceptProposal = async (fieldName: string) => {
    if (!current.id) return;
    try {
      const updated = await api.acceptProposal(current.id, fieldName);
      dispatch(setInvestigation(updated));
    } catch (e: any) {
      alert(`Failed to accept proposal: ${e.message}`);
    }
  };

  const handleRejectProposal = async (fieldName: string) => {
    if (!current.id) return;
    try {
      const updated = await api.rejectProposal(current.id, fieldName);
      dispatch(setInvestigation(updated));
    } catch (e: any) {
      alert(`Failed to reject proposal: ${e.message}`);
    }
  };

  const tabs: { key: InvestigationTab; label: string; icon: any; count?: number }[] = [
    { key: 'summary', label: '1. Incident Summary', icon: FileText },
    {
      key: 'evidence',
      label: '2. Evidence & Gaps',
      icon: ShieldAlert,
      count: current.content?.evidence_gaps?.length,
    },
    {
      key: 'five_whys',
      label: '3. 5 Whys Analysis',
      icon: HelpCircle,
      count: current.content?.five_whys?.length || current.five_whys_steps?.length,
    },
    {
      key: 'causes',
      label: '4. Potential Causes',
      icon: Network,
      count: current.content?.potential_causes?.length,
    },
    {
      key: 'capa',
      label: '5. CAPA Matrix',
      icon: ClipboardCheck,
      count: current.content?.capa_suggestions?.length,
    },
  ];

  const proposals = current.content?.human_edit_proposals || {};
  const proposalKeys = Object.keys(proposals);

  return (
    <main
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, width: '100%' }}
      role="main"
      aria-label="Root Cause Analysis Investigation Workspace"
    >
      {/* Human Edit Protection Alternative Proposals Banner */}
      {proposalKeys.length > 0 && (
        <div
          className="card-surface"
          style={{
            borderLeft: '4px solid var(--color-amber)',
            background: 'var(--color-amber-bg)',
            padding: '0.85rem 1rem',
          }}
          role="region"
          aria-label="Human Edit Protection Proposals"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
            <AlertTriangle size={16} color="var(--color-amber)" />
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-amber)' }}>
              Human Edit Protection: AI Alternative Proposals
            </h3>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
            The AI workflow extracted alternative values from evidentiary records for fields you previously edited. Your edits have been preserved in your draft. Review suggestions below:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {proposalKeys.map((fName) => {
              const prop = proposals[fName];
              return (
                <div
                  key={fName}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '0.65rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span className="badge font-mono badge-draft">
                      Field: {fName.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      Proposed {prop.proposed_at ? new Date(prop.proposed_at).toLocaleTimeString() : ''}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', fontSize: '0.75rem', marginBottom: '0.45rem' }}>
                    <div style={{ padding: '0.45rem', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-xs)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Your Current Edit:</div>
                      <div style={{ color: 'var(--text-primary)' }}>{prop.current_user_value}</div>
                    </div>
                    <div style={{ padding: '0.45rem', background: 'var(--color-teal-bg)', border: '1px solid var(--color-teal-border)', borderRadius: 'var(--radius-xs)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-teal-dark)', marginBottom: '0.15rem' }}>AI Suggested Value:</div>
                      <div style={{ color: 'var(--text-primary)' }}>{prop.ai_proposed_value}</div>
                    </div>
                  </div>

                  {prop.rationale && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
                      <strong>Rationale:</strong> {prop.rationale}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleRejectProposal(fName)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }}
                    >
                      <X size={12} /> Keep My Edit
                    </button>
                    <button
                      onClick={() => handleAcceptProposal(fName)}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }}
                    >
                      <Check size={12} /> Accept AI Proposal
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Primary Section Tabs */}
      <nav
        style={{
          display: 'flex',
          gap: '0.35rem',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '0.25rem',
          overflowX: 'auto',
        }}
        role="tablist"
        aria-label="Investigation Sections"
      >
        {tabs.map(({ key, label, icon: Icon, count }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => dispatch(setActiveTab(key))}
              className="btn btn-sm"
              style={{
                background: isActive ? 'var(--bg-surface)' : 'transparent',
                color: isActive ? 'var(--color-teal)' : 'var(--text-muted)',
                borderBottom: isActive ? '2px solid var(--color-teal)' : 'none',
                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.78rem',
                padding: '0.45rem 0.75rem',
                whiteSpace: 'nowrap',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
              }}
            >
              <Icon size={14} />
              {label}
              {count !== undefined && count > 0 && (
                <span
                  style={{
                    backgroundColor: isActive ? 'var(--color-teal-bg)' : 'var(--bg-surface-subtle)',
                    color: isActive ? 'var(--color-teal-dark)' : 'var(--text-muted)',
                    border: `1px solid ${isActive ? 'var(--color-teal-border)' : 'var(--border-subtle)'}`,
                    borderRadius: '10px',
                    padding: '0.05rem 0.35rem',
                    fontSize: '0.65rem',
                    marginLeft: '0.25rem',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Active Tab Section Component */}
      <div style={{ marginTop: '0.25rem' }}>
        {activeTab === 'summary' && <IncidentSummarySection />}
        {activeTab === 'evidence' && <EvidenceSection />}
        {activeTab === 'five_whys' && <FiveWhysSection />}
        {activeTab === 'causes' && <PotentialCausesSection />}
        {activeTab === 'capa' && <CapaSection />}
      </div>
    </main>
  );
};
