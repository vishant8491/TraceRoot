import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { updateDraftField, setSelectedExcerpt } from '../store/investigationSlice';
import {
  AlertOctagon,
  Lock,
  Activity,
  Sparkles,
  User,
} from 'lucide-react';
import { FieldProvenance } from '../types';

export const IncidentSummarySection: React.FC = () => {
  const dispatch = useDispatch();
  const { current } = useSelector((state: RootState) => state.investigation);
  const { highlightedFields } = useSelector((state: RootState) => state.aiAssistant);

  const isHighlighted = (field: string) => highlightedFields.includes(field);
  const provMap = current.content?.field_provenance || {};

  const handleFieldChange = (field: keyof typeof current, val: string) => {
    dispatch(updateDraftField({ field: field as any, value: val as any }));
  };

  const openCitationExcerpt = (field: string, prov?: FieldProvenance) => {
    if (!prov || !prov.source_references || prov.source_references.length === 0) return;
    const ref = prov.source_references[0];
    const segId = typeof ref === 'string' ? ref : ref.segment_id;
    const srcDoc = (current.source_documents || []).find((d) =>
      d.segments?.some((s) => s.segment_id === segId)
    );
    const seg = srcDoc?.segments?.find((s) => s.segment_id === segId);
    const quoteText = typeof ref === 'object' && ref.quote ? ref.quote : seg?.text;

    dispatch(
      setSelectedExcerpt({
        segmentId: segId,
        documentTitle: srcDoc?.display_name || 'Attached Evidence',
        pageNumber: typeof ref === 'object' && ref.page_number !== undefined ? ref.page_number : seg?.page_number,
        paragraphIndex: typeof ref === 'object' && ref.paragraph_index !== undefined ? ref.paragraph_index : seg?.paragraph_index,
        text: quoteText || `Referenced in segment ${segId}.`,
        status: prov.evidence_status === 'SUPPORTED' ? 'SUPPORTED' : 'INFERRED',
        fieldName: field,
      })
    );
  };

  const renderFieldHeader = (label: string, fieldName: string) => {
    const prov = provMap[fieldName];
    const isAi = prov?.origin === 'AI';
    const isHuman = prov?.origin === 'HUMAN';
    const hasCitations = prov?.source_references && prov.source_references.length > 0;

    return (
      <div className="form-label">
        <span>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {isAi && (
            <span
              className="badge-ai-draft"
              title="Extracted from source records by AI workflow"
            >
              <Sparkles size={9} /> AI Draft
            </span>
          )}
          {isHuman && (
            <span
              className="badge-human-edit"
              title="Edited by human investigator"
            >
              <User size={9} /> Human Edit
            </span>
          )}
          {hasCitations && (
            <button
              type="button"
              onClick={() => openCitationExcerpt(fieldName, prov)}
              className="citation-chip"
              title="Click to view exact source excerpt"
            >
              [{prov.source_references.map((r: any) => typeof r === 'string' ? r : r.segment_id).join(', ')}]
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Parameters Grid */}
      <div className="card-surface">
        <h3
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            marginBottom: '0.85rem',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          API Manufacturing & Deviation Parameters
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            {renderFieldHeader('Investigation Title', 'title')}
            <input
              type="text"
              value={current.title || ''}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              placeholder="e.g. Dissolved Oxygen Excursion during Rosuvastatin Isolation"
              className={`form-input ${isHighlighted('title') ? 'field-highlighted' : ''}`}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            {renderFieldHeader('Product / API Name', 'product_name')}
            <input
              type="text"
              value={current.product_name || ''}
              onChange={(e) => handleFieldChange('product_name', e.target.value)}
              placeholder="[Not recorded in source]"
              className={`form-input ${isHighlighted('product_name') ? 'field-highlighted' : ''}`}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            {renderFieldHeader('Batch / Lot Number', 'batch_number')}
            <input
              type="text"
              value={current.batch_number || ''}
              onChange={(e) => handleFieldChange('batch_number', e.target.value)}
              placeholder="[Not recorded in source]"
              className={`form-input font-mono ${isHighlighted('batch_number') ? 'field-highlighted' : ''}`}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            {renderFieldHeader('Manufacturing Stage / Step', 'manufacturing_stage')}
            <input
              type="text"
              value={current.manufacturing_stage || ''}
              onChange={(e) => handleFieldChange('manufacturing_stage', e.target.value)}
              placeholder="[Not recorded in source]"
              className={`form-input ${isHighlighted('manufacturing_stage') ? 'field-highlighted' : ''}`}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            {renderFieldHeader('Site / Department', 'site_department')}
            <input
              type="text"
              value={current.site_department || ''}
              onChange={(e) => handleFieldChange('site_department', e.target.value)}
              placeholder="[Not recorded in source]"
              className="form-input"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            {renderFieldHeader('Equipment / System ID', 'equipment')}
            <input
              type="text"
              value={current.equipment || ''}
              onChange={(e) => handleFieldChange('equipment', e.target.value)}
              placeholder="[Not recorded in source]"
              className="form-input font-mono"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            {renderFieldHeader('Incident Date / Time', 'incident_date')}
            <input
              type="text"
              value={current.incident_date || ''}
              onChange={(e) => handleFieldChange('incident_date', e.target.value)}
              placeholder="YYYY-MM-DD or timestamp"
              className="form-input"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            {renderFieldHeader('Investigator Display Name', 'investigator_name')}
            <input
              type="text"
              value={current.investigator_name || ''}
              onChange={(e) => handleFieldChange('investigator_name', e.target.value)}
              placeholder="e.g. Lead QA Investigator"
              className="form-input"
            />
          </div>
        </div>
      </div>

      {/* Domain Distinctions: Observed Deviation vs Immediate Containment */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {/* Empirical Observed Deviation */}
        <div className="card-surface" style={{ borderTop: '3px solid var(--color-teal)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertOctagon size={16} color="var(--color-teal)" />
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                Observed Empirical Non-Conformance (FDA Q7)
              </h4>
            </div>
            {renderFieldHeader('', 'observed_deviation')}
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
            Empirical symptom (e.g. dissolved oxygen reading &gt; 0.5%, OOS impurity assay) strictly distinct from root cause hypotheses.
          </p>
          <textarea
            value={current.observed_deviation || current.observed_event || ''}
            onChange={(e) => handleFieldChange('observed_deviation', e.target.value)}
            placeholder="[No empirical deviation recorded yet. Ingest a batch log or report to extract.]"
            rows={5}
            className={`form-textarea ${isHighlighted('observed_deviation') ? 'field-highlighted' : ''}`}
            style={{ fontSize: '0.8125rem', lineHeight: '1.5' }}
          />
        </div>

        {/* Immediate Containment Actions */}
        <div className="card-surface" style={{ borderTop: '3px solid var(--color-amber)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={16} color="var(--color-amber)" />
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                Immediate Containment & Quarantine (ICH Q10)
              </h4>
            </div>
            {renderFieldHeader('', 'immediate_containment')}
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
            Physical containment holds, ERP quality blocks, or isolation valves enacted immediately to prevent distribution.
          </p>
          <textarea
            value={current.immediate_containment || ''}
            onChange={(e) => handleFieldChange('immediate_containment', e.target.value)}
            placeholder="[No immediate containment recorded in source]"
            rows={5}
            className={`form-textarea ${isHighlighted('immediate_containment') ? 'field-highlighted' : ''}`}
            style={{ fontSize: '0.8125rem', lineHeight: '1.5' }}
          />
        </div>
      </div>

      {/* Expected vs Actual Condition */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card-surface">
          {renderFieldHeader('Expected / Qualified Condition', 'expected_condition')}
          <textarea
            value={current.expected_condition || ''}
            onChange={(e) => handleFieldChange('expected_condition', e.target.value)}
            placeholder="e.g. Dissolved oxygen <= 0.5% during nitrogen purge isolation."
            rows={2}
            className="form-textarea"
          />
        </div>
        <div className="card-surface">
          {renderFieldHeader('Actual Observed Condition', 'actual_condition')}
          <textarea
            value={current.actual_condition || ''}
            onChange={(e) => handleFieldChange('actual_condition', e.target.value)}
            placeholder="e.g. Dissolved oxygen peaked at 4.2% for 45 minutes."
            rows={2}
            className="form-textarea"
          />
        </div>
      </div>

      {/* Timeline Narrative */}
      <div className="card-surface">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
          <Activity size={15} color="var(--color-teal)" />
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            Incident Telemetry & Chronological Timeline
          </h4>
        </div>
        <textarea
          value={current.suspected_timeline || ''}
          onChange={(e) => handleFieldChange('suspected_timeline', e.target.value)}
          placeholder="Chronological event log (e.g. 03:14 UTC nitrogen pressure collapse, 03:26 UTC operator alarm)..."
          rows={3}
          className="form-textarea font-mono"
          style={{ fontSize: '0.78rem' }}
        />
      </div>
    </div>
  );
};
