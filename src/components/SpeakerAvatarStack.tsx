import React from 'react';
import { Speaker } from '../types';
import { getDistinctSpeakerColor, getSpeakerInitials } from '../utils/format';

interface SpeakerAvatarStackProps {
  speakers: Speaker[];
  maxVisible?: number;
  size?: 'sm' | 'md';
}

export function SpeakerAvatarStack({
  speakers,
  maxVisible = 3,
  size = 'sm',
}: SpeakerAvatarStackProps) {
  if (!speakers || speakers.length === 0) return null;

  const visible = speakers.slice(0, maxVisible);
  const overflow = speakers.length - visible.length;
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-[11px]';

  return (
    <div
      className="flex items-center -space-x-1.5"
      aria-label={`Speakers: ${speakers.map((s) => s.name).join(', ')}`}
    >
      {visible.map((spk, idx) => {
        const bg = spk.color || getDistinctSpeakerColor(idx);
        const initials = getSpeakerInitials(spk.name);
        return (
          <span
            key={spk.id}
            title={spk.name}
            className={`flex ${dim} items-center justify-center rounded-full border-2 border-white font-semibold text-white shadow-2xs transition-transform hover:z-10 hover:scale-105 dark:border-zinc-900`}
            style={{ backgroundColor: bg }}
          >
            {initials}
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          title={`${overflow} more ${overflow === 1 ? 'speaker' : 'speakers'}`}
          className={`flex ${dim} items-center justify-center rounded-full border-2 border-white bg-zinc-200 font-mono font-semibold text-zinc-700 dark:border-zinc-900 dark:bg-zinc-800 dark:text-zinc-200`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
