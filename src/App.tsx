import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioWaveform, Keyboard, Menu, Plus, Search } from 'lucide-react';
import {
  ApiError,
  createJob,
  getEffectiveApiBaseUrl,
  isMockMode,
  listJobs,
  UploadController,
} from './api';
import { CommandPalette } from './components/CommandPalette';
import { DashboardView } from './components/DashboardView';
import { GlobalDropOverlay } from './components/GlobalDropOverlay';
import { JobDetailView } from './components/JobDetailView';
import { LibraryView } from './components/LibraryView';
import { LiveBackground } from './components/LiveBackground';
import { NewTranscriptionModal } from './components/NewTranscriptionModal';
import { NotificationsMenu } from './components/NotificationsMenu';
import { SettingsView } from './components/SettingsView';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Sidebar } from './components/Sidebar';
import { ToastProvider, useToast } from './components/ToastProvider';
import { UploadTray } from './components/UploadTray';
import { useSettings } from './hooks/useSettings';
import { createInitialNotifications, INITIAL_WORKSPACES } from './mockData';
import {
  AppRoute,
  Job,
  NotificationItem,
  UploadJobPayload,
  UploadTask,
} from './types';

const SIDEBAR_COLLAPSE_KEY = 'callscribe_sidebar_collapsed_v1';

function parseHashRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/jobs/')) {
    const jobId = decodeURIComponent(hash.slice('/jobs/'.length));
    if (jobId) return { view: 'job', jobId };
  }
  if (hash === '/library') return { view: 'library' };
  if (hash === '/settings') return { view: 'settings' };
  return { view: 'dashboard' };
}

function serializeHashRoute(route: AppRoute): string {
  switch (route.view) {
    case 'job':
      return `#/jobs/${encodeURIComponent(route.jobId)}`;
    case 'library':
      return '#/library';
    case 'settings':
      return '#/settings';
    default:
      return '#/';
  }
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

function AppShell() {
  const { settings, updateSettings, cycleTheme, cycleBackground } = useSettings();
  const { showToast } = useToast();

  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute());
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>(() =>
    isMockMode() ? createInitialNotifications() : []
  );

  // Persisted Sidebar Collapse
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Active Workspace
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(
    INITIAL_WORKSPACES[0].id
  );

  // Modals & Overlays
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [prefilledFiles, setPrefilledFiles] = useState<File[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [globalDragging, setGlobalDragging] = useState(false);

  // Upload Queue Manager
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const controllersRef = useRef<Map<string, UploadController>>(new Map());
  const tasksRef = useRef<UploadTask[]>(uploadTasks);
  tasksRef.current = uploadTasks;

  const librarySearchRef = useRef<HTMLInputElement>(null);
  const previousJobStatusRef = useRef<Map<string, Job['status']>>(new Map());
  const dragDepthRef = useRef(0);
  const pendingGoRef = useRef<number | null>(null);

  const handleJobsUpdated = useCallback((jobsList: Job[]) => {
    setRecentJobs(jobsList);

    const prevMap = previousJobStatusRef.current;
    const newNotifs: NotificationItem[] = [];

    for (const j of jobsList) {
      const prevStatus = prevMap.get(j.id);
      if (
        prevStatus &&
        prevStatus !== 'done' &&
        prevStatus !== 'failed' &&
        (j.status === 'done' || j.status === 'failed')
      ) {
        newNotifs.push({
          id: `notif-${j.id}-${Date.now()}`,
          type: j.status === 'done' ? 'job_done' : 'job_failed',
          title: j.status === 'done' ? 'Transcription ready' : 'Transcription failed',
          message:
            j.status === 'done'
              ? `${j.title} finished processing.`
              : `${j.title}: ${j.error || 'Processing error'}`,
          createdAt: new Date().toISOString(),
          read: false,
          jobId: j.id,
        });
      }
      prevMap.set(j.id, j.status);
    }

    if (newNotifs.length > 0) {
      setNotifications((prev) => [...newNotifs, ...prev]);
    }
  }, []);

  const refreshRecentJobs = useCallback(async () => {
    try {
      const data = await listJobs();
      handleJobsUpdated(data);
    } catch {
      if (!isMockMode()) {
        setRecentJobs([]);
      }
    }
  }, [handleJobsUpdated]);

  const effectiveApiUrl = getEffectiveApiBaseUrl();
  const prevApiUrlRef = useRef<string>(effectiveApiUrl);

  useEffect(() => {
    if (prevApiUrlRef.current !== effectiveApiUrl) {
      prevApiUrlRef.current = effectiveApiUrl;
      previousJobStatusRef.current.clear();
      setRecentJobs([]);
      setNotifications(isMockMode() ? createInitialNotifications() : []);
      controllersRef.current.forEach((ctrl) => ctrl.cancel());
      controllersRef.current.clear();
      setUploadTasks([]);
    }
    void refreshRecentJobs();
  }, [effectiveApiUrl, refreshRecentJobs]);

  const navigate = useCallback((next: AppRoute) => {
    setRoute(next);
    const targetHash = serializeHashRoute(next);
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHashRoute());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const openNewModal = useCallback((files: File[] = []) => {
    setPrefilledFiles(files);
    setUploadModalOpen(true);
  }, []);

  // Upload Execution Engine
  const startUploadTask = useCallback(
    (task: UploadTask) => {
      if (controllersRef.current.has(task.id)) return;

      const payload: UploadJobPayload = {
        file: task.file,
        title: task.title,
        language: task.language,
        speakers: task.speakers,
        outputs: task.outputs,
        context: task.context,
      };

      createJob(
        payload,
        (pct) => {
          setUploadTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, progress: pct } : t))
          );
        },
        (ctrl) => {
          controllersRef.current.set(task.id, ctrl);
        }
      )
        .then(({ jobId }) => {
          controllersRef.current.delete(task.id);
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? { ...t, progress: 100, status: 'completed', jobId }
                : t
            )
          );
          void refreshRecentJobs();
          showToast(`"${task.title}" uploaded and queued.`, 'success');
        })
        .catch((err) => {
          controllersRef.current.delete(task.id);
          const msg = err instanceof Error ? err.message : 'Upload failed';
          const cancelled =
            (err instanceof ApiError && err.isAborted) || msg === 'Upload cancelled';
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    status: cancelled ? 'cancelled' : 'error',
                    error: cancelled ? undefined : msg,
                  }
                : t
            )
          );
          if (!cancelled) {
            showToast(`Upload failed for "${task.title}": ${msg}`, 'error');
          }
        });
    },
    [refreshRecentJobs, showToast]
  );

  const handleEnqueueUploads = useCallback(
    (payloads: UploadJobPayload[]) => {
      setUploadModalOpen(false);
      setPrefilledFiles([]);

      const activeFingerprints = new Set(
        tasksRef.current
          .filter((t) => t.status === 'uploading' || t.status === 'paused')
          .map((t) => `${t.file.name}::${t.file.size}::${t.file.lastModified}`)
      );

      const uniquePayloads: UploadJobPayload[] = [];
      let skippedDuplicates = 0;

      for (const p of payloads) {
        const fp = `${p.file.name}::${p.file.size}::${p.file.lastModified}`;
        if (activeFingerprints.has(fp)) {
          skippedDuplicates += 1;
          continue;
        }
        activeFingerprints.add(fp);
        uniquePayloads.push(p);
      }

      if (skippedDuplicates > 0) {
        showToast(
          `Skipped ${skippedDuplicates} duplicate ${skippedDuplicates === 1 ? 'upload already in progress' : 'uploads already in progress'}.`,
          'info'
        );
      }

      if (uniquePayloads.length === 0) return;

      const supportsPause = isMockMode();
      const newTasks: UploadTask[] = uniquePayloads.map((p, i) => ({
        id: `upl-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        file: p.file,
        title: p.title,
        language: p.language,
        speakers: p.speakers,
        outputs: p.outputs,
        context: p.context,
        progress: 0,
        status: 'uploading',
        supportsPause,
      }));

      setUploadTasks((prev) => [...newTasks, ...prev]);
      for (const task of newTasks) {
        startUploadTask(task);
      }
    },
    [startUploadTask, showToast]
  );

  const handlePauseUpload = useCallback(
    (id: string) => {
      const target = tasksRef.current.find((t) => t.id === id);
      if (target?.supportsPause === false) {
        showToast(
          'Live HTTP uploads cannot be paused mid-transfer. Use Cancel and Retry instead.',
          'info'
        );
        return;
      }
      controllersRef.current.get(id)?.pause();
      setUploadTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'paused' } : t))
      );
    },
    [showToast]
  );

  const handleResumeUpload = useCallback((id: string) => {
    const target = tasksRef.current.find((t) => t.id === id);
    if (target?.supportsPause === false) return;
    controllersRef.current.get(id)?.resume();
    setUploadTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'uploading' } : t))
    );
  }, []);

  const handleCancelUpload = useCallback((id: string) => {
    controllersRef.current.get(id)?.cancel();
    controllersRef.current.delete(id);
    setUploadTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'cancelled' } : t))
    );
  }, []);

  const handleRetryUpload = useCallback(
    (id: string) => {
      const target = tasksRef.current.find((t) => t.id === id);
      if (!target) return;
      const resetTask: UploadTask = {
        ...target,
        progress: 0,
        status: 'uploading',
        error: undefined,
      };
      setUploadTasks((prev) => prev.map((t) => (t.id === id ? resetTask : t)));
      startUploadTask(resetTask);
    },
    [startUploadTask]
  );

  const handleClearDoneUploads = useCallback(() => {
    setUploadTasks((prev) =>
      prev.filter((t) => t.status === 'uploading' || t.status === 'paused')
    );
  }, []);

  // Global Drag-and-Drop
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Boolean(e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files'));

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e) || uploadModalOpen) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setGlobalDragging(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e) || uploadModalOpen) return;
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e) || uploadModalOpen) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setGlobalDragging(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || uploadModalOpen) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setGlobalDragging(false);
      const dropped = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
      if (dropped.length > 0) {
        openNewModal(dropped);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [uploadModalOpen, openNewModal]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShortcutsOpen(false);
        setCommandPaletteOpen((o) => !o);
        return;
      }

      if (commandPaletteOpen || uploadModalOpen || shortcutsOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableElement(e.target)) return;

      const key = e.key.toLowerCase();

      if (pendingGoRef.current !== null && Date.now() - pendingGoRef.current < 1000) {
        pendingGoRef.current = null;
        if (key === 'd') {
          e.preventDefault();
          navigate({ view: 'dashboard' });
          return;
        }
        if (key === 'l') {
          e.preventDefault();
          navigate({ view: 'library' });
          return;
        }
        if (key === 's') {
          e.preventDefault();
          navigate({ view: 'settings' });
          return;
        }
      }

      if (key === 'g') {
        pendingGoRef.current = Date.now();
        return;
      }

      if (key === 'n') {
        e.preventDefault();
        openNewModal([]);
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        if (route.view === 'library' && librarySearchRef.current) {
          librarySearchRef.current.focus();
        } else {
          setCommandPaletteOpen(true);
        }
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, uploadModalOpen, shortcutsOpen, route.view, navigate, openNewModal]);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleSelectNotification = (notif: NotificationItem) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );
    if (notif.jobId) {
      navigate({ view: 'job', jobId: notif.jobId });
    }
  };

  return (
    <div className="cs-canvas relative flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <LiveBackground mode={settings.liveBackground} theme={settings.theme} />

      <div className="relative z-10 flex min-h-screen w-full">
        <Sidebar
          route={route}
          recentJobs={recentJobs}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onNavigate={navigate}
          onNewTranscription={() => openNewModal([])}
          theme={settings.theme}
          onChangeTheme={(theme) => updateSettings({ theme })}
          liveBackground={settings.liveBackground}
          onChangeLiveBackground={(liveBackground) => updateSettings({ liveBackground })}
          workspaces={INITIAL_WORKSPACES}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={(id) => {
            setActiveWorkspaceId(id);
            const ws = INITIAL_WORKSPACES.find((w) => w.id === id);
            if (ws) showToast(`Switched workspace to ${ws.name}.`, 'info');
          }}
          onSignOut={() =>
            showToast('Signed out of local session preview. Workspace remains active.', 'info')
          }
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Global Top Utility Header */}
          <header className="cs-surface sticky top-0 z-30 flex h-13 items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/85 px-4 backdrop-blur-md sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => navigate({ view: 'dashboard' })}
                className="flex items-center gap-2 font-display text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-50"
              >
                <span className="cs-accent-btn flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white dark:bg-indigo-500">
                  <AudioWaveform className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span>CallScribe</span>
              </button>
            </div>

            {/* Global Cmd+K Search Trigger */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Open global command palette"
              className="cs-surface hidden w-full max-w-md items-center justify-between gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/85 px-3 py-1.5 text-left text-xs text-zinc-500 transition-colors hover:border-indigo-300 hover:text-zinc-800 sm:flex dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:border-indigo-500/40 dark:hover:text-zinc-200"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                <span className="truncate">Search recordings, transcript lines, or commands...</span>
              </span>
              <kbd className="shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                ⌘K
              </kbd>
            </button>

            {/* Right Utility Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label="Search"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/80 bg-white text-zinc-600 sm:hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
                className="hidden h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/80 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:flex dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                <Keyboard className="h-4 w-4" aria-hidden="true" />
              </button>

              <NotificationsMenu
                notifications={notifications}
                onMarkAllRead={handleMarkAllRead}
                onSelectNotification={handleSelectNotification}
              />

              <button
                type="button"
                onClick={() => openNewModal([])}
                aria-label="New transcription"
                className="cs-accent-btn flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 lg:hidden dark:bg-indigo-500"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Main Screen Viewport */}
          <main className="flex-1">
            {route.view === 'dashboard' && (
              <DashboardView
                onOpenJob={(jobId) => navigate({ view: 'job', jobId })}
                onOpenLibrary={() => navigate({ view: 'library' })}
                onNewTranscription={(files) => openNewModal(files ?? [])}
                onJobsUpdated={handleJobsUpdated}
              />
            )}

            {route.view === 'library' && (
              <LibraryView
                searchInputRef={librarySearchRef}
                onOpenJob={(jobId) => navigate({ view: 'job', jobId })}
                onNewTranscription={() => openNewModal([])}
                onJobsUpdated={handleJobsUpdated}
              />
            )}

            {route.view === 'job' && (
              <JobDetailView
                jobId={route.jobId}
                initialSeekSec={route.seekTo}
                onBack={() => navigate({ view: 'library' })}
                onDeleted={() => navigate({ view: 'library' })}
                onJobChanged={() => void refreshRecentJobs()}
              />
            )}

            {route.view === 'settings' && (
              <SettingsView settings={settings} onUpdateSettings={updateSettings} />
            )}
          </main>
        </div>
      </div>

      <NewTranscriptionModal
        open={uploadModalOpen}
        settings={settings}
        prefilledFiles={prefilledFiles}
        onClose={() => {
          setUploadModalOpen(false);
          setPrefilledFiles([]);
        }}
        onEnqueueUploads={handleEnqueueUploads}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={navigate}
        onNewTranscription={() => openNewModal([])}
        onCycleTheme={cycleTheme}
        onCycleBackground={cycleBackground}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <UploadTray
        tasks={uploadTasks}
        onPause={handlePauseUpload}
        onResume={handleResumeUpload}
        onCancel={handleCancelUpload}
        onRetry={handleRetryUpload}
        onClearDone={handleClearDoneUploads}
        onOpenJob={(jobId) => navigate({ view: 'job', jobId })}
      />

      <GlobalDropOverlay visible={globalDragging} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
