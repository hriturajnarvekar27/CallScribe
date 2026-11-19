import { useCallback, useEffect, useState } from 'react';
import { loadStoredSettings, saveStoredSettings } from '../api';
import { AppSettings, LiveBackgroundMode, ThemeMode } from '../types';

export const THEME_OPTIONS: {
  value: ThemeMode;
  label: string;
  description: string;
  previewBg: string;
  previewAccent: string;
}[] = [
  {
    value: 'dark',
    label: 'Dark Slate',
    description: 'Linear-inspired dark zinc workspace',
    previewBg: '#09090b',
    previewAccent: '#6366f1',
  },
  {
    value: 'light',
    label: 'Light Studio',
    description: 'Clean high-clarity daylight surface',
    previewBg: '#fafafa',
    previewAccent: '#4f46e5',
  },
  {
    value: 'amoled-cyan',
    label: 'AMOLED Cyan',
    description: 'True #000 black with electric cyan neon',
    previewBg: '#000000',
    previewAccent: '#00f0ff',
  },
  {
    value: 'amoled-violet',
    label: 'AMOLED Violet',
    description: 'True #000 black with magenta-violet neon',
    previewBg: '#000000',
    previewAccent: '#d946ef',
  },
  {
    value: 'amoled-emerald',
    label: 'AMOLED Emerald',
    description: 'True #000 black with emerald pulse neon',
    previewBg: '#000000',
    previewAccent: '#10b981',
  },
  {
    value: 'system',
    label: 'System',
    description: 'Matches your OS light/dark preference',
    previewBg: '#18181b',
    previewAccent: '#818cf8',
  },
];

export const LIVE_BACKGROUND_OPTIONS: {
  value: LiveBackgroundMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'aurora',
    label: 'Aurora Mesh',
    description: 'Slow-drifting ambient glow synced to your theme',
  },
  {
    value: 'waves',
    label: 'Acoustic Waves',
    description: 'Smooth flowing audio ribbons across the canvas',
  },
  {
    value: 'particles',
    label: 'Neural Drift',
    description: 'Floating light nodes with subtle constellation links',
  },
  {
    value: 'grid',
    label: 'Studio Grid',
    description: 'Architectural dot matrix with drifting spotlight',
  },
  {
    value: 'off',
    label: 'Static Clean',
    description: 'Solid canvas with zero background animation',
  },
];

export function applyThemeToDocument(theme: ThemeMode): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isAmoled = theme.startsWith('amoled-');
  const shouldDark = isAmoled || theme === 'dark' || (theme === 'system' && prefersDark);

  root.classList.toggle('dark', shouldDark);
  root.classList.toggle('amoled', isAmoled);
  root.setAttribute('data-theme', theme);
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadStoredSettings());

  useEffect(() => {
    applyThemeToDocument(settings.theme);

    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyThemeToDocument('system');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [settings.theme]);

  const updateSettings = useCallback(
    (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => {
      setSettings((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        saveStoredSettings(next);
        return next;
      });
    },
    []
  );

  const cycleTheme = useCallback(() => {
    updateSettings((prev) => {
      const order: ThemeMode[] = [
        'dark',
        'amoled-cyan',
        'amoled-violet',
        'amoled-emerald',
        'light',
        'system',
      ];
      const next = order[(order.indexOf(prev.theme) + 1) % order.length];
      return { ...prev, theme: next };
    });
  }, [updateSettings]);

  const cycleBackground = useCallback(() => {
    updateSettings((prev) => {
      const order: LiveBackgroundMode[] = ['aurora', 'waves', 'particles', 'grid', 'off'];
      const next = order[(order.indexOf(prev.liveBackground) + 1) % order.length];
      return { ...prev, liveBackground: next };
    });
  }, [updateSettings]);

  return { settings, updateSettings, cycleTheme, cycleBackground };
}
