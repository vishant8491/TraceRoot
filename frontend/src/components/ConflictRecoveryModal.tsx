import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  setInvestigation,
  setConflictServerVersion,
  saveSuccess,
} from '../store/investigationSlice';
import { api } from '../services/api';
import { AlertTriangle, RefreshCw, Copy, Check, X } from 'lucide-react';

export const ConflictRecoveryModal: React.FC = () => {
  const dispatch = useDispatch();
  const { current, conflictServerVersion } = useSelector(
    (state: RootState) => state.investigation
  );
  const [isResolving, setIsResolving] = useState(false);

  if (!conflictServerVersion) return null;

  const handleUseServerVersion = () => {
    dispatch(setInvestigation(conflictServerVersion));
    dispatch(setConflictServerVersion(null));
  };

  const handleForceOverwrite = async () => {
    if (!current.id) return;
    setIsResolving(true);
    try {
      // Use latest server version to avoid conflict on retry
      const updated = await api.updateInvestigation(current.id, {
        ...current,
        version: conflictServerVersion.version,
      });
      dispatch(
        saveSuccess({
          id: updated.id!,
          updatedAt: updated.updated_at!,
          version: updated.version,
        })
      );
      dispatch(setConflictServerVersion(null));
    } catch (err: any) {
      alert(`Force overwrite failed: ${err.message}`);
    } finally {
      setIsResolving(false);
    }
  };

  const handleSaveAsNew = async () => {
    setIsResolving(true);
    try {
      const created = await api.createInvestigation({
        ...current,
        id: undefined,
        investigation_number: undefined,
        title: `${current.title} (Recovered Copy)`,
        version: 1,
      });
      dispatch(setInvestigation(created));
      dispatch(setConflictServerVersion(null));
    } catch (err: any) {
      alert(`Save as copy failed: ${err.message}`);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
    >
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-amber-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} color="var(--color-amber)" />
            <h3 id="conflict-dialog-title" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-amber)' }}>
              Version Conflict Detected (HTTP 409)
            </h3>
          </div>
          <button
            onClick={() => dispatch(setConflictServerVersion(null))}
            className="btn btn-secondary btn-sm"
            aria-label="Dismiss conflict dialog"
            style={{ padding: '0.2rem', height: '24px', width: '24px' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
            Another user or background process updated this investigation on the server while you were editing.
            Your local draft has been <strong>preserved intact in memory</strong> so no data is lost.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
              fontSize: '0.75rem',
            }}
          >
            <div
              style={{
                padding: '0.65rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                Your Local Draft
              </div>
              <div>Base Version: <strong>v{current.version || 1}</strong></div>
              <div>Status: {current.status}</div>
              <div>Title: {current.title}</div>
            </div>

            <div
              style={{
                padding: '0.65rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--color-amber)', marginBottom: '0.25rem' }}>
                Server Current Version
              </div>
              <div>Current Version: <strong>v{conflictServerVersion.version}</strong></div>
              <div>Status: {conflictServerVersion.status}</div>
              <div>Updated: {conflictServerVersion.updated_at ? new Date(conflictServerVersion.updated_at).toLocaleTimeString() : 'Unknown'}</div>
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Choose how you would like to recover:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={handleForceOverwrite}
              disabled={isResolving}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.6rem' }}
            >
              <RefreshCw size={14} color="var(--color-teal)" />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>Overwrite Server with My Edits</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Apply your current in-memory edits over the server's version.</div>
              </div>
            </button>

            <button
              onClick={handleSaveAsNew}
              disabled={isResolving}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.6rem' }}
            >
              <Copy size={14} color="var(--color-teal)" />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>Save My Edits as New Investigation</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Fork your current work into a new investigation draft.</div>
              </div>
            </button>

            <button
              onClick={handleUseServerVersion}
              disabled={isResolving}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.6rem' }}
            >
              <Check size={14} color="var(--text-muted)" />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>Accept Server Version & Discard Local Edits</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Replace local draft with the newest version from the database.</div>
              </div>
            </button>
          </div>
        </div>

        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={() => dispatch(setConflictServerVersion(null))}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
