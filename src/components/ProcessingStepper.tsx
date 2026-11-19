import React from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { JobStatus } from '../types';
import { formatDuration } from '../utils/format';

interface ProcessingStepperProps {
  status: JobStatus;
  progress: number;
  durationSec: number;
  error?: string;
}

const STEPS: { key: JobStatus; label: string }[] = [
  { key: 'queued', label: 'Uploading' },
  { key: 'extracting_audio', label: 'Extracting audio' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'analyzing', label: 'Analyzing' },
  { key: 'done', label: 'Done' },
];

function getStepIndex(status: JobStatus): number {
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

export function ProcessingStepper({
  status,
  progress,
  durationSec,
  error,
}: ProcessingStepperProps) {
  if (status === 'failed') {
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50/70 p-6 dark:border-rose-900/60 dark:bg-rose-950/30"
      >
        <div className="flex items-start gap-3.5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-rose-950 dark:text-rose-100">
              Processing failed
            </h2>
            <p className="text-sm leading-relaxed text-rose-800 dark:text-rose-300">
              {error || 'An unexpected error occurred while processing this recording.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeIdx = getStepIndex(status);
  const estimatedTotalSec = Math.max(15, Math.min(180, Math.round(durationSec / 25)));
  const remainingSec = Math.max(2, Math.round(((100 - progress) / 100) * estimatedTotalSec));

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Processing recording
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            This page updates automatically as each stage completes.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
            ~{formatDuration(remainingSec)} remaining
          </span>
          <span className="font-mono font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
            {progress}%
          </span>
        </div>
      </div>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Overall transcription progress"
      >
        <div
          className="h-full rounded-full bg-indigo-600 transition-all duration-300 dark:bg-indigo-500"
          style={{ width: `${Math.max(3, Math.min(100, progress))}%` }}
        />
      </div>

      <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < activeIdx || status === 'done';
          const isCurrent = idx === activeIdx && status !== 'done';
          return (
            <li
              key={step.key}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
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
