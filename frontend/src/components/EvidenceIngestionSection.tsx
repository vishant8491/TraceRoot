import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { removeEvidence } from '../store/investigationSlice';
import {
  FileText,
  FileUp,
  Mail,
  Trash2,
  ChevronDown,
  ChevronRight,
  Hash,
  Copy,
  Check,
  ShieldCheck,
  Layers,
} from 'lucide-react';

export const EvidenceIngestionSection: React.FC = () => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);
  const sourceDocs = current.source_documents || [];
  const legacyEvidence = current.evidence_items || [];

  const [expandedDocIdx, setExpandedDocIdx] = useState<number | null>(0);
  const [copiedSegmentId, setCopiedSegmentId] = useState<string | null>(null);

  const getSourceIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'PDF':
      case 'UPLOADED_PDF':
        return <FileUp size={16} color="var(--color-teal)" />;
      case 'EMAIL':
        return <Mail size={16} color="var(--color-amber)" />;
      default:
        return <FileText size={16} color="var(--color-green)" />;
    }
  };

  const copyCitationTag = (sourceId: string, segmentId: string, pageNumber?: number) => {
    const citation = pageNumber
      ? `[Source: ${sourceId} | Page: ${pageNumber} | Segment: ${segmentId}]`
      : `[Source: ${sourceId} | Segment: ${segmentId}]`;
    navigator.clipboard.writeText(citation);
    setCopiedSegmentId(segmentId);
    setTimeout(() => setCopiedSegmentId(null), 2000);
  };

  const hasAnySources = sourceDocs.length > 0 || legacyEvidence.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Addressable Evidence Repository</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Server-segmented primary evidentiary records (PDF deviation reports, shift logs, and emails) preserving verbatim wording and normalized character offsets.
          </p>
        </div>
        <span
          className="badge font-mono"
          style={{ background: 'var(--color-teal-bg)', color: 'var(--color-teal-dark)', border: '1px solid var(--color-teal-border)', fontSize: '0.72rem' }}
        >
          <ShieldCheck size={13} style={{ display: 'inline', marginRight: '4px' }} />
          Deterministic Segmentation
        </span>
      </div>

      {!hasAnySources ? (
        <div
          style={{
            padding: '2.5rem',
            textAlign: 'center',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-muted)',
          }}
        >
          <FileText size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
          <p style={{ fontSize: '0.9rem' }}>No evidence documents attached to this investigation.</p>
          <p style={{ fontSize: '0.8rem' }}>
            Upload a PDF, paste incident text, or paste an email from the AI panel to generate addressable evidence segments.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Server-segmented persistent SourceDocuments */}
          {sourceDocs.map((doc, docIdx) => {
            const isExpanded = expandedDocIdx === docIdx;
            const segments = doc.segments || [];

            return (
              <div
                key={doc.id || docIdx}
                className="glass-card"
                style={{ padding: '0.9rem', border: '1px solid var(--border-subtle)' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedDocIdx(isExpanded ? null : docIdx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {getSourceIcon(doc.source_type)}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {doc.display_name}
                        </span>
                        <span
                          className="badge font-mono"
                          style={{
                            fontSize: '0.65rem',
                            background: 'var(--color-teal-bg)',
                            color: 'var(--color-teal-dark)',
                            border: '1px solid var(--color-teal-border)',
                          }}
                        >
                          {doc.source_type}
                        </span>
                        <span
                          className="badge font-mono"
                          style={{
                            fontSize: '0.65rem',
                            background: 'var(--bg-surface-subtle)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <Layers size={10} style={{ display: 'inline', marginRight: '3px' }} />
                          {segments.length} segment{segments.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.68rem',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          marginTop: '2px',
                        }}
                      >
                        <Hash size={11} /> SHA-256: {doc.content_hash ? doc.content_hash.slice(0, 16) + '...' : 'pending'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>
                        Addressable Evidence Segments ({segments.length}):
                      </div>

                      {segments.map((seg: any, segIdx: number) => {
                        const isCopied = copiedSegmentId === seg.segment_id;
                        return (
                          <div
                            key={seg.segment_id || segIdx}
                            style={{
                              backgroundColor: 'rgba(15, 23, 42, 0.5)',
                              border: '1px solid rgba(51, 65, 85, 0.6)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.65rem',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '0.35rem',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <span
                                  className="badge font-mono"
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    background: 'var(--color-teal-bg)',
                                    color: 'var(--color-teal-dark)',
                                    border: '1px solid var(--color-teal-border)',
                                  }}
                                >
                                  {seg.segment_id}
                                </span>
                                {seg.page_number && (
                                  <span
                                    className="badge font-mono badge-draft"
                                    style={{ fontSize: '0.65rem' }}
                                  >
                                    Page {seg.page_number}
                                  </span>
                                )}
                                {seg.char_offset_start !== undefined && seg.char_offset_end !== undefined && (
                                  <span
                                    className="font-mono"
                                    style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}
                                  >
                                    offsets [{seg.char_offset_start} : {seg.char_offset_end}]
                                  </span>
                                )}
                              </div>

                              <button
                                className="btn btn-sm"
                                onClick={() => copyCitationTag(doc.id, seg.segment_id, seg.page_number)}
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '0.2rem 0.45rem',
                                  background: isCopied ? 'var(--color-green-bg)' : 'var(--bg-input)',
                                  color: isCopied ? 'var(--color-green)' : 'var(--text-muted)',
                                  border: `1px solid ${isCopied ? 'var(--color-green-border)' : 'var(--border-subtle)'}`,
                                }}
                              >
                                {isCopied ? (
                                  <>
                                    <Check size={11} /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy size={11} /> Copy Citation
                                  </>
                                )}
                              </button>
                            </div>

                            <pre
                              className="font-mono"
                              style={{
                                margin: 0,
                                fontSize: '0.73rem',
                                color: 'var(--text-primary)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                lineHeight: '1.4',
                              }}
                            >
                              {seg.text}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Legacy or local evidence items */}
          {sourceDocs.length === 0 &&
            legacyEvidence.map((item, idx) => {
              const isExpanded = expandedDocIdx === idx;
              return (
                <div key={idx} className="glass-card" style={{ padding: '0.85rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                    onClick={() => setExpandedDocIdx(isExpanded ? null : idx)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {getSourceIcon(item.source_type)}
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.title}
                      </span>
                      <span
                        className="badge font-mono"
                        style={{
                          fontSize: '0.65rem',
                          background: 'var(--color-teal-bg)',
                          color: 'var(--color-teal-dark)',
                          border: '1px solid var(--color-teal-border)',
                        }}
                      >
                        {item.source_type}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch(removeEvidence(idx));
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                      <pre
                        className="font-mono"
                        style={{
                          background: 'var(--bg-input)',
                          padding: '0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          maxHeight: '300px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          color: 'var(--text-secondary)',
                          lineHeight: '1.4',
                        }}
                      >
                        {item.content}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
