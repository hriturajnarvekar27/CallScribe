import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  AudioWaveform,
  Check,
  ChevronRight,
  Clock,
  Download,
  Globe,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Subtitles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  ApiError,
  deleteJob,
  downloadJobAudio,
  exportJob,
  listJobs,
  patchJob,
  reprocessJob,
} from '../api';
import {
  DateRangeFilter,
  FilterStatus,
  Job,
  LibraryViewMode,
  SortOption,
} from '../types';
import {
  formatDuration,
  formatRelativeDate,
  getLanguageLabel,
  isProcessingStatus,
} from '../utils/format';
import { ContextMenu } from './ContextMenu';
import { EmptyStateIllustration } from './EmptyStateIllustration';
import { Sparkline } from './Sparkline';
import { StatusIndicator } from './StatusIndicator';
import { useToast } from './ToastProvider';
import { WaveformThumbnail } from './WaveformThumbnail';

const VIEW_MODE_KEY = 'callscribe_library_view_v1';
const PAGE_SIZE = 6;

interface LibraryViewProps {
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onOpenJob: (jobId: string) => void;
  onNewTranscription: () => void;
  onJobsUpdated?: (jobs: Job[]) => void;
}

export function LibraryView({
  searchInputRef,
  onOpenJob,
  onNewTranscription,
  onJobsUpdated,
}: LibraryViewProps) {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode persisted
  const [viewMode, setViewMode] = useState<LibraryViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      return saved === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });

  // Search & Filters
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortOption>('newest');

  // Multi-select & Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionInput, setBulkActionInput] = useState<'tag' | null>(null);
  const [bulkInputValue, setBulkInputValue] = useState('');

  // Inline Rename & Context Menu
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    job: Job;
    position: { x: number; y: number };
  } | null>(null);

  // Infinite Scroll
  const [visibleLimit, setVisibleLimit] = useState<number>(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const changeViewMode = (mode: LibraryViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const jobsRef = useRef<Job[]>(jobs);
  jobsRef.current = jobs;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchJobs = useCallback(
    async (isInitial = false) => {
      if (!isInitial && inFlightRef.current) return;

      if (isInitial) {
        abortControllerRef.current?.abort();
        setLoading(true);
        setError(null);
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      inFlightRef.current = true;

      try {
        const data = await listJobs(controller.signal);
        if (!mountedRef.current) return;
        setJobs(data);
        onJobsUpdated?.(data);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof ApiError && err.isAborted) return;
        const message = err instanceof Error ? err.message : 'Unable to load recordings';
        if (isInitial || jobsRef.current.length === 0) {
          setError(message);
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current && isInitial) {
          setLoading(false);
        }
      }
    },
    [onJobsUpdated]
  );

  useEffect(() => {
    void fetchJobs(true);
    return () => {
      abortControllerRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [fetchJobs]);

  const hasActiveJobs = useMemo(
    () => jobs.some((job) => isProcessingStatus(job.status)),
    [jobs]
  );

  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = window.setInterval(() => {
      void fetchJobs(false);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [hasActiveJobs, fetchJobs]);

  // 5-Card Stats Computations
  const stats = useMemo(() => {
    const nowMs = Date.now();
    const weekMs = 7 * 86400 * 1000;
    let processing = 0;
    let done = 0;
    let failed = 0;
    let totalSeconds = 0;
    let thisWeekCount = 0;
    let lastWeekCount = 0;
    const sentimentValues: number[] = [];

    for (const j of jobs) {
      totalSeconds += j.durationSec;
      if (isProcessingStatus(j.status)) processing++;
      else if (j.status === 'done') done++;
      else if (j.status === 'failed') failed++;

      const age = nowMs - new Date(j.createdAt).getTime();
      if (age <= weekMs) thisWeekCount++;
      else if (age <= weekMs * 2) lastWeekCount++;

      if (j.analysis) {
        sentimentValues.push(
          j.analysis.sentiment === 'positive'
            ? 92
            : j.analysis.sentiment === 'neutral'
              ? 68
              : 32
        );
      }
    }

    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.round((totalSeconds % 3600) / 60);
    const totalLabel = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    const weekDelta = thisWeekCount - lastWeekCount;
    const avgSentiment =
      sentimentValues.length > 0
        ? Math.round(sentimentValues.reduce((a, b) => a + b, 0) / sentimentValues.length)
        : 82;

    const sparkSeries =
      sentimentValues.length >= 3
        ? [...sentimentValues].reverse()
        : [72, 76, 84, 79, avgSentiment];

    return {
      all: jobs.length,
      processing,
      done,
      failed,
      totalLabel,
      thisWeekCount,
      weekDelta,
      avgSentiment,
      sparkSeries,
    };
  }, [jobs]);

  // Filter Option Lists
  const filterOptions = useMemo(() => {
    const languages = Array.from(new Set(jobs.map((j) => j.language))).sort();
    const tags = Array.from(
      new Set(jobs.flatMap((j) => j.tags ?? []))
    ).sort();
    return { languages, tags };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nowMs = Date.now();

    return jobs
      .filter((job) => {
        if (statusFilter === 'processing' && !isProcessingStatus(job.status)) return false;
        if (statusFilter === 'done' && job.status !== 'done') return false;
        if (statusFilter === 'failed' && job.status !== 'failed') return false;
        if (languageFilter !== 'all' && job.language !== languageFilter) {
          return false;
        }
        if (dateFilter !== 'all') {
          const age = nowMs - new Date(job.createdAt).getTime();
          if (dateFilter === 'today' && age > 86400 * 1000) return false;
          if (dateFilter === '7d' && age > 7 * 86400 * 1000) return false;
          if (dateFilter === '30d' && age > 30 * 86400 * 1000) return false;
        }
        if (tagFilter !== 'all' && !(job.tags ?? []).includes(tagFilter)) {
          return false;
        }

        if (!q) return true;
        const lang = getLanguageLabel(job.language).toLowerCase();
        return (
          job.title.toLowerCase().includes(q) ||
          (job.client?.toLowerCase().includes(q) ?? false) ||
          (job.summary?.toLowerCase().includes(q) ?? false) ||
          (job.tags?.some((t) => t.toLowerCase().includes(q)) ?? false) ||
          lang.includes(q)
        );
      })
      .sort((a, b) => {
        if (sort === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sort === 'longest') {
          return b.durationSec - a.durationSec;
        }
        return a.title.localeCompare(b.title);
      });
  }, [
    jobs,
    statusFilter,
    languageFilter,
    dateFilter,
    tagFilter,
    search,
    sort,
  ]);

  const pinnedJobs = useMemo(
    () => filteredJobs.filter((j) => j.pinned),
    [filteredJobs]
  );
  const regularJobs = useMemo(
    () => filteredJobs.filter((j) => !j.pinned),
    [filteredJobs]
  );

  const visibleRegularJobs = useMemo(
    () => regularJobs.slice(0, visibleLimit),
    [regularJobs, visibleLimit]
  );
  const hasMore = regularJobs.length > visibleLimit;

  // Infinite Scroll Observer
  useEffect(() => {
    if (!hasMore || loading) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          setLoadingMore(true);
          window.setTimeout(() => {
            setVisibleLimit((prev) => prev + PAGE_SIZE);
            setLoadingMore(false);
          }, 260);
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);

  // Active Removable Filter Chips
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (statusFilter !== 'all') {
      chips.push({
        key: 'status',
        label: `Status: ${statusFilter}`,
        onClear: () => setStatusFilter('all'),
      });
    }
    if (languageFilter !== 'all') {
      chips.push({
        key: 'language',
        label: `Language: ${getLanguageLabel(languageFilter)}`,
        onClear: () => setLanguageFilter('all'),
      });
    }
    if (dateFilter !== 'all') {
      chips.push({
        key: 'date',
        label: `Date: ${dateFilter}`,
        onClear: () => setDateFilter('all'),
      });
    }
    if (tagFilter !== 'all') {
      chips.push({
        key: 'tag',
        label: `Tag: #${tagFilter}`,
        onClear: () => setTagFilter('all'),
      });
    }
    if (search.trim()) {
      chips.push({
        key: 'search',
        label: `Search: "${search.trim()}"`,
        onClear: () => setSearch(''),
      });
    }
    return chips;
  }, [
    statusFilter,
    languageFilter,
    dateFilter,
    tagFilter,
    search,
  ]);

  const clearAllFilters = () => {
    setStatusFilter('all');
    setLanguageFilter('all');
    setDateFilter('all');
    setTagFilter('all');
    setSearch('');
  };

  // Row Actions
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTogglePin = async (job: Job) => {
    const nextPinned = !job.pinned;
    const nextJobs = jobsRef.current.map((j) =>
      j.id === job.id ? { ...j, pinned: nextPinned } : j
    );
    setJobs(nextJobs);
    try {
      await patchJob(job.id, { pinned: nextPinned });
      onJobsUpdated?.(nextJobs);
      showToast(nextPinned ? 'Call pinned to top.' : 'Call unpinned.', 'success');
    } catch {
      void fetchJobs(false);
    }
  };

  const handleCommitRename = async (job: Job) => {
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === job.title) return;
    const nextJobs = jobsRef.current.map((j) =>
      j.id === job.id ? { ...j, title: trimmed } : j
    );
    setJobs(nextJobs);
    try {
      await patchJob(job.id, { title: trimmed });
      onJobsUpdated?.(nextJobs);
      showToast('Call renamed.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rename failed', 'error');
      void fetchJobs(false);
    }
  };

  const handleExportSingle = async (job: Job, format: 'srt' | 'md') => {
    try {
      await exportJob(job.id, format);
      showToast(`Exported ${format.toUpperCase()} for "${job.title}".`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  };

  const handleDownloadAudio = async (job: Job) => {
    try {
      const { actualFormat } = await downloadJobAudio(job.id, 'mp3');
      showToast(`Downloaded audio (.${actualFormat}) for "${job.title}".`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Audio extraction failed', 'error');
    }
  };

  const handleRetryOrReprocess = async (job: Job) => {
    try {
      const updated = await reprocessJob(job.id);
      const nextJobs = jobsRef.current.map((j) => (j.id === job.id ? updated : j));
      setJobs(nextJobs);
      onJobsUpdated?.(nextJobs);
      showToast(`Reprocessing "${job.title}"...`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reprocess', 'error');
    }
  };

  const handleDeleteSingle = async (job: Job) => {
    const nextJobs = jobsRef.current.filter((j) => j.id !== job.id);
    setJobs(nextJobs);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(job.id);
      return next;
    });
    try {
      await deleteJob(job.id);
      onJobsUpdated?.(nextJobs);
      showToast('Recording deleted.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
      void fetchJobs(false);
    }
  };

  // Bulk Actions
  const handleBulkExport = async () => {
    const selectedJobs = jobs.filter((j) => selectedIds.has(j.id) && j.status === 'done');
    if (selectedJobs.length === 0) {
      showToast('No completed recordings selected for export.', 'info');
      return;
    }
    try {
      for (const j of selectedJobs) {
        await exportJob(j.id, 'md');
      }
      showToast(`Exported ${selectedJobs.length} Markdown files.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bulk export failed', 'error');
    }
  };

  const handleBulkReprocess = async () => {
    const ids = Array.from(selectedIds);
    try {
      for (const id of ids) {
        await reprocessJob(id);
      }
      setSelectedIds(new Set());
      void fetchJobs(false);
      showToast(`Reprocessing ${ids.length} recordings.`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bulk reprocess failed', 'error');
      void fetchJobs(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const nextJobs = jobsRef.current.filter((j) => !selectedIds.has(j.id));
    setJobs(nextJobs);
    setSelectedIds(new Set());
    try {
      for (const id of ids) {
        await deleteJob(id);
      }
      onJobsUpdated?.(nextJobs);
      showToast(`Deleted ${ids.length} recordings.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bulk delete failed', 'error');
      void fetchJobs(false);
    }
  };

  const handleApplyBulkInput = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = bulkInputValue.trim();
    if (!val || !bulkActionInput) return;

    const ids = Array.from(selectedIds);
    if (bulkActionInput === 'tag') {
      const nextJobs = jobsRef.current.map((j) =>
        selectedIds.has(j.id)
          ? { ...j, tags: Array.from(new Set([...(j.tags ?? []), val])) }
          : j
      );
      setJobs(nextJobs);
      try {
        for (const id of ids) {
          const target = jobsRef.current.find((j) => j.id === id);
          await patchJob(id, {
            tags: Array.from(new Set([...(target?.tags ?? []), val])),
          });
        }
        onJobsUpdated?.(nextJobs);
        showToast(`Added tag #${val} to ${ids.length} recordings.`, 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to apply tag', 'error');
        void fetchJobs(false);
      }
    }

    setBulkActionInput(null);
    setBulkInputValue('');
  };

  const filterButtons: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.all },
    { key: 'processing', label: 'Processing', count: stats.processing },
    { key: 'done', label: 'Done', count: stats.done },
    { key: 'failed', label: 'Failed', count: stats.failed },
  ];

  const renderEtaLabel = (job: Job) => {
    if (job.progress <= 0) {
      return job.stageMessage || 'Starting...';
    }
    const remainingSec = Math.max(2, Math.round(((100 - job.progress) / 100) * 24));
    return `~${remainingSec}s ETA`;
  };

  const renderJobRow = (job: Job) => {
    const processing = isProcessingStatus(job.status);
    const failed = job.status === 'failed';
    const isSelected = selectedIds.has(job.id);
    const isRenaming = renamingId === job.id;

    return (
      <li
        key={job.id}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ job, position: { x: e.clientX, y: e.clientY } });
        }}
        className={`group relative flex flex-col gap-3 px-4 py-3.5 transition-colors md:flex-row md:items-center md:justify-between md:gap-5 ${
          isSelected
            ? 'bg-indigo-50/60 dark:bg-indigo-950/25'
            : 'hover:bg-zinc-50/90 dark:hover:bg-zinc-800/40'
        }`}
      >
        {/* Left: Checkbox + Emblem + Title/Client/Tags/Summary */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-1.5 flex items-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelected(job.id)}
              aria-label={`Select ${job.title}`}
              className={`h-4 w-4 cursor-pointer rounded border-zinc-300 text-indigo-600 transition-opacity focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 ${
                isSelected || selectedIds.size > 0
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
              }`}
            />
          </div>

          <button
            type="button"
            onClick={() => onOpenJob(job.id)}
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              failed
                ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400'
                : processing
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-400'
                  : 'border-zinc-200/80 bg-zinc-50 text-zinc-600 group-hover:border-indigo-200 group-hover:text-indigo-600 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300'
            }`}
            aria-label={`Open ${job.title}`}
          >
            {failed ? (
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            ) : processing ? (
              <Loader2 className="cs-accent-text h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <AudioWaveform className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={renameDraft}
                  autoFocus
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCommitRename(job);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  aria-label="Rename call"
                  className="w-full max-w-md rounded-lg border border-indigo-400 bg-white px-2.5 py-1 text-sm font-semibold text-zinc-900 focus:outline-none dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => void handleCommitRename(job)}
                  aria-label="Save rename"
                  className="rounded-md bg-indigo-600 p-1 text-white"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  aria-label="Cancel rename"
                  className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenJob(job.id)}
                  className="truncate text-left text-sm font-semibold text-zinc-900 transition-colors group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400"
                >
                  {job.title}
                </button>
                {job.pinned && (
                  <Pin className="cs-accent-text h-3 w-3 shrink-0 text-indigo-500" aria-label="Pinned" />
                )}
              </div>
            )}

            {/* One-line Summary or Failed Error with Tooltip & Inline Retry */}
            {job.summary && !failed && (
              <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                {job.summary}
              </p>
            )}

            {failed && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p
                  title={job.error}
                  className="max-w-lg truncate text-xs text-rose-600 dark:text-rose-400"
                >
                  {job.error || 'Processing failed'}
                </p>
                <button
                  type="button"
                  onClick={() => void handleRetryOrReprocess(job)}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/50"
                >
                  <RotateCw className="h-3 w-3" aria-hidden="true" />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenJob(job.id)}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 underline decoration-zinc-400/60 underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                >
                  View details
                </button>
              </div>
            )}

            {/* Metadata: Client · Tags · Date · Duration · Language */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              {job.client && (
                <>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {job.client}
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>{formatRelativeDate(job.createdAt)}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                {formatDuration(job.durationSec)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                {getLanguageLabel(job.language)}
              </span>
              {job.tags && job.tags.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-zinc-400 dark:text-zinc-500">
                    {job.tags.map((t) => `#${t}`).join(' ')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Hover Actions + Speaker Avatars + Status/ETA */}
        <div className="flex items-center justify-between gap-3 pl-9 md:justify-end md:pl-0 shrink-0">
          {/* Row Hover Quick Actions */}
          <div className="hidden items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 xl:flex">
            <button
              type="button"
              onClick={() => onOpenJob(job.id)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              Open
            </button>
            {job.status === 'done' && (
              <>
                <button
                  type="button"
                  onClick={() => void handleExportSingle(job, 'srt')}
                  title="Download SRT subtitles"
                  aria-label="Download SRT subtitles"
                  className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  <Subtitles className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportSingle(job, 'md')}
                  title="Export Markdown"
                  aria-label="Export Markdown"
                  className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setRenamingId(job.id);
                setRenameDraft(job.title);
              }}
              title="Rename"
              aria-label="Rename call"
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void handleTogglePin(job)}
              title={job.pinned ? 'Unpin' : 'Pin'}
              aria-label={job.pinned ? 'Unpin call' : 'Pin call'}
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              {job.pinned ? (
                <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Pin className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({ job, position: { x: rect.left, y: rect.bottom + 4 } });
              }}
              title="More actions"
              aria-label="More actions"
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col items-end">
            <StatusIndicator
              status={job.status}
              progress={job.progress}
              showBar={processing}
            />
            {processing && (
              <span className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-400">
                {renderEtaLabel(job)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpenJob(job.id)}
            aria-label={`Open ${job.title}`}
            className="rounded p-1 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-300"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </li>
    );
  };

  const renderGridCard = (job: Job) => {
    const processing = isProcessingStatus(job.status);
    const failed = job.status === 'failed';
    const isSelected = selectedIds.has(job.id);

    return (
      <div
        key={job.id}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ job, position: { x: e.clientX, y: e.clientY } });
        }}
        className={`cs-surface group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
          isSelected
            ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20'
            : 'border-zinc-200/90 bg-white hover:border-indigo-300/70 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500/40'
        }`}
      >
        <div>
          {/* Top bar: Checkbox + Client + Pin/More */}
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelected(job.id)}
                aria-label={`Select ${job.title}`}
                className={`h-4 w-4 cursor-pointer rounded border-zinc-300 text-indigo-600 transition-opacity dark:border-zinc-700 dark:bg-zinc-950 ${
                  isSelected || selectedIds.size > 0
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                }`}
              />
              <span className="truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                {job.client || 'Unassigned'}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {job.pinned && <Pin className="cs-accent-text h-3 w-3 text-indigo-500" aria-hidden="true" />}
              <button
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setContextMenu({ job, position: { x: rect.left, y: rect.bottom + 4 } });
                }}
                aria-label="More actions"
                className="rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-100 group-hover:opacity-100 dark:hover:bg-zinc-800"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Waveform Thumbnail */}
          <button
            type="button"
            onClick={() => onOpenJob(job.id)}
            className="block w-full text-left"
          >
            <WaveformThumbnail
              jobId={job.id}
              speakers={job.speakers}
              isProcessing={processing}
              isFailed={failed}
            />
            <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-zinc-900 transition-colors group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400">
              {job.title}
            </h3>
          </button>

          {job.summary && !failed && (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
              {job.summary}
            </p>
          )}

          {failed && (
            <div className="mt-1.5 flex items-center gap-2">
              <p title={job.error} className="truncate text-xs text-rose-600 dark:text-rose-400">
                {job.error}
              </p>
              <button
                type="button"
                onClick={() => void handleRetryOrReprocess(job)}
                className="shrink-0 text-[11px] font-semibold text-rose-600 underline dark:text-rose-400"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] tabular-nums text-zinc-400">
              {formatDuration(job.durationSec)}
            </span>
          </div>
          <StatusIndicator status={job.status} progress={job.progress} showBar={processing} />
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Library
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Video &amp; audio transcripts, structured analysis, and exportable subtitles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchJobs(true)}
            aria-label="Refresh call library"
            className="cs-surface inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={onNewTranscription}
            className="cs-accent-btn inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 whitespace-nowrap dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>New transcription</span>
          </button>
        </div>
      </div>

      {/* 5-Card Stats Strip */}
      {!loading && !error && jobs.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="cs-surface rounded-xl border border-zinc-200/90 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Recordings
            </p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {stats.all}
            </p>
          </div>

          <div className="cs-surface rounded-xl border border-zinc-200/90 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Total audio
            </p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {stats.totalLabel}
            </p>
          </div>

          <div className="cs-surface rounded-xl border border-zinc-200/90 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              This week
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {stats.thisWeekCount}
              </span>
              <span
                className={`font-mono text-[11px] font-medium tabular-nums ${
                  stats.weekDelta >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {stats.weekDelta >= 0 ? `+${stats.weekDelta}` : stats.weekDelta} vs last wk
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'done' ? 'all' : 'done')}
            className="cs-surface group rounded-xl border border-zinc-200/90 bg-white px-4 py-3 text-left transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500/40"
          >
            <p className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <span>Subtitles ready</span>
              <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </p>
            <p className="cs-accent-text mt-1 font-mono text-lg font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
              {stats.done}
            </p>
          </button>

          <div className="cs-surface col-span-2 flex items-center justify-between gap-2 rounded-xl border border-zinc-200/90 bg-white px-4 py-3 sm:col-span-1 dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Avg sentiment
              </p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {stats.avgSentiment}%
              </p>
            </div>
            <Sparkline values={stats.sparkSeries} />
          </div>
        </div>
      )}

      {/* Search + Status Chips + List/Grid Toggle + Sort */}
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 lg:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recordings, tags... (/)"
            aria-label="Search recordings"
            className="cs-surface w-full rounded-xl border border-zinc-200 bg-white py-1.5 pr-3 pl-9 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Chips */}
          <div
            role="group"
            aria-label="Filter recordings by status"
            className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {filterButtons.map((btn) => {
              const active = statusFilter === btn.key;
              return (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setStatusFilter(btn.key)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  <span>{btn.label}</span>
                  <span className="font-mono text-[10px] tabular-nums text-zinc-400">
                    {btn.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sort */}
          <div className="relative inline-flex items-center">
            <ArrowUpDown
              className="pointer-events-none absolute left-2.5 h-3 w-3 text-zinc-400"
              aria-hidden="true"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              aria-label="Sort recordings"
              className="cs-surface appearance-none rounded-xl border border-zinc-200 bg-white py-1.5 pr-6 pl-7 text-xs font-medium text-zinc-700 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <option value="newest">Newest</option>
              <option value="longest">Longest</option>
              <option value="title">Title (A–Z)</option>
            </select>
          </div>

          {/* List / Grid Toggle */}
          <div
            role="group"
            aria-label="View layout"
            className="inline-flex items-center rounded-xl border border-zinc-200 bg-zinc-100/80 p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <button
              type="button"
              onClick={() => changeViewMode('list')}
              aria-pressed={viewMode === 'list'}
              aria-label="List view"
              className={`rounded-lg p-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400'
              }`}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => changeViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              aria-label="Grid view"
              className={`rounded-lg p-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Dropdowns Row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">

        <select
          value={languageFilter}
          onChange={(e) => setLanguageFilter(e.target.value)}
          aria-label="Filter by language"
          className="cs-surface rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="all">Language: All</option>
          {filterOptions.languages.map((lang) => (
            <option key={lang} value={lang}>
              {getLanguageLabel(lang)}
            </option>
          ))}
        </select>

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateRangeFilter)}
          aria-label="Filter by date range"
          className="cs-surface rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="all">Date: All time</option>
          <option value="today">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>

        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          aria-label="Filter by tag"
          className="cs-surface rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="all">Tag: All</option>
          {filterOptions.tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
      </div>

      {/* Active Removable Filter Chips */}
      {activeFilterChips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300"
            >
              <span>{chip.label}</span>
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="cs-surface cs-neon-ring mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-2.5 dark:border-indigo-900 dark:bg-indigo-950/35">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(filteredJobs.map((j) => j.id)))}
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Select all ({filteredJobs.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
            >
              Deselect
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleBulkExport()}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkActionInput('tag');
                setBulkInputValue('');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add tag</span>
            </button>
            <button
              type="button"
              onClick={() => void handleBulkReprocess()}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reprocess</span>
            </button>
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>

          {bulkActionInput && (
            <form onSubmit={handleApplyBulkInput} className="flex w-full items-center gap-2 pt-1">
              <input
                type="text"
                value={bulkInputValue}
                autoFocus
                onChange={(e) => setBulkInputValue(e.target.value)}
                placeholder="Enter tag name..."
                className="flex-1 max-w-xs rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setBulkActionInput(null)}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="cs-surface overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {[0, 1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-4 last:border-b-0 dark:border-zinc-800/80"
            >
              <div className="flex flex-1 items-center gap-3.5">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
                </div>
              </div>
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="cs-surface rounded-xl border border-rose-200 bg-white p-8 text-center dark:border-rose-900/60 dark:bg-zinc-900">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Could not load call library
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
          <button
            type="button"
            onClick={() => void fetchJobs(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Empty State with 3-Step Onboarding Checklist */}
      {!loading && !error && filteredJobs.length === 0 && (
        <div className="cs-surface rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyStateIllustration variant={jobs.length === 0 ? 'library' : 'search'} />
          <h2 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {jobs.length === 0 ? 'Welcome to CallScribe' : 'No matching calls found'}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
            {jobs.length === 0
              ? 'Follow these three steps to turn any video or audio file into searchable transcripts and subtitles:'
              : 'Adjust your filters or search query to view more recordings.'}
          </p>

          {jobs.length === 0 ? (
            <>
              <ol className="mx-auto mt-5 max-w-md space-y-2 text-left">
                {[
                  { step: '1', text: 'Upload or drag-and-drop an audio or video recording' },
                  { step: '2', text: 'Review clean, timestamped transcripts & edit wording inline' },
                  { step: '3', text: 'Export SRT/WebVTT subtitles, Word, PDF, or Markdown notes' },
                ].map((item) => (
                  <li
                    key={item.step}
                    className="flex items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-3.5 py-2.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 font-mono text-[10px] font-bold text-white">
                      {item.step}
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={onNewTranscription}
                className="cs-accent-btn mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Upload first recording</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={clearAllFilters}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              <span>Clear all filters</span>
            </button>
          )}
        </div>
      )}

      {/* Pinned Calls Section */}
      {!loading && !error && pinnedJobs.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <Pin className="cs-accent-text h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
            <span>Pinned</span>
          </div>
          {viewMode === 'list' ? (
            <div className="cs-surface overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {pinnedJobs.map(renderJobRow)}
              </ul>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pinnedJobs.map(renderGridCard)}
            </div>
          )}
        </div>
      )}

      {/* Main Calls Section */}
      {!loading && !error && visibleRegularJobs.length > 0 && (
        <div>
          {pinnedJobs.length > 0 && (
            <div className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              All calls
            </div>
          )}
          {viewMode === 'list' ? (
            <div className="cs-surface overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {visibleRegularJobs.map(renderJobRow)}
              </ul>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleRegularJobs.map(renderGridCard)}
            </div>
          )}
        </div>
      )}

      {/* Infinite Scroll Sentinel + Skeletons */}
      {!loading && !error && hasMore && (
        <div ref={sentinelRef} className="mt-4 space-y-2">
          {loadingMore ? (
            <div className="cs-surface overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-4 last:border-b-0 dark:border-zinc-800"
                >
                  <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Load more recordings ({regularJobs.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Right-Click Context Menu */}
      <ContextMenu
        job={contextMenu?.job ?? null}
        position={contextMenu?.position ?? null}
        onClose={() => setContextMenu(null)}
        onOpen={(job) => onOpenJob(job.id)}
        onRename={(job) => {
          setRenamingId(job.id);
          setRenameDraft(job.title);
        }}
        onTogglePin={(job) => void handleTogglePin(job)}
        onExportMd={(job) => void handleExportSingle(job, 'md')}
        onDownloadAudio={(job) => void handleDownloadAudio(job)}
        onReprocess={(job) => void handleRetryOrReprocess(job)}
        onDelete={(job) => void handleDeleteSingle(job)}
      />
    </div>
  );
}
