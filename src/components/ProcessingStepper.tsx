import React from 'react';
import { AlertCircle, Ban, Check, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { JobStatus } from '../types';
import { formatDuration } from '../utils/format';

interface ProcessingStepperProps {
  status: JobStatus;
  progress: number;
  durationSec: number;
  stageMessage?: string;
  error?: string;
  actionBusy?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
}

const STEPS: { key: JobStatus; label: string }[] = [
  { key: 'queued', label: 'Queued' },
  { key: 'extracting_audio', label: 'Audio prep' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'diarizing', label: 'Formatting' },
  { key: 'aligning', label: 'Syncing' },
  { key: 'done', label: 'Done' },
];

function getStepIndex(status: JobStatus): number {
  if (status === 'analyzing') return 4;
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

export function ProcessingStepper({
  status,
  progress,
  durationSec,
  stageMessage,
  error,
  actionBusy = false,
  onCancel,
  onRetry,
}: ProcessingStepperProps) {
  if (status === 'failed' || status === 'cancelled') {
    const isCancelled = status === 'cancelled';
    return (
      <div
        role="alert"
        className={`rounded-xl border p-6 ${
          isCancelled
            ? 'border-zinc-200 bg-zinc-50/90 dark:border-zinc-800 dark:bg-zinc-900/90'
            : 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30'
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            {isCancelled ? (
              <Ban className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            )}
            <div className="space-y-1">
              <h2
                className={`text-base font-semibold ${
                  isCancelled
                    ? 'text-zinc-900 dark:text-zinc-100'
                    : 'text-rose-950 dark:text-rose-100'
                }`}
              >
                {isCancelled ? 'Processing cancelled' : 'Processing failed'}
              </h2>
              <p
                className={`text-sm leading-relaxed ${
                  isCancelled
                    ? 'text-zinc-600 dark:text-zinc-300'
                    : 'text-rose-800 dark:text-rose-300'
                }`}
              >
                {error ||
                  stageMessage ||
                  (isCancelled
                    ? 'Processing was stopped before completion. Any partial transcript already captured has been preserved.'
                    : 'An unexpected error occurred while processing this recording.')}
              </p>
            </div>
          </div>

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={actionBusy}
              className="cs-accent-btn inline-flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {actionBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Retry processing</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const activeIdx = getStepIndex(status);
  const isIndeterminate = progress <= 0;
  const showEta = !isIndeterminate && durationSec > 0 && progress < 100;
  const estimatedTotalSec = Math.max(15, Math.min(180, Math.round(durationSec / 25)));
  const remainingSec = Math.max(2, Math.round(((100 - progress) / 100) * estimatedTotalSec));

  return (
    <div className="cs-surface rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Processing recording
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {stageMessage || 'This page updates automatically as each stage completes.'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0">
          {showEta ? (
            <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
              ~{formatDuration(remainingSec)} remaining
            </span>
          ) : (
            <span className="font-mono text-zinc-500 dark:text-zinc-400">
              {isIndeterminate ? 'Starting...' : 'In progress'}
            </span>
          )}
          <span className="cs-accent-text font-mono font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
            {isIndeterminate ? 'Working' : `${progress}%`}
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={actionBusy}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <XCircle className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={isIndeterminate ? undefined : progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Overall transcription progress"
      >
        <div
          className={`cs-progress-fill h-full rounded-full bg-indigo-600 transition-all duration-300 dark:bg-indigo-500 ${
            isIndeterminate ? 'animate-pulse' : ''
          }`}
          style={{ width: isIndeterminate ? '28%' : `${Math.max(4, Math.min(100, progress))}%` }}
        />
      </div>

      <ol className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < activeIdx || status === 'done';
          const isCurrent = idx === activeIdx && status !== 'done';
          return (
            <li
              key={step.key}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                isCurrent
                  ? 'border-indigo-200 bg-indigo-50/70 text-indigo-900 dark:border-indigo-800/70 dark:bg-indigo-950/40 dark:text-indigo-200'
                  : isCompleted
                    ? 'border-emerald-200/80 bg-emerald-50/50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
                    : 'border-zinc-200/70 bg-zinc-50/40 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-500'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  isCurrent
                    ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                    : isCompleted
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                      : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : isCurrent ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <span className="font-mono text-[10px]">{idx + 1}</span>
                )}
              </span>
              <span className="truncate">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
