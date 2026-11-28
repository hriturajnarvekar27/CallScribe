import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ImagePlus,
  Loader2,
  Palette,
  RotateCcw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  DEFAULT_CUSTOM_BACKGROUND,
  getEffectiveApiBaseUrl,
  getEnvApiBaseUrl,
  isMockMode,
  listJobs,
  validateApiBaseUrl,
} from '../api';
import {
  LIVE_BACKGROUND_OPTIONS,
  resolveThemePalette,
  THEME_OPTIONS,
} from '../hooks/useSettings';
import {
  AppSettings,
  CustomBackgroundBaseStyle,
  CustomBackgroundConfig,
  CustomBackgroundMotion,
  CustomBackgroundPattern,
  OutputSelections,
  TranscriptViewMode,
} from '../types';
import { compressImageFileToDataUrl } from '../utils/imageResize';
import { useToast } from './ToastProvider';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => void;
}

const CUSTOM_BG_PALETTES: {
  label: string;
  primary: string;
  secondary: string;
  tertiary: string;
  angle: number;
}[] = [
  { label: 'Indigo Aurora', primary: '#4f46e5', secondary: '#06b6d4', tertiary: '#ec4899', angle: 135 },
  { label: 'Deep Ocean', primary: '#0369a1', secondary: '#0d9488', tertiary: '#1e3a8a', angle: 150 },
  { label: 'Emerald Pine', primary: '#059669', secondary: '#14b8a6', tertiary: '#84cc16', angle: 120 },
  { label: 'Solar Amber', primary: '#d97706', secondary: '#f43f5e', tertiary: '#eab308', angle: 140 },
  { label: 'Midnight Plum', primary: '#7c3aed', secondary: '#db2777', tertiary: '#312e81', angle: 130 },
  { label: 'Warm Sand', primary: '#b45309', secondary: '#d97706', tertiary: '#78716c', angle: 165 },
];

export function SettingsView({ settings, onUpdateSettings }: SettingsViewProps) {
  const { showToast } = useToast();
  const bgImageInputRef = useRef<HTMLInputElement>(null);

  const [themeFilter, setThemeFilter] = useState<'All' | 'Studio' | 'Tinted Dark' | 'AMOLED Neon'>('All');
  const [bgFilter, setBgFilter] = useState<'All' | 'Ambient' | 'Companions' | 'Custom'>('All');
  const [uploadingBgImage, setUploadingBgImage] = useState(false);

  const [apiInput, setApiInput] = useState(settings.apiBaseUrl);
  const [apiError, setApiError] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const envDefault = getEnvApiBaseUrl();
  const effectiveUrl = getEffectiveApiBaseUrl();
  const mockActive = isMockMode();
  const effectiveValidation = validateApiBaseUrl(effectiveUrl);

  useEffect(() => {
    setApiInput(settings.apiBaseUrl);
  }, [settings.apiBaseUrl]);

  const updateCustomBackground = (patch: Partial<CustomBackgroundConfig>) => {
    onUpdateSettings((prev) => ({
      ...prev,
      liveBackground: 'custom',
      customBackground: {
        ...prev.customBackground,
        ...patch,
      },
    }));
  };

  const handleUploadCustomImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingBgImage(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, {
        maxWidth: 1600,
        maxHeight: 1000,
        quality: 0.82,
      });
      updateCustomBackground({
        baseStyle: 'image',
        imageDataUrl: dataUrl,
      });
      showToast('Custom background image applied.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to load image.', 'error');
    } finally {
      setUploadingBgImage(false);
    }
  };

  const handleSyncCustomColorsToTheme = () => {
    const p = resolveThemePalette(settings.theme);
    updateCustomBackground({
      primaryColor: p.primary,
      secondaryColor: p.secondary,
      tertiaryColor: p.tertiary,
    });
    showToast('Synced custom palette with active theme.', 'success');
  };

  const toggleDefaultOutput = (key: keyof OutputSelections) => {
    onUpdateSettings((prev) => ({
      ...prev,
      defaultOutputs: {
        ...prev.defaultOutputs,
        [key]: !prev.defaultOutputs[key],
      },
    }));
    showToast('Default output preferences saved.', 'success');
  };

  const handleSaveApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateApiBaseUrl(apiInput);
    if (!validation.valid) {
      const message = validation.error ?? 'Invalid API base URL.';
      setApiError(message);
      setConnectionResult(null);
      showToast(message, 'error');
      return;
    }

    setApiError(null);
    setConnectionResult(null);
    setApiInput(validation.normalized);
    onUpdateSettings({ apiBaseUrl: validation.normalized });
    showToast(
      validation.normalized
        ? `API base URL updated to ${validation.normalized}`
        : envDefault
          ? `Override cleared. Using VITE_API_BASE_URL (${envDefault}).`
          : 'API base URL cleared. Mock mode active.',
      'success'
    );
  };

  const handleResetApiUrl = () => {
    setApiInput('');
    setApiError(null);
    setConnectionResult(null);
    onUpdateSettings({ apiBaseUrl: '' });
    showToast(
      envDefault
        ? `Reverted to VITE_API_BASE_URL (${envDefault})`
        : 'Reverted to built-in Mock Mode.',
      'info'
    );
  };

  const handleTestConnection = async () => {
    if (isMockMode()) {
      setConnectionResult({
        ok: true,
        message: 'Mock Mode is active locally. Enter a backend URL above to test a live server.',
      });
      return;
    }
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const jobs = await listJobs();
      setConnectionResult({
        ok: true,
        message: `Connected to ${effectiveUrl} (${jobs.length} recordings returned).`,
      });
    } catch (err) {
      setConnectionResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to reach backend API.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const visibleThemes =
    themeFilter === 'All'
      ? THEME_OPTIONS
      : THEME_OPTIONS.filter((opt) => opt.group === themeFilter);

  const visibleBackgrounds =
    bgFilter === 'All'
      ? LIVE_BACKGROUND_OPTIONS
      : LIVE_BACKGROUND_OPTIONS.filter((opt) => opt.category === bgFilter);

  const cb = settings.customBackground;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Settings
        </h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Configure studio &amp; AMOLED themes, customizable live backgrounds, theme-matched scrollbars, transcription defaults, and API connection.
        </p>
      </div>

      <div className="space-y-6">
        {/* Appearance & Themes */}
        <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Palette className="cs-accent-text h-4 w-4 text-indigo-500" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Themes &amp; Surface Profiles
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-950">
              {(['All', 'Studio', 'Tinted Dark', 'AMOLED Neon'] as const).map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setThemeFilter(group)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    themeFilter === group
                      ? 'cs-surface bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Every theme adapts surface contrast, accent controls, live ambient colors, and application scrollbars.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleThemes.map((opt) => {
              const active = settings.theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdateSettings({ theme: opt.value })}
                  aria-pressed={active}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                    active
                      ? 'cs-neon-ring border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/25'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                  }`}
                >
                  {/* Mini canvas + surface + scrollbar preview swatch */}
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-between rounded-lg border border-zinc-300/60 p-1 dark:border-zinc-700"
                    style={{ backgroundColor: opt.previewBg }}
                    aria-hidden="true"
                  >
                    <span
                      className="flex h-full w-5 items-center justify-center rounded-sm"
                      style={{ backgroundColor: opt.previewSurface }}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shadow-sm"
                        style={{
                          backgroundColor: opt.previewAccent,
                          boxShadow: opt.value.startsWith('amoled-')
                            ? `0 0 8px ${opt.previewAccent}`
                            : undefined,
                        }}
                      />
                    </span>
                    <span
                      className="h-5 w-1 rounded-full opacity-80"
                      style={{ backgroundColor: opt.previewAccent }}
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {opt.label}
                      </span>
                      {active && (
                        <Check
                          className="cs-accent-text h-3.5 w-3.5 shrink-0 text-indigo-500"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Live & Customizable Backgrounds */}
        <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="cs-accent-text h-4 w-4 text-indigo-500" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Live &amp; Customizable Backgrounds
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-950">
              {(['All', 'Ambient', 'Companions', 'Custom'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setBgFilter(cat)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    bgFilter === cat
                      ? 'cs-surface bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Choose an ambient preset, animated companion world, or design your own gradient, pattern, or wallpaper backdrop.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBackgrounds.map((opt) => {
              const active = settings.liveBackground === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdateSettings({ liveBackground: opt.value })}
                  aria-pressed={active}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                    active
                      ? 'cs-neon-ring border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/25'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {opt.label}
                    </span>
                    {active && (
                      <Check
                        className="cs-accent-text h-3.5 w-3.5 shrink-0 text-indigo-500"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Global Background Intensity & Motion Speed */}
          {settings.liveBackground !== 'off' && (
            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2 dark:border-zinc-800">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <label htmlFor="bg-opacity-slider" className="font-medium text-zinc-700 dark:text-zinc-300">
                    Background intensity
                  </label>
                  <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    {settings.backgroundOpacity}%
                  </span>
                </div>
                <input
                  id="bg-opacity-slider"
                  type="range"
                  min={20}
                  max={100}
                  step={5}
                  value={settings.backgroundOpacity}
                  onChange={(e) =>
                    onUpdateSettings({ backgroundOpacity: Number(e.target.value) })
                  }
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <label htmlFor="bg-speed-slider" className="font-medium text-zinc-700 dark:text-zinc-300">
                    Animation speed
                  </label>
                  <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    {settings.backgroundSpeed.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="bg-speed-slider"
                  type="range"
                  min={0.25}
                  max={2}
                  step={0.25}
                  value={settings.backgroundSpeed}
                  onChange={(e) =>
                    onUpdateSettings({ backgroundSpeed: Number(e.target.value) })
                  }
                  className="w-full accent-indigo-600"
                />
              </div>
            </div>
          )}

          {/* Custom Background Studio Controls */}
          <div className="mt-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="cs-accent-text h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Custom Background Studio
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {settings.liveBackground !== 'custom' && (
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ liveBackground: 'custom' })}
                    className="cs-accent-btn rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500"
                  >
                    Activate Custom Studio
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSyncCustomColorsToTheme}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Match active theme
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateCustomBackground(DEFAULT_CUSTOM_BACKGROUND);
                    showToast('Custom background reset to defaults.', 'info');
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Reset
                </button>
              </div>
            </div>

            {settings.liveBackground === 'custom' ? (
              <div className="mt-4 space-y-4">
                {/* Base Style + Pattern + Motion */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="custom-bg-style"
                      className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Base layer
                    </label>
                    <select
                      id="custom-bg-style"
                      value={cb.baseStyle}
                      onChange={(e) =>
                        updateCustomBackground({
                          baseStyle: e.target.value as CustomBackgroundBaseStyle,
                        })
                      }
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      <option value="gradient">Linear gradient</option>
                      <option value="radial">Radial mesh</option>
                      <option value="solid">Solid wash</option>
                      <option value="image">Custom image / wallpaper</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="custom-bg-pattern"
                      className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Surface pattern
                    </label>
                    <select
                      id="custom-bg-pattern"
                      value={cb.pattern}
                      onChange={(e) =>
                        updateCustomBackground({
                          pattern: e.target.value as CustomBackgroundPattern,
                        })
                      }
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      <option value="none">None</option>
                      <option value="dots">Fine dots</option>
                      <option value="grid">Studio grid</option>
                      <option value="diagonal">Diagonal lines</option>
                      <option value="rings">Acoustic rings</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="custom-bg-motion"
                      className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Motion overlay
                    </label>
                    <select
                      id="custom-bg-motion"
                      value={cb.motion}
                      onChange={(e) =>
                        updateCustomBackground({
                          motion: e.target.value as CustomBackgroundMotion,
                        })
                      }
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      <option value="none">None</option>
                      <option value="aurora">Aurora glow</option>
                      <option value="particles">Neural drift</option>
                      <option value="waves">Acoustic waves</option>
                      <option value="fireflies">Firefly meadow</option>
                      <option value="starfield">Starlight drift</option>
                    </select>
                  </div>
                </div>

                {/* Color Pickers & Quick Presets (or Image Upload when image selected) */}
                {cb.baseStyle === 'image' ? (
                  <div className="space-y-3 rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          Wallpaper image
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Upload an image from your device (auto-compressed for local storage) or paste an HTTPS URL.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          ref={bgImageInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => void handleUploadCustomImage(e)}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={uploadingBgImage}
                          onClick={() => bgImageInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{uploadingBgImage ? 'Processing...' : 'Choose image'}</span>
                        </button>
                        {cb.imageDataUrl && (
                          <button
                            type="button"
                            onClick={() => updateCustomBackground({ imageDataUrl: '' })}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-rose-400 dark:hover:bg-rose-950/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Clear</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="custom-bg-img-url"
                        className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
                      >
                        Or paste image URL
                      </label>
                      <input
                        id="custom-bg-img-url"
                        type="url"
                        value={cb.imageDataUrl.startsWith('data:') ? '' : cb.imageDataUrl}
                        onChange={(e) => updateCustomBackground({ imageDataUrl: e.target.value.trim() })}
                        placeholder="https://example.com/studio-wallpaper.jpg"
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <label htmlFor="custom-img-blur" className="font-medium text-zinc-700 dark:text-zinc-300">
                            Backdrop blur
                          </label>
                          <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            {cb.imageBlurPx}px
                          </span>
                        </div>
                        <input
                          id="custom-img-blur"
                          type="range"
                          min={0}
                          max={24}
                          step={1}
                          value={cb.imageBlurPx}
                          onChange={(e) =>
                            updateCustomBackground({ imageBlurPx: Number(e.target.value) })
                          }
                          className="w-full accent-indigo-600"
                        />
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <label htmlFor="custom-img-dim" className="font-medium text-zinc-700 dark:text-zinc-300">
                            Contrast scrim
                          </label>
                          <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            {cb.imageDimPercent}%
                          </span>
                        </div>
                        <input
                          id="custom-img-dim"
                          type="range"
                          min={0}
                          max={85}
                          step={5}
                          value={cb.imageDimPercent}
                          onChange={(e) =>
                            updateCustomBackground({ imageDimPercent: Number(e.target.value) })
                          }
                          className="w-full accent-indigo-600"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {(
                        [
                          { key: 'primaryColor', label: 'Primary color' },
                          { key: 'secondaryColor', label: 'Secondary color' },
                          { key: 'tertiaryColor', label: 'Highlight color' },
                        ] as const
                      ).map((picker) => (
                        <div key={picker.key} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                          <label
                            htmlFor={`cb-${picker.key}`}
                            className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
                          >
                            {picker.label}
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] uppercase text-zinc-500 dark:text-zinc-400">
                              {cb[picker.key]}
                            </span>
                            <input
                              id={`cb-${picker.key}`}
                              type="color"
                              value={cb[picker.key]}
                              onChange={(e) =>
                                updateCustomBackground({ [picker.key]: e.target.value })
                              }
                              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {cb.baseStyle === 'gradient' && (
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <label htmlFor="custom-bg-angle" className="font-medium text-zinc-700 dark:text-zinc-300">
                            Gradient angle
                          </label>
                          <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            {cb.angleDeg}°
                          </span>
                        </div>
                        <input
                          id="custom-bg-angle"
                          type="range"
                          min={0}
                          max={360}
                          step={5}
                          value={cb.angleDeg}
                          onChange={(e) =>
                            updateCustomBackground({ angleDeg: Number(e.target.value) })
                          }
                          className="w-full accent-indigo-600"
                        />
                      </div>
                    )}

                    <div>
                      <span className="mb-1.5 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Quick color presets
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {CUSTOM_BG_PALETTES.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              updateCustomBackground({
                                primaryColor: preset.primary,
                                secondaryColor: preset.secondary,
                                tertiaryColor: preset.tertiary,
                                angleDeg: preset.angle,
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <span
                              className="h-3 w-5 rounded-sm"
                              style={{
                                backgroundImage: `linear-gradient(${preset.angle}deg, ${preset.primary}, ${preset.secondary}, ${preset.tertiary})`,
                              }}
                              aria-hidden="true"
                            />
                            <span>{preset.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Activate <strong className="font-medium text-zinc-700 dark:text-zinc-300">Custom Studio</strong> above to pick custom colors, gradient angles, geometric patterns, motion overlays, or upload a wallpaper image.
              </p>
            )}
          </div>
        </section>

        {/* Transcription Defaults */}
        <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Transcription defaults
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Pre-selected options when starting a new transcription.
          </p>

          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="settings-default-language"
                  className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Default language
                </label>
                <select
                  id="settings-default-language"
                  value={settings.defaultLanguage}
                  onChange={(e) => {
                    onUpdateSettings({ defaultLanguage: e.target.value });
                    showToast('Default language updated.', 'success');
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="en">English</option>
                  <option value="hi">Hindi (हिन्दी)</option>
                  <option value="mr">Marathi (मराठी)</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="ja">Japanese</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="settings-default-transcript-mode"
                  className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Default transcript layout
                </label>
                <select
                  id="settings-default-transcript-mode"
                  value={settings.defaultTranscriptMode}
                  onChange={(e) => {
                    onUpdateSettings({
                      defaultTranscriptMode: e.target.value as TranscriptViewMode,
                    });
                    showToast('Default transcript layout saved.', 'success');
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="transcript">Transcript (continuous readable paragraphs)</option>
                  <option value="timestamped">Timestamped (meaningful time-synced segments)</option>
                </select>
              </div>
            </div>

            <div>
              <span className="mb-2 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Default outputs
              </span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(
                  [
                    { key: 'summary', label: 'Summary & key points' },
                    { key: 'notes', label: 'Structured notes' },
                    { key: 'analysis', label: 'Topic & sentiment analysis' },
                    { key: 'subtitles', label: 'Subtitles (.srt / .vtt)' },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
                  >
                    <input
                      type="checkbox"
                      checked={settings.defaultOutputs[opt.key]}
                      onChange={() => toggleDefaultOutput(opt.key)}
                      className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <span className="mb-2 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Document &amp; subtitle export defaults
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/50">
                  <input
                    type="checkbox"
                    checked={settings.exportIncludeTimestamps}
                    onChange={(e) => {
                      onUpdateSettings({ exportIncludeTimestamps: e.target.checked });
                      showToast('Export timestamp preference saved.', 'success');
                    }}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <span>Include timestamps in exports</span>
                </label>

                <div>
                  <label
                    htmlFor="settings-default-sub-fmt"
                    className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Default subtitle format
                  </label>
                  <select
                    id="settings-default-sub-fmt"
                    value={settings.defaultSubtitleFormat}
                    onChange={(e) => {
                      onUpdateSettings({
                        defaultSubtitleFormat: e.target.value as 'srt' | 'vtt',
                      });
                      showToast('Default subtitle format saved.', 'success');
                    }}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="srt">SubRip (.srt)</option>
                    <option value="vtt">WebVTT (.vtt)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* AI & Privacy */}
        <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                AI &amp; Privacy (Local-first)
              </h2>
            </div>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Audio stays local
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Audio extraction and speech transcription run locally on your configured backend. Raw audio and video files are never uploaded to Gemini.
          </p>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/50">
            <input
              type="checkbox"
              checked={settings.enableCloudAi}
              onChange={(e) => {
                onUpdateSettings({ enableCloudAi: e.target.checked });
                showToast(
                  e.target.checked
                    ? 'Optional Gemini transcript tools enabled.'
                    : 'Optional Gemini transcript tools disabled (strict local-only mode).',
                  'info'
                );
              }}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <div>
              <span className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Allow optional Gemini transcript assistance
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                When triggered manually, sends transcript text only to the server-side Gemini integration for summary, key decisions, and action-item drafting.
              </span>
            </div>
          </label>
        </section>

        {/* Backend API Connection */}
        <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                API endpoint override
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Stored in localStorage for testing against your transcription backend. Leave blank to use{' '}
                <code className="font-mono text-zinc-700 dark:text-zinc-300">VITE_API_BASE_URL</code>{' '}
                or built-in Mock Mode.
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                !effectiveValidation.valid
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-zinc-600 dark:text-zinc-300'
              }`}
            >
              <Server className="cs-accent-text h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>
                {mockActive
                  ? 'Mock Mode active'
                  : effectiveValidation.valid
                    ? 'Live API active'
                    : 'Invalid API configuration'}
              </span>
            </span>
          </div>

          {!effectiveValidation.valid && effectiveValidation.error && (
            <p role="alert" className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">
              {effectiveValidation.error}
            </p>
          )}

          <form onSubmit={handleSaveApiUrl} noValidate className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="settings-api-url"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                API base URL
              </label>
              <input
                id="settings-api-url"
                type="url"
                value={apiInput}
                onChange={(e) => {
                  setApiInput(e.target.value);
                  if (apiError) setApiError(null);
                }}
                placeholder={envDefault || 'https://api.yourdomain.com'}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {apiError && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                  {apiError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                className="cs-accent-btn rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                Save endpoint
              </button>
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={testingConnection}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {testingConnection && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                <span>{testingConnection ? 'Testing...' : 'Test connection'}</span>
              </button>
              <button
                type="button"
                onClick={handleResetApiUrl}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reset override</span>
              </button>
            </div>

            {connectionResult && (
              <p
                role="status"
                className={`text-xs font-medium ${
                  connectionResult.ok
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {connectionResult.message}
              </p>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
