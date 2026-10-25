import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ExtractedContext } from '../types';

export type AiActionType =
  | 'idle'
  | 'extracting'
  | 'generating_whys'
  | 'generating_ishikawa'
  | 'evaluating_evidence'
  | 'generating_capa'
  | 'running_full_draft';

interface AiAssistantState {
  isPanelOpen: boolean;
  currentAction: AiActionType;
  progressStep: string;
  error: string | null;
  lastRunTimestamp: string | null;
  pastedInputText: string;
  selectedSampleKey: string;
  pendingExtractedContext: ExtractedContext | null;
  highlightedFields: string[];
}

const initialState: AiAssistantState = {
  isPanelOpen: true,
  currentAction: 'idle',
  progressStep: '',
  error: null,
  lastRunTimestamp: null,
  pastedInputText: '',
  selectedSampleKey: '',
  pendingExtractedContext: null,
  highlightedFields: [],
};

export const aiAssistantSlice = createSlice({
  name: 'aiAssistant',
  initialState,
  reducers: {
    togglePanel(state) {
      state.isPanelOpen = !state.isPanelOpen;
    },
    setPanelOpen(state, action: PayloadAction<boolean>) {
      state.isPanelOpen = action.payload;
    },
    setPastedInputText(state, action: PayloadAction<string>) {
      state.pastedInputText = action.payload;
    },
    setSelectedSampleKey(state, action: PayloadAction<string>) {
      state.selectedSampleKey = action.payload;
    },
    startAiWorkflow(state, action: PayloadAction<{ action: AiActionType; message: string }>) {
      state.currentAction = action.payload.action;
      state.progressStep = action.payload.message;
      state.error = null;
    },
    setAiProgress(state, action: PayloadAction<string>) {
      state.progressStep = action.payload;
    },
    aiWorkflowSuccess(state, action: PayloadAction<{ highlighted?: string[] }>) {
      state.currentAction = 'idle';
      state.progressStep = '';
      state.lastRunTimestamp = new Date().toISOString();
      state.highlightedFields = action.payload.highlighted || [];
      state.error = null;
    },
    aiWorkflowFailed(state, action: PayloadAction<string>) {
      state.currentAction = 'idle';
      state.progressStep = '';
      state.error = action.payload;
    },
    clearHighlightedFields(state) {
      state.highlightedFields = [];
    },
  },
});

export const {
  togglePanel,
  setPanelOpen,
  setPastedInputText,
  setSelectedSampleKey,
  startAiWorkflow,
  setAiProgress,
  aiWorkflowSuccess,
  aiWorkflowFailed,
  clearHighlightedFields,
} = aiAssistantSlice.actions;

export default aiAssistantSlice.reducer;
