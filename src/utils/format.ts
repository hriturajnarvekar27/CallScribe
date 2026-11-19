import { JobStatus } from '../types';

export const LANGUAGE_LABELS: Record<string, string> = {
  auto: 'Auto-detect',
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  mr: 'Marathi (मराठी)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
};

export const DISTINCT_SPEAKER_COLORS = [
  '#6366F1', // Indigo
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Violet
  '#F97316', // Orange
  '#14B8A6', // Teal
];

export function getDistinctSpeakerColor(index: number): string {
  return DISTINCT_SPEAKER_COLORS[index % DISTINCT_SPEAKER_COLORS.length];
}

/**
 * Extracts crisp 1-2 letter initials from speaker names like:
 * - "Speaker 1 (Maya Lin)" -> "ML"
 * - "Maya Lin (Partner)" -> "ML"
 * - "Priya Deshmukh" -> "PD"
 * - "Speaker 2" -> "S2"
 */
export function getSpeakerInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return '?';

  // Prefer name inside parentheses if prefixed with "Speaker N (...)"
  const parenMatch = cleaned.match(/^Speaker\s*\d*\s*\(([^)]+)\)/i);
  const target = (parenMatch ? parenMatch[1] : cleaned)
    .replace(/\([^)]*\)/g, '')
    .trim();

  const speakerNumMatch = target.match(/^Speaker\s*(\d+)$/i);
  if (speakerNumMatch) {
    return `S${speakerNumMatch[1]}`;
  }

  const words = target.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase();
}

export function getLanguageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatTimestamp(seconds: number): string {
  return formatDuration(seconds);
}

export function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `Yesterday, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDays < 7 && diffDays > 1) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function isProcessingStatus(status: JobStatus): boolean {
  return (
    status === 'queued' ||
    status === 'extracting_audio' ||
    status === 'transcribing' ||
    status === 'analyzing'
  );
}

export function getStatusLabel(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'extracting_audio':
      return 'Extracting audio';
    case 'transcribing':
      return 'Transcribing';
    case 'analyzing':
      return 'Analyzing';
    case 'done':
      return 'Done';
    case 'failed':
      return 'Failed';
  }
}

export function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
}
