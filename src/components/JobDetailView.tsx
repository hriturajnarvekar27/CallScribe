import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Pencil,
  RefreshCw,
  Subtitles,
  Trash2,
  X,
} from 'lucide-react';
import { deleteJob, exportJob, patchJob, regenerateSection } from '../api';
import { useJobPolling } from '../hooks/useJobPolling';
import {
  ExportFormat,
  NoteSection,
  RegenerateSection,
} from '../types';
import {
  formatDuration,
  formatRelativeDate,
  getLanguageLabel,
  isProcessingStatus,
} from '../utils/format';
import { AudioPlayer } from './AudioPlayer';
import { InsightsPanel } from './insights/InsightsPanel';
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

const EXPORT_OPTIONS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: 'srt', label: 'SRT subtitles', ext: '.srt' },
  { format: 'vtt', label: 'WebVTT subtitles', ext: '.vtt' },
  { format: 'docx', label: 'Word document', ext: '.docx' },
  { format: 'pdf', label: 'PDF report', ext: '.pdf' },
  { format: 'md', label: 'Markdown', ext: '.md' },
  { format: 'txt', label: 'Plain text', ext: '.txt' },
];

export function JobDetailView({
  jobId,
  initialSeekSec,
  onBack,
  onDeleted,
  onJobChanged,
}: JobDetailViewProps) {
  const { showToast } = useToast();
  const { job, setJob, loading, error, pollWarning, refetch } = useJobPolling(jobId);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [renamingSpeakerId, setRenamingSpeakerId] = useState<string | null>(null);
  const [speakerDraft, setSpeakerDraft] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [regeneratingSection, setRegeneratingSection] =
    useState<RegenerateSection | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mobilePane, setMobilePane] = useState<'transcript' | 'insights'>('transcript');

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const appliedSeekKeyRef = useRef<string | null>(null);
  const prevTrackedJobRef = useRef<{ id: string; status: string } | null>(null);

  useEffect(() => {
    setCurrentTime(initialSeekSec ?? 0);
    setIsPlaying(false);
    setEditingTitle(false);
    setRenamingSpeakerId(null);
    setConfirmDelete(false);
    appliedSeekKeyRef.current = null;
    prevTrackedJobRef.current = null;
  }, [jobId, initialSeekSec]);

  useEffect(() => {
    if (!job) return;
    const prev = prevTrackedJobRef.current;
    if (
      prev &&
      prev.id === job.id &&
      (prev.status === 'queued' ||
        prev.status === 'extracting_audio' ||
        prev.status === 'transcribing' ||
        prev.status === 'analyzing') &&
      (job.status === 'done' || job.status === 'failed')
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
    if (!exportOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportOpen]);

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
        setIsPlaying((p) => !p);
      } else if (e.key === '[') {
        e.preventDefault();
        setCurrentTime((t) => Math.max(0, t - 10));
      } else if (e.key === ']') {
        e.preventDefault();
        setCurrentTime((t) => Math.min(job.durationSec, t + 10));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [job?.status, job?.durationSec]);

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

  const handleRenameSpeaker = async (speakerId: string, newName: string) => {
    if (!job) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setRenamingSpeakerId(null);
      return;
    }

    const previous = job;
    const updatedSpeakers = job.speakers.map((s) =>
      s.id === speakerId ? { ...s, name: trimmed } : s
    );

    setJob({ ...job, speakers: updatedSpeakers });
    setRenamingSpeakerId(null);

    try {
      const saved = await patchJob(job.id, { speakers: updatedSpeakers });
      setJob(saved);
      onJobChanged?.();
      showToast(`Speaker renamed to "${trimmed}".`, 'success');
    } catch (err) {
      setJob(previous);
      showToast(err instanceof Error ? err.message : 'Failed to rename speaker', 'error');
    }
  };

  const handleEditSegment = async (segmentId: string, newText: string) => {
    if (!job) return;
    const previous = job;
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
      await exportJob(job.id, format);
      showToast(`Exported ${format.toUpperCase()} file.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error');
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

          {/* Unboxed Metadata + Interactive Speaker Legend */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <StatusIndicator status={job.status} progress={job.progress} />
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{formatDuration(job.durationSec)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatRelativeDate(job.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{getLanguageLabel(job.language)}</span>

            {job.status === 'done' && job.speakers.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <div className="flex flex-wrap items-center gap-2">
                  {job.speakers.map((spk) =>
                    renamingSpeakerId === spk.id ? (
                      <span key={spk.id} className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          value={speakerDraft}
                          autoFocus
                          onChange={(e) => setSpeakerDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleRenameSpeaker(spk.id, speakerDraft);
                            if (e.key === 'Escape') setRenamingSpeakerId(null);
                          }}
                          aria-label={`Rename ${spk.name}`}
                          className="w-32 rounded border border-indigo-400 bg-white px-1.5 py-0.5 text-xs text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => void handleRenameSpeaker(spk.id, speakerDraft)}
                          aria-label="Save speaker name"
                          className="text-emerald-600 dark:text-emerald-400"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <button
                        key={spk.id}
                        type="button"
                        onClick={() => {
                          setRenamingSpeakerId(spk.id);
                          setSpeakerDraft(spk.name);
                        }}
                        title="Click to rename speaker"
                        className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-zinc-700 transition-colors hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: spk.color }}
                          aria-hidden="true"
                        />
                        <span>{spk.name}</span>
                      </button>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Export, Subtitles & Delete Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                  className="cs-surface absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
                >
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

      {/* Processing / Failed State */}
      {(processing || job.status === 'failed') && (
        <div className="mb-6">
          <ProcessingStepper
            status={job.status}
            progress={job.progress}
            durationSec={job.durationSec}
            error={job.error}
          />
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
            currentTime={currentTime}
            isPlaying={isPlaying}
            onTimeChange={setCurrentTime}
            onPlayStateChange={setIsPlaying}
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
              Summary, Analysis &amp; Subtitles
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
                speakers={job.speakers}
                transcript={job.transcript ?? []}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onSeek={(sec) => {
                  setCurrentTime(sec);
                  setIsPlaying(true);
                }}
                onRenameSpeaker={(id, name) => void handleRenameSpeaker(id, name)}
                onEditSegment={(id, text) => void handleEditSegment(id, text)}
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
                regeneratingSection={regeneratingSection}
                onRegenerate={(sec) => void handleRegenerate(sec)}
                onUpdateNotes={(notes) => void handleUpdateNotes(notes)}
                onSeek={(sec) => {
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
