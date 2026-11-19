import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS: {
  title: string;
  items: { keys: string[]; description: string }[];
}[] = [
  {
    title: 'Global actions',
    items: [
      { keys: ['⌘ / Ctrl', 'K'], description: 'Open command palette' },
      { keys: ['N'], description: 'New transcription' },
      { keys: ['/'], description: 'Focus search / command palette' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close modal or palette' },
    ],
  },
  {
    title: 'Navigation (G then key)',
    items: [
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'L'], description: 'Go to Library' },
      { keys: ['G', 'S'], description: 'Go to Settings' },
    ],
  },
  {
    title: 'Playback (on recording page)',
    items: [
      { keys: ['Space'], description: 'Play / Pause media' },
      { keys: ['['], description: 'Skip back 10 seconds' },
      { keys: [']'], description: 'Skip forward 10 seconds' },
    ],
  },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div
        className="fixed inset-0 bg-zinc-950/60 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="cs-surface relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200/80 px-5 py-3.5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            <h2
              id="shortcuts-modal-title"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Keyboard shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 p-5 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {group.title}
              </h3>
              <ul className="space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.description} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300">{item.description}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, idx) => (
                        <React.Fragment key={k}>
                          {idx > 0 && <span className="text-[10px] text-zinc-400">then</span>}
                          <kbd className="rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
