import React from 'react';
import { UploadCloud } from 'lucide-react';

interface GlobalDropOverlayProps {
  visible: boolean;
}

export function GlobalDropOverlay({ visible }: GlobalDropOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm"
      aria-hidden="true"
    >
      <div className="cs-neon-ring flex w-full max-w-md flex-col items-center rounded-2xl border-2 border-dashed border-indigo-400 bg-zinc-900/95 px-8 py-12 text-center shadow-2xl">
        <div className="cs-accent-btn flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg">
          <UploadCloud className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">
          Drop recordings to transcribe
        </h2>
        <p className="mt-1 text-xs text-zinc-400">
          Release MP4, MOV, MKV, WebM, MP3, M4A, or WAV files anywhere
        </p>
      </div>
    </div>
  );
}
