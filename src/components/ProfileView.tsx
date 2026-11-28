import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  Palette,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { getProfileInitials } from '../hooks/useProfile';
import { LIVE_BACKGROUND_OPTIONS, THEME_OPTIONS } from '../hooks/useSettings';
import { AppRoute, AppSettings, Job, UserProfile } from '../types';
import { formatDuration } from '../utils/format';
import { compressImageFileToDataUrl } from '../utils/imageResize';
import { useToast } from './ToastProvider';

interface ProfileViewProps {
  profile: UserProfile;
  settings: AppSettings;
  jobs: Job[];
  onUpdateProfile: (updater: Partial<UserProfile> | ((prev: UserProfile) => UserProfile)) => void;
  onResetProfile: () => void;
  onUpdateSettings: (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => void;
  onNavigate: (route: AppRoute) => void;
}

const AVATAR_COLOR_SWATCHES = [
  '#4f46e5',
  '#0284c7',
  '#059669',
  '#d97706',
  '#e11d48',
  '#9333ea',
  '#0d9488',
  '#3f3f46',
];

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function ProfileView({
  profile,
  settings,
  jobs,
  onUpdateProfile,
  onResetProfile,
  onUpdateSettings,
  onNavigate,
}: ProfileViewProps) {
  const { showToast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<UserProfile>(profile);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  const isDirty = useMemo(
    () =>
      draft.displayName !== profile.displayName ||
      draft.email !== profile.email ||
      draft.role !== profile.role ||
      draft.organization !== profile.organization ||
      draft.bio !== profile.bio ||
      draft.timezone !== profile.timezone ||
      draft.avatarUrl !== profile.avatarUrl ||
      draft.avatarColor !== profile.avatarColor,
    [draft, profile]
  );

  const stats = useMemo(() => {
    const completed = jobs.filter((j) => j.status === 'done').length;
    const pinned = jobs.filter((j) => Boolean(j.pinned)).length;
    const totalSec = jobs.reduce((sum, j) => sum + (Number.isFinite(j.durationSec) ? j.durationSec : 0), 0);
    return {
      total: jobs.length,
      completed,
      pinned,
      totalDuration: formatDuration(totalSec),
    };
  }, [jobs]);

  const timezoneOptions = useMemo(() => {
    const list = new Set(COMMON_TIMEZONES);
    if (draft.timezone) list.add(draft.timezone);
    return Array.from(list);
  }, [draft.timezone]);

  const activeThemeMeta =
    THEME_OPTIONS.find((t) => t.value === settings.theme) ?? THEME_OPTIONS[0];
  const activeBgMeta =
    LIVE_BACKGROUND_OPTIONS.find((b) => b.value === settings.liveBackground) ??
    LIVE_BACKGROUND_OPTIONS[0];

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, {
        maxWidth: 256,
        maxHeight: 256,
        squareCrop: true,
        quality: 0.85,
      });
      setDraft((prev) => ({ ...prev, avatarUrl: dataUrl }));
      onUpdateProfile({ avatarUrl: dataUrl });
      showToast('Profile photo updated.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to process image.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = draft.displayName.trim();
    const cleanedEmail = draft.email.trim();
    if (!cleanedName) {
      showToast('Display name cannot be empty.', 'error');
      return;
    }
    if (cleanedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }

    onUpdateProfile({
      ...draft,
      displayName: cleanedName,
      email: cleanedEmail,
      role: draft.role.trim(),
      organization: draft.organization.trim(),
      bio: draft.bio.trim(),
    });
    showToast('Profile saved.', 'success');
  };

  const handleExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'callscribe-profile-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Exported profile and appearance settings.', 'success');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        profile?: Partial<UserProfile>;
        settings?: Partial<AppSettings>;
      };
      if (parsed.profile) {
        onUpdateProfile((prev) => ({
          ...prev,
          ...parsed.profile,
        }));
      }
      if (parsed.settings) {
        onUpdateSettings((prev) => ({
          ...prev,
          ...parsed.settings,
          customBackground: parsed.settings?.customBackground
            ? { ...prev.customBackground, ...parsed.settings.customBackground }
            : prev.customBackground,
        }));
      }
      showToast('Profile and settings imported.', 'success');
    } catch {
      showToast('Invalid backup JSON file.', 'error');
    }
  };

  const initials = getProfileInitials(draft.displayName, draft.email);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Profile
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Manage your workspace identity, avatar, recording summary, and appearance preferences.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate({ view: 'settings' })}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Palette className="cs-accent-text h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <span>Themes &amp; backgrounds</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* Identity & Form */}
        <form
          onSubmit={handleSaveProfile}
          className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-col gap-5 border-b border-zinc-100 pb-6 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <div className="flex items-center gap-4">
              {draft.avatarUrl ? (
                <img
                  src={draft.avatarUrl}
                  alt={draft.displayName}
                  referrerPolicy="no-referrer"
                  className="h-18 w-18 shrink-0 rounded-2xl border border-zinc-200 object-cover dark:border-zinc-700"
                />
              ) : (
                <div
                  className="flex h-18 w-18 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-sm"
                  style={{ backgroundColor: draft.avatarColor }}
                  aria-hidden="true"
                >
                  {initials}
                </div>
              )}

              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {draft.displayName || 'Workspace User'}
                </h2>
                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {[draft.role, draft.organization].filter(Boolean).join(' · ') || draft.email}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleAvatarSelected(e)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingAvatar}
                    onClick={() => avatarInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{uploadingAvatar ? 'Uploading...' : 'Upload photo'}</span>
                  </button>
                  {draft.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((prev) => ({ ...prev, avatarUrl: '' }));
                        onUpdateProfile({ avatarUrl: '' });
                        showToast('Avatar photo removed.', 'info');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Avatar color
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {AVATAR_COLOR_SWATCHES.map((color) => {
                  const selected = draft.avatarColor.toLowerCase() === color.toLowerCase();
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, avatarColor: color }))}
                      aria-label={`Select avatar color ${color}`}
                      aria-pressed={selected}
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                        selected ? 'ring-2 ring-zinc-900 ring-offset-2 dark:ring-white dark:ring-offset-zinc-900' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {selected && <Check className="h-3 w-3 text-white" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="profile-display-name"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Display name
              </label>
              <input
                id="profile-display-name"
                type="text"
                value={draft.displayName}
                onChange={(e) => setDraft((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="Your full name"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label
                htmlFor="profile-email"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Email address
              </label>
              <input
                id="profile-email"
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label
                htmlFor="profile-role"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Role or title
              </label>
              <input
                id="profile-role"
                type="text"
                value={draft.role}
                onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))}
                placeholder="Product Lead, Account Executive..."
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label
                htmlFor="profile-org"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Organization
              </label>
              <input
                id="profile-org"
                type="text"
                value={draft.organization}
                onChange={(e) => setDraft((prev) => ({ ...prev, organization: e.target.value }))}
                placeholder="Team or studio name"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="profile-timezone"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Timezone
              </label>
              <select
                id="profile-timezone"
                value={draft.timezone}
                onChange={(e) => setDraft((prev) => ({ ...prev, timezone: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="profile-bio"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Workspace notes / bio
              </label>
              <textarea
                id="profile-bio"
                rows={3}
                value={draft.bio}
                onChange={(e) => setDraft((prev) => ({ ...prev, bio: e.target.value }))}
                placeholder="Short description of your calls or default meeting context..."
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {isDirty ? 'You have unsaved profile edits.' : 'All profile details saved locally.'}
            </span>
            <div className="flex items-center gap-2.5">
              {isDirty && (
                <button
                  type="button"
                  onClick={() => setDraft(profile)}
                  className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Discard
                </button>
              )}
              <button
                type="submit"
                className="cs-accent-btn rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                Save profile
              </button>
            </div>
          </div>
        </form>

        {/* Workspace Activity Summary */}
        <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <User className="cs-accent-text h-4 w-4 text-indigo-500" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Workspace activity
            </h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Summary computed from recordings in your current workspace.
          </p>

          <div className="mt-4 grid grid-cols-2 divide-x divide-y divide-zinc-100 rounded-xl border border-zinc-200/80 sm:grid-cols-4 sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
            <div className="p-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Recordings</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {stats.total}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Completed</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {stats.completed}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total duration</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {stats.totalDuration}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Pinned</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {stats.pinned}
              </p>
            </div>
          </div>
        </section>

        {/* Active Appearance & Backup */}
        <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Appearance &amp; portability
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Active theme and background configuration, plus JSON backup for moving between browsers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'settings' })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Sparkles className="cs-accent-text h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
              <span>Customize appearance</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 border-b border-zinc-100 pb-5 sm:grid-cols-2 dark:border-zinc-800">
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200/80 px-3.5 py-3 dark:border-zinc-800">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300/60 dark:border-zinc-700"
                style={{ backgroundColor: activeThemeMeta.previewBg }}
                aria-hidden="true"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: activeThemeMeta.previewAccent }}
                />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Active theme</p>
                <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {activeThemeMeta.label} · {activeThemeMeta.group}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-zinc-200/80 px-3.5 py-3 dark:border-zinc-800">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
                <Sparkles className="cs-accent-text h-4 w-4 text-indigo-500" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Background layer</p>
                <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {activeBgMeta.label} · {settings.backgroundOpacity}% opacity
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export profile &amp; settings</span>
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={(e) => void handleImportBackup(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Import backup JSON</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onResetProfile();
                showToast('Profile reset to defaults.', 'info');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset profile</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
