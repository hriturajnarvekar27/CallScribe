import React, { useState } from 'react';
import {
  Check,
  Copy,
  ListTodo,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ActionItem } from '../../types';
import { formatDuration } from '../../utils/format';
import { useToast } from '../ToastProvider';

interface SummaryTabProps {
  summary?: string;
  keyPoints?: string[];
  actionItems?: ActionItem[];
  regenerating: boolean;
  aiSummarizing?: boolean;
  enableCloudAi?: boolean;
  hasTranscript?: boolean;
  onRegenerate: () => void;
  onAiSummarize?: () => void;
  onUpdateSummary?: (summary: string) => void;
  onUpdateActionItems?: (items: ActionItem[]) => void;
  onSeek?: (sec: number) => void;
}

export function SummaryTab({
  summary,
  keyPoints,
  actionItems = [],
  regenerating,
  aiSummarizing = false,
  enableCloudAi = true,
  hasTranscript = false,
  onRegenerate,
  onAiSummarize,
  onUpdateSummary,
  onUpdateActionItems,
  onSeek,
}: SummaryTabProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');

  const [addingAction, setAddingAction] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  const handleCopy = async () => {
    const parts: string[] = [];
    if (summary) parts.push(summary);
    if (keyPoints?.length) {
      parts.push('', 'Key Points:', ...keyPoints.map((kp) => `• ${kp}`));
    }
    if (actionItems.length > 0) {
      parts.push(
        '',
        'Action Items:',
        ...actionItems.map((a) => {
          const meta = [a.owner, a.deadline].filter(Boolean).join(' · ');
          return `- [${a.completed ? 'x' : ' '}] ${a.task}${meta ? ` (${meta})` : ''}`;
        })
      );
    }
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      setCopied(true);
      showToast('Summary copied to clipboard.', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('Could not copy to clipboard.', 'error');
    }
  };

  const handleSaveSummary = () => {
    const trimmed = summaryDraft.trim();
    if (!trimmed || !onUpdateSummary) {
      setEditingSummary(false);
      return;
    }
    onUpdateSummary(trimmed);
    setEditingSummary(false);
  };

  const handleToggleActionItem = (id: string) => {
    if (!onUpdateActionItems) return;
    onUpdateActionItems(
      actionItems.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const handleDeleteActionItem = (id: string) => {
    if (!onUpdateActionItems) return;
    onUpdateActionItems(actionItems.filter((item) => item.id !== id));
  };

  const handleAddActionItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateActionItems) return;
    const task = newTask.trim();
    if (!task) return;
    const nextItem: ActionItem = {
      id: `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      task,
      ...(newOwner.trim() ? { owner: newOwner.trim() } : {}),
      ...(newDeadline.trim() ? { deadline: newDeadline.trim() } : {}),
      completed: false,
    };
    onUpdateActionItems([...actionItems, nextItem]);
    setNewTask('');
    setNewOwner('');
    setNewDeadline('');
    setAddingAction(false);
  };

  const hasSummaryContent = Boolean(summary) || Boolean(keyPoints && keyPoints.length > 0);

  return (
    <div className="space-y-6">
      {!hasSummaryContent && !editingSummary ? (
        <div className="rounded-xl border border-dashed border-zinc-200 py-8 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No summary generated yet for this recording.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {onAiSummarize && hasTranscript && (
              <button
                type="button"
                onClick={onAiSummarize}
                disabled={aiSummarizing}
                title={
                  enableCloudAi
                    ? 'Draft a transcript-grounded summary using Gemini AI'
                    : 'Optional Gemini AI assistance is turned off in Settings > AI & Privacy'
                }
                className={`cs-accent-btn inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  enableCloudAi
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                    : 'border border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {aiSummarizing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{aiSummarizing ? 'Summarizing...' : 'AI draft summary'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{regenerating ? 'Generating...' : 'Generate summary'}</span>
            </button>

            {onUpdateSummary && (
              <button
                type="button"
                onClick={() => {
                  setSummaryDraft('');
                  setEditingSummary(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Write manually</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Executive overview
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {onAiSummarize && hasTranscript && (
                <button
                  type="button"
                  onClick={onAiSummarize}
                  disabled={aiSummarizing}
                  title={
                    enableCloudAi
                      ? 'Draft a transcript-grounded summary & action items using Gemini AI'
                      : 'Optional Gemini AI assistance is turned off in Settings > AI & Privacy'
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
                    enableCloudAi
                      ? 'cs-accent-btn bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                      : 'border border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {aiSummarizing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{aiSummarizing ? 'Summarizing...' : 'AI draft'}</span>
                </button>
              )}

              {onUpdateSummary && !editingSummary && (
                <button
                  type="button"
                  onClick={() => {
                    setSummaryDraft(summary ?? '');
                    setEditingSummary(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                  <span>Edit</span>
                </button>
              )}

              <button
                type="button"
                onClick={onRegenerate}
                disabled={regenerating}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{regenerating ? 'Regenerating...' : 'Regenerate'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {editingSummary ? (
            <div className="space-y-2">
              <textarea
                rows={5}
                value={summaryDraft}
                autoFocus
                onChange={(e) => setSummaryDraft(e.target.value)}
                aria-label="Edit executive summary"
                placeholder="Write a concise summary grounded in the transcript..."
                className="w-full rounded-xl border border-indigo-400 bg-white p-3 text-sm leading-relaxed text-zinc-900 focus:outline-none dark:bg-zinc-950 dark:text-zinc-100"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveSummary}
                  className="cs-accent-btn inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Save summary</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSummary(false)}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          ) : (
            summary && (
              <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                  {summary}
                </p>
              </div>
            )
          )}

          {keyPoints && keyPoints.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Key takeaways
              </h3>
              <ol className="mt-3 space-y-3">
                {keyPoints.map((point, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-50 font-mono text-[11px] font-semibold tabular-nums text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
                      {idx + 1}
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {/* Per-Recording Action Items Checklist */}
      {(actionItems.length > 0 || onUpdateActionItems) && (
        <div className="border-t border-zinc-200/80 pt-5 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Action items{actionItems.length > 0 ? ` (${actionItems.filter((a) => !a.completed).length} open)` : ''}
              </span>
            </h3>
            {onUpdateActionItems && !addingAction && (
              <button
                type="button"
                onClick={() => setAddingAction(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                <span>Add item</span>
              </button>
            )}
          </div>

          {addingAction && (
            <form
              onSubmit={handleAddActionItem}
              className="mb-3 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/50"
            >
              <input
                type="text"
                value={newTask}
                autoFocus
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Task mentioned in this recording..."
                aria-label="Action item task"
                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  placeholder="Owner (optional)"
                  aria-label="Action item owner"
                  className="min-w-[120px] flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <input
                  type="text"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  placeholder="Deadline (optional)"
                  aria-label="Action item deadline"
                  className="min-w-[120px] flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={!newTask.trim()}
                  className="cs-accent-btn rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingAction(false);
                    setNewTask('');
                    setNewOwner('');
                    setNewDeadline('');
                  }}
                  className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {actionItems.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              No action items logged for this recording yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {actionItems.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-start gap-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/40"
                >
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => handleToggleActionItem(item.id)}
                    aria-label={`Mark "${item.task}" ${item.completed ? 'incomplete' : 'complete'}`}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs leading-relaxed ${
                        item.completed
                          ? 'line-through text-zinc-400 dark:text-zinc-500'
                          : 'text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {item.task}
                    </p>
                    {(item.owner || item.deadline || item.timestampSec !== undefined) && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {item.owner && (
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            @{item.owner}
                          </span>
                        )}
                        {item.deadline && <span>Due: {item.deadline}</span>}
                        {item.timestampSec !== undefined && onSeek && (
                          <button
                            type="button"
                            onClick={() => onSeek(item.timestampSec!)}
                            className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300"
                          >
                            <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                            <span>{formatDuration(item.timestampSec)}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {onUpdateActionItems && (
                    <button
                      type="button"
                      onClick={() => handleDeleteActionItem(item.id)}
                      aria-label={`Delete action item "${item.task}"`}
                      className="rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus-visible:opacity-100 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

