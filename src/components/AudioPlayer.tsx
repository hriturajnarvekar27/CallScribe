import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Speaker, TranscriptSegment } from '../types';
import { formatDuration } from '../utils/format';

interface AudioPlayerProps {
  audioUrl?: string;
  durationSec: number;
  speakers: Speaker[];
  transcript: TranscriptSegment[];
  currentTime: number;
  isPlaying: boolean;
  onTimeChange: (time: number) => void;
  onPlayStateChange: (playing: boolean) => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
const BAR_COUNT = 96;

export function AudioPlayer({
  audioUrl,
  durationSec,
  speakers,
  transcript,
  currentTime,
  isPlaying,
  onTimeChange,
  onPlayStateChange,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [muted, setMuted] = useState<boolean>(false);
  const [showCaptions, setShowCaptions] = useState<boolean>(true);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const safeDuration = Math.max(1, durationSec);

  const speakerMap = useMemo(() => {
    const map = new Map<string, Speaker>();
    for (const s of speakers) {
      map.set(s.id, s);
    }
    return map;
  }, [speakers]);

  // Precompute speaker-colored waveform bars across timeline
  const waveformBars = useMemo(() => {
    const bars: { time: number; heightPct: number; color: string; speakerName?: string }[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const t = ((i + 0.5) / BAR_COUNT) * safeDuration;
      const seg = transcript.find((s) => t >= s.start && t <= s.end);
      const speaker = seg ? speakerMap.get(seg.speakerId) : undefined;
      const seed = Math.abs(Math.sin(i * 12.9898 + (seg ? seg.text.length : 7)) * 43758.5453) % 1;
      const heightPct = seg ? Math.round(32 + seed * 64) : Math.round(18 + seed * 22);
      bars.push({
        time: t,
        heightPct,
        color: speaker?.color ?? '#a1a1aa',
        speakerName: speaker?.name,
      });
    }
    return bars;
  }, [safeDuration, transcript, speakerMap]);

  const hoverSpeakerName = useMemo(() => {
    if (hoverTime === null) return null;
    const seg = transcript.find((s) => hoverTime >= s.start && hoverTime <= s.end);
    return seg ? speakerMap.get(seg.speakerId)?.name ?? null : null;
  }, [hoverTime, transcript, speakerMap]);

  const activeSegment = useMemo(() => {
    return transcript.find((s) => currentTime >= s.start && currentTime <= s.end) ?? null;
  }, [currentTime, transcript]);
  const activeSpeaker = activeSegment ? speakerMap.get(activeSegment.speakerId) : undefined;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
    el.muted = muted;
  }, [speed, muted]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (isPlaying) {
      el.play().catch(() => {
        // Ignore browser autoplay block
      });
    } else {
      el.pause();
    }
  }, [isPlaying, audioUrl]);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    if (!isPlaying) return;
    let last = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const deltaSec = ((now - last) / 1000) * speed;
      last = now;

      const el = audioRef.current;
      if (
        el &&
        Number.isFinite(el.duration) &&
        el.duration >= safeDuration * 0.9 &&
        !el.paused
      ) {
        onTimeChange(Math.min(safeDuration, el.currentTime));
        if (el.ended) {
          onPlayStateChange(false);
          return;
        }
      } else {
        const nextTime = Math.min(safeDuration, currentTimeRef.current + deltaSec);
        onTimeChange(nextTime);
        if (nextTime >= safeDuration) {
          onPlayStateChange(false);
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, speed, safeDuration, onTimeChange, onPlayStateChange]);

  const seekTo = (targetSec: number) => {
    const clamped = Math.max(0, Math.min(safeDuration, targetSec));
    onTimeChange(clamped);
    const el = audioRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) {
      el.currentTime = clamped % el.duration;
    }
  };

  const handleTrackPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * safeDuration;
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
  };

  const progressPct = Math.max(0, Math.min(100, (currentTime / safeDuration) * 100));

  return (
    <div className="cs-surface sticky top-13 z-20 rounded-xl border border-zinc-200/90 bg-white/95 px-4 py-2.5 shadow-xs backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          loop={Boolean(audioUrl)}
          preload="metadata"
        />
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        {/* Transport Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => seekTo(currentTime - 10)}
            aria-label="Skip back 10 seconds"
            title="Back 10s"
            className="flex h-8 items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono text-[10px] tabular-nums">10</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (currentTime >= safeDuration) {
                seekTo(0);
              }
              onPlayStateChange(!isPlaying);
            }}
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            className="cs-accent-btn flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4 translate-x-0.5 fill-current" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => seekTo(currentTime + 10)}
            aria-label="Skip forward 10 seconds"
            title="Forward 10s"
            className="flex h-8 items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            <span className="font-mono text-[10px] tabular-nums">10</span>
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Speaker-Diarized Waveform Scrubber */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-12 text-right font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200 shrink-0">
            {formatDuration(currentTime)}
          </span>

          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Audio playback position"
            aria-valuemin={0}
            aria-valuemax={safeDuration}
            aria-valuenow={Math.round(currentTime)}
            onClick={(e) => {
              const t = handleTrackPointer(e.clientX);
              if (t !== undefined) seekTo(t);
            }}
            onMouseMove={(e) => {
              const t = handleTrackPointer(e.clientX);
              if (t !== undefined) setHoverTime(t);
            }}
            onMouseLeave={() => setHoverTime(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                seekTo(currentTime + 5);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                seekTo(currentTime - 5);
              }
            }}
            className="group relative flex h-9 flex-1 cursor-pointer items-center gap-[2px] rounded-md px-0.5 focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            {waveformBars.map((bar, idx) => {
              const passed = bar.time <= currentTime;
              const isNearHover =
                hoverTime !== null && Math.abs(bar.time - hoverTime) < safeDuration / BAR_COUNT;
              return (
                <span
                  key={idx}
                  className="flex-1 rounded-full transition-opacity duration-100"
                  style={{
                    height: `${bar.heightPct}%`,
                    backgroundColor: bar.color,
                    opacity: isNearHover ? 1 : passed ? 0.92 : 0.25,
                  }}
                />
              );
            })}

            {/* Playhead Hairline */}
            <div
              className="pointer-events-none absolute top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 rounded-full bg-zinc-900 dark:bg-white"
              style={{ left: `${progressPct}%` }}
            />

            {/* Hover Timestamp + Speaker Tooltip */}
            {hoverTime !== null && (
              <div
                className="pointer-events-none absolute -top-8 flex -translate-x-1/2 items-center gap-1.5 rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white shadow-md whitespace-nowrap dark:bg-zinc-100 dark:text-zinc-900"
                style={{
                  left: `${Math.max(8, Math.min(92, (hoverTime / safeDuration) * 100))}%`,
                }}
              >
                <span className="font-mono tabular-nums">{formatDuration(hoverTime)}</span>
                {hoverSpeakerName && (
                  <>
                    <span className="opacity-50" aria-hidden="true">·</span>
                    <span className="max-w-[140px] truncate">{hoverSpeakerName}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <span className="w-12 font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
            {formatDuration(safeDuration)}
          </span>
        </div>

        {/* Captions, Speed & Mute Controls */}
        <div className="flex items-center justify-end gap-1.5 shrink-0">
          {transcript.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCaptions((c) => !c)}
              aria-pressed={showCaptions}
              title={showCaptions ? 'Hide live captions' : 'Show live captions'}
              aria-label={showCaptions ? 'Hide live captions' : 'Show live captions'}
              className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                showCaptions
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-400'
              }`}
            >
              <Captions className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">CC</span>
            </button>
          )}

          <button
            type="button"
            onClick={cycleSpeed}
            aria-label={`Playback speed ${speed}x`}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-xs font-medium tabular-nums text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {speed}x
          </button>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            {muted ? (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Live Synced Caption Strip */}
      {showCaptions && activeSegment && (
        <div className="mt-2 flex items-baseline gap-2 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-800/80">
          {activeSpeaker && (
            <span
              className="shrink-0 font-semibold"
              style={{ color: activeSpeaker.color }}
            >
              {activeSpeaker.name}:
            </span>
          )}
          <p className="line-clamp-1 flex-1 text-zinc-700 dark:text-zinc-300">
            {activeSegment.text}
          </p>
        </div>
      )}
    </div>
  );
}
