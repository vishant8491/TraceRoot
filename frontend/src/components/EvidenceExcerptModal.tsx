import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { clearSelectedExcerpt, setSelectedExcerpt } from '../store/investigationSlice';
import {
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { SourceSegment } from '../types';

export const EvidenceExcerptModal: React.FC = () => {
  const dispatch = useDispatch();
  const { selectedExcerpt, current } = useSelector((state: RootState) => state.investigation);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedExcerpt) {
      closeBtnRef.current?.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          dispatch(clearSelectedExcerpt());
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedExcerpt, dispatch]);

  if (!selectedExcerpt) return null;

  // Find corresponding source document and segment list for navigation
  const sourceDocs = current.source_documents || [];
  let matchingDoc = sourceDocs.find(
    (d) => d.display_name === selectedExcerpt.documentTitle
  );
  if (!matchingDoc && sourceDocs.length > 0) {
    matchingDoc = sourceDocs.find((d) =>
      d.segments?.some((s) => s.segment_id === selectedExcerpt.segmentId)
    );
  }

  const segments: SourceSegment[] = matchingDoc?.segments || [];
  const currentIndex = segments.findIndex((s) => s.segment_id === selectedExcerpt.segmentId);

  const handlePrevSegment = () => {
    if (currentIndex > 0) {
      const prev = segments[currentIndex - 1];
      dispatch(
        setSelectedExcerpt({
          segmentId: prev.segment_id,
          documentTitle: matchingDoc?.display_name || selectedExcerpt.documentTitle,
          pageNumber: prev.page_number,
          paragraphIndex: prev.paragraph_index,
          text: prev.text,
          status: selectedExcerpt.status,
          fieldName: selectedExcerpt.fieldName,
        })
      );
    }
  };

  const handleNextSegment = () => {
    if (currentIndex >= 0 && currentIndex < segments.length - 1) {
      const next = segments[currentIndex + 1];
      dispatch(
        setSelectedExcerpt({
          segmentId: next.segment_id,
          documentTitle: matchingDoc?.display_name || selectedExcerpt.documentTitle,
          pageNumber: next.page_number,
          paragraphIndex: next.paragraph_index,
          text: next.text,
          status: selectedExcerpt.status,
          fieldName: selectedExcerpt.fieldName,
        })
      );
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="excerpt-dialog-title"
      onClick={() => dispatch(clearSelectedExcerpt())}
    >
      <div
        className="modal-content"
        style={{ maxWidth: '580px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '0.9rem 1.15rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} color="var(--color-teal)" />
            <div>
              <h3 id="excerpt-dialog-title" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                Evidentiary Source Excerpt
              </h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Deterministic Evidence Reference Citation
              </span>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={() => dispatch(clearSelectedExcerpt())}
            className="btn btn-secondary btn-sm"
            aria-label="Close evidence excerpt"
            style={{ padding: '0.25rem', height: '26px', width: '26px' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Excerpt Body */}
        <div style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Metadata pill bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.4rem',
              alignItems: 'center',
              fontSize: '0.72rem',
            }}
          >
            <span
              className="badge font-mono"
              style={{
                background: 'var(--color-teal-bg)',
                color: 'var(--color-teal-dark)',
                border: '1px solid var(--color-teal-border)',
              }}
            >
              Segment: {selectedExcerpt.segmentId}
            </span>

            {selectedExcerpt.documentTitle && (
              <span
                className="badge font-mono"
                style={{
                  background: 'var(--bg-surface-subtle)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {selectedExcerpt.documentTitle}
              </span>
            )}

            {selectedExcerpt.pageNumber !== undefined && selectedExcerpt.pageNumber > 0 && (
              <span className="badge font-mono badge-draft">
                Page {selectedExcerpt.pageNumber}
              </span>
            )}

            {selectedExcerpt.paragraphIndex !== undefined && (
              <span className="badge font-mono badge-draft">
                Paragraph {selectedExcerpt.paragraphIndex + 1}
              </span>
            )}

            {/* Evidentiary Status Badge */}
            {selectedExcerpt.status === 'SUPPORTED' ? (
              <span
                className="badge"
                style={{
                  background: 'var(--color-green-bg)',
                  color: 'var(--color-green)',
                  border: '1px solid var(--color-green-border)',
                }}
              >
                <CheckCircle2 size={11} /> Supported by source
              </span>
            ) : selectedExcerpt.status === 'NEEDED' ? (
              <span
                className="badge"
                style={{
                  background: 'var(--color-amber-bg)',
                  color: 'var(--color-amber)',
                  border: '1px solid var(--color-amber-border)',
                }}
              >
                <AlertTriangle size={11} /> Evidence needed
              </span>
            ) : (
              <span
                className="badge"
                style={{
                  background: 'var(--bg-surface-subtle)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <Info size={11} /> Inferred from records
              </span>
            )}
          </div>

          {selectedExcerpt.fieldName && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Referenced by field: <strong>{selectedExcerpt.fieldName.replace(/_/g, ' ')}</strong>
            </div>
          )}

          {/* Verbatim Excerpt Text Box */}
          <div
            style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem',
              fontSize: '0.8125rem',
              lineHeight: '1.55',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              maxHeight: '260px',
              overflowY: 'auto',
            }}
          >
            {selectedExcerpt.text || 'No verbatim excerpt recorded for this segment.'}
          </div>

          {/* Regulatory Context Notice */}
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.4', fontStyle: 'italic' }}>
            Excerpt derived directly from uploaded source document. Verbatim segments are cryptographically hashed and indexed to guarantee audit trail traceability under 21 CFR Part 11.
          </p>
        </div>

        {/* Modal Footer with Segment Navigation */}
        <div
          style={{
            padding: '0.75rem 1.15rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {segments.length > 1 && (
              <>
                <button
                  onClick={handlePrevSegment}
                  disabled={currentIndex <= 0}
                  className="btn btn-secondary btn-sm"
                  aria-label="Previous segment"
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {currentIndex + 1} of {segments.length}
                </span>
                <button
                  onClick={handleNextSegment}
                  disabled={currentIndex < 0 || currentIndex >= segments.length - 1}
                  className="btn btn-secondary btn-sm"
                  aria-label="Next segment"
                >
                  Next <ChevronRight size={13} />
                </button>
              </>
            )}
          </div>

          <button
            onClick={() => dispatch(clearSelectedExcerpt())}
            className="btn btn-secondary btn-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
