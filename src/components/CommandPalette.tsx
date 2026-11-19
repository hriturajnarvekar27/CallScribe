import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioWaveform,
  CornerDownLeft,
  FileText,
  FolderKanban,
  Keyboard,
  LayoutDashboard,
  Palette,
  Plus,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { ApiError, listFullJobsForWorkspace } from '../api';
import { AppRoute, Job } from '../types';
import { formatTimestamp } from '../utils/format';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: AppRoute) => void;
  onNewTranscription: () => void;
  onCycleTheme: () => void;
  onCycleBackground: () => void;
  onOpenShortcuts: () => void;
}

interface PaletteResult {
  id: string;
  group: 'Commands' | 'Calls' | 'Transcript matches';
  title: string;
  subtitle?: string;
  timestamp?: string;
  highlightQuery?: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded-xs bg-indigo-200/80 px-0.5 text-zinc-950 dark:bg-indigo-500/40 dark:text-white"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onNewTranscription,
  onCycleTheme,
  onCycleBackground,
  onOpenShortcuts,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setLoadError(null);
    const controller = new AbortController();
    void listFullJobsForWorkspace(controller.signal)
      .then(setJobs)
      .catch((err) => {
        if (err instanceof ApiError && err.isAborted) return;
        setJobs([]);
        setLoadError(err instanceof Error ? err.message : 'Unable to load recordings');
      });
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      controller.abort();
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const results = useMemo<PaletteResult[]>(() => {
    const q = query.trim().toLowerCase();
    const items: PaletteResult[] = [];

    const commands: PaletteResult[] = [
      {
        id: 'cmd-new',
        group: 'Commands',
        title: 'New transcription',
        subtitle: 'Upload an audio or video recording',
        icon: Plus,
        onSelect: () => {
          onClose();
          onNewTranscription();
        },
      },
      {
        id: 'cmd-theme',
        group: 'Commands',
        title: 'Switch / Cycle theme',
        subtitle: 'Dark Slate, AMOLED Neon Cyan/Violet/Emerald, Light',
        icon: Palette,
        onSelect: () => {
          onCycleTheme();
        },
      },
      {
        id: 'cmd-bg',
        group: 'Commands',
        title: 'Switch / Cycle live background',
        subtitle: 'Aurora Mesh, Acoustic Waves, Neural Drift, Studio Grid, Static',
        icon: Sparkles,
        onSelect: () => {
          onCycleBackground();
        },
      },
      {
        id: 'cmd-dashboard',
        group: 'Commands',
        title: 'Go to Dashboard',
        icon: LayoutDashboard,
        onSelect: () => {
          onNavigate({ view: 'dashboard' });
          onClose();
        },
      },
      {
        id: 'cmd-library',
        group: 'Commands',
        title: 'Go to Library',
        icon: FolderKanban,
        onSelect: () => {
          onNavigate({ view: 'library' });
          onClose();
        },
      },
      {
        id: 'cmd-settings',
        group: 'Commands',
        title: 'Go to Settings',
        icon: Settings,
        onSelect: () => {
          onNavigate({ view: 'settings' });
          onClose();
        },
      },
      {
        id: 'cmd-shortcuts',
        group: 'Commands',
        title: 'View keyboard shortcuts',
        icon: Keyboard,
        onSelect: () => {
          onClose();
          onOpenShortcuts();
        },
      },
    ];

    for (const cmd of commands) {
      if (!q || cmd.title.toLowerCase().includes(q) || cmd.subtitle?.toLowerCase().includes(q)) {
        items.push(cmd);
      }
    }

    // Calls
    const matchingCalls = jobs.filter(
      (j) =>
        !q ||
        j.title.toLowerCase().includes(q) ||
        j.client?.toLowerCase().includes(q) ||
        j.tags?.some((t) => t.toLowerCase().includes(q))
    );
    for (const job of matchingCalls.slice(0, q ? 6 : 4)) {
      items.push({
        id: `call-${job.id}`,
        group: 'Calls',
        title: job.title,
        subtitle: job.client ? `${job.client}` : undefined,
        icon: AudioWaveform,
        onSelect: () => {
          onNavigate({ view: 'job', jobId: job.id });
          onClose();
        },
      });
    }

    // Transcript snippets (when query >= 2 chars)
    if (q.length >= 2) {
      let matchCount = 0;
      for (const job of jobs) {
        if (!job.transcript?.length) continue;
        for (const seg of job.transcript) {
          if (seg.text.toLowerCase().includes(q)) {
            items.push({
              id: `seg-${job.id}-${seg.id}`,
              group: 'Transcript matches',
              title: seg.text,
              subtitle: job.title,
              timestamp: formatTimestamp(seg.start),
              highlightQuery: query,
              icon: FileText,
              onSelect: () => {
                onNavigate({ view: 'job', jobId: job.id, seekTo: seg.start });
                onClose();
              },
            });
            matchCount++;
            if (matchCount >= 6) break;
          }
        }
        if (matchCount >= 6) break;
      }
    }

    return items;
  }, [query, jobs, onClose, onNewTranscription, onCycleTheme, onCycleBackground, onNavigate, onOpenShortcuts]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((idx) => (results.length > 0 ? (idx + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((idx) =>
          results.length > 0 ? (idx - 1 + results.length) % results.length : 0
        );
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault();
        results[activeIndex].onSelect();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, results, activeIndex, onClose]);

  if (!open) return null;

  const groups: PaletteResult['group'][] = [
    'Calls',
    'Transcript matches',
    'Commands',
  ];

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="fixed inset-0 bg-zinc-950/65 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="cs-surface cs-neon-ring relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recordings, transcript lines, or commands..."
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <kbd className="rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2 cs-scrollbar">
          {loadError && (
            <p
              role="status"
              className="mx-2 mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-300"
            >
              {loadError}
            </p>
          )}
          {results.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No matching calls, transcripts, clients, or commands found.
            </p>
          ) : (
            groups.map((group) => {
              const groupItems = results.filter((r) => r.group === group);
              if (groupItems.length === 0) return null;

              return (
                <div key={group} className="mb-2 last:mb-0">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
                    {group}
                  </div>
                  <ul>
                    {groupItems.map((item) => {
                      runningIndex += 1;
                      const isActive = runningIndex === activeIndex;
                      const currentIdx = runningIndex;
                      const Icon = item.icon;

                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onMouseEnter={() => setActiveIndex(currentIdx)}
                            onClick={item.onSelect}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                              isActive
                                ? 'bg-indigo-50 text-zinc-900 dark:bg-indigo-950/50 dark:text-zinc-50'
                                : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50'
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-2.5">
                              <Icon
                                className={`mt-0.5 h-4 w-4 shrink-0 ${
                                  isActive
                                    ? 'cs-accent-text text-indigo-600 dark:text-indigo-400'
                                    : 'text-zinc-400'
                                }`}
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">
                                  {item.highlightQuery
                                    ? highlightMatch(item.title, item.highlightQuery)
                                    : item.title}
                                </p>
                                {item.subtitle && (
                                  <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {item.subtitle}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.timestamp && (
                                <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                  {item.timestamp}
                                </span>
                              )}
                              {isActive && (
                                <CornerDownLeft
                                  className="h-3.5 w-3.5 text-zinc-400"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
