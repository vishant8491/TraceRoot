import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setSelectedExcerpt } from '../store/investigationSlice';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { SourceSegment } from '../types';

export const EvidenceSection: React.FC = () => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);

  const rawAssessment = current.content?.evidence_assessment;
  const assessment = {
    observed_facts: rawAssessment?.observed_facts || [],
    reported_allegations: rawAssessment?.reported_allegations || [],
    contradictions: rawAssessment?.contradictions || rawAssessment?.contradictions_detected || [],
    missing_evidence: rawAssessment?.missing_evidence || rawAssessment?.missing_evidence_gaps || [],
    supporting_points: rawAssessment?.supporting_points || [],
    counter_evidence: rawAssessment?.counter_evidence || [],
  };

  const evidenceGaps = current.content?.evidence_gaps || [];
  const sourceDocs = current.source_documents || [];

  // Count unreviewed items based on actual fields
  const provMap = current.content?.field_provenance || {};
  const totalItems = Object.keys(provMap).length + (current.content?.potential_causes?.length || 0);
  const unreviewedCount =
    Object.values(provMap).filter((p) => p.review_state === 'UNREVIEWED').length +
    (current.content?.potential_causes?.filter((c) => c.status === 'HYPOTHESIS').length || 0);

  const handleOpenSegment = (docTitle: string, seg: SourceSegment, status: 'SUPPORTED' | 'INFERRED' | 'NEEDED') => {
    dispatch(
      setSelectedExcerpt({
        segmentId: seg.segment_id,
        documentTitle: docTitle,
        pageNumber: seg.page_number,
        paragraphIndex: seg.paragraph_index,
        text: seg.text,
        status: status,
      })
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Evidence Review Progress Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 1rem',
        }}
      >
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Evidentiary Grounds & Fact Verification
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Differentiates empirical measurements from subjective allegations; separates contradictions from supporting points.
          </p>
        </div>

        {totalItems > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Review Status:</span>
            <span
              className="badge"
              style={{
                background: unreviewedCount === 0 ? 'var(--color-green-bg)' : 'var(--color-amber-bg)',
                color: unreviewedCount === 0 ? 'var(--color-green)' : 'var(--color-amber)',
                border: `1px solid ${unreviewedCount === 0 ? 'var(--color-green-border)' : 'var(--color-amber-border)'}`,
              }}
            >
              {unreviewedCount === 0 ? 'All Items Reviewed' : `${unreviewedCount} of ${totalItems} Pending Review`}
            </span>
          </div>
        )}
      </div>

      {/* Grid: Observed Facts vs Reported Claims */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Observed Facts */}
        <div className="card-surface" style={{ borderTop: '3px solid var(--color-green)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <CheckCircle2 size={16} color="var(--color-green)" />
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Observed Facts (Empirical SCADA / Laboratory Data)
            </h4>
          </div>
          {assessment.observed_facts.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No empirical facts extracted. Attach an evidence document and run analysis.
            </p>
          ) : (
            <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem' }}>
              {assessment.observed_facts.map((fact, idx) => (
                <li key={idx} style={{ color: 'var(--text-secondary)' }}>
                  {fact}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reported Allegations */}
        <div className="card-surface" style={{ borderTop: '3px solid var(--color-amber)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <HelpCircle size={16} color="var(--color-amber)" />
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Reported Allegations (Subjective Supervisor / Shift Claims)
            </h4>
          </div>
          {assessment.reported_allegations.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No subjective operator error allegations reported in current source.
            </p>
          ) : (
            <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem' }}>
              {assessment.reported_allegations.map((allegation, idx) => (
                <li key={idx} style={{ color: 'var(--text-secondary)' }}>
                  {allegation}
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-amber)', marginTop: '0.15rem' }}>
                    [REPORTED CLAIM]: Requires independent sensor / electronic audit verification.
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Grid: Supporting Evidence vs Contradictions (Separated strictly!) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Supporting Evidence */}
        <div className="card-surface" style={{ borderTop: '3px solid var(--color-teal)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <CheckCircle2 size={16} color="var(--color-teal)" />
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Corroborating Evidence Points
            </h4>
          </div>
          {assessment.supporting_points.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No corroborating points extracted yet.
            </p>
          ) : (
            <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem' }}>
              {assessment.supporting_points.map((pt, idx) => (
                <li key={idx} style={{ color: 'var(--text-secondary)' }}>
                  {pt}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Contradictions & Counter-Evidence */}
        <div className="card-surface" style={{ borderTop: '3px solid var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <XCircle size={16} color="var(--text-muted)" />
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Contradictions & Ruled-Out Hypotheses
            </h4>
          </div>
          {assessment.contradictions.length === 0 && assessment.counter_evidence.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No evidentiary contradictions identified.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {assessment.contradictions.map((c, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.45rem 0.6rem',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '0.75rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  <strong style={{ color: 'var(--color-red)' }}>Contradiction:</strong> {c}
                </div>
              ))}
              {assessment.counter_evidence.map((ce, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.45rem 0.6rem',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <strong>Counter-evidence:</strong> {ce}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Missing Evidence Gaps (Amber Callout) */}
      <div className="card-surface">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
          <AlertTriangle size={16} color="var(--color-amber)" />
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-amber)' }}>
            Missing Evidence Gaps & Verification Steps (GMP Completeness)
          </h4>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Prioritized empirical records required to elevate a hypothesis to scientific confirmation under FDA Q7 / ICH Q10.
        </p>

        {evidenceGaps.length === 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No evidence gaps identified.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.75rem' }}>
            {evidenceGaps.map((gap, idx) => (
              <div
                key={idx}
                className="amber-evidence-box"
                style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                    {gap.information_needed}
                  </span>
                  <span
                    className="badge font-mono"
                    style={{
                      background: gap.priority === 'HIGH' ? 'var(--color-amber-bg)' : 'var(--bg-surface-subtle)',
                      color: gap.priority === 'HIGH' ? 'var(--color-amber)' : 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.62rem',
                    }}
                  >
                    Priority: {gap.priority}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <strong>Why it matters:</strong> {gap.why_it_matters}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-teal-dark)', marginTop: '0.15rem' }}>
                  <strong>Suggested Verification:</strong> {gap.suggested_verification_step}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attached Source Documents with Clickable Segment Chips */}
      <div className="card-surface">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
          <FileText size={16} color="var(--color-teal)" />
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            Attached Evidentiary Source Documents & Segments
          </h4>
        </div>

        {sourceDocs.length === 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No source documents attached yet. Ingest a document from the AI Evidence Assistant to compute addressable segments.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sourceDocs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="badge font-mono badge-draft">
                      {doc.source_type}
                    </span>
                    <strong style={{ fontSize: '0.8125rem' }}>{doc.display_name}</strong>
                  </div>
                  <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }} title={`SHA-256: ${doc.content_hash}`}>
                    Hash: {doc.content_hash.slice(0, 12)}...
                  </span>
                </div>

                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  {doc.segments?.length || 0} deterministic addressable segments indexed. Click any segment chip below to inspect verbatim quote:
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {(doc.segments || []).map((seg) => (
                    <button
                      key={seg.segment_id}
                      onClick={() => handleOpenSegment(doc.display_name, seg, 'SUPPORTED')}
                      className="citation-chip"
                      title={seg.text.slice(0, 100)}
                    >
                      {seg.segment_id}
                      {seg.page_number && ` (p.${seg.page_number})`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
