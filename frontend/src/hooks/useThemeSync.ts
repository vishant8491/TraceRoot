import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  ThemePreference,
  THEME_STORAGE_KEY,
  setThemePreference,
  setResolvedTheme,
  applyThemeToDocument,
} from '../store/themeSlice';

/**
 * Hook to synchronize theme state with:
 * 1. Document attributes (data-theme, colorScheme).
 * 2. Operating System preference changes when 'system' is active.
 * 3. Cross-tab synchronization via the 'storage' event.
 */
export const useThemeSync = () => {
  const dispatch = useDispatch();
  const { preference, resolved } = useSelector((state: RootState) => state.theme);

  // Apply theme to document whenever resolved theme changes
  useEffect(() => {
    applyThemeToDocument(resolved);
  }, [resolved]);

  // Synchronize OS theme changes when 'system' is selected
  useEffect(() => {
    if (preference !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const isDark = 'matches' in e ? e.matches : (e as any).matches;
      dispatch(setResolvedTheme(isDark ? 'dark' : 'light'));
    };

    // Listen to changes
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else if ((mediaQuery as any).addListener) {
      (mediaQuery as any).addListener(handleMediaChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else if ((mediaQuery as any).removeListener) {
        (mediaQuery as any).removeListener(handleMediaChange);
      }
    };
  }, [preference, dispatch]);

  // Cross-tab synchronization via storage event
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const val = e.newValue as ThemePreference;
        if (val === 'light' || val === 'dark' || val === 'system') {
          dispatch(setThemePreference(val));
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [dispatch]);

  return {
    preference,
    resolved,
    setTheme: (pref: ThemePreference) => dispatch(setThemePreference(pref)),
  };
};
