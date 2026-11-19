import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { UploadTask } from '../types';
import { formatFileSize } from '../utils/format';

interface UploadTrayProps {
  tasks: UploadTask[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onClearDone: () => void;
  onOpenJob: (jobId: string) => void;
}

export function UploadTray({
  tasks,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onClearDone,
  onOpenJob,
}: UploadTrayProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  const activeCount = tasks.filter(
    (t) => t.status === 'uploading' || t.status === 'paused'
  ).length;

  return (
    <aside
      aria-label="Upload queue"
      className="cs-surface fixed right-4 bottom-4 z-40 w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-2.5 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-center gap-2 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100"
        >
          <UploadCloud className="cs-accent-text h-4 w-4 text-indigo-500" aria-hidden="true" />
          <span>
            {activeCount > 0
              ? `Uploading ${activeCount} ${activeCount === 1 ? 'file' : 'files'}`
              : `${tasks.length} ${tasks.length === 1 ? 'upload' : 'uploads'}`}
          </span>
        </button>

        <div className="flex items-center gap-1">
          {tasks.some((t) => t.status === 'completed' || t.status === 'cancelled' || t.status === 'error') && (
            <button
              type="button"
              onClick={onClearDone}
              aria-label="Clear completed uploads"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand upload tray' : 'Collapse upload tray'}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            {collapsed ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Task List */}
      {!collapsed && (
        <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto cs-scrollbar dark:divide-zinc-800/80">
          {tasks.map((task) => (
            <li key={task.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    {task.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="font-mono tabular-nums">{formatFileSize(task.file.size)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {task.status === 'uploading' && `${task.progress}%`}
                      {task.status === 'paused' && `Paused (${task.progress}%)`}
                      {task.status === 'completed' && 'Uploaded'}
                      {task.status === 'cancelled' && 'Cancelled'}
                      {task.status === 'error' && (task.error || 'Failed')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {task.status === 'uploading' && (
                    <button
                      type="button"
                      onClick={() => onPause(task.id)}
                      aria-label="Pause upload"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  {task.status === 'paused' && (
                    <button
                      type="button"
                      onClick={() => onResume(task.id)}
                      aria-label="Resume upload"
                      className="rounded p-1 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  {(task.status === 'uploading' || task.status === 'paused') && (
                    <button
                      type="button"
                      onClick={() => onCancel(task.id)}
                      aria-label="Cancel upload"
                      className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  {(task.status === 'error' || task.status === 'cancelled') && (
                    <button
                      type="button"
                      onClick={() => onRetry(task.id)}
                      aria-label="Retry upload"
                      className="rounded p-1 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
                    >
                      <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  {task.status === 'completed' && task.jobId && (
                    <button
                      type="button"
                      onClick={() => onOpenJob(task.jobId!)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                    >
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      <span>Open</span>
                    </button>
                  )}
                </div>
              </div>

              {(task.status === 'uploading' || task.status === 'paused') && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className={`cs-progress-fill h-full rounded-full transition-all duration-150 ${
                      task.status === 'paused'
                        ? 'bg-amber-500'
                        : 'cs-shimmer-bar bg-indigo-600 dark:bg-indigo-500'
                    }`}
                    style={{ width: `${Math.max(4, task.progress)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
