import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  MessageSquareWarning,
  Minus,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { JobAnalysis } from '../../types';

interface AnalysisTabProps {
  analysis?: JobAnalysis;
  regenerating: boolean;
  onRegenerate: () => void;
}

export function AnalysisTab({
  analysis,
  regenerating,
  onRegenerate,
}: AnalysisTabProps) {
  if (!analysis) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No client analysis generated yet.
        </p>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{regenerating ? 'Analyzing...' : 'Generate analysis'}</span>
        </button>
      </div>
    );
  }

  const sentimentConfig = {
    positive: {
      label: 'Positive sentiment',
      icon: TrendingUp,
      classes:
        'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    neutral: {
      label: 'Neutral sentiment',
      icon: Minus,
      classes:
        'border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-100',
      iconColor: 'text-zinc-600 dark:text-zinc-400',
    },
    negative: {
      label: 'Negative sentiment',
      icon: TrendingDown,
      classes:
        'border-rose-200 bg-rose-50/70 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200',
      iconColor: 'text-rose-600 dark:text-rose-400',
    },
  }[analysis.sentiment];

  const SentimentIcon = sentimentConfig.icon;

  const sections = [
    {
      title: 'Key decisions',
      items: analysis.decisions,
      icon: CheckCircle2,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Questions raised',
      items: analysis.questionsRaised,
      icon: HelpCircle,
      iconClass: 'text-cyan-600 dark:text-cyan-400',
    },
    {
      title: 'Client concerns',
      items: analysis.concerns,
      icon: MessageSquareWarning,
      iconClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Delivery & commercial risks',
      items: analysis.risks,
      icon: ShieldAlert,
      iconClass: 'text-rose-600 dark:text-rose-400',
    },
    {
      title: 'Recommended next steps',
      items: analysis.nextSteps,
      icon: ArrowRight,
      iconClass: 'text-indigo-600 dark:text-indigo-400',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Sentiment &amp; signal breakdown
        </h3>
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

      {/* Sentiment Card */}
      <div className={`rounded-xl border p-4 ${sentimentConfig.classes}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <SentimentIcon className={`h-4 w-4 ${sentimentConfig.iconColor}`} aria-hidden="true" />
          <span>{sentimentConfig.label}</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed opacity-90">{analysis.sentimentNote}</p>
      </div>

      {/* Topics */}
      {analysis.topics.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Topics discussed
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analysis.topics.map((topic, idx) => (
              <span
                key={idx}
                className="rounded-lg border border-zinc-200/90 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Structured Analysis Cards */}
      <div className="space-y-3">
        {sections.map((section) => {
          if (!section.items || section.items.length === 0) return null;
          const Icon = section.icon;
          return (
            <div
              key={section.title}
              className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <Icon className={`h-3.5 w-3.5 ${section.iconClass}`} aria-hidden="true" />
                <span>{section.title}</span>
              </div>
              <ul className="mt-2.5 space-y-1.5">
                {section.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
