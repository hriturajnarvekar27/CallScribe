import React, { useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw, Server, Sparkles } from 'lucide-react';
import {
  getEffectiveApiBaseUrl,
  getEnvApiBaseUrl,
  isMockMode,
  listJobs,
  validateApiBaseUrl,
} from '../api';
import { LIVE_BACKGROUND_OPTIONS, THEME_OPTIONS } from '../hooks/useSettings';
import { AppSettings, OutputSelections } from '../types';
import { useToast } from './ToastProvider';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => void;
}

export function SettingsView({ settings, onUpdateSettings }: SettingsViewProps) {
  const { showToast } = useToast();
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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Settings
        </h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Configure transcription defaults, AMOLED neon &amp; studio themes, and backend API connection.
        </p>
      </div>

      <div className="space-y-6">
        {/* Appearance & AMOLED Neon Themes */}
        <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Themes &amp; AMOLED Neon combos
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Pick a surface contrast profile. AMOLED modes use true #000000 black with neon accents.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {THEME_OPTIONS.map((opt) => {
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
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300/60 dark:border-zinc-700"
                    style={{ backgroundColor: opt.previewBg }}
                    aria-hidden="true"
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full shadow-sm"
                      style={{
                        backgroundColor: opt.previewAccent,
                        boxShadow: opt.value.startsWith('amoled-')
                          ? `0 0 10px ${opt.previewAccent}`
                          : undefined,
                      }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {opt.label}
                      </span>
                      {active && <Check className="cs-accent-text h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />}
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

        {/* Live Backgrounds */}
        <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Sparkles className="cs-accent-text h-4 w-4 text-indigo-500" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Live backgrounds
            </h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Ambient motion layers that adapt dynamically to your selected theme &amp; AMOLED neon palette.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LIVE_BACKGROUND_OPTIONS.map((opt) => {
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
                    {active && <Check className="cs-accent-text h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {opt.description}
                  </p>
                </button>
              );
            })}
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
            <div className="max-w-xs">
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

            <div className="grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2 dark:border-zinc-800">
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

              <div className="flex items-end">
                <label className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/50">
                  <input
                    type="checkbox"
                    checked={settings.subtitleIncludeSpeakers}
                    onChange={(e) => {
                      onUpdateSettings({ subtitleIncludeSpeakers: e.target.checked });
                      showToast('Subtitle speaker preference updated.', 'success');
                    }}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <span>Include speaker names in subtitles</span>
                </label>
              </div>
            </div>
          </div>
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
