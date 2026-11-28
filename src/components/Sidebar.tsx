import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AudioWaveform,
  Check,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  LogOut,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { getProfileInitials } from '../hooks/useProfile';
import { LIVE_BACKGROUND_OPTIONS, THEME_OPTIONS } from '../hooks/useSettings';
import { AppRoute, Job, LiveBackgroundMode, ThemeMode, UserProfile } from '../types';
import { isProcessingStatus } from '../utils/format';

interface SidebarProps {
  route: AppRoute;
  recentJobs: Job[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: (route: AppRoute) => void;
  onNewTranscription: () => void;
  theme: ThemeMode;
  onChangeTheme: (theme: ThemeMode) => void;
  liveBackground: LiveBackgroundMode;
  onChangeLiveBackground: (mode: LiveBackgroundMode) => void;
  profile: UserProfile;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  route,
  recentJobs,
  collapsed,
  onToggleCollapse,
  onNavigate,
  onNewTranscription,
  theme,
  onChangeTheme,
  liveBackground,
  onChangeLiveBackground,
  profile,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [bgMenuOpen, setBgMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const bgMenuRef = useRef<HTMLDivElement>(null);

  const activeJobId = route.view === 'job' ? route.jobId : null;

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
      if (bgMenuRef.current && !bgMenuRef.current.contains(e.target as Node)) {
        setBgMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const navItems: {
    key: AppRoute['view'];
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'library', label: 'Library', icon: FolderKanban, badge: recentJobs.length || undefined },
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const currentThemeObj =
    THEME_OPTIONS.find((t) => t.value === theme) ?? THEME_OPTIONS[0];
  const currentBgObj =
    LIVE_BACKGROUND_OPTIONS.find((b) => b.value === liveBackground) ??
    LIVE_BACKGROUND_OPTIONS[0];
  const initials = getProfileInitials(profile.displayName, profile.email);

  const renderSidebarBody = (isMobileDrawer = false) => {
    const isMini = collapsed && !isMobileDrawer;

    return (
      <div className="cs-sidebar flex h-full flex-col justify-between bg-zinc-50/90 px-3 py-3.5 dark:bg-zinc-900/95">
        <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden cs-scrollbar">
          {/* Brand + Collapse Toggle */}
          <div className={`flex items-center ${isMini ? 'justify-center' : 'justify-between px-1'}`}>
            {!isMini && (
              <button
                type="button"
                onClick={() => {
                  onNavigate({ view: 'dashboard' });
                  onCloseMobile();
                }}
                className="flex items-center gap-2 rounded-lg py-0.5 text-left focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <span className="cs-accent-btn flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs dark:bg-indigo-500">
                  <AudioWaveform className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="font-display text-[15px] font-bold tracking-tight text-zinc-900 whitespace-nowrap dark:text-zinc-50">
                  CallScribe
                </span>
              </button>
            )}

            {isMobileDrawer ? (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation menu"
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={isMini ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isMini ? 'Expand sidebar' : 'Collapse sidebar'}
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                {isMini ? (
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            )}
          </div>

          {/* Primary CTA */}
          <button
            type="button"
            onClick={() => {
              onNewTranscription();
              onCloseMobile();
            }}
            title={isMini ? 'New transcription (N)' : undefined}
            className={`cs-accent-btn flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2 text-[13px] font-semibold text-white shadow-xs transition-all duration-150 hover:bg-indigo-700 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 whitespace-nowrap dark:bg-indigo-500 dark:hover:bg-indigo-600 ${
              isMini ? 'px-2' : 'px-3'
            }`}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!isMini && <span>New transcription</span>}
          </button>

          {/* Primary Nav */}
          <nav aria-label="Primary navigation" className="space-y-0.5">
            {navItems.map((item) => {
              const active = route.view === item.key;
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  title={isMini ? item.label : undefined}
                  onClick={() => {
                    onNavigate({ view: item.key } as AppRoute);
                    onCloseMobile();
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center rounded-lg py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 whitespace-nowrap ${
                    isMini ? 'justify-center px-2' : 'justify-between px-2.5'
                  } ${
                    active
                      ? 'cs-surface bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700/60'
                      : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? 'cs-accent-text text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                      aria-hidden="true"
                    />
                    {!isMini && <span>{item.label}</span>}
                  </span>
                  {!isMini && item.badge !== undefined && (
                    <span className="font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Recent Calls */}
          {!isMini && recentJobs.length > 0 && (
            <div className="pt-1">
              <div className="mb-1.5 px-2.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                Recent calls
              </div>
              <ul className="space-y-0.5">
                {recentJobs.slice(0, 5).map((job) => {
                  const isSelected = activeJobId === job.id;
                  const processing = isProcessingStatus(job.status);
                  const failed = job.status === 'failed';
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate({ view: 'job', jobId: job.id });
                          onCloseMobile();
                        }}
                        title={job.title}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                          isSelected
                            ? 'cs-surface cs-accent-text bg-white font-semibold text-indigo-600 shadow-xs ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-indigo-400 dark:ring-zinc-700/60'
                            : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200'
                        }`}
                      >
                        {processing ? (
                          <Loader2 className="cs-accent-text h-3 w-3 shrink-0 animate-spin text-indigo-500" aria-hidden="true" />
                        ) : failed ? (
                          <AlertCircle className="h-3 w-3 shrink-0 text-rose-500" aria-hidden="true" />
                        ) : (
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              isSelected ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-600'
                            }`}
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{job.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Bottom: Live Background + Theme Switcher + User Menu */}
        <div className="space-y-2.5 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">

          {/* Live Background Picker Popover */}
          <div className="relative" ref={bgMenuRef}>
            <button
              type="button"
              onClick={() => setBgMenuOpen((o) => !o)}
              title={isMini ? `Background: ${currentBgObj.label}` : undefined}
              className={`flex w-full items-center rounded-lg border border-zinc-200/80 bg-white/80 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:bg-zinc-800 ${
                isMini ? 'justify-center px-2' : 'justify-between px-2.5'
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="cs-accent-text h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
                {!isMini && <span className="truncate">{currentBgObj.label}</span>}
              </span>
              {!isMini && (
                <span className="text-[10px] text-zinc-400">Bg</span>
              )}
            </button>

            {bgMenuOpen && (
              <div
                role="menu"
                aria-label="Choose live background"
                className="cs-surface cs-scrollbar absolute bottom-full left-0 z-50 mb-2 max-h-80 w-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[10px] font-semibold text-zinc-400">
                    Live backgrounds
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setBgMenuOpen(false);
                      onNavigate({ view: 'settings' });
                      onCloseMobile();
                    }}
                    className="cs-accent-text text-[10px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Customize
                  </button>
                </div>
                {LIVE_BACKGROUND_OPTIONS.map((opt) => {
                  const selected = liveBackground === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onChangeLiveBackground(opt.value);
                        setBgMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        selected
                          ? 'bg-indigo-50 font-semibold text-zinc-900 dark:bg-indigo-950/50 dark:text-zinc-50'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate">{opt.label}</p>
                        <p className="truncate text-[10px] font-normal text-zinc-400">
                          {opt.description}
                        </p>
                      </div>
                      {selected && (
                        <Check className="cs-accent-text h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Theme Picker Popover */}
          <div className="relative" ref={themeMenuRef}>
            <button
              type="button"
              onClick={() => setThemeMenuOpen((o) => !o)}
              title={isMini ? `Theme: ${currentThemeObj.label}` : undefined}
              className={`flex w-full items-center rounded-lg border border-zinc-200/80 bg-white/80 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:bg-zinc-800 ${
                isMini ? 'justify-center px-2' : 'justify-between px-2.5'
              }`}
            >
              <span className="flex items-center gap-2">
                <Palette className="cs-accent-text h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
                {!isMini && <span className="truncate">{currentThemeObj.label}</span>}
              </span>
              {!isMini && (
                <span
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-white/20"
                  style={{ backgroundColor: currentThemeObj.previewAccent }}
                  aria-hidden="true"
                />
              )}
            </button>

            {themeMenuOpen && (
              <div
                role="menu"
                aria-label="Choose theme"
                className="cs-surface cs-scrollbar absolute bottom-full left-0 z-50 mb-2 max-h-80 w-60 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400">
                  Themes &amp; AMOLED Neon
                </div>
                {THEME_OPTIONS.map((opt) => {
                  const selected = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onChangeTheme(opt.value);
                        setThemeMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        selected
                          ? 'bg-indigo-50 font-semibold text-zinc-900 dark:bg-indigo-950/50 dark:text-zinc-50'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700"
                          style={{ backgroundColor: opt.previewBg }}
                          aria-hidden="true"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: opt.previewAccent }}
                          />
                        </span>
                        <span className="truncate">{opt.label}</span>
                      </span>
                      {selected && (
                        <Check className="cs-accent-text h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              title={isMini ? `${profile.displayName} (${profile.email})` : undefined}
              className={`flex w-full items-center rounded-xl py-1.5 text-left transition-colors hover:bg-zinc-200/60 dark:hover:bg-zinc-800 ${
                isMini ? 'justify-center px-1' : 'gap-2.5 px-2'
              }`}
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-zinc-300 dark:ring-zinc-700"
                />
              ) : (
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: profile.avatarColor }}
                >
                  {initials}
                </span>
              )}
              {!isMini && (
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {profile.displayName}
                  </p>
                  <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                    {profile.email}
                  </p>
                </div>
              )}
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                aria-label="Account menu"
                className="cs-surface absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {profile.displayName}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                    {profile.email}
                  </p>
                </div>
                <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onNavigate({ view: 'profile' });
                    setUserMenuOpen(false);
                    onCloseMobile();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Manage profile</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onNavigate({ view: 'settings' });
                    setUserMenuOpen(false);
                    onCloseMobile();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Themes &amp; backgrounds</span>
                </button>
                <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSignOut();
                    setUserMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        className={`hidden shrink-0 border-r border-zinc-200/80 transition-[width] duration-200 lg:block dark:border-zinc-800 ${
          collapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarBody(false)}</div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="fixed inset-0 bg-zinc-950/50 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-68 max-w-[85vw] border-r border-zinc-200 shadow-xl dark:border-zinc-800">
            {renderSidebarBody(true)}
          </aside>
        </div>
      )}
    </>
  );
}
