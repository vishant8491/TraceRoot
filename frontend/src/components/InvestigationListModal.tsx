import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setInvestigation, setSummaries } from '../store/investigationSlice';
import { api } from '../services/api';
import { FolderOpen, X, Trash2, ArrowRight, Clock, PlusCircle } from 'lucide-react';
import { resetInvestigation } from '../store/investigationSlice';

interface InvestigationListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InvestigationListModal: React.FC<InvestigationListModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { summaries } = useSelector((state: RootState) => state.investigation);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listInvestigations();
      dispatch(setSummaries(data));
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve saved investigations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadList();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenInvestigation = async (id: string) => {
    setLoading(true);
    try {
      const full = await api.getInvestigation(id);
      dispatch(setInvestigation(full));
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to load investigation details');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this investigation record from PostgreSQL?')) return;

    try {
      await api.deleteInvestigation(id);
      loadList();
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    }
  };

  const handleCreateNew = () => {
    dispatch(resetInvestigation());
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1.5rem',
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '750px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass-card-header" style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FolderOpen size={20} color="var(--color-teal)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Saved RCA Investigations</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleCreateNew}>
              <PlusCircle size={14} /> New Investigation
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.3rem',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--color-red-bg)',
              border: '1px solid var(--color-red-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-red)',
              fontSize: '0.8rem',
              marginBottom: '0.75rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Loading database records...
            </p>
          ) : summaries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '0.95rem' }}>No saved investigations found in database.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                Create an investigation draft and click "Save Draft" in the top bar.
              </p>
            </div>
          ) : (
            summaries.map((item) => (
              <div
                key={item.id}
                onClick={() => handleOpenInvestigation(item.id)}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.title}
                    </span>
                    {item.deviation_number && (
                      <span className="badge font-mono" style={{ fontSize: '0.65rem' }}>
                        {item.deviation_number}
                      </span>
                    )}
                    <span className="badge badge-draft" style={{ fontSize: '0.65rem' }}>
                      {item.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {item.product_name && <span>API: {item.product_name}</span>}
                    {item.batch_number && <span className="font-mono">Lot: {item.batch_number}</span>}
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={12} /> {new Date(item.updated_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={(e) => handleDelete(e, item.id)}
                    title="Delete investigation"
                  >
                    <Trash2 size={14} />
                  </button>
                  <ArrowRight size={16} color="var(--color-teal)" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
