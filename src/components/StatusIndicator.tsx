import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { JobStatus } from '../types';
import { getStatusLabel, isProcessingStatus } from '../utils/format';

interface StatusIndicatorProps {
  status: JobStatus;
  progress: number;
  showBar?: boolean;
}

export function StatusIndicator({ status, progress, showBar = false }: StatusIndicatorProps) {
  const processing = isProcessingStatus(status);
  const label = getStatusLabel(status);

  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 whitespace-nowrap shrink-0">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <div className="flex min-w-[144px] flex-col gap-1.5">
      <div className="cs-accent-text flex items-center justify-between gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {processing && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />}
          <span>{label}</span>
        </span>
        <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
          {progress}%
        </span>
      </div>
      {showBar && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} progress`}
        >
          <div
            className="cs-shimmer-bar cs-progress-fill h-full rounded-full bg-indigo-600 transition-all duration-300 dark:bg-indigo-500"
            style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
