import { useCallback, useEffect, useState } from 'react';
import { loadStoredSettings, saveStoredSettings } from '../api';
import { AppSettings, LiveBackgroundMode, ThemeMode } from '../types';

export interface ThemeOptionMeta {
  value: ThemeMode;
  label: string;
  group: 'Studio' | 'Tinted Dark' | 'AMOLED Neon';
  description: string;
  previewBg: string;
  previewSurface: string;
  previewAccent: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  isDark: boolean;
}

export const THEME_OPTIONS: ThemeOptionMeta[] = [
  {
    value: 'dark',
    label: 'Dark Slate',
    group: 'Studio',
    description: 'Linear-inspired dark zinc workspace',
    previewBg: '#09090b',
    previewSurface: '#18181b',
    previewAccent: '#6366f1',
    primaryColor: '#6366f1',
    secondaryColor: '#06b6d4',
    tertiaryColor: '#8b5cf6',
    isDark: true,
  },
  {
    value: 'light',
    label: 'Light Studio',
    group: 'Studio',
    description: 'Clean high-clarity daylight surface',
    previewBg: '#fafafa',
    previewSurface: '#ffffff',
    previewAccent: '#4f46e5',
    primaryColor: '#4f46e5',
    secondaryColor: '#0ea5e9',
    tertiaryColor: '#8b5cf6',
    isDark: false,
  },
  {
    value: 'light-warm',
    label: 'Warm Paper',
    group: 'Studio',
    description: 'Soft alabaster paper with amber ink accents',
    previewBg: '#f8f5ef',
    previewSurface: '#fffdf9',
    previewAccent: '#b45309',
    primaryColor: '#b45309',
    secondaryColor: '#ea580c',
    tertiaryColor: '#ca8a04',
    isDark: false,
  },
  {
    value: 'light-ocean',
    label: 'Nordic Mist',
    group: 'Studio',
    description: 'Cool glacier mist with crisp sapphire accents',
    previewBg: '#f1f7fb',
    previewSurface: '#ffffff',
    previewAccent: '#0284c7',
    primaryColor: '#0284c7',
    secondaryColor: '#0d9488',
    tertiaryColor: '#6366f1',
    isDark: false,
  },
  {
    value: 'system',
    label: 'System',
    group: 'Studio',
    description: 'Matches your OS light/dark preference',
    previewBg: '#18181b',
    previewSurface: '#27272a',
    previewAccent: '#818cf8',
    primaryColor: '#6366f1',
    secondaryColor: '#06b6d4',
    tertiaryColor: '#8b5cf6',
    isDark: true,
  },
  {
    value: 'midnight-indigo',
    label: 'Midnight Indigo',
    group: 'Tinted Dark',
    description: 'Deep navy-indigo studio with periwinkle glow',
    previewBg: '#070b18',
    previewSurface: '#0f162e',
    previewAccent: '#818cf8',
    primaryColor: '#818cf8',
    secondaryColor: '#38bdf8',
    tertiaryColor: '#a78bfa',
    isDark: true,
  },
  {
    value: 'forest-moss',
    label: 'Evergreen Dusk',
    group: 'Tinted Dark',
    description: 'Deep pine studio with calm sage-mint accents',
    previewBg: '#06100c',
    previewSurface: '#0d1d17',
    previewAccent: '#34d399',
    primaryColor: '#34d399',
    secondaryColor: '#2dd4bf',
    tertiaryColor: '#84cc16',
    isDark: true,
  },
  {
    value: 'obsidian-rose',
    label: 'Obsidian Rose',
    group: 'Tinted Dark',
    description: 'Charcoal plum studio with luminous coral-rose',
    previewBg: '#0e080c',
    previewSurface: '#190e16',
    previewAccent: '#fb7185',
    primaryColor: '#fb7185',
    secondaryColor: '#f472b6',
    tertiaryColor: '#fb923c',
    isDark: true,
  },
  {
    value: 'amoled-cyan',
    label: 'AMOLED Cyan',
    group: 'AMOLED Neon',
    description: 'True #000 black with electric cyan neon',
    previewBg: '#000000',
    previewSurface: '#060a0c',
    previewAccent: '#00f0ff',
    primaryColor: '#00f0ff',
    secondaryColor: '#3b82f6',
    tertiaryColor: '#14b8a6',
    isDark: true,
  },
  {
    value: 'amoled-violet',
    label: 'AMOLED Violet',
    group: 'AMOLED Neon',
    description: 'True #000 black with magenta-violet neon',
    previewBg: '#000000',
    previewSurface: '#09060b',
    previewAccent: '#d946ef',
    primaryColor: '#d946ef',
    secondaryColor: '#8b5cf6',
    tertiaryColor: '#ec4899',
    isDark: true,
  },
  {
    value: 'amoled-emerald',
    label: 'AMOLED Emerald',
    group: 'AMOLED Neon',
    description: 'True #000 black with emerald pulse neon',
    previewBg: '#000000',
    previewSurface: '#050a08',
    previewAccent: '#10b981',
    primaryColor: '#10b981',
    secondaryColor: '#06b6d4',
    tertiaryColor: '#22c55e',
    isDark: true,
  },
  {
    value: 'amoled-amber',
    label: 'AMOLED Solar',
    group: 'AMOLED Neon',
    description: 'True #000 black with molten gold-amber neon',
    previewBg: '#000000',
    previewSurface: '#0b0804',
    previewAccent: '#f59e0b',
    primaryColor: '#f59e0b',
    secondaryColor: '#fb923c',
    tertiaryColor: '#eab308',
    isDark: true,
  },
  {
    value: 'amoled-crimson',
    label: 'AMOLED Crimson',
    group: 'AMOLED Neon',
    description: 'True #000 black with vivid ruby-rose neon',
    previewBg: '#000000',
    previewSurface: '#0b0507',
    previewAccent: '#f43f5e',
    primaryColor: '#f43f5e',
    secondaryColor: '#ec4899',
    tertiaryColor: '#fb7185',
    isDark: true,
  },
];

export interface LiveBackgroundOptionMeta {
  value: LiveBackgroundMode;
  label: string;
  category: 'Ambient' | 'Companions' | 'Custom';
  description: string;
}

export const LIVE_BACKGROUND_OPTIONS: LiveBackgroundOptionMeta[] = [
  {
    value: 'aurora',
    label: 'Aurora Mesh',
    category: 'Ambient',
    description: 'Slow-drifting ambient glow synced to your theme',
  },
  {
    value: 'waves',
    label: 'Acoustic Waves',
    category: 'Ambient',
    description: 'Smooth flowing audio ribbons across the canvas',
  },
  {
    value: 'particles',
    label: 'Neural Drift',
    category: 'Ambient',
    description: 'Floating light nodes with subtle constellation links',
  },
  {
    value: 'grid',
    label: 'Studio Grid',
    category: 'Ambient',
    description: 'Architectural dot matrix with drifting spotlight',
  },
  {
    value: 'starfield',
    label: 'Starlight Drift',
    category: 'Ambient',
    description: 'Twinkling cosmic field with gentle shooting stars',
  },
  {
    value: 'rain',
    label: 'Midnight Rain',
    category: 'Ambient',
    description: 'Calm diagonal rain streaks and expanding ripples',
  },
  {
    value: 'fireflies',
    label: 'Firefly Meadow',
    category: 'Ambient',
    description: 'Warm glowing orbs drifting smoothly in slow orbits',
  },
  {
    value: 'topography',
    label: 'Contour Drift',
    category: 'Ambient',
    description: 'Minimalist undulating topographic contour lines',
  },
  {
    value: 'pokemon',
    label: 'Pocket Pals',
    category: 'Companions',
    description: 'Cute animated electric, flame, aqua & leafy companions',
  },
  {
    value: 'animals',
    label: 'Cozy Critters',
    category: 'Companions',
    description: 'Hopping bunnies, kittens, shiba pups, foxes & butterflies',
  },
  {
    value: 'aquarium',
    label: 'Pond & Sea Pals',
    category: 'Companions',
    description: 'Swimming koi fish, baby sea turtles, ducklings & bubbles',
  },
  {
    value: 'custom',
    label: 'Custom Studio',
    category: 'Custom',
    description: 'Design your own gradient, uploaded image, pattern & motion',
  },
  {
    value: 'off',
    label: 'Static Clean',
    category: 'Custom',
    description: 'Solid canvas with zero background animation',
  },
];

const LIGHT_ONLY_THEMES = new Set<ThemeMode>(['light', 'light-warm', 'light-ocean']);
const TINTED_THEMES = new Set<ThemeMode>([
  'light-warm',
  'light-ocean',
  'midnight-indigo',
  'forest-moss',
  'obsidian-rose',
]);

export function resolveThemePalette(theme: ThemeMode): {
  primary: string;
  secondary: string;
  tertiary: string;
  isDark: boolean;
} {
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (theme === 'system') {
    return prefersDark
      ? { primary: '#6366f1', secondary: '#06b6d4', tertiary: '#8b5cf6', isDark: true }
      : { primary: '#4f46e5', secondary: '#0ea5e9', tertiary: '#8b5cf6', isDark: false };
  }

  const found = THEME_OPTIONS.find((t) => t.value === theme);
  if (found) {
    return {
      primary: found.primaryColor,
      secondary: found.secondaryColor,
      tertiary: found.tertiaryColor,
      isDark: found.isDark,
    };
  }

  return { primary: '#6366f1', secondary: '#06b6d4', tertiary: '#8b5cf6', isDark: true };
}

export function applyThemeToDocument(theme: ThemeMode): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isAmoled = theme.startsWith('amoled-');
  const isTinted = TINTED_THEMES.has(theme);
  const shouldDark =
    isAmoled || (!LIGHT_ONLY_THEMES.has(theme) && (theme !== 'system' || prefersDark));

  root.classList.toggle('dark', shouldDark);
  root.classList.toggle('amoled', isAmoled);
  root.classList.toggle('cs-tinted', isTinted);
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
      const order: ThemeMode[] = THEME_OPTIONS.map((t) => t.value);
      const next = order[(order.indexOf(prev.theme) + 1) % order.length];
      return { ...prev, theme: next };
    });
  }, [updateSettings]);

  const cycleBackground = useCallback(() => {
    updateSettings((prev) => {
      const order: LiveBackgroundMode[] = LIVE_BACKGROUND_OPTIONS.map((b) => b.value);
      const next = order[(order.indexOf(prev.liveBackground) + 1) % order.length];
      return { ...prev, liveBackground: next };
    });
  }, [updateSettings]);

  return { settings, updateSettings, cycleTheme, cycleBackground };
}
