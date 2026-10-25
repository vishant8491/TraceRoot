import {
  Investigation,
  InvestigationSummary,
  ExtractedContext,
  FiveWhysStep,
  IshikawaFactor,
  MissingEvidenceItem,
  CapaItem,
  FullWorkflowResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export interface SourceDocument {
  id: string;
  investigation_id: string;
  source_type: string;
  display_name: string;
  extracted_text: string;
  segments: Array<{
    segment_id: string;
    page_number?: number;
    paragraph_index?: number;
    char_offset_start?: number;
    char_offset_end?: number;
    text: string;
  }>;
  content_hash: string;
  created_at: string;
}

export interface AIRun {
  id: string;
  investigation_id: string;
  draft_version: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  completed_stages: string[];
  model_id: string;
  started_at: string;
  finished_at?: string;
  structured_output?: Record<string, any>;
  failure_code?: string;
  failure_message?: string;
}

export interface ReviewSubmission {
  version: number;
  reviewer_name: string;
  decisions: Record<string, {
    decision_state: 'ACCEPTED' | 'EDITED' | 'REJECTED';
    decided_by: string;
    comment?: string;
  }>;
  comment?: string;
}

export interface ReviewResult {
  investigation: Investigation;
  disclaimer: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    let message = `API Error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.error?.message || parsed.detail || parsed.message || message;
    } catch {
      message = errorText || message;
    }
    const err: any = new Error(message);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export const api = {
  // Investigations Core CRUD (Contract-Conforming)
  async listInvestigations(): Promise<InvestigationSummary[]> {
    const res = await fetch(`${API_BASE}/investigations`);
    return handleResponse<InvestigationSummary[]>(res);
  },

  async getInvestigation(id: string): Promise<Investigation> {
    const res = await fetch(`${API_BASE}/investigations/${id}`);
    return handleResponse<Investigation>(res);
  },

  async createInvestigation(data: Partial<Investigation>): Promise<Investigation> {
    const res = await fetch(`${API_BASE}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Investigation>(res);
  },

  // Optimistic Concurrency Update (PATCH with atomic version check)
  async updateInvestigation(id: string, data: Partial<Investigation> & { version?: number }): Promise<Investigation> {
    const res = await fetch(`${API_BASE}/investigations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Investigation>(res);
  },

  async deleteInvestigation(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/investigations/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Failed to delete investigation (${res.status})`);
    }
  },

  // Sources & Evidence Contracts (PDF, Text, or Email)
  async addSource(
    investigationId: string,
    options: {
      file?: File;
      text_content?: string;
      display_name?: string;
      source_type?: string;
      email_subject?: string;
      email_from?: string;
      email_date?: string;
      email_to?: string;
    }
  ): Promise<SourceDocument> {
    const formData = new FormData();
    if (options.file) {
      formData.append('file', options.file);
    }
    if (options.text_content !== undefined) {
      formData.append('text_content', options.text_content);
    }
    if (options.display_name) {
      formData.append('display_name', options.display_name);
    }
    if (options.source_type) {
      formData.append('source_type', options.source_type);
    }
    if (options.email_subject) {
      formData.append('email_subject', options.email_subject);
    }
    if (options.email_from) {
      formData.append('email_from', options.email_from);
    }
    if (options.email_date) {
      formData.append('email_date', options.email_date);
    }
    if (options.email_to) {
      formData.append('email_to', options.email_to);
    }

    const res = await fetch(`${API_BASE}/investigations/${investigationId}/sources`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<SourceDocument>(res);
  },

  async getSource(investigationId: string, sourceId: string): Promise<SourceDocument> {
    const res = await fetch(`${API_BASE}/investigations/${investigationId}/sources/${sourceId}`);
    return handleResponse<SourceDocument>(res);
  },

  // Asynchronous RCA Analysis Contract
  async analyzeInvestigation(investigationId: string, modelId?: string): Promise<AIRun> {
    const res = await fetch(`${API_BASE}/investigations/${investigationId}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelId ? { model_id: modelId } : {}),
    });
    return handleResponse<AIRun>(res);
  },

  async getAIRun(investigationId: string, runId: string): Promise<AIRun> {
    const res = await fetch(`${API_BASE}/investigations/${investigationId}/runs/${runId}`);
    return handleResponse<AIRun>(res);
  },

  // Formal Draft Review Contract
  async submitReview(investigationId: string, submission: ReviewSubmission): Promise<ReviewResult> {
    const res = await fetch(`${API_BASE}/investigations/${investigationId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
    return handleResponse<ReviewResult>(res);
  },

  // Human Edit Protection Proposal Endpoints
  async acceptProposal(investigationId: string, fieldName: string): Promise<Investigation> {
    const res = await fetch(`${API_BASE}/investigations/${investigationId}/proposals/${fieldName}/accept`, {
      method: 'POST',
    });
    return handleResponse<Investigation>(res);
  },

  async rejectProposal(investigationId: string, fieldName: string): Promise<Investigation> {
    const res = await fetch(`${API_BASE}/investigations/${investigationId}/proposals/${fieldName}/reject`, {
      method: 'POST',
    });
    return handleResponse<Investigation>(res);
  },

  // Legacy AI Helper Endpoints (Kept for compatibility)
  async extractContext(text: string, sourceName?: string): Promise<ExtractedContext> {
    const res = await fetch(`${API_BASE}/ai/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text_content: text, source_name: sourceName }),
    });
    return handleResponse<ExtractedContext>(res);
  },

  async uploadPdf(file: File): Promise<{ filename: string; raw_text: string; extracted_context: ExtractedContext }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/ai/parse-pdf`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<{ filename: string; raw_text: string; extracted_context: ExtractedContext }>(res);
  },

  async generateFiveWhys(params: {
    observed_event: string;
    unit_operation?: string;
    immediate_containment?: string;
    context_text?: string;
  }): Promise<{ root_cause_summary: string; steps: FiveWhysStep[] }> {
    const res = await fetch(`${API_BASE}/ai/five-whys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<{ root_cause_summary: string; steps: FiveWhysStep[] }>(res);
  },

  async generateIshikawa(params: {
    observed_event: string;
    root_cause_summary?: string;
    context_text?: string;
  }): Promise<{ factors: IshikawaFactor[] }> {
    const res = await fetch(`${API_BASE}/ai/ishikawa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<{ factors: IshikawaFactor[] }>(res);
  },

  async evaluateEvidence(params: {
    observed_event: string;
    root_cause_summary?: string;
    context_text: string;
  }): Promise<{
    supporting_points: string[];
    contradictory_points: string[];
    missing_evidence_items: MissingEvidenceItem[];
    uncertainty_notes?: string;
  }> {
    const res = await fetch(`${API_BASE}/ai/evidence-evaluation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<{
      supporting_points: string[];
      contradictory_points: string[];
      missing_evidence_items: MissingEvidenceItem[];
      uncertainty_notes?: string;
    }>(res);
  },

  async generateCapa(params: {
    observed_event: string;
    root_cause_summary: string;
    contributing_factors?: string[];
    unit_operation?: string;
  }): Promise<{ items: CapaItem[] }> {
    const res = await fetch(`${API_BASE}/ai/capa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<{ items: CapaItem[] }>(res);
  },

  async executeFullAutoDraft(text: string, sourceName?: string): Promise<FullWorkflowResponse> {
    const res = await fetch(`${API_BASE}/ai/full-auto-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text_content: text, source_name: sourceName }),
    });
    return handleResponse<FullWorkflowResponse>(res);
  },
};
