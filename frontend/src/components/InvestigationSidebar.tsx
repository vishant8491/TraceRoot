import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  setInvestigation,
  resetInvestigation,
  setSummaries,
  setLoadingSummaries,
} from '../store/investigationSlice';
import { api } from '../services/api';
import {
  Plus,
  Search,
  FileText,
  Clock,
  RotateCw,
  AlertCircle,
  X,
} from 'lucide-react';

interface InvestigationSidebarProps {
  onCloseMobileDrawer?: () => void;
  isMobileDrawer?: boolean;
}

export const InvestigationSidebar: React.FC<InvestigationSidebarProps> = ({
  onCloseMobileDrawer,
  isMobileDrawer = false,
}) => {
  const dispatch = useDispatch();
  const { current, summaries, isLoadingSummaries, isDirty } = useSelector(
    (state: RootState) => state.investigation
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'DRAFT' | 'REVIEWED'>('ALL');
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [showDirtyWarning, setShowDirtyWarning] = useState(false);

  // Load investigations list on mount
  useEffect(() => {
    loadInvestigationsList();
  }, []);

  const loadInvestigationsList = async () => {
    dispatch(setLoadingSummaries(true));
    try {
      const list = await api.listInvestigations();
      dispatch(setSummaries(list));
    } catch (e) {
      console.error('Failed to load investigations list:', e);
    }
  };

  const handleSelectInvestigation = async (id: string) => {
    if (id === current.id) {
      if (onCloseMobileDrawer) onCloseMobileDrawer();
      return;
    }

    if (isDirty) {
      setPendingSwitchId(id);
      setShowDirtyWarning(true);
      return;
    }

    await fetchAndActivate(id);
  };

  const fetchAndActivate = async (id: string) => {
    try {
      const detail = await api.getInvestigation(id);
      dispatch(setInvestigation(detail));
      if (onCloseMobileDrawer) onCloseMobileDrawer();
    } catch (err: any) {
      alert(`Could not open investigation: ${err.message}`);
    }
  };

  const handleCreateNew = () => {
    if (isDirty) {
      setPendingSwitchId('NEW');
      setShowDirtyWarning(true);
      return;
    }
    dispatch(resetInvestigation());
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const confirmSwitchDiscardEdits = async () => {
    setShowDirtyWarning(false);
    if (pendingSwitchId === 'NEW') {
      dispatch(resetInvestigation());
    } else if (pendingSwitchId) {
      await fetchAndActivate(pendingSwitchId);
    }
    setPendingSwitchId(null);
  };

  const filteredSummaries = summaries.filter((inv) => {
    const matchesSearch =
      (inv.investigation_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.product_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === 'ALL' ||
      inv.status.toUpperCase() === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <aside
      className="card-surface sidebar-desktop-slot"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        height: isMobileDrawer ? '100%' : 'calc(100vh - 5.5rem)',
        position: isMobileDrawer ? 'relative' : 'sticky',
        top: isMobileDrawer ? 0 : '4.5rem',
        padding: '0.85rem',
        overflow: 'hidden',
        border: '1px solid var(--border-card)',
      }}
      aria-label="Investigations navigation"
    >
      {/* Sidebar Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <FileText size={16} color="var(--color-teal)" />
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Investigations
          </h2>
          <span
            className="badge badge-draft font-mono"
            style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
          >
            {summaries.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <button
            onClick={loadInvestigationsList}
            className="btn btn-secondary btn-sm"
            title="Refresh investigations"
            aria-label="Refresh investigations list"
            style={{ padding: '0.25rem', height: '24px', width: '24px' }}
          >
            <RotateCw size={12} className={isLoadingSummaries ? 'spin' : ''} />
          </button>
          {isMobileDrawer && (
            <button
              onClick={onCloseMobileDrawer}
              className="btn btn-secondary btn-sm"
              aria-label="Close navigation drawer"
              style={{ padding: '0.25rem', height: '24px', width: '24px' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* New Investigation Button */}
      <button
        onClick={handleCreateNew}
        className="btn btn-primary"
        style={{ width: '100%', fontSize: '0.78rem', padding: '0.45rem' }}
        aria-label="Create new RCA investigation"
      >
        <Plus size={14} /> New Investigation
      </button>

      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <Search
          size={13}
          color="var(--text-muted)"
          style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)' }}
        />
        <input
          type="text"
          placeholder="Filter by ID, product..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-input"
          style={{ paddingLeft: '1.75rem', fontSize: '0.75rem', padding: '0.35rem 0.5rem 0.35rem 1.75rem' }}
          aria-label="Search investigations"
        />
      </div>

      {/* Status Filter Tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.2rem',
          background: 'var(--bg-surface-subtle)',
          padding: '2px',
          borderRadius: 'var(--radius-sm)',
        }}
        role="group"
        aria-label="Filter investigations by status"
      >
        {(['ALL', 'DRAFT', 'REVIEWED'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className="btn btn-sm"
            style={{
              fontSize: '0.68rem',
              padding: '0.2rem 0',
              background: filterStatus === st ? 'var(--bg-surface)' : 'transparent',
              color: filterStatus === st ? 'var(--color-teal)' : 'var(--text-muted)',
              border: filterStatus === st ? '1px solid var(--border-subtle)' : 'none',
              boxShadow: filterStatus === st ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Investigations List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          paddingRight: '0.15rem',
        }}
        role="list"
      >
        {filteredSummaries.length === 0 ? (
          <div
            style={{
              padding: '1.5rem 0.5rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
            }}
          >
            No investigations found.
          </div>
        ) : (
          filteredSummaries.map((inv) => {
            const isSelected = current.id === inv.id;
            const isReviewed = inv.status === 'REVIEWED';

            return (
              <div
                key={inv.id}
                onClick={() => handleSelectInvestigation(inv.id)}
                role="listitem"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectInvestigation(inv.id);
                  }
                }}
                style={{
                  padding: '0.55rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected
                    ? '1px solid var(--color-teal)'
                    : '1px solid var(--border-subtle)',
                  background: isSelected ? 'var(--color-teal-bg)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: isSelected ? 'var(--color-teal-dark)' : 'var(--text-primary)',
                    }}
                  >
                    {inv.investigation_number || 'INV-DRAFT'}
                  </span>
                  <span
                    className={`badge ${isReviewed ? 'badge-approved' : 'badge-draft'}`}
                    style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem' }}
                  >
                    {isReviewed ? 'Reviewed' : 'Draft'}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: isSelected ? 600 : 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={inv.title}
                >
                  {inv.title || 'Untitled Investigation'}
                </div>

                {inv.product_name && (
                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {inv.product_name}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.65rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.1rem',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Clock size={10} />
                    {inv.updated_at ? new Date(inv.updated_at).toLocaleDateString() : 'Draft'}
                  </span>
                  {isSelected && isDirty && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        color: 'var(--color-amber)',
                        fontWeight: 600,
                      }}
                      title="Unsaved changes in active draft"
                    >
                      ● Unsaved
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Unsaved Changes Guard Dialog */}
      {showDirtyWarning && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dirty-warn-title">
          <div className="modal-content" style={{ maxWidth: '420px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <AlertCircle size={18} color="var(--color-amber)" />
              <h3 id="dirty-warn-title" style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                Unsaved Changes in Draft
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.4' }}>
              You have unsaved changes in the active investigation. Switching investigations will discard local modifications that have not been saved to the database.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDirtyWarning(false)}
                className="btn btn-secondary btn-sm"
              >
                Keep Editing
              </button>
              <button
                onClick={confirmSwitchDiscardEdits}
                className="btn btn-danger btn-sm"
              >
                Discard & Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
