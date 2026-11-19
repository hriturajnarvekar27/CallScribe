import React from 'react';

interface EmptyStateIllustrationProps {
  variant?: 'library' | 'search';
}

export function EmptyStateIllustration({ variant = 'library' }: EmptyStateIllustrationProps) {
  return (
    <svg
      width="112"
      height="88"
      viewBox="0 0 112 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="mx-auto text-zinc-300 dark:text-zinc-700"
    >
      <rect
        x="14"
        y="12"
        width="84"
        height="64"
        rx="10"
        className="fill-white stroke-zinc-200 dark:fill-zinc-900 dark:stroke-zinc-800"
        strokeWidth="1.5"
      />
      <rect
        x="24"
        y="24"
        width="32"
        height="6"
        rx="3"
        className="fill-indigo-100 dark:fill-indigo-950"
      />
      <rect
        x="24"
        y="36"
        width="64"
        height="4"
        rx="2"
        className="fill-zinc-200 dark:fill-zinc-800"
      />
      <rect
        x="24"
        y="45"
        width="52"
        height="4"
        rx="2"
        className="fill-zinc-200 dark:fill-zinc-800"
      />
      <rect
        x="24"
        y="54"
        width="40"
        height="4"
        rx="2"
        className="fill-zinc-200 dark:fill-zinc-800"
      />
      {variant === 'library' ? (
        <g>
          <circle
            cx="84"
            cy="60"
            r="16"
            className="fill-indigo-600 dark:fill-indigo-500"
          />
          <path
            d="M84 53V67M77 60H91"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g>
          <circle
            cx="82"
            cy="58"
            r="15"
            className="fill-zinc-100 stroke-indigo-500 dark:fill-zinc-800 dark:stroke-indigo-400"
            strokeWidth="2"
          />
          <circle
            cx="80.5"
            cy="56.5"
            r="5.5"
            className="stroke-indigo-600 dark:stroke-indigo-400"
            strokeWidth="1.75"
          />
          <path
            d="M84.5 60.5L88.5 64.5"
            className="stroke-indigo-600 dark:stroke-indigo-400"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}
