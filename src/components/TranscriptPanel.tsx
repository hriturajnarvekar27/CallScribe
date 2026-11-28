import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlignLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Pencil,
  Play,
  Redo2,
  Repeat,
  Scissors,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import { TranscriptSegment, TranscriptViewMode } from '../types';
import { formatTimestamp } from '../utils/format';
import {
  buildMeaningfulSegments,
  buildReadableParagraphs,
  findActiveSegmentIndex,
  MeaningfulSegment,
  normalizeTranscriptText,
  redistributeParagraphText,
  TranscriptParagraph,
} from '../utils/transcriptFormat';
import { useToast } from './ToastProvider';

interface TranscriptPanelProps {
  transcript: TranscriptSegment[];
  currentTime: number;
  isPlaying: boolean;
  defaultViewMode?: TranscriptViewMode;
  canUndo?: boolean;
  canRedo?: boolean;
  onSeek: (timeSec: number) => void;
  onReplaySegment?: (seg: TranscriptSegment) => void;
  onEditSegment: (segmentId: string, newText: string) => void;
  onEditSegmentsBatch?: (updates: Array<{ id: string; text: string }>) => void;
  onSplitSegment?: (segmentId: string, splitCharIndex: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark
        key={idx}
        className="rounded-xs bg-amber-200 px-0.5 text-zinc-900 dark:bg-amber-500/35 dark:text-amber-100"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

function computeSplitCharIndex(text: string, wordBoundaryIndex: number): number {
  const tokens = text.trim().split(/\s+/);
  if (wordBoundaryIndex <= 0 || wordBoundaryIndex >= tokens.length) {
    return Math.floor(text.length / 2);
  }
  const prefix = tokens.slice(0, wordBoundaryIndex).join(' ');
  return Math.max(1, Math.min(text.length - 1, prefix.length));
}

const VIEW_MODES: Array<{
  value: TranscriptViewMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'transcript', label: 'Transcript', icon: AlignLeft },
  { value: 'timestamped', label: 'Timestamped', icon: Clock },
];

export function TranscriptPanel({
  transcript,
  currentTime,
  isPlaying,
  defaultViewMode = 'transcript',
  canUndo = false,
  canRedo = false,
  onSeek,
  onReplaySegment,
  onEditSegment,
  onEditSegmentsBatch,
  onSplitSegment,
  onUndo,
  onRedo,
}: TranscriptPanelProps) {
  const { showToast } = useToast();
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<TranscriptViewMode>(defaultViewMode);
  const [autoFollow, setAutoFollow] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCursor, setMatchCursor] = useState(0);
  const [copiedAll, setCopiedAll] = useState(false);

  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentDraft, setSegmentDraft] = useState('');

  const [editingParagraphId, setEditingParagraphId] = useState<string | null>(null);
  const [paragraphDraft, setParagraphDraft] = useState('');

  const [splittingSegmentId, setSplittingSegmentId] = useState<string | null>(null);

  useEffect(() => {
    setViewMode(defaultViewMode);
  }, [defaultViewMode]);

  const { wordCount, readingMinutes } = useMemo(() => {
    let words = 0;
    for (const seg of transcript) {
      const cleaned = normalizeTranscriptText(seg.text);
      if (cleaned) {
        words += cleaned.split(' ').length;
      }
    }
    return {
      wordCount: words,
      readingMinutes: Math.max(1, Math.round(words / 180)),
    };
  }, [transcript]);

  const paragraphs = useMemo(() => buildReadableParagraphs(transcript), [transcript]);
  const meaningfulSegments = useMemo(() => buildMeaningfulSegments(transcript), [transcript]);

  const activeCanonicalSegmentId = useMemo(() => {
    const idx = findActiveSegmentIndex(transcript, currentTime);
    return idx >= 0 ? transcript[idx].id : null;
  }, [transcript, currentTime]);

  const rowCount = viewMode === 'transcript' ? paragraphs.length : meaningfulSegments.length;

  const activeRowIndex = useMemo(() => {
    if (viewMode === 'transcript') {
      if (activeCanonicalSegmentId) {
        const hit = paragraphs.findIndex((p) =>
          p.segments.some((s) => s.id === activeCanonicalSegmentId)
        );
        if (hit !== -1) return hit;
      }
      return findActiveSegmentIndex(paragraphs, currentTime);
    }

    if (activeCanonicalSegmentId) {
      const hit = meaningfulSegments.findIndex((m) =>
        m.segmentIds.includes(activeCanonicalSegmentId)
      );
      if (hit !== -1) return hit;
    }
    return findActiveSegmentIndex(meaningfulSegments, currentTime);
  }, [viewMode, activeCanonicalSegmentId, paragraphs, meaningfulSegments, currentTime]);

  const matchRowIndices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const indices: number[] = [];

    if (viewMode === 'transcript') {
      paragraphs.forEach((p, idx) => {
        if (p.text.toLowerCase().includes(q)) {
          indices.push(idx);
        }
      });
    } else {
      meaningfulSegments.forEach((seg, idx) => {
        if (seg.text.toLowerCase().includes(q)) {
          indices.push(idx);
        }
      });
    }

    return indices;
  }, [viewMode, searchQuery, paragraphs, meaningfulSegments]);

  useEffect(() => {
    setMatchCursor(0);
  }, [searchQuery, viewMode]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => (viewMode === 'timestamped' ? 60 : 96),
    overscan: 8,
  });

  useEffect(() => {
    if (
      isPlaying &&
      autoFollow &&
      activeRowIndex >= 0 &&
      !editingSegmentId &&
      !editingParagraphId &&
      !splittingSegmentId
    ) {
      virtualizer.scrollToIndex(activeRowIndex, {
        align: 'center',
        behavior: 'smooth',
      });
    }
  }, [
    activeRowIndex,
    isPlaying,
    autoFollow,
    editingSegmentId,
    editingParagraphId,
    splittingSegmentId,
    virtualizer,
  ]);

  const jumpToMatch = (nextCursor: number) => {
    if (matchRowIndices.length === 0) return;
    const wrapped = (nextCursor + matchRowIndices.length) % matchRowIndices.length;
    setMatchCursor(wrapped);
    const targetIdx = matchRowIndices[wrapped];
    virtualizer.scrollToIndex(targetIdx, { align: 'center', behavior: 'smooth' });
  };

  const applySegmentsUpdate = (segments: TranscriptSegment[], editedText: string) => {
    const trimmed = editedText.trim();
    if (!trimmed) return;
    if (segments.length === 1) {
      onEditSegment(segments[0].id, trimmed);
      return;
    }
    const updates = redistributeParagraphText(segments, trimmed);
    if (onEditSegmentsBatch) {
      onEditSegmentsBatch(updates);
    } else {
      for (const u of updates) {
        onEditSegment(u.id, u.text);
      }
    }
  };

  const commitMeaningfulSegmentEdit = (mseg: MeaningfulSegment) => {
    if (!editingSegmentId) return;
    applySegmentsUpdate(mseg.segments, segmentDraft);
    setEditingSegmentId(null);
  };

  const commitParagraphEdit = (para: TranscriptParagraph) => {
    applySegmentsUpdate(para.segments, paragraphDraft);
    setEditingParagraphId(null);
  };

  const handleCopyFullTranscript = async () => {
    if (transcript.length === 0) return;
    const text =
      viewMode === 'transcript'
        ? paragraphs.map((p) => p.text).join('\n\n')
        : meaningfulSegments
            .map((seg) => `[${formatTimestamp(seg.start)}] ${seg.text}`)
            .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      showToast('Transcript copied to clipboard.', 'success');
      window.setTimeout(() => setCopiedAll(false), 1800);
    } catch {
      showToast('Could not copy transcript.', 'error');
    }
  };

  const handleCopyText = async (line: string, label = 'Copied to clipboard.') => {
    try {
      await navigator.clipboard.writeText(line);
      showToast(label, 'success');
    } catch {
      showToast('Could not copy text.', 'error');
    }
  };

  const renderInlineSegmentEditor = (mseg: MeaningfulSegment) => (
    <div className="my-1 space-y-2">
      <textarea
        rows={3}
        value={segmentDraft}
        autoFocus
        onChange={(e) => setSegmentDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            commitMeaningfulSegmentEdit(mseg);
          } else if (e.key === 'Escape') {
            setEditingSegmentId(null);
          }
        }}
        aria-label="Edit transcript segment"
        className="w-full rounded-lg border border-indigo-400 bg-white p-2.5 text-sm leading-relaxed text-zinc-900 focus:outline-none dark:bg-zinc-950 dark:text-zinc-100"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => commitMeaningfulSegmentEdit(mseg)}
          className="cs-accent-btn rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditingSegmentId(null)}
          className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderInlineSplitter = (seg: TranscriptSegment) => {
    const wordsForSplit = seg.text.trim().split(/\s+/);
    return (
      <div className="my-1 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5 dark:border-indigo-900/60 dark:bg-indigo-950/20">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-indigo-800 dark:text-indigo-200">
          <span>Click a word divider to split this segment:</span>
          <button
            type="button"
            onClick={() => setSplittingSegmentId(null)}
            className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-y-1.5 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
          {wordsForSplit.map((word, wIdx) => (
            <React.Fragment key={wIdx}>
              <span>{word}</span>
              {wIdx < wordsForSplit.length - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const splitChar = computeSplitCharIndex(seg.text, wIdx + 1);
                    onSplitSegment?.(seg.id, splitChar);
                    setSplittingSegmentId(null);
                  }}
                  title={`Split after "${word}"`}
                  className="mx-1 inline-flex h-5 items-center rounded border border-dashed border-indigo-300 px-1 font-mono text-[10px] text-indigo-500 transition-colors hover:border-indigo-600 hover:bg-indigo-600 hover:text-white dark:border-indigo-700 dark:text-indigo-300"
                >
                  |
                </button>
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Transcript"
      className="cs-surface flex h-[560px] flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-xs lg:h-[calc(100vh-256px)] lg:min-h-[520px] dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Toolbar */}
      <div className="space-y-2.5 border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Transcript presentation mode"
            className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            {VIEW_MODES.map((m) => {
              const Icon = m.icon;
              const active = viewMode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setViewMode(m.value);
                    setEditingSegmentId(null);
                    setEditingParagraphId(null);
                    setSplittingSegmentId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                    active
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative flex min-w-[160px] flex-1 items-center">
            <Search
              className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transcript..."
              aria-label="Search within transcript"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pr-24 pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-950"
            />
            {searchQuery.trim() && (
              <div className="absolute right-1.5 flex items-center gap-0.5">
                <span className="px-1 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  {matchRowIndices.length === 0
                    ? '0'
                    : `${matchCursor + 1}/${matchRowIndices.length}`}
                </span>
                <button
                  type="button"
                  onClick={() => jumpToMatch(matchCursor - 1)}
                  disabled={matchRowIndices.length === 0}
                  aria-label="Previous search match"
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-200/70 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => jumpToMatch(matchCursor + 1)}
                  disabled={matchRowIndices.length === 0}
                  aria-label="Next search match"
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-200/70 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(onUndo || onRedo) && (
              <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Undo transcript edit"
                  aria-label="Undo transcript edit"
                  className="rounded-l-lg px-2 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-35 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Redo transcript edit"
                  aria-label="Redo transcript edit"
                  className="rounded-r-lg px-2 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-35 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setAutoFollow((f) => !f)}
              aria-pressed={autoFollow}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                autoFollow
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              Follow
            </button>

            <button
              type="button"
              onClick={() => void handleCopyFullTranscript()}
              disabled={transcript.length === 0}
              title="Copy transcript"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {copiedAll ? (
                <Check className="h-3 w-3 text-emerald-500 shrink-0" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              <span>{copiedAll ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Compact Editorial Sub-Bar */}
        {transcript.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {viewMode === 'transcript'
                ? `${paragraphs.length} paragraph${paragraphs.length === 1 ? '' : 's'} · click any sentence to seek`
                : `${meaningfulSegments.length} timestamped segment${meaningfulSegments.length === 1 ? '' : 's'} · click to seek`}
            </span>

            <span className="font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
              {wordCount.toLocaleString()} words · ~{readingMinutes}m read
            </span>
          </div>
        )}
      </div>

      {/* Virtualized Editorial Scroll Area */}
      {transcript.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No transcript segments available yet.
          </p>
        </div>
      ) : (
        <div ref={scrollParentRef} className="flex-1 overflow-y-auto px-4 py-4 cs-scrollbar">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const isFocusedMatch =
                matchRowIndices.length > 0 && matchRowIndices[matchCursor] === virtualRow.index;

              // -----------------------------------------------------------
              // MODE 1: TRANSCRIPT (Continuous readable paragraphs)
              // -----------------------------------------------------------
              if (viewMode === 'transcript') {
                const para = paragraphs[virtualRow.index];
                if (!para) return null;
                const isParaActive = para.segments.some(
                  (s) => s.id === activeCanonicalSegmentId
                );
                const isEditingPara = editingParagraphId === para.id;

                return (
                  <div
                    key={para.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="pb-4"
                  >
                    <div
                      className={`group flex items-start gap-4 rounded-lg px-2 py-1.5 transition-colors ${
                        isFocusedMatch
                          ? 'bg-amber-50/60 dark:bg-amber-950/20'
                          : 'hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSeek(para.start)}
                        title={`Play paragraph from ${formatTimestamp(para.start)}`}
                        className={`w-12 shrink-0 pt-1 text-right font-mono text-[11px] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                          isParaActive
                            ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                            : 'text-zinc-400 opacity-75 group-hover:opacity-100 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-200'
                        }`}
                      >
                        {formatTimestamp(para.start)}
                      </button>

                      <div className="min-w-0 flex-1">
                        {isEditingPara ? (
                          <div className="space-y-2">
                            <textarea
                              rows={4}
                              value={paragraphDraft}
                              autoFocus
                              onChange={(e) => setParagraphDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                  e.preventDefault();
                                  commitParagraphEdit(para);
                                } else if (e.key === 'Escape') {
                                  setEditingParagraphId(null);
                                }
                              }}
                              aria-label="Edit transcript paragraph"
                              className="w-full rounded-lg border border-indigo-400 bg-white p-2.5 text-sm leading-relaxed text-zinc-900 focus:outline-none dark:bg-zinc-950 dark:text-zinc-100"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => commitParagraphEdit(para)}
                                className="cs-accent-btn rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingParagraphId(null)}
                                className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[14.5px] leading-[1.78] text-zinc-800 dark:text-zinc-200">
                            {para.segments.map((seg, sIdx) => {
                              const segText = normalizeTranscriptText(seg.text);
                              if (!segText) return null;
                              const isSegActive = seg.id === activeCanonicalSegmentId;
                              return (
                                <React.Fragment key={seg.id}>
                                  <span
                                    onClick={() => onSeek(seg.start)}
                                    title={`Seek to ${formatTimestamp(seg.start)}`}
                                    className={`cursor-pointer rounded-xs transition-colors ${
                                      isSegActive
                                        ? 'bg-indigo-100/90 px-0.5 text-zinc-950 dark:bg-indigo-500/30 dark:text-zinc-50'
                                        : 'hover:bg-zinc-200/50 dark:hover:bg-zinc-700/40'
                                    }`}
                                  >
                                    {highlightText(segText, searchQuery)}
                                  </span>
                                  {sIdx < para.segments.length - 1 ? ' ' : ''}
                                </React.Fragment>
                              );
                            })}
                          </p>
                        )}
                      </div>

                      {!isEditingPara && (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingParagraphId(para.id);
                              setParagraphDraft(para.text);
                            }}
                            aria-label="Edit paragraph"
                            title="Edit text (preserves timestamps)"
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCopyText(para.text, 'Paragraph copied.')}
                            aria-label="Copy paragraph"
                            title="Copy paragraph"
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                          >
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // -----------------------------------------------------------
              // MODE 2: TIMESTAMPED (Meaningful segments + timecodes)
              // -----------------------------------------------------------
              const mseg = meaningfulSegments[virtualRow.index];
              if (!mseg) return null;
              const isActive =
                activeCanonicalSegmentId !== null
                  ? mseg.segmentIds.includes(activeCanonicalSegmentId)
                  : currentTime >= mseg.start && currentTime < mseg.end;
              const isEditing = editingSegmentId === mseg.id;
              const singleSeg = mseg.segments.length === 1 ? mseg.segments[0] : null;
              const isSplitting = singleSeg ? splittingSegmentId === singleSeg.id : false;

              return (
                <div
                  key={mseg.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="pb-1.5"
                >
                  <div
                    className={`group flex items-start gap-4 rounded-lg px-2 py-2 transition-colors ${
                      isActive
                        ? 'bg-indigo-50/85 dark:bg-indigo-950/35'
                        : isFocusedMatch
                          ? 'bg-amber-50/70 dark:bg-amber-950/25'
                          : 'hover:bg-zinc-50/80 dark:hover:bg-zinc-800/35'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSeek(mseg.start)}
                      title={`Play from ${formatTimestamp(mseg.start)}`}
                      className={`inline-flex w-14 shrink-0 items-center justify-end gap-1 pt-0.5 font-mono text-[11px] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                        isActive
                          ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                          : 'text-zinc-400 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-200'
                      }`}
                    >
                      {isActive && <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />}
                      <span>{formatTimestamp(mseg.start)}</span>
                    </button>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        renderInlineSegmentEditor(mseg)
                      ) : isSplitting && singleSeg && onSplitSegment ? (
                        renderInlineSplitter(singleSeg)
                      ) : (
                        <p
                          onClick={() => onSeek(mseg.start)}
                          className="cursor-pointer text-[14px] leading-[1.68] text-zinc-800 dark:text-zinc-200"
                        >
                          {highlightText(mseg.text, searchQuery)}
                        </p>
                      )}
                    </div>

                    {!isEditing && !isSplitting && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {onReplaySegment && (
                          <button
                            type="button"
                            onClick={() =>
                              onReplaySegment({
                                ...mseg.segments[0],
                                start: mseg.start,
                                end: mseg.end,
                                text: mseg.text,
                              })
                            }
                            title={`Replay (${formatTimestamp(mseg.start)}–${formatTimestamp(mseg.end)})`}
                            aria-label="Replay segment"
                            className="rounded p-1 text-zinc-400 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950 dark:hover:text-indigo-300"
                          >
                            <Repeat className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                        {onSplitSegment &&
                          singleSeg &&
                          singleSeg.text.trim().split(/\s+/).length >= 4 && (
                            <button
                              type="button"
                              onClick={() =>
                                setSplittingSegmentId((cur) =>
                                  cur === singleSeg.id ? null : singleSeg.id
                                )
                              }
                              aria-label="Split segment"
                              title="Split segment"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            >
                              <Scissors className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => {
                            setSplittingSegmentId(null);
                            setEditingSegmentId(mseg.id);
                            setSegmentDraft(mseg.text);
                          }}
                          aria-label="Edit segment"
                          title="Edit text (preserves timestamps)"
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyText(
                              `[${formatTimestamp(mseg.start)}] ${mseg.text}`,
                              'Segment copied.'
                            )
                          }
                          aria-label="Copy segment"
                          title="Copy segment"
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        >
                          <Copy className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
