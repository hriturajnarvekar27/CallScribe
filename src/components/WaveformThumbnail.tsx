import React, { useMemo } from 'react';
import { Speaker } from '../types';

interface WaveformThumbnailProps {
  jobId: string;
  speakers?: Speaker[];
  isProcessing?: boolean;
  isFailed?: boolean;
}

export function WaveformThumbnail({
  jobId,
  isProcessing = false,
  isFailed = false,
}: WaveformThumbnailProps) {
  const bars = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < jobId.length; i++) {
      hash = (hash * 31 + jobId.charCodeAt(i)) | 0;
    }
    const count = 42;
    return Array.from({ length: count }, (_, idx) => {
      const seed = Math.abs(Math.sin(hash + idx * 1.73) * 43758.5453) % 1;
      const heightPct = Math.round(20 + seed * 76);
      const color = isFailed ? '#f43f5e' : '#6366f1';
      return { heightPct, color };
    });
  }, [jobId, isFailed]);

  return (
    <div
      className="flex h-12 w-full items-center gap-[2px] rounded-lg border border-zinc-200/70 bg-zinc-50/80 px-2.5 dark:border-zinc-800/80 dark:bg-zinc-950/70"
      aria-hidden="true"
    >
      {bars.map((bar, idx) => (
        <span
          key={idx}
          className={`flex-1 rounded-full transition-all ${
            isProcessing ? 'animate-pulse' : ''
          }`}
          style={{
            height: `${bar.heightPct}%`,
            backgroundColor: bar.color,
            opacity: isFailed ? 0.45 : isProcessing ? 0.65 : 0.78,
          }}
        />
      ))}
    </div>
  );
}
