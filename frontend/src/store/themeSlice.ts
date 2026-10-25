import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'traceroot-theme';

/**
 * Safely read stored theme preference from localStorage.
 * Falls back to 'system' on missing, invalid, or inaccessible storage.
 */
export const getStoredThemePreference = (): ThemePreference => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    }
  } catch {
    // Gracefully handle restricted storage (e.g. Incognito mode / SecurityError)
  }
  return 'system';
};

/**
 * Safely persist theme preference to localStorage.
 */
export const setStoredThemePreference = (pref: ThemePreference): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, pref);
    }
  } catch {
    // Silently ignore storage failures
  }
};

/**
 * Detect current OS color-scheme preference using matchMedia.
 */
export const getSystemTheme = (): ResolvedTheme => {
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {
    // matchMedia unavailable fallback
  }
  return 'light';
};

/**
 * Resolve a theme preference to either 'light' or 'dark'.
 */
export const resolveTheme = (pref: ThemePreference): ResolvedTheme => {
  if (pref === 'dark') return 'dark';
  if (pref === 'light') return 'light';
  return getSystemTheme();
};

/**
 * Apply resolved theme to document root (data-theme and colorScheme).
 */
export const applyThemeToDocument = (resolved: ResolvedTheme): void => {
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.style.colorScheme = resolved;
    }
  } catch {
    // Ignore DOM access failures in non-browser environments
  }
};

export interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

const initialPreference = getStoredThemePreference();
const initialResolved = resolveTheme(initialPreference);

// Initial application to prevent layout mismatch
applyThemeToDocument(initialResolved);

export const themeSlice = createSlice({
  name: 'theme',
  initialState: {
    preference: initialPreference,
    resolved: initialResolved,
  } as ThemeState,
  reducers: {
    setThemePreference: (state, action: PayloadAction<ThemePreference>) => {
      const pref = action.payload;
      state.preference = pref;
      state.resolved = resolveTheme(pref);
      setStoredThemePreference(pref);
      applyThemeToDocument(state.resolved);
    },
    setResolvedTheme: (state, action: PayloadAction<ResolvedTheme>) => {
      state.resolved = action.payload;
      applyThemeToDocument(action.payload);
    },
  },
});

export const { setThemePreference, setResolvedTheme } = themeSlice.actions;
export default themeSlice.reducer;
