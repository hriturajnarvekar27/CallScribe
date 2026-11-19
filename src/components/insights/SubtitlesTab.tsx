import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Minus,
  Plus,
  Subtitles,
  UserCheck,
} from 'lucide-react';
import { exportJob, loadStoredSettings } from '../../api';
import { Job, SubtitleFormat } from '../../types';
import { buildSrt, buildVtt } from '../../utils/exportMock';
import { formatSrtTime } from '../../utils/format';
import { useToast } from '../ToastProvider';

interface SubtitlesTabProps {
  job: Job;
  currentTime: number;
  onSeek: (sec: number) => void;
}

export function SubtitlesTab({ job, currentTime, onSeek }: SubtitlesTabProps) {
  const { showToast } = useToast();
  const initialSettings = useMemo(() => loadStoredSettings(), []);

  const [format, setFormat] = useState<SubtitleFormat>(
    initialSettings.defaultSubtitleFormat
  );
  const [includeSpeakers, setIncludeSpeakers] = useState<boolean>(
    initialSettings.subtitleIncludeSpeakers
  );
  const [offsetSec, setOffsetSec] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  const segments = job.transcript ?? [];

  const speakerMap = useMemo(() => {
    return new Map(job.speakers.map((s) => [s.id, s]));
  }, [job.speakers]);

  const activeCueIndex = useMemo(() => {
    return segments.findIndex((seg) => {
      const start = Math.max(0, seg.start + offsetSec);
      const end = Math.max(start + 0.5, seg.end + offsetSec);
      return currentTime >= start && currentTime <= end;
    });
  }, [segments, currentTime, offsetSec]);

  const activeCue = activeCueIndex >= 0 ? segments[activeCueIndex] : null;
  const activeSpeaker = activeCue ? speakerMap.get(activeCue.speakerId) : undefined;

  const formattedText = useMemo(() => {
    const opts = { includeSpeakers, offsetSec };
    return format === 'srt' ? buildSrt(job, opts) : buildVtt(job, opts);
  }, [format, includeSpeakers, offsetSec, job]);

  const handleCopy = async () => {
    if (!formattedText.trim()) return;
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopied(true);
      showToast(`${format.toUpperCase()} subtitles copied to clipboard.`, 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('Could not copy subtitles.', 'error');
    }
  };

  const handleDownload = async () => {
    try {
      await exportJob(job.id, format, { includeSpeakers, offsetSec });
      showToast(`Downloaded ${format.toUpperCase()} subtitles.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Subtitle download failed', 'error');
    }
  };

  if (segments.length === 0) {
    return (
      <div className="py-10 text-center">
        <Subtitles className="mx-auto h-7 w-7 text-zinc-400" aria-hidden="true" />
        <p className="mt-2.5 text-sm text-zinc-500 dark:text-zinc-400">
          No transcript segments available to generate subtitles yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live Video Caption Stage Preview */}
      <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-center shadow-inner">
        <div className="mb-2 flex items-center justify-between text-[10px] font-medium text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            <span>Live caption preview</span>
          </span>
          <span className="font-mono tabular-nums text-zinc-400">
            {formatSrtTime(currentTime).split(',')[0]}
          </span>
        </div>

        <div className="flex min-h-[68px] items-center justify-center rounded-lg bg-zinc-900/90 px-4 py-3">
          {activeCue ? (
            <p className="max-w-md rounded bg-black/75 px-3 py-1.5 text-xs leading-relaxed font-medium text-white shadow-sm sm:text-[13px]">
              {includeSpeakers && activeSpeaker && (
                <span className="mr-1.5 font-semibold" style={{ color: activeSpeaker.color }}>
                  {activeSpeaker.name}:
                </span>
              )}
              <span>{activeCue.text}</span>
            </p>
          ) : (
            <p className="text-xs text-zinc-500">
              Press play or click any cue below to preview synced video captions
            </p>
          )}
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/50">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Format Pill */}
          <div
            role="group"
            aria-label="Subtitle format"
            className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {(['srt', 'vtt'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormat(fmt)}
                aria-pressed={format === fmt}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold uppercase transition-colors ${
                  format === fmt
                    ? 'cs-accent-btn bg-indigo-600 text-white dark:bg-indigo-500'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                .{fmt}
              </button>
            ))}
          </div>

          {/* Speaker Prefix Toggle */}
          <button
            type="button"
            onClick={() => setIncludeSpeakers((v) => !v)}
            aria-pressed={includeSpeakers}
            title="Include speaker name prefix inside subtitle cues"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              includeSpeakers
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/70 dark:bg-indigo-950/50 dark:text-indigo-300'
                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
            }`}
          >
            <UserCheck className="h-3 w-3" aria-hidden="true" />
            <span>Speakers</span>
          </button>

          {/* Timing Offset Nudge */}
          <div
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-1.5 py-0.5 dark:border-zinc-800 dark:bg-zinc-900"
            title="Shift all cue timestamps"
          >
            <button
              type="button"
              onClick={() => setOffsetSec((o) => Math.max(-10, Number((o - 0.5).toFixed(1))))}
              aria-label="Shift cues earlier by 0.5 seconds"
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
            </button>
            <span className="min-w-[54px] text-center font-mono text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
              {offsetSec === 0 ? 'Sync 0s' : `${offsetSec > 0 ? '+' : ''}${offsetSec}s`}
            </span>
            <button
              type="button"
              onClick={() => setOffsetSec((o) => Math.min(10, Number((o + 0.5).toFixed(1))))}
              aria-label="Shift cues later by 0.5 seconds"
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3" aria-hidden="true" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="cs-accent-btn inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            <span>.{format}</span>
          </button>
        </div>
      </div>

      {/* Cue List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>{segments.length} subtitle cues</span>
          <span>Click any cue to jump playback</span>
        </div>

        <ul className="space-y-2">
          {segments.map((seg, idx) => {
            const start = Math.max(0, seg.start + offsetSec);
            const end = Math.max(start + 0.5, seg.end + offsetSec);
            const startLabel =
              format === 'vtt'
                ? formatSrtTime(start).replace(',', '.')
                : formatSrtTime(start);
            const endLabel =
              format === 'vtt'
                ? formatSrtTime(end).replace(',', '.')
                : formatSrtTime(end);
            const spk = speakerMap.get(seg.speakerId);
            const isActive = idx === activeCueIndex;

            return (
              <li key={seg.id}>
                <button
                  type="button"
                  onClick={() => onSeek(start)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-950/35'
                      : 'border-zinc-200/80 bg-zinc-50/50 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-zinc-400">
                    <span>#{idx + 1}</span>
                    <span>
                      {startLabel} --&gt; {endLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {includeSpeakers && spk && (
                      <span className="mr-1.5 font-semibold" style={{ color: spk.color }}>
                        {spk.name}:
                      </span>
                    )}
                    {seg.text}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
