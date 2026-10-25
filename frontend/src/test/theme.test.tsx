import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import themeReducer, {
  THEME_STORAGE_KEY,
  getStoredThemePreference,
  setStoredThemePreference,
  getSystemTheme,
  resolveTheme,
  applyThemeToDocument,
  setThemePreference,
  setResolvedTheme,
} from '../store/themeSlice';
import { ThemeSelector } from '../components/ThemeSelector';
import { useThemeSync } from '../hooks/useThemeSync';

function createTestStore(preloadedPreference: 'light' | 'dark' | 'system' = 'system') {
  const resolved = resolveTheme(preloadedPreference);
  return configureStore({
    reducer: {
      theme: themeReducer,
    },
    preloadedState: {
      theme: {
        preference: preloadedPreference,
        resolved,
      },
    },
  });
}

// Harness component to test useThemeSync hook
const ThemeSyncHarness: React.FC = () => {
  useThemeSync();
  return <div data-testid="sync-harness" />;
};

describe('Theme Resolution & Persistence (themeSlice)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  it('falls back to "system" when localStorage is empty or has invalid value', () => {
    expect(getStoredThemePreference()).toBe('system');

    localStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme-xyz');
    expect(getStoredThemePreference()).toBe('system');

    localStorage.setItem(THEME_STORAGE_KEY, 'DARK'); // uppercase invalid
    expect(getStoredThemePreference()).toBe('system');
  });

  it('correctly retrieves valid "light", "dark", or "system" from localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(getStoredThemePreference()).toBe('light');

    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(getStoredThemePreference()).toBe('dark');

    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    expect(getStoredThemePreference()).toBe('system');
  });

  it('handles localStorage throwing SecurityError gracefully without crashing', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });

    expect(() => getStoredThemePreference()).not.toThrow();
    expect(getStoredThemePreference()).toBe('system');

    expect(() => setStoredThemePreference('dark')).not.toThrow();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it('resolves explicit preferences directly', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolves "system" using matchMedia', () => {
    // Mock matchMedia returning matches: true (dark)
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(getSystemTheme()).toBe('dark');
    expect(resolveTheme('system')).toBe('dark');

    // Mock matchMedia returning matches: false (light)
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(getSystemTheme()).toBe('light');
    expect(resolveTheme('system')).toBe('light');
  });

  it('applies theme to document root with data-theme and colorScheme', () => {
    applyThemeToDocument('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyThemeToDocument('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('updates store state and persists to localStorage on setThemePreference', () => {
    const store = createTestStore('light');

    store.dispatch(setThemePreference('dark'));
    expect(store.getState().theme.preference).toBe('dark');
    expect(store.getState().theme.resolved).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('updates resolved state on setResolvedTheme', () => {
    const store = createTestStore('system');

    store.dispatch(setResolvedTheme('dark'));
    expect(store.getState().theme.resolved).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('ThemeSelector UI Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders all three theme buttons with accessible labels and tooltips', () => {
    const store = createTestStore('system');
    render(
      <Provider store={store}>
        <ThemeSelector />
      </Provider>
    );

    const lightBtn = screen.getByRole('button', { name: /^light theme$/i });
    const systemBtn = screen.getByRole('button', { name: /^system theme$/i });
    const darkBtn = screen.getByRole('button', { name: /^dark theme$/i });

    expect(lightBtn).toBeInTheDocument();
    expect(systemBtn).toBeInTheDocument();
    expect(darkBtn).toBeInTheDocument();

    expect(lightBtn).toHaveAttribute('title', 'Switch to light theme');
    expect(systemBtn).toHaveAttribute('title', 'Follow operating system theme');
    expect(darkBtn).toHaveAttribute('title', 'Switch to dark theme');
  });

  it('shows the active option clearly with aria-pressed', () => {
    const store = createTestStore('system');
    render(
      <Provider store={store}>
        <ThemeSelector />
      </Provider>
    );

    const lightBtn = screen.getByRole('button', { name: /^light theme$/i });
    const systemBtn = screen.getByRole('button', { name: /^system theme$/i });
    const darkBtn = screen.getByRole('button', { name: /^dark theme$/i });

    expect(systemBtn).toHaveAttribute('aria-pressed', 'true');
    expect(lightBtn).toHaveAttribute('aria-pressed', 'false');
    expect(darkBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to Dark mode on click without page reload', () => {
    const store = createTestStore('light');
    render(
      <Provider store={store}>
        <ThemeSelector />
      </Provider>
    );

    const darkBtn = screen.getByRole('button', { name: /^dark theme$/i });
    fireEvent.click(darkBtn);

    expect(store.getState().theme.preference).toBe('dark');
    expect(store.getState().theme.resolved).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(darkBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to Light mode on click without page reload', () => {
    const store = createTestStore('dark');
    render(
      <Provider store={store}>
        <ThemeSelector />
      </Provider>
    );

    const lightBtn = screen.getByRole('button', { name: /^light theme$/i });
    fireEvent.click(lightBtn);

    expect(store.getState().theme.preference).toBe('light');
    expect(store.getState().theme.resolved).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(lightBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to System mode on click', () => {
    const store = createTestStore('dark');
    render(
      <Provider store={store}>
        <ThemeSelector />
      </Provider>
    );

    const systemBtn = screen.getByRole('button', { name: /^system theme$/i });
    fireEvent.click(systemBtn);

    expect(store.getState().theme.preference).toBe('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(systemBtn).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('useThemeSync & Cross-Tab / OS Preference Sync', () => {
  let mediaListeners: Array<(e: MediaQueryListEvent) => void> = [];

  beforeEach(() => {
    mediaListeners = [];
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event, cb) => {
        mediaListeners.push(cb);
      }),
      removeEventListener: vi.fn((_event, cb) => {
        mediaListeners = mediaListeners.filter((l) => l !== cb);
      }),
      dispatchEvent: vi.fn(),
    }));
  });

  it('responds to OS theme changes when preference is "system"', () => {
    const store = createTestStore('system');
    const { unmount } = render(
      <Provider store={store}>
        <ThemeSyncHarness />
      </Provider>
    );

    expect(store.getState().theme.resolved).toBe('light');

    // Simulate OS change to dark
    act(() => {
      mediaListeners.forEach((listener) => {
        listener({ matches: true } as MediaQueryListEvent);
      });
    });

    expect(store.getState().theme.resolved).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Unmount cleans up listeners
    unmount();
    expect(mediaListeners.length).toBe(0);
  });

  it('ignores OS theme changes when preference is explicitly "light" or "dark"', () => {
    const store = createTestStore('light');
    render(
      <Provider store={store}>
        <ThemeSyncHarness />
      </Provider>
    );

    expect(store.getState().theme.resolved).toBe('light');

    // Simulate OS change to dark
    act(() => {
      mediaListeners.forEach((listener) => {
        listener({ matches: true } as MediaQueryListEvent);
      });
    });

    // Should still be light
    expect(store.getState().theme.preference).toBe('light');
    expect(store.getState().theme.resolved).toBe('light');
  });

  it('synchronizes theme across browser tabs via storage event', () => {
    const store = createTestStore('light');
    render(
      <Provider store={store}>
        <ThemeSyncHarness />
      </Provider>
    );

    expect(store.getState().theme.preference).toBe('light');

    // Simulate storage event from another tab
    act(() => {
      const storageEvent = new StorageEvent('storage', {
        key: THEME_STORAGE_KEY,
        newValue: 'dark',
      });
      window.dispatchEvent(storageEvent);
    });

    expect(store.getState().theme.preference).toBe('dark');
    expect(store.getState().theme.resolved).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
