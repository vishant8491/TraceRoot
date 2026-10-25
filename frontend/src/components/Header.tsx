import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  setSaving,
  saveSuccess,
  saveFailed,
  setConflictServerVersion,
} from '../store/investigationSlice';
import { api } from '../services/api';
import {
  FileText,
  Save,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Menu,
  Check,
} from 'lucide-react';
import { ReviewModal } from './ReviewModal';
import { ThemeSelector } from './ThemeSelector';

interface HeaderProps {
  onToggleMobileSidebar: () => void;
  onToggleMobileAssistant: () => void;
  isMobileAssistantOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleMobileSidebar,
  onToggleMobileAssistant,
  isMobileAssistantOpen,
}) => {
  const dispatch = useDispatch();
  const { current, isDirty, isSaving, lastSavedAt, saveError } = useSelector(
    (state: RootState) => state.investigation
  );

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const handleSaveDraft = async () => {
    dispatch(setSaving(true));
    try {
      if (current.id) {
        const updated = await api.updateInvestigation(current.id, {
          ...current,
          version: current.version ?? 1,
        });
        dispatch(
          saveSuccess({
            id: updated.id!,
            updatedAt: updated.updated_at!,
            version: updated.version,
          })
        );
      } else {
        const created = await api.createInvestigation(current);
        dispatch(
          saveSuccess({
            id: created.id!,
            updatedAt: created.updated_at!,
            version: created.version,
          })
        );
      }
    } catch (err: any) {
      if (err.status === 409) {
        // Concurrency conflict: fetch latest server copy for comparison while keeping local edits intact
        try {
          const serverCopy = await api.getInvestigation(current.id!);
          dispatch(setConflictServerVersion(serverCopy));
        } catch {
          dispatch(setConflictServerVersion(current));
        }
      } else {
        dispatch(saveFailed(err.message || 'Failed to save investigation draft.'));
      }
    }
  };

  const isReviewed = current.status === 'REVIEWED';

  return (
    <>
      <header
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0.65rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Left: Mobile Toggle & Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Mobile Sidebar Toggle Button */}
          <button
            onClick={onToggleMobileSidebar}
            className="btn btn-secondary btn-sm mobile-only-btn"
            aria-label="Toggle investigations list"
            style={{ padding: '0.35rem 0.5rem' }}
          >
            <Menu size={15} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                background: 'var(--color-teal)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--btn-primary-text)',
              }}
            >
              <FileText size={17} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: 'var(--text-primary)',
                  }}
                >
                  TraceRoot
                </span>
                <span
                  className="badge font-mono"
                  style={{
                    background: 'var(--color-teal-bg)',
                    color: 'var(--color-teal-dark)',
                    border: '1px solid var(--color-teal-border)',
                    fontSize: '0.625rem',
                  }}
                >
                  Pharma RCA
                </span>
              </div>
            </div>
          </div>

          <div style={{ height: '20px', width: '1px', background: 'var(--border-subtle)' }} />

          {/* Active Investigation Identification */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              className="badge font-mono badge-draft"
              style={{ fontWeight: 600, fontSize: '0.72rem' }}
            >
              {current.investigation_number || 'INV-NEW-DRAFT'}
            </span>

            <span
              className={`badge ${isReviewed ? 'badge-approved' : 'badge-review'}`}
              style={{ fontSize: '0.68rem' }}
            >
              {isReviewed ? 'Reviewed' : 'Draft'}
            </span>

            <span className="badge badge-draft font-mono" style={{ fontSize: '0.65rem' }}>
              v{current.version || 1}
            </span>
          </div>
        </div>

        {/* Center / Right: Save Status & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Save Status Feedback Indicator */}
          <div
            className="header-save-status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              color: isDirty ? 'var(--color-amber)' : 'var(--text-muted)',
            }}
          >
            {isSaving ? (
              <span>Saving draft...</span>
            ) : isDirty ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem' }}>●</span> Unsaved changes
              </span>
            ) : lastSavedAt ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-green)' }}>
                <Check size={12} /> Saved {new Date(lastSavedAt).toLocaleTimeString()}
              </span>
            ) : (
              <span>Draft ready</span>
            )}
          </div>

          {/* Theme Selector (Light / System / Dark) */}
          <ThemeSelector />

          {/* Save Draft Action */}
          <button
            onClick={handleSaveDraft}
            disabled={isSaving || !isDirty}
            className="btn btn-secondary btn-sm"
            aria-label="Save draft changes"
          >
            <Save size={13} /> Save Draft
          </button>

          {/* Mark Reviewed Action */}
          <button
            onClick={() => setIsReviewModalOpen(true)}
            className="btn btn-primary btn-sm"
            aria-label="Open formal review sign-off"
          >
            <CheckCircle2 size={13} /> {isReviewed ? 'Update Review' : 'Mark Reviewed'}
          </button>

          {/* Mobile / Tablet AI Assistant Drawer Toggle */}
          <button
            onClick={onToggleMobileAssistant}
            className={`btn btn-sm mobile-assistant-toggle ${isMobileAssistantOpen ? 'btn-primary' : 'btn-accent'}`}
            aria-label="Toggle AI Evidence Assistant"
            aria-expanded={isMobileAssistantOpen}
          >
            <Sparkles size={13} /> AI Assistant
          </button>
        </div>
      </header>

      {/* Save Error Banner if any */}
      {saveError && (
        <div
          className="error-box"
          style={{
            margin: '0.5rem 1.5rem 0',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={15} />
            <span>Save error: {saveError}</span>
          </div>
          <button
            onClick={handleSaveDraft}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem' }}
          >
            Retry Save
          </button>
        </div>
      )}

      {/* Formal Review Modal */}
      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
      />
    </>
  );
};
