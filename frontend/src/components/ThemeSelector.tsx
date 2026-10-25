import React from 'react';
import { useThemeSync } from '../hooks/useThemeSync';
import { Sun, Moon, Monitor } from 'lucide-react';
import { ThemePreference } from '../store/themeSlice';

export const ThemeSelector: React.FC = () => {
  const { preference, setTheme } = useThemeSync();

  const options: {
    value: ThemePreference;
    label: string;
    icon: React.FC<any>;
    tooltip: string;
  }[] = [
    { value: 'light', label: 'Light', icon: Sun, tooltip: 'Switch to light theme' },
    { value: 'system', label: 'System', icon: Monitor, tooltip: 'Follow operating system theme' },
    { value: 'dark', label: 'Dark', icon: Moon, tooltip: 'Switch to dark theme' },
  ];

  return (
    <div
      role="group"
      aria-label="Theme selection"
      className="theme-selector-group"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px',
        backgroundColor: 'var(--bg-surface-subtle)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        gap: '2px',
        flexShrink: 0,
      }}
    >
      {options.map(({ value, label, icon: Icon, tooltip }) => {
        const isSelected = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={`${label} theme`}
            title={tooltip}
            aria-pressed={isSelected}
            className={`theme-option-btn ${isSelected ? 'theme-option-active' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              padding: 0,
              borderRadius: 'var(--radius-xs)',
              border: isSelected ? '1px solid var(--border-subtle)' : '1px solid transparent',
              cursor: 'pointer',
              backgroundColor: isSelected ? 'var(--bg-surface)' : 'transparent',
              color: isSelected ? 'var(--color-teal)' : 'var(--text-muted)',
              boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
              transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
            }}
          >
            <Icon size={13} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
};
