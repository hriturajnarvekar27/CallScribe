export type JobStatus =
  | 'queued'
  | 'extracting_audio'
  | 'transcribing'
  | 'analyzing'
  | 'done'
  | 'failed';

export type ExportFormat = 'docx' | 'pdf' | 'md' | 'txt' | 'srt' | 'vtt';

export type RegenerateSection = 'summary' | 'notes' | 'analysis';

export type SentimentType = 'positive' | 'neutral' | 'negative';

export type SubtitleFormat = 'srt' | 'vtt';

export type ThemeMode =
  | 'dark'
  | 'light'
  | 'amoled-cyan'
  | 'amoled-violet'
  | 'amoled-emerald'
  | 'system';

export type LiveBackgroundMode =
  | 'aurora'
  | 'waves'
  | 'particles'
  | 'grid'
  | 'off';

export type SortOption = 'newest' | 'longest' | 'title';

export type FilterStatus = 'all' | 'processing' | 'done' | 'failed';

export type LibraryViewMode = 'list' | 'grid';

export type DateRangeFilter = 'all' | 'today' | '7d' | '30d';

export interface Speaker {
  id: string;
  name: string;
  color: string;
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  speakerId: string;
  text: string;
}

export interface NoteSection {
  heading: string;
  bullets: string[];
}

export interface JobAnalysis {
  sentiment: SentimentType;
  sentimentNote: string;
  topics: string[];
  decisions: string[];
  concerns: string[];
  risks: string[];
  nextSteps: string[];
}

export interface Job {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number;
  language: string;
  status: JobStatus;
  progress: number;
  error?: string;
  audioUrl?: string;
  client?: string;
  tags?: string[];
  pinned?: boolean;
  speakers: Speaker[];
  transcript?: TranscriptSegment[];
  summary?: string;
  keyPoints?: string[];
  notes?: NoteSection[];
  analysis?: JobAnalysis;
}

export interface OutputSelections {
  summary: boolean;
  notes: boolean;
  analysis: boolean;
  subtitles: boolean;
}

export interface UploadJobPayload {
  file: File;
  title: string;
  language: string;
  speakers: string;
  outputs: OutputSelections;
  context: string;
}

export interface AppSettings {
  defaultLanguage: string;
  defaultOutputs: OutputSelections;
  defaultSubtitleFormat: SubtitleFormat;
  subtitleIncludeSpeakers: boolean;
  theme: ThemeMode;
  liveBackground: LiveBackgroundMode;
  apiBaseUrl: string;
}

export interface NotificationItem {
  id: string;
  type: 'job_done' | 'job_failed' | 'mention';
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  jobId?: string;
}

export interface UploadTask {
  id: string;
  file: File;
  title: string;
  language: string;
  speakers: string;
  outputs: OutputSelections;
  context: string;
  progress: number;
  status: 'uploading' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: string;
  jobId?: string;
}

export interface WorkspaceOption {
  id: string;
  name: string;
  plan: string;
  hoursUsed: number;
  hoursLimit: number;
}

export type AppRoute =
  | { view: 'dashboard' }
  | { view: 'library' }
  | { view: 'job'; jobId: string; seekTo?: number }
  | { view: 'settings' };
