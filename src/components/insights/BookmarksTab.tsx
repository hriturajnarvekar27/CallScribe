import React, { useMemo, useState } from 'react';
import { Bookmark as BookmarkIcon, Check, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { Bookmark, BookmarkCategory } from '../../types';
import { formatDuration } from '../../utils/format';

interface BookmarksTabProps {
  bookmarks?: Bookmark[];
  currentTime: number;
  onUpdateBookmarks: (bookmarks: Bookmark[]) => void;
  onSeek: (sec: number) => void;
}

const CATEGORIES: { value: BookmarkCategory; label: string; colorClass: string }[] = [
  {
    value: 'important',
    label: 'Important',
    colorClass:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  },
  {
    value: 'question',
    label: 'Question',
    colorClass:
      'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-300',
  },
  {
    value: 'decision',
    label: 'Decision',
    colorClass:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    value: 'follow-up',
    label: 'Follow-up',
    colorClass:
      'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300',
  },
  {
    value: 'note',
    label: 'Note',
    colorClass:
      'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300',
  },
];

function getCategoryStyle(category: BookmarkCategory) {
  return CATEGORIES.find((c) => c.value === category) ?? CATEGORIES[0];
}

export function BookmarksTab({
  bookmarks = [],
  currentTime,
  onUpdateBookmarks,
  onSeek,
}: BookmarksTabProps) {
  const [labelDraft, setLabelDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState<BookmarkCategory>('important');
  const [noteDraft, setNoteDraft] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCategory, setEditCategory] = useState<BookmarkCategory>('important');
  const [editNote, setEditNote] = useState('');

  const sortedBookmarks = useMemo(
    () => [...bookmarks].sort((a, b) => a.timeSec - b.timeSec),
    [bookmarks]
  );

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const label = labelDraft.trim() || `Moment at ${formatDuration(currentTime)}`;
    const nextItem: Bookmark = {
      id: `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timeSec: Math.max(0, Math.round(currentTime * 10) / 10),
      category: categoryDraft,
      label,
      ...(noteDraft.trim() ? { note: noteDraft.trim() } : {}),
      createdAt: new Date().toISOString(),
    };
    onUpdateBookmarks([...bookmarks, nextItem].sort((a, b) => a.timeSec - b.timeSec));
    setLabelDraft('');
    setNoteDraft('');
  };

  const handleDelete = (id: string) => {
    onUpdateBookmarks(bookmarks.filter((b) => b.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const startEdit = (bm: Bookmark) => {
    setEditingId(bm.id);
    setEditLabel(bm.label);
    setEditCategory(bm.category);
    setEditNote(bm.note ?? '');
  };

  const saveEdit = () => {
    if (!editingId) return;
    const trimmed = editLabel.trim();
    if (!trimmed) return;
    onUpdateBookmarks(
      bookmarks.map((b) =>
        b.id === editingId
          ? {
              ...b,
              label: trimmed,
              category: editCategory,
              note: editNote.trim() || undefined,
            }
          : b
      )
    );
    setEditingId(null);
  };

  return (
    <div className="space-y-5">
      {/* Add Bookmark at Current Time */}
      <form
        onSubmit={handleAdd}
        className="space-y-2.5 rounded-xl border border-zinc-200/90 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/50"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            <BookmarkIcon className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            <span>Add bookmark at {formatDuration(currentTime)}</span>
          </span>
          <select
            value={categoryDraft}
            onChange={(e) => setCategoryDraft(e.target.value as BookmarkCategory)}
            aria-label="Bookmark category"
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          placeholder="Label this moment (e.g. Budget concern, Key quote)..."
          aria-label="Bookmark label"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Optional context note..."
            aria-label="Bookmark note"
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="cs-accent-btn inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>
      </form>

      {/* Bookmarks List */}
      {sortedBookmarks.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No bookmarks saved yet.
          </p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Use the form above or click Bookmark on the audio bar while listening.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {sortedBookmarks.map((bm) => {
            const style = getCategoryStyle(bm.category);
            const isEditing = editingId === bm.id;

            return (
              <li
                key={bm.id}
                className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:border-zinc-700"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editLabel}
                        autoFocus
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-indigo-400 bg-white px-2.5 py-1 text-xs font-medium text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as BookmarkCategory)}
                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Optional note..."
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-800 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="cs-accent-btn inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSeek(bm.timeSec)}
                          title="Jump to bookmark"
                          className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-indigo-700 transition-colors hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-500 dark:hover:text-white"
                        >
                          <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                          <span>{formatDuration(bm.timeSec)}</span>
                        </button>
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${style.colorClass}`}
                        >
                          {style.label}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {bm.label}
                      </p>
                      {bm.note && (
                        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {bm.note}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(bm)}
                        aria-label={`Edit bookmark ${bm.label}`}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(bm.id)}
                        aria-label={`Delete bookmark ${bm.label}`}
                        className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
