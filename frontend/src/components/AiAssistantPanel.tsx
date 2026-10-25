import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  startAiWorkflow,
  setAiProgress,
  aiWorkflowSuccess,
  aiWorkflowFailed,
  setPastedInputText,
  setSelectedSampleKey,
} from '../store/aiAssistantSlice';
import {
  setInvestigation,
  addSourceDocument,
  setActiveTab,
} from '../store/investigationSlice';
import { api } from '../services/api';
import { SAMPLE_INCIDENTS } from '../utils/sampleLoaders';
import {
  Sparkles,
  FileUp,
  FileText,
  Mail,
  AlertTriangle,
  RotateCw,
  Zap,
  CheckCircle2,
  X,
} from 'lucide-react';

const GENUINE_STAGES = [
  { id: 'prepare_source', label: 'Reading source', desc: 'Parsing & deterministic segmentation' },
  { id: 'extract_incident', label: 'Extracting facts', desc: 'Manufacturing parameters & deviations' },
  { id: 'analyze_evidence', label: 'Reviewing evidence', desc: 'Facts, allegations & contradictions' },
  { id: 'propose_investigation', label: 'Drafting RCA', desc: '5 Whys & 6M potential hypotheses' },
  { id: 'propose_capa', label: 'Suggesting CAPA', desc: 'Corrective & preventive remediation' },
  { id: 'validate_output', label: 'Ready for review', desc: 'Cross-reference & citation check' },
];

interface AiAssistantPanelProps {
  onCloseMobileDrawer?: () => void;
  isMobileDrawer?: boolean;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  onCloseMobileDrawer,
  isMobileDrawer = false,
}) => {
  const dispatch = useDispatch();
  const { currentAction, error, pastedInputText, selectedSampleKey } =
    useSelector((state: RootState) => state.aiAssistant);
  const { current } = useSelector((state: RootState) => state.investigation);

  const [inputMode, setInputMode] = useState<'text' | 'pdf' | 'email'>('text');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [activeStageId, setActiveStageId] = useState<string>('prepare_source');

  // Email-specific fields
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailFrom, setEmailFrom] = useState<string>('');
  const [emailDate, setEmailDate] = useState<string>('');
  const [emailTo, setEmailTo] = useState<string>('');

  const isBusy = currentAction !== 'idle' || isUploading;

  // Handle Loading Presets
  const handleSelectSample = (key: string) => {
    dispatch(setSelectedSampleKey(key));
    const sample = SAMPLE_INCIDENTS.find((s) => s.key === key);
    if (!sample) return;

    if (sample.sourceType === 'EMAIL') {
      setInputMode('email');
      setEmailSubject(sample.emailFields?.subject || '');
      setEmailFrom(sample.emailFields?.from || '');
      setEmailDate(sample.emailFields?.date || '');
      setEmailTo(sample.emailFields?.to || '');
      dispatch(setPastedInputText(sample.rawText));
    } else {
      // For synthetic samples (including Sample 1 Rosuvastatin),
      // set to 'text' mode so the report narrative is visible in the form textarea
      setInputMode('text');
      dispatch(setPastedInputText(sample.rawText));
    }
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // Run Real AI Workflow with genuine backend stage polling
  const handleIngestAndAnalyze = async () => {
    let activeInvestigationId = current.id;

    setIsUploading(true);
    setCompletedStages([]);
    setActiveStageId('prepare_source');

    dispatch(
      startAiWorkflow({
        action: 'extracting',
        message: 'Reading source...',
      })
    );

    try {
      // 1. Ensure active investigation exists on backend
      if (!activeInvestigationId) {
        const createdInv = await api.createInvestigation({
          title: current.title || 'New API Deviation Investigation',
          product_name: current.product_name,
          batch_number: current.batch_number,
          manufacturing_stage: current.manufacturing_stage,
          site_department: current.site_department,
          equipment: current.equipment,
          observed_deviation: current.observed_deviation,
          expected_condition: current.expected_condition,
          actual_condition: current.actual_condition,
          immediate_containment: current.immediate_containment,
          investigator_name: current.investigator_name,
        });
        activeInvestigationId = createdInv.id;
        dispatch(setInvestigation(createdInv));
      }

      if (!activeInvestigationId) {
        throw new Error('Failed to create or resolve investigation ID.');
      }

      // 2. Attach source document
      let sourceResult;
      if (inputMode === 'pdf') {
        if (!selectedFile && !pastedInputText.trim()) {
          alert('Please select a PDF file or load a synthetic sample.');
          setIsUploading(false);
          dispatch(aiWorkflowFailed('No PDF selected.'));
          return;
        }

        if (selectedFile) {
          sourceResult = await api.addSource(activeInvestigationId, {
            file: selectedFile,
            display_name: selectedFile.name,
            source_type: 'PDF',
          });
        } else {
          sourceResult = await api.addSource(activeInvestigationId, {
            text_content: pastedInputText,
            display_name: 'DEV-SYNTHETIC_Rosuvastatin_QC_Report.pdf',
            source_type: 'PDF',
          });
        }
      } else if (inputMode === 'email') {
        if (!pastedInputText.trim()) {
          alert('Please provide email body text.');
          setIsUploading(false);
          dispatch(aiWorkflowFailed('Email content is empty.'));
          return;
        }
        sourceResult = await api.addSource(activeInvestigationId, {
          text_content: pastedInputText,
          display_name: emailSubject ? `Email: ${emailSubject}` : 'Incident Notification Email',
          source_type: 'EMAIL',
          email_subject: emailSubject,
          email_from: emailFrom,
          email_date: emailDate,
          email_to: emailTo,
        });
      } else {
        if (!pastedInputText.trim()) {
          alert('Please provide incident text or choose a synthetic preset.');
          setIsUploading(false);
          dispatch(aiWorkflowFailed('Text content is empty.'));
          return;
        }
        sourceResult = await api.addSource(activeInvestigationId, {
          text_content: pastedInputText,
          display_name: 'Incident_Deviation_Narrative.txt',
          source_type: 'TEXT',
        });
      }

      dispatch(addSourceDocument(sourceResult));
      setCompletedStages(['prepare_source']);
      setActiveStageId('extract_incident');

      // 3. Trigger asynchronous LangGraph + Groq execution
      const run = await api.analyzeInvestigation(activeInvestigationId);

      // 4. Poll genuine backend stages
      let isDone = false;
      let pollCount = 0;
      while (!isDone && pollCount < 120) {
        await new Promise((r) => setTimeout(r, 650));
        const statusPoll = await api.getAIRun(activeInvestigationId, run.id);

        if (statusPoll.completed_stages && Array.isArray(statusPoll.completed_stages)) {
          setCompletedStages(statusPoll.completed_stages);
          const nextPending = GENUINE_STAGES.find(
            (st) => !statusPoll.completed_stages.includes(st.id)
          );
          if (nextPending) {
            setActiveStageId(nextPending.id);
            dispatch(setAiProgress(nextPending.label));
          }
        }

        if (statusPoll.status === 'COMPLETED') {
          isDone = true;
          setCompletedStages(GENUINE_STAGES.map((s) => s.id));
          break;
        } else if (statusPoll.status === 'FAILED') {
          throw new Error(statusPoll.failure_message || 'AI RCA workflow failed.');
        }
        pollCount++;
      }

      if (!isDone) {
        throw new Error('AI analysis timed out waiting for completion.');
      }

      // 5. Fetch updated investigation and commit
      const updatedInv = await api.getInvestigation(activeInvestigationId);
      dispatch(setInvestigation(updatedInv));
      dispatch(
        aiWorkflowSuccess({
          highlighted: ['observed_deviation', 'immediate_containment', 'product_name', 'batch_number'],
        })
      );
      dispatch(setActiveTab('summary'));
      if (onCloseMobileDrawer) onCloseMobileDrawer();
    } catch (err: any) {
      dispatch(aiWorkflowFailed(err.message || 'AI workflow execution error.'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <aside
      className="card-surface assistant-desktop-slot"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        height: isMobileDrawer ? '100%' : 'calc(100vh - 5.5rem)',
        position: isMobileDrawer ? 'relative' : 'sticky',
        top: isMobileDrawer ? 0 : '4.5rem',
        padding: '0.85rem',
        overflowY: 'auto',
        border: '1px solid var(--border-card)',
      }}
      aria-label="AI Evidence Assistant"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Sparkles size={16} color="var(--color-teal)" />
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            AI Evidence Assistant
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span
            className="badge font-mono"
            style={{
              background: 'var(--color-teal-bg)',
              color: 'var(--color-teal-dark)',
              border: '1px solid var(--color-teal-border)',
              fontSize: '0.625rem',
            }}
          >
            LangGraph + Groq
          </span>
          {isMobileDrawer && (
            <button
              onClick={onCloseMobileDrawer}
              className="btn btn-secondary btn-sm"
              aria-label="Close assistant drawer"
              style={{ padding: '0.2rem', height: '24px', width: '24px' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Extraction Contract Explanation Box */}
      <div
        style={{
          background: 'var(--bg-surface-subtle)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.55rem 0.65rem',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          lineHeight: '1.4',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
          What TraceRoot extracts into your RCA draft:
        </div>
        Extracts verified manufacturing parameters, empirical deviation boundaries, timeline, 5 Whys progression, 6M Ishikawa hypotheses, evidence gaps, and CAPA suggestions directly grounded in source segments.
      </div>

      {/* Synthetic Demo Presets (Clearly Labeled) */}
      <div>
        <label className="form-label" style={{ fontSize: '0.72rem' }}>
          Load Synthetic Demonstration Incident:
        </label>
        <select
          value={selectedSampleKey}
          onChange={(e) => handleSelectSample(e.target.value)}
          className="form-select"
          style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
          aria-label="Load synthetic demonstration incident"
        >
          <option value="">-- Choose Synthetic Demo Incident --</option>
          {SAMPLE_INCIDENTS.map((sample) => (
            <option key={sample.key} value={sample.key}>
              {sample.name}
            </option>
          ))}
        </select>
        {selectedSampleKey && (
          <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span className="badge badge-synthetic">
              [SYNTHETIC TEST DATA]
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              Invokes real live LangGraph workflow.
            </span>
          </div>
        )}
      </div>

      {/* Input Mode Selector (PDF / Text / Email) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.25rem',
          background: 'var(--bg-surface-subtle)',
          padding: '2px',
          borderRadius: 'var(--radius-sm)',
        }}
        role="tablist"
        aria-label="Source input method"
      >
        <button
          onClick={() => setInputMode('pdf')}
          role="tab"
          aria-selected={inputMode === 'pdf'}
          className="btn btn-sm"
          style={{
            fontSize: '0.7rem',
            padding: '0.25rem 0',
            background: inputMode === 'pdf' ? 'var(--bg-surface)' : 'transparent',
            color: inputMode === 'pdf' ? 'var(--color-teal)' : 'var(--text-muted)',
            border: inputMode === 'pdf' ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          <FileUp size={12} /> PDF Report
        </button>
        <button
          onClick={() => setInputMode('text')}
          role="tab"
          aria-selected={inputMode === 'text'}
          className="btn btn-sm"
          style={{
            fontSize: '0.7rem',
            padding: '0.25rem 0',
            background: inputMode === 'text' ? 'var(--bg-surface)' : 'transparent',
            color: inputMode === 'text' ? 'var(--color-teal)' : 'var(--text-muted)',
            border: inputMode === 'text' ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          <FileText size={12} /> Paste Text
        </button>
        <button
          onClick={() => setInputMode('email')}
          role="tab"
          aria-selected={inputMode === 'email'}
          className="btn btn-sm"
          style={{
            fontSize: '0.7rem',
            padding: '0.25rem 0',
            background: inputMode === 'email' ? 'var(--bg-surface)' : 'transparent',
            color: inputMode === 'email' ? 'var(--color-teal)' : 'var(--text-muted)',
            border: inputMode === 'email' ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          <Mail size={12} /> Paste Email
        </button>
      </div>

      {/* Input Form Body */}
      {inputMode === 'pdf' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div
            style={{
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem 0.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface-subtle)',
            }}
          >
            <FileUp size={22} color="var(--text-muted)" style={{ margin: '0 auto 0.25rem' }} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Upload Text-Based QC OOS / Batch PDF
            </p>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              id="pdf-input"
              style={{ display: 'none' }}
            />
            <label
              htmlFor="pdf-input"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '0.45rem', cursor: 'pointer', fontSize: '0.72rem' }}
            >
              Select PDF Document
            </label>
            {selectedFile && (
              <p style={{ fontSize: '0.7rem', color: 'var(--color-teal)', marginTop: '0.35rem', wordBreak: 'break-all' }}>
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            Max 10 MB, 50 pages. Selectable text layer required.
          </span>
        </div>
      ) : inputMode === 'email' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <input
            type="text"
            placeholder="Subject: Deviation Notification"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className="form-input"
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
            <input
              type="text"
              placeholder="From: lead@pharma.com"
              value={emailFrom}
              onChange={(e) => setEmailFrom(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.72rem', padding: '0.3rem 0.45rem' }}
            />
            <input
              type="text"
              placeholder="Date: 2026-10-21"
              value={emailDate}
              onChange={(e) => setEmailDate(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.72rem', padding: '0.3rem 0.45rem' }}
            />
          </div>
          <textarea
            value={pastedInputText}
            onChange={(e) => dispatch(setPastedInputText(e.target.value))}
            placeholder="Paste raw email body narrative..."
            rows={5}
            className="form-textarea font-mono"
            style={{ fontSize: '0.72rem', lineHeight: '1.4' }}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.67rem', color: 'var(--text-muted)' }}>
            <span>Incident description / shift log</span>
            <span>{pastedInputText.length.toLocaleString()} chars</span>
          </div>
          <textarea
            value={pastedInputText}
            onChange={(e) => dispatch(setPastedInputText(e.target.value))}
            placeholder="Paste raw deviation narrative, operator shift handover log, or batch observations..."
            rows={6}
            className="form-textarea font-mono"
            style={{ fontSize: '0.72rem', lineHeight: '1.4' }}
          />
        </div>
      )}

      {/* Analyze Action Button */}
      <button
        className="btn btn-primary"
        onClick={handleIngestAndAnalyze}
        disabled={isBusy}
        style={{ width: '100%', padding: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}
      >
        <Zap size={14} /> Analyze Source & Populate Draft
      </button>

      {/* Genuine Backend Processing Stages Stepper */}
      {isBusy && (
        <div
          style={{
            background: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
          }}
          aria-live="polite"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-teal-dark)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <RotateCw size={12} className="spin" /> Orchestrating LangGraph Pipeline...
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {completedStages.length}/{GENUINE_STAGES.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {GENUINE_STAGES.map((st) => {
              const isCompleted = completedStages.includes(st.id);
              const isActive = activeStageId === st.id && !isCompleted;

              return (
                <div
                  key={st.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    fontSize: '0.72rem',
                    color: isCompleted
                      ? 'var(--color-green)'
                      : isActive
                      ? 'var(--color-teal-dark)'
                      : 'var(--text-muted)',
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={13} color="var(--color-green)" style={{ flexShrink: 0 }} />
                  ) : isActive ? (
                    <RotateCw size={13} color="var(--color-teal)" className="spin" style={{ flexShrink: 0 }} />
                  ) : (
                    <span
                      style={{
                        width: '13px',
                        height: '13px',
                        borderRadius: '50%',
                        border: '1px solid var(--border-subtle)',
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error & Retry State */}
      {error && (
        <div
          className="error-box"
          style={{ fontSize: '0.72rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
          role="alert"
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
            <AlertTriangle size={15} color="var(--color-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600 }}>Analysis Failed</div>
              <div style={{ color: 'var(--color-red)', marginTop: '0.1rem' }}>{error}</div>
            </div>
          </div>
          <button
            onClick={handleIngestAndAnalyze}
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: 'flex-end', fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
          >
            <RotateCw size={11} /> Retry Analysis
          </button>
        </div>
      )}
    </aside>
  );
};
