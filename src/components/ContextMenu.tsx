import React, { useEffect, useRef } from 'react';
import {
  Download,
  ExternalLink,
  FileAudio,
  Pencil,
  Pin,
  PinOff,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { Job } from '../types';

interface ContextMenuProps {
  job: Job | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onOpen: (job: Job) => void;
  onRename: (job: Job) => void;
  onTogglePin: (job: Job) => void;
  onExportMd: (job: Job) => void;
  onDownloadAudio: (job: Job) => void;
  onReprocess: (job: Job) => void;
  onDelete: (job: Job) => void;
}

export function ContextMenu({
  job,
  position,
  onClose,
  onOpen,
  onRename,
  onTogglePin,
  onExportMd,
  onDownloadAudio,
  onReprocess,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!job || !position) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [job, position, onClose]);

  if (!job || !position) return null;

  const left = Math.min(position.x, window.innerWidth - 208);
  const top = Math.min(position.y, window.innerHeight - 260);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${job.title}`}
      style={{ left, top }}
      className="cs-surface fixed z-50 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onOpen(job);
          onClose();
        }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <ExternalLink className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        <span>Open recording</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onTogglePin(job);
          onClose();
        }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {job.pinned ? (
          <PinOff className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        ) : (
          <Pin className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        )}
        <span>{job.pinned ? 'Unpin call' : 'Pin to top'}</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onRename(job);
          onClose();
        }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <Pencil className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        <span>Rename</span>
      </button>

      {job.status === 'done' && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onExportMd(job);
            onClose();
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Download className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          <span>Export Markdown</span>
        </button>
      )}

      {job.audioUrl && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onDownloadAudio(job);
            onClose();
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <FileAudio className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          <span>Download audio</span>
        </button>
      )}

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onReprocess(job);
          onClose();
        }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <RotateCw className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        <span>Reprocess</span>
      </button>

      <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDelete(job);
          onClose();
        }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Delete</span>
      </button>
    </div>
  );
}
