import React, { useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { useToast } from '../ToastProvider';

interface SummaryTabProps {
  summary?: string;
  keyPoints?: string[];
  regenerating: boolean;
  onRegenerate: () => void;
}

export function SummaryTab({
  summary,
  keyPoints,
  regenerating,
  onRegenerate,
}: SummaryTabProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const parts: string[] = [];
    if (summary) parts.push(summary);
    if (keyPoints?.length) {
      parts.push('', 'Key Points:', ...keyPoints.map((kp) => `• ${kp}`));
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

  if (!summary && (!keyPoints || keyPoints.length === 0)) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No summary generated yet for this recording.
        </p>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{regenerating ? 'Generating...' : 'Generate summary'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Executive overview
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} aria-hidden="true" />
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

      {summary && (
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
          <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {summary}
          </p>
        </div>
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
    </div>
  );
}
