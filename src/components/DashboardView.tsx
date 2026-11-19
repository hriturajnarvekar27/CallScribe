import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Clock,
  FileAudio,
  FileText,
  FolderKanban,
  Loader2,
  Plus,
  RotateCw,
  Subtitles,
  UploadCloud,
} from 'lucide-react';
import { ApiError, exportJob, listJobs, reprocessJob } from '../api';
import { Job } from '../types';
import {
  formatDuration,
  formatRelativeDate,
  getLanguageLabel,
  isProcessingStatus,
} from '../utils/format';
import { Sparkline } from './Sparkline';
import { SpeakerAvatarStack } from './SpeakerAvatarStack';
import { StatusIndicator } from './StatusIndicator';
import { useToast } from './ToastProvider';

interface DashboardViewProps {
  onOpenJob: (jobId: string) => void;
  onOpenLibrary: () => void;
  onNewTranscription: (files?: File[]) => void;
  onJobsUpdated?: (jobs: Job[]) => void;
}

export function DashboardView({
  onOpenJob,
  onOpenLibrary,
  onNewTranscription,
  onJobsUpdated,
}: DashboardViewProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

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
        const msg = err instanceof Error ? err.message : 'Unable to reach backend API';
        if (isInitial || jobsRef.current.length === 0) {
          setError(msg);
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
    () => jobs.some((j) => isProcessingStatus(j.status)),
    [jobs]
  );

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      void fetchJobs(false);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, fetchJobs]);

  const metrics = useMemo(() => {
    const nowMs = Date.now();
    const weekMs = 7 * 86400 * 1000;
    let totalSeconds = 0;
    let thisWeekCount = 0;
    let lastWeekCount = 0;
    let readyCount = 0;
    const sentimentValues: number[] = [];
    const languageCounts = new Map<string, number>();

    const dayBuckets: { label: string; minutes: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowMs - i * 86400 * 1000);
      dayBuckets.push({
        label: d.toLocaleDateString([], { weekday: 'short' }),
        minutes: 0,
      });
    }

    for (const j of jobs) {
      totalSeconds += j.durationSec;
      if (j.status === 'done') readyCount++;

      const age = nowMs - new Date(j.createdAt).getTime();
      if (age <= weekMs) thisWeekCount++;
      else if (age <= weekMs * 2) lastWeekCount++;

      const dayIdx = 6 - Math.floor(age / 86400000);
      if (dayIdx >= 0 && dayIdx < 7) {
        dayBuckets[dayIdx].minutes += Math.round(j.durationSec / 60);
      }

      if (j.analysis) {
        sentimentValues.push(
          j.analysis.sentiment === 'positive'
            ? 92
            : j.analysis.sentiment === 'neutral'
              ? 68
              : 32
        );
      }

      languageCounts.set(j.language, (languageCounts.get(j.language) ?? 0) + 1);
    }

    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.round((totalSeconds % 3600) / 60);
    const totalLabel = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    const avgSentiment =
      sentimentValues.length > 0
        ? Math.round(sentimentValues.reduce((a, b) => a + b, 0) / sentimentValues.length)
        : 82;

    const topLanguages = Array.from(languageCounts.entries())
      .map(([code, count]) => ({
        code,
        label: getLanguageLabel(code),
        count,
        pct: jobs.length > 0 ? Math.round((count / jobs.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const maxDayMinutes = Math.max(30, ...dayBuckets.map((d) => d.minutes));

    return {
      totalCount: jobs.length,
      readyCount,
      totalLabel,
      thisWeekCount,
      weekDelta: thisWeekCount - lastWeekCount,
      avgSentiment,
      sparkSeries:
        sentimentValues.length >= 3
          ? [...sentimentValues].reverse()
          : [74, 78, 86, 80, avgSentiment],
      dayBuckets,
      maxDayMinutes,
      topLanguages,
    };
  }, [jobs]);

  const activeJobs = useMemo(
    () => jobs.filter((j) => isProcessingStatus(j.status)),
    [jobs]
  );

  const recentJobs = useMemo(
    () =>
      [...jobs]
        .filter((j) => !isProcessingStatus(j.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [jobs]
  );

  const readySubtitleJobs = useMemo(
    () =>
      [...jobs]
        .filter((j) => j.status === 'done')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4),
    [jobs]
  );

  const handleQuickExport = async (job: Job, format: 'srt' | 'vtt' | 'md') => {
    try {
      await exportJob(job.id, format);
      showToast(`Exported ${format.toUpperCase()} for "${job.title}".`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  };

  const handleRetry = async (job: Job) => {
    try {
      const updated = await reprocessJob(job.id);
      const nextJobs = jobsRef.current.map((j) => (j.id === job.id ? updated : j));
      setJobs(nextJobs);
      onJobsUpdated?.(nextJobs);
      showToast(`Retrying "${job.title}"...`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Retry failed', 'error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Transcribe video &amp; audio recordings, inspect speaker transcripts, and export subtitles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenLibrary}
            className="cs-surface inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white/90 px-3.5 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-900/85 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <FolderKanban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Library</span>
          </button>

          <button
            type="button"
            onClick={() => onNewTranscription()}
            className="cs-accent-btn inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 whitespace-nowrap dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>New transcription</span>
          </button>
        </div>
      </div>

      {/* Quick Upload Drop Banner */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropActive(false);
          const dropped = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
          if (dropped.length > 0) onNewTranscription(dropped);
        }}
        className={`cs-surface mb-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-dashed px-5 py-4 transition-colors sm:flex-row sm:items-center ${
          dropActive
            ? 'cs-neon-ring border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/35'
            : 'border-zinc-300/90 bg-white/80 hover:border-indigo-400/70 dark:border-zinc-800 dark:bg-zinc-900/75'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp4,.mov,.mkv,.webm,.mp3,.m4a,.wav"
          onChange={(e) => {
            const chosen = e.target.files ? Array.from(e.target.files) : [];
            if (chosen.length > 0) onNewTranscription(chosen);
            e.target.value = '';
          }}
          className="sr-only"
          aria-label="Quick upload media files"
        />

        <div className="flex items-center gap-3.5">
          <div className="cs-accent-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs dark:bg-indigo-500">
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Drop video or audio here to transcribe &amp; generate subtitles
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Supports MP4, MOV, MKV, WebM, MP3, M4A, WAV · Hindi, Marathi, English &amp; more
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap shrink-0 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Choose files
        </button>
      </div>

      {/* Backend API Error Banner */}
      {!loading && error && (
        <div
          role="alert"
          className="cs-surface mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-200"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchJobs(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-100"
          >
            <RotateCw className="h-3 w-3" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 5-Card Stats Strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="cs-surface rounded-xl border border-zinc-200/90 bg-white/85 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Recordings
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
            {loading ? '—' : metrics.totalCount}
          </p>
        </div>

        <div className="cs-surface rounded-xl border border-zinc-200/90 bg-white/85 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Total media
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
            {loading ? '—' : metrics.totalLabel}
          </p>
        </div>

        <div className="cs-surface rounded-xl border border-zinc-200/90 bg-white/85 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            This week
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {loading ? '—' : metrics.thisWeekCount}
            </span>
            {!loading && (
              <span
                className={`font-mono text-[11px] font-medium tabular-nums ${
                  metrics.weekDelta >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {metrics.weekDelta >= 0 ? `+${metrics.weekDelta}` : metrics.weekDelta} vs last wk
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenLibrary}
          className="cs-surface group rounded-xl border border-zinc-200/90 bg-white/85 px-4 py-3 text-left transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:border-indigo-500/40"
        >
          <p className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>Subtitles ready</span>
            <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </p>
          <p className="cs-accent-text mt-1 font-mono text-lg font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {loading ? '—' : metrics.readyCount}
          </p>
        </button>

        <div className="cs-surface col-span-2 flex items-center justify-between gap-2 rounded-xl border border-zinc-200/90 bg-white/85 px-4 py-3 sm:col-span-1 dark:border-zinc-800 dark:bg-zinc-900/80">
          <div>
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Avg sentiment
            </p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {loading ? '—' : `${metrics.avgSentiment}%`}
            </p>
          </div>
          <Sparkline values={metrics.sparkSeries} />
        </div>
      </div>

      {/* Main Two-Column Studio Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Live Queue + Recent Recordings */}
        <div className="space-y-5 lg:col-span-7">
          {activeJobs.length > 0 && (
            <section
              aria-label="Active processing queue"
              className="cs-surface cs-neon-ring overflow-hidden rounded-xl border border-indigo-200/80 bg-white/85 dark:border-indigo-900/60 dark:bg-zinc-900/80"
            >
              <div className="flex items-center justify-between border-b border-zinc-200/70 px-4 py-3 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  <Loader2 className="cs-accent-text h-3.5 w-3.5 animate-spin text-indigo-500" aria-hidden="true" />
                  <span>Processing right now ({activeJobs.length})</span>
                </div>
                <span className="font-mono text-[11px] text-zinc-400">Auto-updating</span>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {activeJobs.map((job) => {
                  const etaSec = Math.max(2, Math.round(((100 - job.progress) / 100) * 24));
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        onClick={() => onOpenJob(job.id)}
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {job.title}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                            {formatDuration(job.durationSec)} · {getLanguageLabel(job.language)} · ~{etaSec}s ETA
                          </p>
                        </div>
                        <StatusIndicator status={job.status} progress={job.progress} showBar />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Recent Transcripts & Subtitles */}
          <section
            aria-label="Recent recordings"
            className="cs-surface overflow-hidden rounded-xl border border-zinc-200/90 bg-white/85 dark:border-zinc-800 dark:bg-zinc-900/80"
          >
            <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
              <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Recent transcripts &amp; subtitles
              </h2>
              <button
                type="button"
                onClick={onOpenLibrary}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                <span>View all</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>

            {loading ? (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
                    </div>
                    <div className="h-6 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {recentJobs.map((job) => {
                  const failed = job.status === 'failed';
                  return (
                    <li
                      key={job.id}
                      className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-zinc-50/70 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-zinc-800/35"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                            failed
                              ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400'
                              : 'border-zinc-200/80 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300'
                          }`}
                        >
                          {failed ? (
                            <AlertCircle className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <FileAudio className="h-4 w-4" aria-hidden="true" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onOpenJob(job.id)}
                            className="truncate text-left text-sm font-semibold text-zinc-900 transition-colors hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400"
                          >
                            {job.title}
                          </button>

                          {job.summary && !failed && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                              {job.summary}
                            </p>
                          )}

                          {failed && (
                            <p title={job.error} className="mt-0.5 truncate text-xs text-rose-600 dark:text-rose-400">
                              {job.error || 'Processing failed'}
                            </p>
                          )}

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span>{formatRelativeDate(job.createdAt)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {formatDuration(job.durationSec)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{getLanguageLabel(job.language)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2.5 pl-11 sm:justify-end sm:pl-0 shrink-0">
                        <SpeakerAvatarStack speakers={job.speakers} maxVisible={3} />

                        {failed ? (
                          <button
                            type="button"
                            onClick={() => void handleRetry(job)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                          >
                            <RotateCw className="h-3 w-3" aria-hidden="true" />
                            <span>Retry</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleQuickExport(job, 'srt')}
                            title="Download SRT subtitles"
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <Subtitles className="cs-accent-text h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                            <span>.srt</span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right: 7-Day Activity, Languages & Quick Subtitle Exports */}
        <div className="space-y-5 lg:col-span-5">
          {/* 7-Day Activity & Language Mix */}
          <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white/85 p-5 dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                7-day transcription volume
              </h2>
              <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                minutes / day
              </span>
            </div>

            <div className="mt-4 flex h-28 items-end gap-2">
              {metrics.dayBuckets.map((bucket, idx) => {
                const heightPct = Math.max(8, Math.round((bucket.minutes / metrics.maxDayMinutes) * 100));
                return (
                  <div key={idx} className="group flex flex-1 flex-col items-center gap-1.5">
                    <span className="font-mono text-[10px] tabular-nums text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
                      {bucket.minutes}m
                    </span>
                    <div className="flex h-20 w-full items-end rounded-md bg-zinc-100/70 p-0.5 dark:bg-zinc-800/40">
                      <div
                        className="cs-progress-fill w-full rounded-sm bg-indigo-500/85 transition-all duration-300"
                        style={{ height: `${heightPct}%` }}
                        title={`${bucket.label}: ${bucket.minutes} min`}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                      {bucket.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Spoken Languages Breakdown */}
            <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Languages transcribed
              </h3>
              <ul className="mt-3 space-y-2.5">
                {metrics.topLanguages.map((lang) => (
                  <li key={lang.code} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {lang.label}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                        {lang.count} ({lang.pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="cs-progress-fill h-full rounded-full bg-indigo-500"
                        style={{ width: `${Math.max(8, lang.pct)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Quick Subtitle & Transcript Export Center */}
          <section className="cs-surface rounded-xl border border-zinc-200/90 bg-white/85 p-5 dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <Subtitles className="cs-accent-text h-4 w-4 text-indigo-500" aria-hidden="true" />
                <span>Quick subtitle &amp; transcript exports</span>
              </div>
              <button
                type="button"
                onClick={onOpenLibrary}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                Library
              </button>
            </div>

            {readySubtitleJobs.length === 0 ? (
              <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                Upload a video or audio recording to generate downloadable subtitles.
              </p>
            ) : (
              <ul className="mt-3.5 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {readySubtitleJobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center justify-between gap-2.5 py-2.5 first:pt-0 last:pb-0"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenJob(job.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs font-medium text-zinc-800 hover:text-indigo-600 dark:text-zinc-200 dark:hover:text-indigo-400">
                        {job.title}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-400">
                        {formatDuration(job.durationSec)} · {getLanguageLabel(job.language)}
                      </p>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleQuickExport(job, 'srt')}
                        title="Download SRT subtitles"
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200"
                      >
                        .srt
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleQuickExport(job, 'vtt')}
                        title="Download WebVTT subtitles"
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200"
                      >
                        .vtt
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleQuickExport(job, 'md')}
                        title="Download Markdown notes"
                        aria-label={`Export Markdown for ${job.title}`}
                        className="rounded-md border border-zinc-200 bg-white p-1 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:text-zinc-100"
                      >
                        <FileText className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
