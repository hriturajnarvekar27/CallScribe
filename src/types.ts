export type JobStatus =
  | 'queued'
  | 'extracting_audio'
  | 'transcribing'
  | 'diarizing'
  | 'aligning'
  | 'analyzing'
  | 'done'
  | 'failed'
  | 'cancelled';

export type ExportFormat = 'docx' | 'pdf' | 'md' | 'txt' | 'srt' | 'vtt';

export type AudioFormat = 'mp3' | 'wav';

export type RegenerateSection = 'summary' | 'notes' | 'analysis';

export type SentimentType = 'positive' | 'neutral' | 'negative';

export type SubtitleFormat = 'srt' | 'vtt';

export type TranscriptViewMode = 'transcript' | 'timestamped';

export interface ExportOptions {
  includeTimestamps?: boolean;
  includeSpeakers?: boolean;
  offsetSec?: number;
}

export type BookmarkCategory = 'important' | 'question' | 'decision' | 'follow-up' | 'note';

export type ThemeMode =
  | 'dark'
  | 'light'
  | 'light-warm'
  | 'light-ocean'
  | 'midnight-indigo'
  | 'forest-moss'
  | 'obsidian-rose'
  | 'amoled-cyan'
  | 'amoled-violet'
  | 'amoled-emerald'
  | 'amoled-amber'
  | 'amoled-crimson'
  | 'system';

export type LiveBackgroundMode =
  | 'aurora'
  | 'waves'
  | 'particles'
  | 'grid'
  | 'starfield'
  | 'rain'
  | 'fireflies'
  | 'topography'
  | 'pokemon'
  | 'animals'
  | 'aquarium'
  | 'custom'
  | 'off';

export type CustomBackgroundBaseStyle = 'gradient' | 'radial' | 'solid' | 'image';
export type CustomBackgroundPattern = 'none' | 'dots' | 'grid' | 'diagonal' | 'rings';
export type CustomBackgroundMotion =
  | 'none'
  | 'aurora'
  | 'particles'
  | 'waves'
  | 'fireflies'
  | 'starfield';

export interface CustomBackgroundConfig {
  baseStyle: CustomBackgroundBaseStyle;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  angleDeg: number;
  pattern: CustomBackgroundPattern;
  motion: CustomBackgroundMotion;
  imageDataUrl: string;
  imageBlurPx: number;
  imageDimPercent: number;
}

export interface UserProfile {
  displayName: string;
  email: string;
  role: string;
  organization: string;
  bio: string;
  timezone: string;
  avatarUrl: string;
  avatarColor: string;
}

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
  confidence?: number;
  uncertain?: boolean;
}

export interface NoteSection {
  heading: string;
  bullets: string[];
}

export interface Bookmark {
  id: string;
  timeSec: number;
  category: BookmarkCategory;
  label: string;
  note?: string;
  createdAt?: string;
}

export interface ActionItem {
  id: string;
  task: string;
  owner?: string;
  deadline?: string;
  timestampSec?: number;
  completed: boolean;
}

export interface JobAnalysis {
  sentiment: SentimentType;
  sentimentNote: string;
  topics: string[];
  decisions: string[];
  concerns: string[];
  risks: string[];
  nextSteps: string[];
  questionsRaised?: string[];
}

export interface Job {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number;
  language: string;
  status: JobStatus;
  progress: number;
  stageMessage?: string;
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
  bookmarks?: Bookmark[];
  actionItems?: ActionItem[];
}

export interface OutputSelections {
  summary: boolean;
  notes: boolean;
  analysis: boolean;
  subtitles: boolean;
}

export interface DiarizeSpeakersResult {
  speakers: Speaker[];
  transcript: TranscriptSegment[];
  reasoning: string;
  changedCount: number;
}

export interface AiSummarizeResult {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  questionsRaised: string[];
  actionItems: ActionItem[];
  followUps: string[];
}

export interface TranscriptSearchHit {
  jobId: string;
  jobTitle: string;
  segmentId: string;
  speakerId: string;
  speakerName: string;
  start: number;
  end: number;
  text: string;
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
  defaultTranscriptMode: TranscriptViewMode;
  exportIncludeTimestamps: boolean;
  exportIncludeSpeakers: boolean;
  theme: ThemeMode;
  liveBackground: LiveBackgroundMode;
  backgroundOpacity: number;
  backgroundSpeed: number;
  customBackground: CustomBackgroundConfig;
  apiBaseUrl: string;
  diarizationConfidenceThreshold: number;
  autoFlagUncertainSpeakers: boolean;
  enableCloudAi: boolean;
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
  supportsPause?: boolean;
  error?: string;
  jobId?: string;
}

export type AppRoute =
  | { view: 'dashboard' }
  | { view: 'library' }
  | { view: 'job'; jobId: string; seekTo?: number }
  | { view: 'profile' }
  | { view: 'settings' };
