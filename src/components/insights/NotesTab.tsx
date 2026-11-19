import React, { useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { NoteSection } from '../../types';

interface NotesTabProps {
  notes?: NoteSection[];
  regenerating: boolean;
  onUpdateNotes: (notes: NoteSection[]) => void;
  onRegenerate: () => void;
}

export function NotesTab({
  notes = [],
  regenerating,
  onUpdateNotes,
  onRegenerate,
}: NotesTabProps) {
  const [editing, setEditing] = useState<{ sectionIdx: number; bulletIdx: number | null } | null>(
    null
  );
  const [draft, setDraft] = useState('');
  const [newBulletSectionIdx, setNewBulletSectionIdx] = useState<number | null>(null);
  const [newBulletText, setNewBulletText] = useState('');

  const commitEdit = () => {
    if (!editing) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      setEditing(null);
      return;
    }

    const updated = notes.map((sec, sIdx) => {
      if (sIdx !== editing.sectionIdx) return sec;
      if (editing.bulletIdx === null) {
        return { ...sec, heading: trimmed };
      }
      return {
        ...sec,
        bullets: sec.bullets.map((b, bIdx) => (bIdx === editing.bulletIdx ? trimmed : b)),
      };
    });
    onUpdateNotes(updated);
    setEditing(null);
  };

  const deleteBullet = (sectionIdx: number, bulletIdx: number) => {
    const updated = notes.map((sec, sIdx) =>
      sIdx === sectionIdx
        ? { ...sec, bullets: sec.bullets.filter((_, bIdx) => bIdx !== bulletIdx) }
        : sec
    );
    onUpdateNotes(updated);
  };

  const addBullet = (sectionIdx: number) => {
    const trimmed = newBulletText.trim();
    if (!trimmed) return;
    const updated = notes.map((sec, sIdx) =>
      sIdx === sectionIdx ? { ...sec, bullets: [...sec.bullets, trimmed] } : sec
    );
    onUpdateNotes(updated);
    setNewBulletText('');
    setNewBulletSectionIdx(null);
  };

  const addSection = () => {
    onUpdateNotes([...notes, { heading: 'New Topic', bullets: ['Add note details...'] }]);
  };

  if (notes.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No meeting notes generated yet.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{regenerating ? 'Generating...' : 'Generate notes'}</span>
          </button>
          <button
            type="button"
            onClick={addSection}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add section</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Click any heading or bullet to edit inline.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addSection}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Section</span>
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{regenerating ? 'Regenerating...' : 'Regenerate'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {notes.map((section, sIdx) => (
          <div
            key={sIdx}
            className="border-b border-zinc-100 pb-5 last:border-b-0 last:pb-0 dark:border-zinc-800/80"
          >
            {editing?.sectionIdx === sIdx && editing.bulletIdx === null ? (
              <input
                type="text"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditing(null);
                }}
                aria-label="Edit note section heading"
                className="w-full rounded-lg border border-indigo-400 bg-white px-2.5 py-1 text-sm font-semibold text-zinc-900 focus:outline-none dark:bg-zinc-950 dark:text-zinc-100"
              />
            ) : (
              <h3
                onClick={() => {
                  setEditing({ sectionIdx: sIdx, bulletIdx: null });
                  setDraft(section.heading);
                }}
                className="cursor-pointer rounded-md px-1.5 py-0.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {section.heading}
              </h3>
            )}

            <ul className="mt-2.5 space-y-2">
              {section.bullets.map((bullet, bIdx) => {
                const isEditingBullet =
                  editing?.sectionIdx === sIdx && editing.bulletIdx === bIdx;

                return (
                  <li key={bIdx} className="group flex items-start gap-2.5 pl-1.5">
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-500"
                      aria-hidden="true"
                    />
                    {isEditingBullet ? (
                      <textarea
                        rows={2}
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            commitEdit();
                          }
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        aria-label="Edit note bullet"
                        className="flex-1 rounded-lg border border-indigo-400 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    ) : (
                      <div className="flex flex-1 items-start justify-between gap-2">
                        <p
                          onClick={() => {
                            setEditing({ sectionIdx: sIdx, bulletIdx: bIdx });
                            setDraft(bullet);
                          }}
                          className="flex-1 cursor-pointer rounded-md px-1.5 py-0.5 text-sm leading-relaxed text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
                        >
                          {bullet}
                        </p>
                        <button
                          type="button"
                          onClick={() => deleteBullet(sIdx, bIdx)}
                          aria-label="Delete note bullet"
                          className="rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {newBulletSectionIdx === sIdx ? (
              <div className="mt-2.5 flex items-center gap-2 pl-4">
                <input
                  type="text"
                  value={newBulletText}
                  autoFocus
                  placeholder="Type a note bullet..."
                  onChange={(e) => setNewBulletText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addBullet(sIdx);
                    }
                    if (e.key === 'Escape') {
                      setNewBulletSectionIdx(null);
                      setNewBulletText('');
                    }
                  }}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => addBullet(sIdx)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewBulletSectionIdx(null);
                    setNewBulletText('');
                  }}
                  className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNewBulletSectionIdx(sIdx);
                  setNewBulletText('');
                }}
                className="mt-2 inline-flex items-center gap-1 pl-4 text-xs font-medium text-zinc-400 transition-colors hover:text-indigo-600 dark:text-zinc-500 dark:hover:text-indigo-400"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                <span>Add bullet</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
