import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileAudio,
  Loader2,
  Pencil,
  Pin,
  RefreshCw,
  Subtitles,
  Trash2,
  X,
} from 'lucide-react';
import {
  cancelJob,
  deleteJob,
  downloadJobAudio,
  exportJob,
  patchJob,
  regenerateSection,
  retryJob,
  summarizeJobWithAi,
} from '../api';
import { useJobPolling } from '../hooks/useJobPolling';
import { useSettings } from '../hooks/useSettings';
import {
  ActionItem,
  AudioFormat,
  Bookmark,
  ExportFormat,
  NoteSection,
  RegenerateSection,
  TranscriptSegment,
} from '../types';
import {
  formatDuration,
  formatRelativeDate,
  getLanguageLabel,
  isProcessingStatus,
} from '../utils/format';
import { AudioPlayer } from './AudioPlayer';
import { InsightTabKey, InsightsPanel } from './insights/InsightsPanel';
import { ProcessingStepper } from './ProcessingStepper';
import { StatusIndicator } from './StatusIndicator';
import { useToast } from './ToastProvider';
import { TranscriptPanel } from './TranscriptPanel';

interface JobDetailViewProps {
  jobId: string;
  initialSeekSec?: number;
  onBack: () => void;
  onDeleted: () => void;
  onJobChanged?: () => void;
}

interface TranscriptSnapshot {
  transcript: TranscriptSegment[];
}

const MAX_HISTORY = 20;

const EXPORT_OPTIONS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: 'srt', label: 'SRT subtitles', ext: '.srt' },
  { format: 'vtt', label: 'WebVTT subtitles', ext: '.vtt' },
  { format: 'docx', label: 'Word document', ext: '.docx' },
  { format: 'pdf', label: 'PDF report', ext: '.pdf' },
  { format: 'md', label: 'Markdown', ext: '.md' },
  { format: 'txt', label: 'Plain text', ext: '.txt' },
];

function cloneSnapshot(transcript: TranscriptSegment[]): TranscriptSnapshot {
  return {
    transcript: transcript.map((seg) => ({ ...seg })),
  };
}

export function JobDetailView({
  jobId,
  initialSeekSec,
  onBack,
  onDeleted,
  onJobChanged,
}: JobDetailViewProps) {
  const { showToast } = useToast();
  const { settings } = useSettings();
  const { job, setJob, loading, error, pollWarning, refetch } = useJobPolling(jobId);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIncludeTimestamps, setExportIncludeTimestamps] = useState<boolean>(
    settings.exportIncludeTimestamps
  );
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [downloadingAudio, setDownloadingAudio] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [regeneratingSection, setRegeneratingSection] =
    useState<RegenerateSection | null>(null);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [jobActionBusy, setJobActionBusy] = useState(false);

  const [historyPast, setHistoryPast] = useState<TranscriptSnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<TranscriptSnapshot[]>([]);
  const [togglingPin, setTogglingPin] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayRange, setReplayRange] = useState<{ start: number; end: number } | null>(null);
  const [mobilePane, setMobilePane] = useState<'transcript' | 'insights'>('transcript');
  const [activeInsightTab, setActiveInsightTab] = useState<InsightTabKey | undefined>(undefined);

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const audioMenuRef = useRef<HTMLDivElement>(null);
  const appliedSeekKeyRef = useRef<string | null>(null);
  const prevTrackedJobRef = useRef<{ id: string; status: string } | null>(null);

  useEffect(() => {
    setExportIncludeTimestamps(settings.exportIncludeTimestamps);
  }, [settings.exportIncludeTimestamps]);

  useEffect(() => {
    setCurrentTime(initialSeekSec ?? 0);
    setIsPlaying(false);
    setReplayRange(null);
    setEditingTitle(false);
    setConfirmDelete(false);
    setHistoryPast([]);
    setHistoryFuture([]);
    setActiveInsightTab(undefined);
    appliedSeekKeyRef.current = null;
    prevTrackedJobRef.current = null;
  }, [jobId, initialSeekSec]);

  useEffect(() => {
    if (!job) return;
    const prev = prevTrackedJobRef.current;
    if (
      prev &&
      prev.id === job.id &&
      isProcessingStatus(prev.status as typeof job.status) &&
      (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled')
    ) {
      onJobChanged?.();
    }
    prevTrackedJobRef.current = { id: job.id, status: job.status };
  }, [job, onJobChanged]);

  useEffect(() => {
    if (
      job?.status === 'done' &&
      initialSeekSec !== undefined &&
      appliedSeekKeyRef.current !== `${job.id}:${initialSeekSec}`
    ) {
      appliedSeekKeyRef.current = `${job.id}:${initialSeekSec}`;
      setCurrentTime(initialSeekSec);
      setIsPlaying(true);
    }
  }, [job?.id, job?.status, initialSeekSec]);

  useEffect(() => {
    if (!exportOpen && !audioMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target as Node)) {
        setAudioMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportOpen, audioMenuOpen]);

  useEffect(() => {
    if (job?.status !== 'done') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setReplayRange(null);
        setIsPlaying((p) => !p);
      } else if (e.key === '[') {
        e.preventDefault();
        setReplayRange(null);
        setCurrentTime((t) => Math.max(0, t - 10));
      } else if (e.key === ']') {
        e.preventDefault();
        setReplayRange(null);
        setCurrentTime((t) => Math.min(job.durationSec, t + 10));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [job?.status, job?.durationSec]);

  const pushHistory = (transcript: TranscriptSegment[]) => {
    const snap = cloneSnapshot(transcript);
    setHistoryPast((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
    setHistoryFuture([]);
  };

  const handleSaveTitle = async () => {
    if (!job) return;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === job.title) {
      setEditingTitle(false);
      return;
    }

    const previous = job;
    setJob({ ...job, title: trimmed });
    setEditingTitle(false);

    try {
      const updated = await patchJob(job.id, { title: trimmed });
      setJob(updated);
      onJobChanged?.();
      showToast('Call title updated.', 'success');
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to update title', 'error');
    }
  };

  const handleEditSegment = async (segmentId: string, newText: string) => {
    if (!job) return;
    const previous = job;
    pushHistory(job.transcript ?? []);
    const updatedTranscript = (job.transcript ?? []).map((seg) =>
      seg.id === segmentId ? { ...seg, text: newText } : seg
    );

    setJob({ ...job, transcript: updatedTranscript });

    try {
      const saved = await patchJob(job.id, { transcript: updatedTranscript });
      setJob(saved);
      showToast('Transcript segment saved.', 'success');
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to save segment', 'error');
    }
  };

  const handleEditSegmentsBatch = async (updates: Array<{ id: string; text: string }>) => {
    if (!job || updates.length === 0) return;
    const updateMap = new Map(updates.map((u) => [u.id, u.text]));
    const previous = job;
    pushHistory(job.transcript ?? []);
    const updatedTranscript = (job.transcript ?? []).map((seg) =>
      updateMap.has(seg.id) ? { ...seg, text: updateMap.get(seg.id)! } : seg
    );

    setJob({ ...job, transcript: updatedTranscript });

    try {
      const saved = await patchJob(job.id, { transcript: updatedTranscript });
      setJob(saved);
      showToast('Transcript updated with timestamps intact.', 'success');
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to save transcript edits', 'error');
    }
  };

  const handleSplitSegment = async (segmentId: string, splitCharIndex: number) => {
    if (!job || !job.transcript) return;
    const idx = job.transcript.findIndex((seg) => seg.id === segmentId);
    if (idx === -1) return;
    const seg = job.transcript[idx];

    const partA = seg.text.slice(0, splitCharIndex).trim();
    const partB = seg.text.slice(splitCharIndex).trim();
    if (!partA || !partB) return;

    const previous = job;
    pushHistory(job.transcript);

    const ratio = Math.max(0.15, Math.min(0.85, partA.length / (partA.length + partB.length)));
    const splitTime = Number((seg.start + Math.max(0.1, seg.end - seg.start) * ratio).toFixed(2));

    const firstPart: TranscriptSegment = {
      ...seg,
      end: splitTime,
      text: partA,
    };
    const secondPart: TranscriptSegment = {
      ...seg,
      id: `${seg.id}-s${Date.now().toString(36)}`,
      start: splitTime,
      text: partB,
    };

    const updatedTranscript = [
      ...job.transcript.slice(0, idx),
      firstPart,
      secondPart,
      ...job.transcript.slice(idx + 1),
    ];

    setJob({ ...job, transcript: updatedTranscript });

    try {
      const saved = await patchJob(job.id, { transcript: updatedTranscript });
      setJob(saved);
      showToast('Segment split into two parts.', 'success');
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to split segment', 'error');
    }
  };

  const handleUndo = async () => {
    if (!job || historyPast.length === 0) return;
    const previousJob = job;
    const target = historyPast[historyPast.length - 1];
    const currentSnap = cloneSnapshot(job.transcript ?? []);

    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((prev) => [currentSnap, ...prev.slice(0, MAX_HISTORY - 1)]);
    setJob({
      ...job,
      transcript: target.transcript,
    });

    try {
      const saved = await patchJob(job.id, {
        transcript: target.transcript,
      });
      setJob(saved);
      onJobChanged?.();
      showToast('Undid last transcript change.', 'info');
    } catch (err) {
      setJob(previousJob);
      showToast(err instanceof Error ? err.message : 'Failed to undo change', 'error');
    }
  };

  const handleRedo = async () => {
    if (!job || historyFuture.length === 0) return;
    const previousJob = job;
    const target = historyFuture[0];
    const currentSnap = cloneSnapshot(job.transcript ?? []);

    setHistoryFuture((prev) => prev.slice(1));
    setHistoryPast((prev) => [...prev.slice(-(MAX_HISTORY - 1)), currentSnap]);
    setJob({
      ...job,
      transcript: target.transcript,
    });

    try {
      const saved = await patchJob(job.id, {
        transcript: target.transcript,
      });
      setJob(saved);
      onJobChanged?.();
      showToast('Redid transcript change.', 'info');
    } catch (err) {
      setJob(previousJob);
      showToast(err instanceof Error ? err.message : 'Failed to redo change', 'error');
    }
  };

  const handleTogglePin = async () => {
    if (!job || togglingPin) return;
    const previous = job;
    const nextPinned = !job.pinned;
    setTogglingPin(true);
    setJob({ ...job, pinned: nextPinned });
    try {
      const saved = await patchJob(job.id, { pinned: nextPinned });
      setJob(saved);
      onJobChanged?.();
      showToast(nextPinned ? 'Pinned recording.' : 'Unpinned recording.', 'success');
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to update pin status', 'error');
    } finally {
      setTogglingPin(false);
    }
  };

  const handleUpdateSummary = async (summary: string) => {
    if (!job) return;
    const previous = job;
    setJob({ ...job, summary });
    try {
      const saved = await patchJob(job.id, { summary });
      setJob(saved);
      onJobChanged?.();
      showToast('Summary saved.', 'success');
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to save summary', 'error');
    }
  };

  const handleUpdateActionItems = async (actionItems: ActionItem[]) => {
    if (!job) return;
    const previous = job;
    setJob({ ...job, actionItems });
    try {
      const saved = await patchJob(job.id, { actionItems });
      setJob(saved);
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to save action items', 'error');
    }
  };

  const handleAiSummarize = async () => {
    if (!job || aiSummarizing) return;
    if (!settings.enableCloudAi) {
      showToast(
        'Optional Gemini AI summarization is turned off in Settings > AI & Privacy.',
        'info'
      );
      return;
    }
    setAiSummarizing(true);
    const previous = job;
    try {
      const res = await summarizeJobWithAi(job);
      const nextAnalysis = {
        sentiment: job.analysis?.sentiment ?? 'neutral',
        sentimentNote:
          job.analysis?.sentimentNote ?? 'Grounded in transcript summary pass.',
        topics: job.analysis?.topics ?? [],
        decisions: res.decisions.length > 0 ? res.decisions : job.analysis?.decisions ?? [],
        concerns: job.analysis?.concerns ?? [],
        risks: job.analysis?.risks ?? [],
        nextSteps: res.followUps.length > 0 ? res.followUps : job.analysis?.nextSteps ?? [],
        questionsRaised:
          res.questionsRaised.length > 0
            ? res.questionsRaised
            : job.analysis?.questionsRaised,
      };
      const nextActionItems =
        res.actionItems.length > 0 ? res.actionItems : job.actionItems;

      setJob({
        ...job,
        summary: res.summary,
        keyPoints: res.keyPoints,
        actionItems: nextActionItems,
        analysis: nextAnalysis,
      });

      const saved = await patchJob(job.id, {
        summary: res.summary,
        keyPoints: res.keyPoints,
        actionItems: nextActionItems,
        analysis: nextAnalysis,
      });
      setJob(saved);
      onJobChanged?.();
      showToast('Transcript summary drafted and saved.', 'success');
    } catch (err) {
      setJob(previous);
      showToast(
        err instanceof Error ? err.message : 'AI summarization failed',
        'error'
      );
    } finally {
      setAiSummarizing(false);
    }
  };

  const handleUpdateNotes = async (notes: NoteSection[]) => {
    if (!job) return;
    const previous = job;
    setJob({ ...job, notes });

    try {
      const saved = await patchJob(job.id, { notes });
      setJob(saved);
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to save notes', 'error');
    }
  };

  const handleUpdateBookmarks = async (bookmarks: Bookmark[]) => {
    if (!job) return;
    const previous = job;
    setJob({ ...job, bookmarks });
    try {
      const saved = await patchJob(job.id, { bookmarks });
      setJob(saved);
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to save bookmarks', 'error');
    }
  };

  const handleAddBookmarkAtTime = (timeSec: number) => {
    if (!job) return;
    const rounded = Math.max(0, Math.round(timeSec * 10) / 10);
    const nextBookmark: Bookmark = {
      id: `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timeSec: rounded,
      category: 'important',
      label: `Moment at ${formatDuration(rounded)}`,
      createdAt: new Date().toISOString(),
    };
    const nextList = [...(job.bookmarks ?? []), nextBookmark].sort(
      (a, b) => a.timeSec - b.timeSec
    );
    void handleUpdateBookmarks(nextList);
    setActiveInsightTab('bookmarks');
    setMobilePane('insights');
    showToast(`Saved bookmark at ${formatDuration(rounded)}.`, 'success');
  };

  const handleCancelProcessing = async () => {
    if (!job || jobActionBusy) return;
    setJobActionBusy(true);
    try {
      const updated = await cancelJob(job.id);
      setJob(updated);
      onJobChanged?.();
      showToast('Processing cancelled.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not cancel job', 'error');
    } finally {
      setJobActionBusy(false);
    }
  };

  const handleRetryProcessing = async () => {
    if (!job || jobActionBusy) return;
    setJobActionBusy(true);
    try {
      const updated = await retryJob(job.id);
      setJob(updated);
      onJobChanged?.();
      showToast('Re-queued recording for processing.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not retry job', 'error');
    } finally {
      setJobActionBusy(false);
    }
  };

  const handleRegenerate = async (section: RegenerateSection) => {
    if (!job) return;
    setRegeneratingSection(section);
    try {
      const updated = await regenerateSection(job.id, section);
      setJob(updated);
      showToast('Section regenerated.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Regeneration failed', 'error');
    } finally {
      setRegeneratingSection(null);
    }
  };

  const handleExport = async (format: ExportFormat) => {
    if (!job) return;
    setExportOpen(false);
    try {
      await exportJob(job.id, format, {
        includeTimestamps: exportIncludeTimestamps,
        includeSpeakers: false,
      });
      showToast(`Exported ${format.toUpperCase()} file.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  };

  const handleDownloadAudio = async (format: AudioFormat) => {
    if (!job || downloadingAudio) return;
    setAudioMenuOpen(false);
    setExportOpen(false);
    setDownloadingAudio(true);
    try {
      const { actualFormat } = await downloadJobAudio(job.id, format);
      showToast(`Downloaded audio (.${actualFormat}).`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Audio extraction failed', 'error');
    } finally {
      setDownloadingAudio(false);
    }
  };

  const handleDelete = async () => {
    if (!job) return;
    setDeleting(true);
    try {
      await deleteJob(job.id);
      onJobChanged?.();
      showToast('Recording deleted.', 'success');
      onDeleted();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8">
        <div className="mb-6 space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-7 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/70" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="h-96 animate-pulse rounded-xl bg-zinc-200/70 lg:col-span-7 dark:bg-zinc-900" />
          <div className="h-96 animate-pulse rounded-xl bg-zinc-200/70 lg:col-span-5 dark:bg-zinc-900" />
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Library</span>
        </button>

        <div className="rounded-xl border border-rose-200 bg-white p-8 text-center dark:border-rose-900/60 dark:bg-zinc-900">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          <h1 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Could not load recording
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {error || 'The requested recording could not be found.'}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  const processing = isProcessingStatus(job.status);
  const hasPartialTranscript =
    (job.status === 'failed' || job.status === 'cancelled') &&
    (job.transcript?.length ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-8">
      {/* Top Breadcrumb + Actions Header */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Library</span>
          </button>

          {/* Editable Title */}
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveTitle();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                aria-label="Edit call title"
                className="w-full max-w-xl rounded-xl border border-indigo-400 bg-white px-3 py-1 font-display text-xl font-bold text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="button"
                onClick={() => void handleSaveTitle()}
                aria-label="Save title"
                className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setEditingTitle(false)}
                aria-label="Cancel title edit"
                className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="group flex items-start gap-2">
              <h1
                onClick={() => {
                  setTitleDraft(job.title);
                  setEditingTitle(true);
                }}
                className="cursor-pointer text-xl font-bold tracking-tight text-zinc-900 transition-colors hover:text-indigo-600 sm:text-2xl dark:text-zinc-50 dark:hover:text-indigo-400"
              >
                {job.title}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(job.title);
                  setEditingTitle(true);
                }}
                aria-label="Rename recording"
                className="mt-1 rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-zinc-700 group-hover:opacity-100 focus-visible:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Unboxed Metadata */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <StatusIndicator status={job.status} progress={job.progress} />
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{formatDuration(job.durationSec)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatRelativeDate(job.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{getLanguageLabel(job.language)}</span>
          </div>
        </div>

        {/* Pin, Export, Subtitles, Audio & Delete Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleTogglePin()}
            disabled={togglingPin}
            aria-pressed={Boolean(job.pinned)}
            title={job.pinned ? 'Unpin recording' : 'Pin recording'}
            className={`cs-surface inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 whitespace-nowrap ${
              job.pinned
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
            }`}
          >
            <Pin
              className={`h-3.5 w-3.5 shrink-0 ${job.pinned ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{job.pinned ? 'Pinned' : 'Pin'}</span>
          </button>

          {job.audioUrl && (
            <div className="relative" ref={audioMenuRef}>
              <button
                type="button"
                onClick={() => setAudioMenuOpen((o) => !o)}
                disabled={downloadingAudio}
                aria-haspopup="menu"
                aria-expanded={audioMenuOpen}
                className="cs-surface inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-indigo-600 whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {downloadingAudio ? (
                  <Loader2 className="cs-accent-text h-3.5 w-3.5 shrink-0 animate-spin text-indigo-500" aria-hidden="true" />
                ) : (
                  <FileAudio className="cs-accent-text h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
                )}
                <span>{downloadingAudio ? 'Extracting audio...' : 'Download audio'}</span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              </button>

              {audioMenuOpen && (
                <div
                  role="menu"
                  aria-label="Audio download format options"
                  className="cs-surface absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleDownloadAudio('mp3')}
                    className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span>MP3 audio</span>
                    <span className="font-mono text-[11px] text-zinc-400">.mp3</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleDownloadAudio('wav')}
                    className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span>WAV audio</span>
                    <span className="font-mono text-[11px] text-zinc-400">.wav</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {job.status === 'done' && (
            <>
              <button
                type="button"
                onClick={() => void handleExport('srt')}
                className="cs-surface inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Subtitles className="cs-accent-text h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
                <span>Subtitles (.srt)</span>
              </button>

              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setExportOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  className="cs-surface inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Export</span>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                </button>

                {exportOpen && (
                  <div
                    role="menu"
                    aria-label="Export format options"
                    className="cs-surface absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div
                      className="space-y-1.5 border-b border-zinc-100 px-3.5 py-2 dark:border-zinc-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                        Export options
                      </span>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
                        <input
                          type="checkbox"
                          checked={exportIncludeTimestamps}
                          onChange={(e) => setExportIncludeTimestamps(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
                        />
                        <span>Include timestamps</span>
                      </label>
                    </div>

                    <div className="py-1">
                      {EXPORT_OPTIONS.map((opt) => (
                        <button
                          key={opt.format}
                          type="button"
                          role="menuitem"
                          onClick={() => void handleExport(opt.format)}
                          className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <span>{opt.label}</span>
                          <span className="font-mono text-[11px] text-zinc-400">{opt.ext}</span>
                        </button>
                      ))}
                    </div>
                    {job.audioUrl && (
                      <>
                        <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void handleDownloadAudio('mp3')}
                          className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <span>Extracted audio</span>
                          <span className="font-mono text-[11px] text-zinc-400">.mp3</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void handleDownloadAudio('wav')}
                          className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <span>Uncompressed audio</span>
                          <span className="font-mono text-[11px] text-zinc-400">.wav</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {confirmDelete ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 dark:border-rose-900/70 dark:bg-rose-950/40">
              <span className="text-xs font-medium text-rose-800 dark:text-rose-200">
                Delete?
              </span>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-white/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete recording"
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-200 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-600 whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-900 dark:text-rose-400 dark:hover:border-rose-900 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Transient Polling Warning Banner */}
      {pollWarning && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-200"
        >
          <span>{pollWarning}</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            <span>Retry now</span>
          </button>
        </div>
      )}

      {/* Processing / Failed / Cancelled State */}
      {(processing || job.status === 'failed' || job.status === 'cancelled') && (
        <div className="mb-6">
          <ProcessingStepper
            status={job.status}
            progress={job.progress}
            durationSec={job.durationSec}
            stageMessage={job.stageMessage}
            error={job.error}
            actionBusy={jobActionBusy}
            onCancel={processing ? () => void handleCancelProcessing() : undefined}
            onRetry={
              job.status === 'failed' || job.status === 'cancelled'
                ? () => void handleRetryProcessing()
                : undefined
            }
          />
        </div>
      )}

      {/* Preserved Partial Transcript on Failed / Cancelled */}
      {hasPartialTranscript && (
        <div className="space-y-4">
          {job.audioUrl && (
            <AudioPlayer
              audioUrl={job.audioUrl}
              durationSec={job.durationSec}
              speakers={job.speakers}
              transcript={job.transcript ?? []}
              bookmarks={job.bookmarks}
              replayRange={replayRange}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onTimeChange={setCurrentTime}
              onPlayStateChange={(playing) => {
                if (!playing) setReplayRange(null);
                setIsPlaying(playing);
              }}
              onAddBookmarkAtTime={handleAddBookmarkAtTime}
              onReplayEnded={() => setReplayRange(null)}
            />
          )}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Preserved partial transcript ({job.transcript?.length} segments)
            </h2>
            <TranscriptPanel
              transcript={job.transcript ?? []}
              currentTime={currentTime}
              isPlaying={isPlaying}
              defaultViewMode={settings.defaultTranscriptMode}
              canUndo={historyPast.length > 0}
              canRedo={historyFuture.length > 0}
              onSeek={(sec) => {
                setReplayRange(null);
                setCurrentTime(sec);
                setIsPlaying(true);
              }}
              onReplaySegment={(seg) => {
                setReplayRange({ start: seg.start, end: Math.max(seg.start + 0.5, seg.end) });
                setCurrentTime(seg.start);
                setIsPlaying(true);
              }}
              onEditSegment={(id, text) => void handleEditSegment(id, text)}
              onEditSegmentsBatch={(updates) => void handleEditSegmentsBatch(updates)}
              onSplitSegment={(id, idx) => void handleSplitSegment(id, idx)}
              onUndo={() => void handleUndo()}
              onRedo={() => void handleRedo()}
            />
          </div>
        </div>
      )}

      {/* Completed State: Sticky Audio Player + Two-Column Workspace */}
      {job.status === 'done' && (
        <div className="space-y-4">
          <AudioPlayer
            audioUrl={job.audioUrl}
            durationSec={job.durationSec}
            speakers={job.speakers}
            transcript={job.transcript ?? []}
            bookmarks={job.bookmarks}
            replayRange={replayRange}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onTimeChange={setCurrentTime}
            onPlayStateChange={(playing) => {
              if (!playing) setReplayRange(null);
              setIsPlaying(playing);
            }}
            onAddBookmarkAtTime={handleAddBookmarkAtTime}
            onReplayEnded={() => setReplayRange(null)}
          />

          {/* Mobile Pane Switcher */}
          <div
            role="tablist"
            aria-label="View mode"
            className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1 lg:hidden dark:border-zinc-800 dark:bg-zinc-900"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mobilePane === 'transcript'}
              onClick={() => setMobilePane('transcript')}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                mobilePane === 'transcript'
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Transcript
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobilePane === 'insights'}
              onClick={() => setMobilePane('insights')}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                mobilePane === 'insights'
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Summary, Bookmarks &amp; Subtitles
            </button>
          </div>

          {/* Two-Column Desktop / Tabbed Mobile Layout */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div
              className={`lg:col-span-7 ${
                mobilePane === 'transcript' ? 'block' : 'hidden lg:block'
              }`}
            >
              <TranscriptPanel
                transcript={job.transcript ?? []}
                currentTime={currentTime}
                isPlaying={isPlaying}
                defaultViewMode={settings.defaultTranscriptMode}
                canUndo={historyPast.length > 0}
                canRedo={historyFuture.length > 0}
                onSeek={(sec) => {
                  setReplayRange(null);
                  setCurrentTime(sec);
                  setIsPlaying(true);
                }}
                onReplaySegment={(seg) => {
                  setReplayRange({ start: seg.start, end: Math.max(seg.start + 0.5, seg.end) });
                  setCurrentTime(seg.start);
                  setIsPlaying(true);
                }}
                onEditSegment={(id, text) => void handleEditSegment(id, text)}
                onEditSegmentsBatch={(updates) => void handleEditSegmentsBatch(updates)}
                onSplitSegment={(id, idx) => void handleSplitSegment(id, idx)}
                onUndo={() => void handleUndo()}
                onRedo={() => void handleRedo()}
              />
            </div>

            <div
              className={`lg:col-span-5 ${
                mobilePane === 'insights' ? 'block' : 'hidden lg:block'
              }`}
            >
              <InsightsPanel
                job={job}
                currentTime={currentTime}
                initialTab={activeInsightTab}
                regeneratingSection={regeneratingSection}
                aiSummarizing={aiSummarizing}
                enableCloudAi={settings.enableCloudAi}
                onRegenerate={(sec) => void handleRegenerate(sec)}
                onAiSummarize={() => void handleAiSummarize()}
                onUpdateSummary={(summary) => void handleUpdateSummary(summary)}
                onUpdateActionItems={(items) => void handleUpdateActionItems(items)}
                onUpdateNotes={(notes) => void handleUpdateNotes(notes)}
                onUpdateBookmarks={(bms) => void handleUpdateBookmarks(bms)}
                onSeek={(sec) => {
                  setReplayRange(null);
                  setCurrentTime(sec);
                  setIsPlaying(true);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

