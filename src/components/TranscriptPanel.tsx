import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Pencil,
  Play,
  Search,
  X,
} from 'lucide-react';
import { Speaker, TranscriptSegment } from '../types';
import { formatTimestamp, getSpeakerInitials } from '../utils/format';
import { useToast } from './ToastProvider';

interface TranscriptPanelProps {
  speakers: Speaker[];
  transcript: TranscriptSegment[];
  currentTime: number;
  isPlaying: boolean;
  onSeek: (timeSec: number) => void;
  onRenameSpeaker: (speakerId: string, newName: string) => void;
  onEditSegment: (segmentId: string, newText: string) => void;
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

export function TranscriptPanel({
  speakers,
  transcript,
  currentTime,
  isPlaying,
  onSeek,
  onRenameSpeaker,
  onEditSegment,
}: TranscriptPanelProps) {
  const { showToast } = useToast();
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const [showTimestamps, setShowTimestamps] = useState(true);
  const [autoFollow, setAutoFollow] = useState(true);
  const [speakerFilter, setSpeakerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCursor, setMatchCursor] = useState(0);
  const [copiedAll, setCopiedAll] = useState(false);

  const [renamingSpeakerId, setRenamingSpeakerId] = useState<string | null>(null);
  const [speakerDraft, setSpeakerDraft] = useState('');

  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentDraft, setSegmentDraft] = useState('');

  const speakerMap = useMemo(() => {
    const map = new Map<string, Speaker>();
    for (const s of speakers) {
      map.set(s.id, s);
    }
    return map;
  }, [speakers]);

  // Speaker talk-time share
  const speakerStats = useMemo(() => {
    const durations = new Map<string, number>();
    let total = 0;
    for (const seg of transcript) {
      const dur = Math.max(1, seg.end - seg.start);
      durations.set(seg.speakerId, (durations.get(seg.speakerId) ?? 0) + dur);
      total += dur;
    }
    return speakers.map((spk) => {
      const dur = durations.get(spk.id) ?? 0;
      const pct = total > 0 ? Math.round((dur / total) * 100) : 0;
      return { ...spk, pct };
    });
  }, [speakers, transcript]);

  const visibleTranscript = useMemo(() => {
    if (speakerFilter === 'all') return transcript;
    return transcript.filter((seg) => seg.speakerId === speakerFilter);
  }, [transcript, speakerFilter]);

  const activeSegmentIndex = useMemo(() => {
    return visibleTranscript.findIndex(
      (seg) => currentTime >= seg.start && currentTime <= seg.end
    );
  }, [visibleTranscript, currentTime]);

  const matchIndices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const indices: number[] = [];
    visibleTranscript.forEach((seg, idx) => {
      const spkName = speakerMap.get(seg.speakerId)?.name.toLowerCase() ?? '';
      if (seg.text.toLowerCase().includes(q) || spkName.includes(q)) {
        indices.push(idx);
      }
    });
    return indices;
  }, [visibleTranscript, searchQuery, speakerMap]);

  useEffect(() => {
    setMatchCursor(0);
  }, [searchQuery, speakerFilter]);

  const virtualizer = useVirtualizer({
    count: visibleTranscript.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });

  useEffect(() => {
    if (isPlaying && autoFollow && activeSegmentIndex >= 0 && !editingSegmentId) {
      virtualizer.scrollToIndex(activeSegmentIndex, {
        align: 'center',
        behavior: 'smooth',
      });
    }
  }, [activeSegmentIndex, isPlaying, autoFollow, editingSegmentId, virtualizer]);

  const jumpToMatch = (nextCursor: number) => {
    if (matchIndices.length === 0) return;
    const wrapped = (nextCursor + matchIndices.length) % matchIndices.length;
    setMatchCursor(wrapped);
    const targetIdx = matchIndices[wrapped];
    virtualizer.scrollToIndex(targetIdx, { align: 'center', behavior: 'smooth' });
  };

  const commitSpeakerRename = () => {
    if (!renamingSpeakerId) return;
    const trimmed = speakerDraft.trim();
    if (trimmed) {
      onRenameSpeaker(renamingSpeakerId, trimmed);
    }
    setRenamingSpeakerId(null);
  };

  const commitSegmentEdit = () => {
    if (!editingSegmentId) return;
    const trimmed = segmentDraft.trim();
    if (trimmed) {
      onEditSegment(editingSegmentId, trimmed);
    }
    setEditingSegmentId(null);
  };

  const handleCopyFullTranscript = async () => {
    if (visibleTranscript.length === 0) return;
    const text = visibleTranscript
      .map((seg) => {
        const name = speakerMap.get(seg.speakerId)?.name ?? seg.speakerId;
        const ts = showTimestamps ? `[${formatTimestamp(seg.start)}] ` : '';
        return `${ts}${name}: ${seg.text}`;
      })
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      showToast('Transcript copied to clipboard.', 'success');
      window.setTimeout(() => setCopiedAll(false), 1800);
    } catch {
      showToast('Could not copy transcript.', 'error');
    }
  };

  const handleCopySegment = async (seg: TranscriptSegment, speakerName: string) => {
    const line = `[${formatTimestamp(seg.start)}] ${speakerName}: ${seg.text}`;
    try {
      await navigator.clipboard.writeText(line);
      showToast('Segment copied.', 'success');
    } catch {
      showToast('Could not copy segment.', 'error');
    }
  };

  return (
    <section
      aria-label="Transcript"
      className="cs-surface flex h-[560px] flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-xs lg:h-[calc(100vh-256px)] lg:min-h-[520px] dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Toolbar */}
      <div className="space-y-2 border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex min-w-[180px] flex-1 items-center">
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
                  {matchIndices.length === 0 ? '0' : `${matchCursor + 1}/${matchIndices.length}`}
                </span>
                <button
                  type="button"
                  onClick={() => jumpToMatch(matchCursor - 1)}
                  disabled={matchIndices.length === 0}
                  aria-label="Previous search match"
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-200/70 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => jumpToMatch(matchCursor + 1)}
                  disabled={matchIndices.length === 0}
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

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAutoFollow((f) => !f)}
              aria-pressed={autoFollow}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                autoFollow
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              Auto-scroll
            </button>
            <button
              type="button"
              onClick={() => setShowTimestamps((s) => !s)}
              aria-pressed={showTimestamps}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                showTimestamps
                  ? 'border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
                  : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">Timestamps</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopyFullTranscript()}
              disabled={visibleTranscript.length === 0}
              title="Copy visible transcript"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {copiedAll ? (
                <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3" aria-hidden="true" />
              )}
              <span>{copiedAll ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Speaker Filter & Talk-Time Strip */}
        {speakers.length > 1 && transcript.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setSpeakerFilter('all')}
              aria-pressed={speakerFilter === 'all'}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
                speakerFilter === 'all'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
              }`}
            >
              All ({transcript.length})
            </button>
            {speakerStats.map((spk) => {
              const active = speakerFilter === spk.id;
              return (
                <button
                  key={spk.id}
                  type="button"
                  onClick={() => setSpeakerFilter(active ? 'all' : spk.id)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    active
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200'
                      : 'border-zinc-200/80 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: spk.color }}
                    aria-hidden="true"
                  />
                  <span className="max-w-[110px] truncate">{spk.name}</span>
                  <span className="font-mono text-[10px] tabular-nums text-zinc-400">
                    {spk.pct}%
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Virtualized Scroll Area */}
      {visibleTranscript.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No transcript segments match the current filter.
          </p>
        </div>
      ) : (
        <div
          ref={scrollParentRef}
          className="flex-1 overflow-y-auto px-3 py-3 cs-scrollbar"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const seg = visibleTranscript[virtualRow.index];
              const speaker = speakerMap.get(seg.speakerId) ?? {
                id: seg.speakerId,
                name: seg.speakerId,
                color: '#71717a',
              };
              const isActive = virtualRow.index === activeSegmentIndex;
              const isFocusedMatch =
                matchIndices.length > 0 &&
                matchIndices[matchCursor] === virtualRow.index;
              const isEditing = editingSegmentId === seg.id;
              const isRenaming = renamingSpeakerId === speaker.id;

              return (
                <div
                  key={seg.id}
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
                    className={`group rounded-xl px-3.5 py-3 transition-colors ${
                      isActive
                        ? 'bg-indigo-50/80 ring-1 ring-indigo-200/90 dark:bg-indigo-950/35 dark:ring-indigo-800/70'
                        : isFocusedMatch
                          ? 'bg-amber-50/70 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-800/60'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    {/* Segment Header */}
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tracking-tight text-white shadow-2xs"
                          style={{ backgroundColor: speaker.color }}
                          aria-hidden="true"
                        >
                          {getSpeakerInitials(speaker.name)}
                        </span>

                        {isRenaming ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={speakerDraft}
                              autoFocus
                              onChange={(e) => setSpeakerDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitSpeakerRename();
                                } else if (e.key === 'Escape') {
                                  setRenamingSpeakerId(null);
                                }
                              }}
                              aria-label="Rename speaker"
                              className="rounded-md border border-indigo-400 bg-white px-2 py-0.5 text-xs font-medium text-zinc-900 focus:outline-none dark:bg-zinc-950 dark:text-zinc-100"
                            />
                            <button
                              type="button"
                              onClick={commitSpeakerRename}
                              aria-label="Save speaker name"
                              className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingSpeakerId(null)}
                              aria-label="Cancel rename"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingSpeakerId(speaker.id);
                              setSpeakerDraft(speaker.name);
                            }}
                            title="Click to rename speaker everywhere"
                            className="inline-flex items-center gap-1 truncate rounded px-1 py-0.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-200/60 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <span className="truncate">{speaker.name}</span>
                            <Pencil
                              className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-60"
                              aria-hidden="true"
                            />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleCopySegment(seg, speaker.name)}
                          aria-label="Copy segment"
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200/60 hover:text-zinc-800 group-hover:opacity-100 focus-visible:opacity-100 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        >
                          <Copy className="h-3 w-3" aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingSegmentId(seg.id);
                            setSegmentDraft(seg.text);
                          }}
                          aria-label="Edit segment text"
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200/60 hover:text-zinc-800 group-hover:opacity-100 focus-visible:opacity-100 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          <span>Edit</span>
                        </button>

                        {showTimestamps && (
                          <button
                            type="button"
                            onClick={() => onSeek(seg.start)}
                            title="Play from this timestamp"
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                              isActive
                                ? 'cs-accent-btn bg-indigo-600 text-white dark:bg-indigo-500'
                                : 'text-zinc-500 hover:bg-indigo-100 hover:text-indigo-700 dark:text-zinc-400 dark:hover:bg-indigo-950 dark:hover:text-indigo-300'
                            }`}
                          >
                            <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                            <span>{formatTimestamp(seg.start)}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Segment Body */}
                    {isEditing ? (
                      <div className="space-y-2 pl-8">
                        <textarea
                          rows={3}
                          value={segmentDraft}
                          autoFocus
                          onChange={(e) => setSegmentDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                              e.preventDefault();
                              commitSegmentEdit();
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
                            onClick={commitSegmentEdit}
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
                    ) : (
                      <p
                        onClick={() => onSeek(seg.start)}
                        className="cursor-pointer pl-8 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                      >
                        {highlightText(seg.text, searchQuery)}
                      </p>
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
