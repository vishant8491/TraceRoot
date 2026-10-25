import { configureStore } from '@reduxjs/toolkit';
import investigationReducer from './investigationSlice';
import aiAssistantReducer from './aiAssistantSlice';
import themeReducer from './themeSlice';

export const store = configureStore({
  reducer: {
    investigation: investigationReducer,
    aiAssistant: aiAssistantReducer,
    theme: themeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
