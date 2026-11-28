import React, { useEffect, useState } from 'react';
import { Bookmark as BookmarkIcon, Compass, FileText, NotebookPen, Subtitles } from 'lucide-react';
import { ActionItem, Bookmark, Job, NoteSection, RegenerateSection } from '../../types';
import { AnalysisTab } from './AnalysisTab';
import { BookmarksTab } from './BookmarksTab';
import { NotesTab } from './NotesTab';
import { SubtitlesTab } from './SubtitlesTab';
import { SummaryTab } from './SummaryTab';

export type InsightTabKey = 'summary' | 'notes' | 'analysis' | 'subtitles' | 'bookmarks';

interface InsightsPanelProps {
  job: Job;
  currentTime: number;
  initialTab?: InsightTabKey;
  regeneratingSection: RegenerateSection | null;
  aiSummarizing?: boolean;
  enableCloudAi?: boolean;
  onRegenerate: (section: RegenerateSection) => void;
  onAiSummarize?: () => void;
  onUpdateSummary?: (summary: string) => void;
  onUpdateActionItems?: (items: ActionItem[]) => void;
  onUpdateNotes: (notes: NoteSection[]) => void;
  onUpdateBookmarks?: (bookmarks: Bookmark[]) => void;
  onSeek: (sec: number) => void;
}

export function InsightsPanel({
  job,
  currentTime,
  initialTab,
  regeneratingSection,
  aiSummarizing = false,
  enableCloudAi = true,
  onRegenerate,
  onAiSummarize,
  onUpdateSummary,
  onUpdateActionItems,
  onUpdateNotes,
  onUpdateBookmarks,
  onSeek,
}: InsightsPanelProps) {
  const [activeTab, setActiveTab] = useState<InsightTabKey>(initialTab ?? 'summary');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, job.id]);

  const tabs: {
    key: InsightTabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    { key: 'summary', label: 'Summary', icon: FileText },
    { key: 'notes', label: 'Notes', icon: NotebookPen, count: job.notes?.length },
    { key: 'analysis', label: 'Analysis', icon: Compass },
    { key: 'bookmarks', label: 'Bookmarks', icon: BookmarkIcon, count: job.bookmarks?.length },
    { key: 'subtitles', label: 'Subtitles', icon: Subtitles, count: job.transcript?.length },
  ];

  return (
    <section
      aria-label="Analysis, bookmarks and subtitles"
      className="cs-surface flex h-[560px] flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-xs lg:h-[calc(100vh-256px)] lg:min-h-[520px] dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Tabs Header */}
      <div
        role="tablist"
        aria-label="Transcript tools and analysis"
        className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200/80 px-3 pt-2.5 dark:border-zinc-800"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={`relative inline-flex items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                active
                  ? 'cs-accent-text border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className="font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Scrollable Tab Body */}
      <div className="flex-1 overflow-y-auto p-5 cs-scrollbar">
        {activeTab === 'summary' && (
          <SummaryTab
            summary={job.summary}
            keyPoints={job.keyPoints}
            actionItems={job.actionItems}
            regenerating={regeneratingSection === 'summary'}
            aiSummarizing={aiSummarizing}
            enableCloudAi={enableCloudAi}
            hasTranscript={Boolean(job.transcript && job.transcript.length > 0)}
            onRegenerate={() => onRegenerate('summary')}
            onAiSummarize={onAiSummarize}
            onUpdateSummary={onUpdateSummary}
            onUpdateActionItems={onUpdateActionItems}
            onSeek={onSeek}
          />
        )}

        {activeTab === 'notes' && (
          <NotesTab
            notes={job.notes}
            regenerating={regeneratingSection === 'notes'}
            onUpdateNotes={onUpdateNotes}
            onRegenerate={() => onRegenerate('notes')}
          />
        )}

        {activeTab === 'analysis' && (
          <AnalysisTab
            analysis={job.analysis}
            regenerating={regeneratingSection === 'analysis'}
            onRegenerate={() => onRegenerate('analysis')}
          />
        )}

        {activeTab === 'bookmarks' && (
          <BookmarksTab
            bookmarks={job.bookmarks}
            currentTime={currentTime}
            onUpdateBookmarks={onUpdateBookmarks ?? (() => {})}
            onSeek={onSeek}
          />
        )}

        {activeTab === 'subtitles' && (
          <SubtitlesTab job={job} currentTime={currentTime} onSeek={onSeek} />
        )}
      </div>
    </section>
  );
}

