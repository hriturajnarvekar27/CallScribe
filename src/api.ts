import { createInitialMockJobs } from './mockData';
import {
  ActionItem,
  AiSummarizeResult,
  AppSettings,
  AudioFormat,
  Bookmark,
  CustomBackgroundConfig,
  DiarizeSpeakersResult,
  ExportFormat,
  ExportOptions,
  Job,
  JobAnalysis,
  JobStatus,
  NoteSection,
  RegenerateSection,
  Speaker,
  TranscriptSearchHit,
  TranscriptSegment,
  TranscriptViewMode,
  UploadJobPayload,
  UserProfile,
} from './types';
import { extractAudioWavFromFile, triggerBlobDownload } from './utils/audioExtract';
import { downloadMockExport } from './utils/exportMock';
import { getDistinctSpeakerColor, validateMediaFile } from './utils/format';
import { getMockAudioUrl } from './utils/mockAudio';

const SETTINGS_STORAGE_KEY = 'callscribe_settings_v2';

export class ApiError extends Error {
  readonly status?: number;
  readonly isAborted: boolean;
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    status?: number,
    options?: { isAborted?: boolean; isNetworkError?: boolean }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isAborted = Boolean(options?.isAborted);
    this.isNetworkError = Boolean(options?.isNetworkError);
  }
}

const VALID_TRANSCRIPT_MODES = new Set<TranscriptViewMode>([
  'transcript',
  'timestamped',
]);

const PROFILE_STORAGE_KEY = 'callscribe_profile_v1';

export const DEFAULT_CUSTOM_BACKGROUND: CustomBackgroundConfig = {
  baseStyle: 'gradient',
  primaryColor: '#4f46e5',
  secondaryColor: '#06b6d4',
  tertiaryColor: '#ec4899',
  angleDeg: 135,
  pattern: 'dots',
  motion: 'aurora',
  imageDataUrl: '',
  imageBlurPx: 4,
  imageDimPercent: 45,
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultLanguage: 'auto',
  defaultOutputs: {
    summary: true,
    notes: true,
    analysis: true,
    subtitles: true,
  },
  defaultSubtitleFormat: 'srt',
  subtitleIncludeSpeakers: false,
  defaultTranscriptMode: 'transcript',
  exportIncludeTimestamps: true,
  exportIncludeSpeakers: false,
  theme: 'dark',
  liveBackground: 'aurora',
  backgroundOpacity: 100,
  backgroundSpeed: 1,
  customBackground: DEFAULT_CUSTOM_BACKGROUND,
  apiBaseUrl: '',
  diarizationConfidenceThreshold: 0.55,
  autoFlagUncertainSpeakers: false,
  enableCloudAi: true,
};

export function loadStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const cb = parsed.customBackground;
    return {
      defaultLanguage: parsed.defaultLanguage ?? DEFAULT_SETTINGS.defaultLanguage,
      defaultOutputs: {
        summary: parsed.defaultOutputs?.summary ?? DEFAULT_SETTINGS.defaultOutputs.summary,
        notes: parsed.defaultOutputs?.notes ?? DEFAULT_SETTINGS.defaultOutputs.notes,
        analysis: parsed.defaultOutputs?.analysis ?? DEFAULT_SETTINGS.defaultOutputs.analysis,
        subtitles: parsed.defaultOutputs?.subtitles ?? DEFAULT_SETTINGS.defaultOutputs.subtitles,
      },
      defaultSubtitleFormat: parsed.defaultSubtitleFormat ?? DEFAULT_SETTINGS.defaultSubtitleFormat,
      subtitleIncludeSpeakers: false,
      defaultTranscriptMode:
        parsed.defaultTranscriptMode && VALID_TRANSCRIPT_MODES.has(parsed.defaultTranscriptMode)
          ? parsed.defaultTranscriptMode
          : DEFAULT_SETTINGS.defaultTranscriptMode,
      exportIncludeTimestamps:
        typeof parsed.exportIncludeTimestamps === 'boolean'
          ? parsed.exportIncludeTimestamps
          : DEFAULT_SETTINGS.exportIncludeTimestamps,
      exportIncludeSpeakers: false,
      theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
      liveBackground: parsed.liveBackground ?? DEFAULT_SETTINGS.liveBackground,
      backgroundOpacity:
        typeof parsed.backgroundOpacity === 'number' && Number.isFinite(parsed.backgroundOpacity)
          ? Math.max(20, Math.min(100, Math.round(parsed.backgroundOpacity)))
          : DEFAULT_SETTINGS.backgroundOpacity,
      backgroundSpeed:
        typeof parsed.backgroundSpeed === 'number' && Number.isFinite(parsed.backgroundSpeed)
          ? Math.max(0.25, Math.min(2.0, parsed.backgroundSpeed))
          : DEFAULT_SETTINGS.backgroundSpeed,
      customBackground: {
        baseStyle: cb?.baseStyle ?? DEFAULT_CUSTOM_BACKGROUND.baseStyle,
        primaryColor: cb?.primaryColor ?? DEFAULT_CUSTOM_BACKGROUND.primaryColor,
        secondaryColor: cb?.secondaryColor ?? DEFAULT_CUSTOM_BACKGROUND.secondaryColor,
        tertiaryColor: cb?.tertiaryColor ?? DEFAULT_CUSTOM_BACKGROUND.tertiaryColor,
        angleDeg:
          typeof cb?.angleDeg === 'number' && Number.isFinite(cb.angleDeg)
            ? Math.max(0, Math.min(360, cb.angleDeg))
            : DEFAULT_CUSTOM_BACKGROUND.angleDeg,
        pattern: cb?.pattern ?? DEFAULT_CUSTOM_BACKGROUND.pattern,
        motion: cb?.motion ?? DEFAULT_CUSTOM_BACKGROUND.motion,
        imageDataUrl: typeof cb?.imageDataUrl === 'string' ? cb.imageDataUrl : '',
        imageBlurPx:
          typeof cb?.imageBlurPx === 'number' && Number.isFinite(cb.imageBlurPx)
            ? Math.max(0, Math.min(24, cb.imageBlurPx))
            : DEFAULT_CUSTOM_BACKGROUND.imageBlurPx,
        imageDimPercent:
          typeof cb?.imageDimPercent === 'number' && Number.isFinite(cb.imageDimPercent)
            ? Math.max(0, Math.min(85, cb.imageDimPercent))
            : DEFAULT_CUSTOM_BACKGROUND.imageDimPercent,
      },
      apiBaseUrl: parsed.apiBaseUrl ?? DEFAULT_SETTINGS.apiBaseUrl,
      diarizationConfidenceThreshold:
        typeof parsed.diarizationConfidenceThreshold === 'number' &&
        Number.isFinite(parsed.diarizationConfidenceThreshold)
          ? Math.max(0.35, Math.min(0.85, parsed.diarizationConfidenceThreshold))
          : DEFAULT_SETTINGS.diarizationConfidenceThreshold,
      autoFlagUncertainSpeakers:
        typeof parsed.autoFlagUncertainSpeakers === 'boolean'
          ? parsed.autoFlagUncertainSpeakers
          : DEFAULT_SETTINGS.autoFlagUncertainSpeakers,
      enableCloudAi:
        typeof parsed.enableCloudAi === 'boolean'
          ? parsed.enableCloudAi
          : DEFAULT_SETTINGS.enableCloudAi,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: 'Eren Yeager',
  email: 'yeagereren2777@gmail.com',
  role: 'Workspace Owner',
  organization: 'CallScribe Studio',
  bio: 'Client meetings, engineering syncs, and structured call documentation.',
  timezone: getBrowserTimezone(),
  avatarUrl: '',
  avatarColor: '#4f46e5',
};

export function loadStoredProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PROFILE;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      displayName: parsed.displayName?.trim() || DEFAULT_USER_PROFILE.displayName,
      email: parsed.email?.trim() || DEFAULT_USER_PROFILE.email,
      role: parsed.role ?? DEFAULT_USER_PROFILE.role,
      organization: parsed.organization ?? DEFAULT_USER_PROFILE.organization,
      bio: parsed.bio ?? DEFAULT_USER_PROFILE.bio,
      timezone: parsed.timezone || DEFAULT_USER_PROFILE.timezone,
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : '',
      avatarColor: parsed.avatarColor || DEFAULT_USER_PROFILE.avatarColor,
    };
  } catch {
    return DEFAULT_USER_PROFILE;
  }
}

export function saveStoredProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota errors
  }
}

export function getEnvApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';
}

export interface ApiBaseUrlValidation {
  valid: boolean;
  normalized: string;
  error?: string;
}

export function validateApiBaseUrl(raw: string): ApiBaseUrlValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, normalized: '' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Invalid API base URL. Expected an http:// or https:// URL (e.g. https://api.example.com).',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalized: trimmed,
      error: 'API base URL must use http:// or https://.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'API base URL must not embed credentials.',
    };
  }

  if (parsed.search || parsed.hash) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'API base URL must not contain query parameters or hash fragments.',
    };
  }

  const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  return { valid: true, normalized };
}

export function getEffectiveApiBaseUrl(): string {
  const settings = loadStoredSettings();
  const override = settings.apiBaseUrl.trim();
  const base = override || getEnvApiBaseUrl();
  if (!base) return '';
  const checked = validateApiBaseUrl(base);
  return checked.valid ? checked.normalized : base.replace(/\/+$/, '');
}

export function isMockMode(): boolean {
  return getEffectiveApiBaseUrl() === '';
}

function requireValidatedApiBaseUrl(): string {
  const raw = getEffectiveApiBaseUrl();
  if (!raw) {
    throw new ApiError('Live API base URL is not configured.');
  }
  const checked = validateApiBaseUrl(raw);
  if (!checked.valid) {
    throw new ApiError(checked.error ?? 'Invalid API base URL configured.');
  }
  return checked.normalized;
}

// ---------------------------------------------------------------------------
// Mock Engine (active when VITE_API_BASE_URL & local override are empty)
// ---------------------------------------------------------------------------

interface MockJobLifecycle {
  startedAt: number;
  durationMs: number;
  initialProgress: number;
  context?: string;
}

let mockJobs: Job[] = createInitialMockJobs();
const mockLifecycles = new Map<string, MockJobLifecycle>();
const mockUploadedFiles = new Map<string, File>();
const mockObjectUrls = new Map<string, string>();

// Register the 2 initial processing jobs so they advance in real time:
// 1) "transcribing" at ~40%
// 2) "queued" at ~6%
mockLifecycles.set('job-kestrel-roadmap', {
  startedAt: Date.now(),
  durationMs: 24000,
  initialProgress: 40,
});
mockLifecycles.set('job-northstar-renewal', {
  startedAt: Date.now(),
  durationMs: 30000,
  initialProgress: 6,
});

function buildCompletedMockContent(job: Job, context?: string): Partial<Job> {
  const isMarathi = job.language === 'mr';
  const isHindi = job.language === 'hi';

  if (isMarathi) {
    const transcript: TranscriptSegment[] = [
      {
        id: `${job.id}-s1`,
        start: 0,
        end: 52,
        speakerId: 'spk-1',
        text: 'नमस्कार, कॉल जॉईन केल्याबद्दल धन्यवाद. आज आपण नॉर्थस्टार रिटेलच्या वार्षिक सीट विस्ताराबाबत आणि मराठी सपोर्ट चॅनेलच्या अटींवर चर्चा करणार आहोत.',
      },
      {
        id: `${job.id}-s2`,
        start: 53,
        end: 118,
        speakerId: 'spk-2',
        text: 'नमस्कार! आमच्या पुणे आणि मुंबई शाखांमधील ४५ नवीन स्टोअर व्यवस्थापकांसाठी पुढील महिन्यापासून परवाने हवे आहेत. वार्षिक बिलावर काय सवलत मिळेल?',
      },
      {
        id: `${job.id}-s3`,
        start: 119,
        end: 185,
        speakerId: 'spk-1',
        text: '४५ अतिरिक्त सीट्ससाठी आम्ही १८% वार्षिक व्हॉल्यूम डिस्काउंट देऊ शकतो आणि सर्व स्टोअर्ससाठी मराठी भाषेतील प्राधान्य सपोर्ट समाविष्ट असेल.',
      },
      {
        id: `${job.id}-s4`,
        start: 186,
        end: 248,
        speakerId: 'spk-2',
        text: 'छान. कृपया उद्यापर्यंत सुधारित कोटेशन पाठवा जेणेकरून आमची फायनान्स टीम या आठवड्यात मंजुरी देऊ शकेल.',
      },
    ];
    return {
      audioUrl: job.audioUrl ?? getMockAudioUrl(),
      speakers: [
        { id: 'spk-1', name: 'Rohan Joshi', color: getDistinctSpeakerColor(0) },
        { id: 'spk-2', name: 'Sneha Kulkarni', color: getDistinctSpeakerColor(1) },
      ],
      transcript,
      summary:
        'नॉर्थस्टार रिटेलने पुणे आणि मुंबई शाखांसाठी ४५ अतिरिक्त सीट्सच्या वार्षिक विस्तारावर चर्चा केली. १८% व्हॉल्यूम सवलत आणि मराठी भाषेतील प्राधान्य सपोर्टवर सहमती झाली.',
      keyPoints: [
        'पुणे व मुंबई शाखांसाठी ४५ नवीन स्टोअर व्यवस्थापक परवाने मंजूर.',
        'वार्षिक करारावर १८% व्हॉल्यूम डिस्काउंट लागू.',
        'मराठी प्राधान्य सपोर्ट चॅनेल पुढील महिन्यापासून सक्रिय होणार.',
      ],
      notes: [
        {
          heading: 'व्यावसायिक अटी आणि विस्तार',
          bullets: [
            '४५ नवीन सीट्ससाठी वार्षिक बिलिंग चक्र १ डिसेंबरपासून सुरू होईल.',
            'मराठी UI व ऑनबोर्डिंग मार्गदर्शिका उपलब्ध करून दिली जाईल.',
          ],
        },
      ],
      analysis: {
        sentiment: 'positive',
        sentimentNote: 'Smooth expansion discussion with clear commercial agreement.',
        topics: ['Seat Expansion', 'Volume Discount', 'Marathi Support', 'Annual Renewal'],
        decisions: ['Agreed on 18% annual volume discount for 45 additional licenses.'],
        concerns: ['Need finance approval within the current week to hit Dec 1 rollout.'],
        risks: ['Delayed PO processing could postpone branch onboarding by one week.'],
        nextSteps: ['Deliver updated order form tomorrow.', 'Schedule store manager training.'],
      },
    };
  }

  const singleSpeaker = job.speakers.length === 1;
  const contextSuffix = context?.trim() ? ` Context noted: "${context.trim()}".` : '';
  const speaker1Name = job.speakers[0]?.name || (isHindi ? 'Priya Deshmukh' : 'Nadia Vance');
  const speaker2Name = singleSpeaker
    ? speaker1Name
    : job.speakers[1]?.name || (isHindi ? 'Vikram Rao' : 'Liam O’Connor');

  const transcript: TranscriptSegment[] = [
    {
      id: `${job.id}-s1`,
      start: 0,
      end: 44,
      speakerId: 'spk-1',
      text: `Thanks for making time today to review "${job.title}". Let's align on priorities, commercial milestones, and any open blockers before next sprint.`,
    },
    {
      id: `${job.id}-s2`,
      start: 45,
      end: 98,
      speakerId: singleSpeaker ? 'spk-1' : 'spk-2',
      text: 'Our main goal this quarter is reducing onboarding time for enterprise workspaces while keeping audit trails intact. Pricing predictability matters most to our finance lead.',
    },
    {
      id: `${job.id}-s3`,
      start: 99,
      end: 158,
      speakerId: 'spk-1',
      text: 'Makes complete sense. We can phase the rollout into two clean milestones: core workspace provisioning in Week 3, followed by automated reporting and SSO enforcement in Week 6.',
    },
    {
      id: `${job.id}-s4`,
      start: 159,
      end: 214,
      speakerId: singleSpeaker ? 'spk-1' : 'spk-2',
      text: 'Let us lock Week 3 for the pilot cohort of 12 team leads and circulate the security checklist tomorrow morning.',
    },
  ];

  return {
    audioUrl: job.audioUrl ?? getMockAudioUrl(),
    speakers: singleSpeaker
      ? [{ id: 'spk-1', name: speaker1Name, color: job.speakers[0]?.color ?? getDistinctSpeakerColor(0) }]
      : [
          { id: 'spk-1', name: speaker1Name, color: job.speakers[0]?.color ?? getDistinctSpeakerColor(0) },
          { id: 'spk-2', name: speaker2Name, color: job.speakers[1]?.color ?? getDistinctSpeakerColor(1) },
        ],
    transcript,
    summary: `Both teams aligned on a two-phase rollout for ${job.title}, targeting an initial 12-user pilot cohort in Week 3 and full SSO/reporting launch in Week 6.${contextSuffix}`,
    keyPoints: [
      'Two-phase rollout agreed: core provisioning in Week 3, SSO and reporting in Week 6.',
      '12 team leads nominated for the initial pilot cohort.',
      'Predictable milestone pricing prioritized to streamline CFO sign-off.',
    ],
    notes: [
      {
        heading: 'Rollout Milestones & Scope',
        bullets: [
          'Phase 1 (Week 3): Workspace provisioning and pilot onboarding.',
          'Phase 2 (Week 6): Automated audit reporting and SAML SSO enforcement.',
        ],
      },
      {
        heading: 'Commercial & Security Alignment',
        bullets: [
          'Fixed milestone schedule preferred by finance stakeholders.',
          'Security questionnaire due for review tomorrow morning.',
        ],
      },
    ],
    analysis: {
      sentiment: 'positive',
      sentimentNote: 'Collaborative alignment on phased delivery and clear pilot scope.',
      topics: ['Phased Rollout', 'Enterprise Onboarding', 'Milestone Pricing', 'SSO Security'],
      decisions: ['Adopted a 2-milestone delivery plan starting with a 12-lead Week 3 pilot.'],
      concerns: ['Finance requires strict pricing predictability before expanding seats.'],
      risks: ['Delayed security checklist review could slip the Week 3 pilot start.'],
      nextSteps: ['Circulate security checklist.', 'Confirm pilot cohort kickoff date.'],
    },
  };
}

function advanceMockJobs(): void {
  const now = Date.now();
  mockJobs = mockJobs.map((job) => {
    const lifecycle = mockLifecycles.get(job.id);
    if (!lifecycle) return job;

    const elapsed = now - lifecycle.startedAt;
    const ratio = Math.min(1, elapsed / lifecycle.durationMs);
    const progress = Math.min(
      100,
      Math.round(lifecycle.initialProgress + (100 - lifecycle.initialProgress) * ratio)
    );

    let status: JobStatus = job.status;
    let stageMessage: string | undefined;
    if (progress >= 100) {
      status = 'done';
      stageMessage = 'Completed transcription and alignment.';
    } else if (progress >= 84) {
      status = 'analyzing';
      stageMessage = 'Extracting structured summary & insights...';
    } else if (progress >= 72) {
      status = 'aligning';
      stageMessage = 'Refining readable segments and timestamps...';
    } else if (progress >= 58) {
      status = 'diarizing';
      stageMessage = 'Formatting paragraphs and sentence flow...';
    } else if (progress >= 30) {
      status = 'transcribing';
      stageMessage = 'Transcribing speech with timestamps...';
    } else if (progress >= 12) {
      status = 'extracting_audio';
      stageMessage = 'Preparing 16 kHz mono audio track...';
    } else {
      status = 'queued';
      stageMessage = 'Queued for local transcription...';
    }

    if (status === 'done') {
      mockLifecycles.delete(job.id);
      const completedFields = buildCompletedMockContent(job, lifecycle.context);
      return {
        ...job,
        ...completedFields,
        status: 'done',
        progress: 100,
        stageMessage,
      };
    }

    return {
      ...job,
      status,
      progress,
      stageMessage,
    };
  });
}

// ---------------------------------------------------------------------------
// Response Validation, Normalization & Error Formatting
// ---------------------------------------------------------------------------

const VALID_JOB_STATUSES = new Set<JobStatus>([
  'queued',
  'extracting_audio',
  'transcribing',
  'diarizing',
  'aligning',
  'analyzing',
  'done',
  'failed',
  'cancelled',
]);

function getDefaultHttpErrorMessage(status: number): string {
  if (status === 400) return 'Invalid request parameters (400).';
  if (status === 404) return 'Recording not found (404).';
  if (status === 413) return 'Uploaded file exceeds the backend size limit (413).';
  if (status === 422) return 'Request validation failed (422).';
  if (status >= 500) return `Server error (${status}). Please try again later.`;
  return `Request failed (${status}).`;
}

function sanitizeErrorText(raw: string): string {
  const withoutTrace = raw
    .split(/\r?\nTraceback \(most recent call last\):/i)[0]
    .split(/\r?\n\s+at\s+/)[0]
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!withoutTrace) return '';
  return withoutTrace.length > 220 ? `${withoutTrace.slice(0, 217)}...` : withoutTrace;
}

function extractErrorMessage(status: number, bodyText: string): string {
  const fallback = getDefaultHttpErrorMessage(status);
  const trimmed = bodyText.trim();
  if (!trimmed) return fallback;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('<!doctype') || lower.startsWith('<html')) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      detail?: unknown;
      error?: unknown;
      message?: unknown;
    };

    if (typeof parsed.detail === 'string') {
      return sanitizeErrorText(parsed.detail) || fallback;
    }

    if (Array.isArray(parsed.detail)) {
      const details = parsed.detail
        .slice(0, 3)
        .map((item) => {
          if (typeof item === 'string') return sanitizeErrorText(item);
          if (item && typeof item === 'object') {
            const entry = item as { loc?: unknown[]; msg?: unknown };
            const locParts = Array.isArray(entry.loc)
              ? entry.loc
                  .filter((p) => p !== 'body' && p !== 'query' && p !== 'path')
                  .map((p) => String(p))
              : [];
            const msg = typeof entry.msg === 'string' ? sanitizeErrorText(entry.msg) : '';
            if (locParts.length > 0 && msg) return `${locParts.join('.')}: ${msg}`;
            return msg;
          }
          return '';
        })
        .filter(Boolean);
      if (details.length > 0) return details.join('; ');
    }

    if (typeof parsed.error === 'string') {
      return sanitizeErrorText(parsed.error) || fallback;
    }
    if (typeof parsed.message === 'string') {
      return sanitizeErrorText(parsed.message) || fallback;
    }
  } catch {
    // Plain text response body
  }

  return sanitizeErrorText(trimmed) || fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeSpeakers(rawSpeakers: unknown): Speaker[] {
  if (!Array.isArray(rawSpeakers)) return [];
  return rawSpeakers
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `spk-${idx + 1}`,
      name:
        typeof item.name === 'string' && item.name.trim()
          ? item.name
          : `Speaker ${idx + 1}`,
      color:
        typeof item.color === 'string' && item.color.trim()
          ? item.color
          : getDistinctSpeakerColor(idx),
    }));
}

function normalizeTranscript(rawTranscript: unknown): TranscriptSegment[] | undefined {
  if (rawTranscript === undefined || rawTranscript === null) return undefined;
  if (!Array.isArray(rawTranscript)) {
    throw new ApiError('Malformed response: job transcript must be an array.');
  }
  return rawTranscript
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `seg-${idx + 1}`,
      start: typeof item.start === 'number' && Number.isFinite(item.start) ? Math.max(0, item.start) : 0,
      end: typeof item.end === 'number' && Number.isFinite(item.end) ? Math.max(0, item.end) : 0,
      speakerId:
        typeof item.speakerId === 'string' && item.speakerId.trim()
          ? item.speakerId
          : 'spk-1',
      text: typeof item.text === 'string' ? item.text : '',
      ...(typeof item.confidence === 'number' && Number.isFinite(item.confidence)
        ? { confidence: Math.max(0, Math.min(1, item.confidence)) }
        : {}),
      ...(typeof item.uncertain === 'boolean' ? { uncertain: item.uncertain } : {}),
    }));
}

function normalizeNotes(rawNotes: unknown): NoteSection[] | undefined {
  if (rawNotes === undefined || rawNotes === null) return undefined;
  if (!Array.isArray(rawNotes)) return undefined;
  return rawNotes
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      heading: typeof item.heading === 'string' ? item.heading : 'Notes',
      bullets: asStringArray(item.bullets),
    }));
}

function normalizeBookmarks(rawBookmarks: unknown): Bookmark[] | undefined {
  if (rawBookmarks === undefined || rawBookmarks === null) return undefined;
  if (!Array.isArray(rawBookmarks)) return undefined;
  return rawBookmarks
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => {
      const cat = item.category;
      const category =
        cat === 'important' ||
        cat === 'question' ||
        cat === 'decision' ||
        cat === 'follow-up' ||
        cat === 'note'
          ? cat
          : 'important';
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id : `bm-${idx + 1}`,
        timeSec:
          typeof item.timeSec === 'number' && Number.isFinite(item.timeSec)
            ? Math.max(0, item.timeSec)
            : 0,
        category,
        label: typeof item.label === 'string' && item.label.trim() ? item.label : 'Bookmark',
        ...(typeof item.note === 'string' && item.note.trim() ? { note: item.note } : {}),
        ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
      };
    });
}

function normalizeActionItems(rawItems: unknown): ActionItem[] | undefined {
  if (rawItems === undefined || rawItems === null) return undefined;
  if (!Array.isArray(rawItems)) return undefined;
  return rawItems
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `act-${idx + 1}`,
      task: typeof item.task === 'string' ? item.task : '',
      ...(typeof item.owner === 'string' && item.owner.trim() ? { owner: item.owner } : {}),
      ...(typeof item.deadline === 'string' && item.deadline.trim() ? { deadline: item.deadline } : {}),
      ...(typeof item.timestampSec === 'number' && Number.isFinite(item.timestampSec)
        ? { timestampSec: Math.max(0, item.timestampSec) }
        : {}),
      completed: Boolean(item.completed),
    }))
    .filter((item) => item.task.trim().length > 0);
}

function normalizeAnalysis(rawAnalysis: unknown): JobAnalysis | undefined {
  if (rawAnalysis === undefined || rawAnalysis === null) return undefined;
  if (typeof rawAnalysis !== 'object') return undefined;
  const obj = rawAnalysis as Record<string, unknown>;
  const sentiment =
    obj.sentiment === 'positive' || obj.sentiment === 'neutral' || obj.sentiment === 'negative'
      ? obj.sentiment
      : 'neutral';

  return {
    sentiment,
    sentimentNote: typeof obj.sentimentNote === 'string' ? obj.sentimentNote : '',
    topics: asStringArray(obj.topics),
    decisions: asStringArray(obj.decisions),
    concerns: asStringArray(obj.concerns),
    risks: asStringArray(obj.risks),
    nextSteps: asStringArray(obj.nextSteps),
    ...(Array.isArray(obj.questionsRaised)
      ? { questionsRaised: asStringArray(obj.questionsRaised) }
      : {}),
  };
}

function normalizeJob(raw: unknown, baseUrl?: string): Job {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('Malformed recording payload received from backend API.');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id.trim()) {
    throw new ApiError('Malformed recording payload: missing recording id.');
  }

  const rawStatus = typeof obj.status === 'string' ? (obj.status as JobStatus) : 'queued';
  const status: JobStatus = VALID_JOB_STATUSES.has(rawStatus) ? rawStatus : 'queued';

  const rawProgress = typeof obj.progress === 'number' && Number.isFinite(obj.progress)
    ? obj.progress
    : status === 'done'
      ? 100
      : 0;
  const progress = Math.max(0, Math.min(100, Math.round(rawProgress)));

  const durationSec =
    typeof obj.durationSec === 'number' && Number.isFinite(obj.durationSec)
      ? Math.max(0, obj.durationSec)
      : 0;

  let audioUrl = typeof obj.audioUrl === 'string' && obj.audioUrl.trim() ? obj.audioUrl : undefined;
  if (audioUrl && baseUrl && audioUrl.startsWith('/')) {
    audioUrl = `${baseUrl}${audioUrl}`;
  }

  return {
    id: obj.id,
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title : 'Untitled recording',
    createdAt:
      typeof obj.createdAt === 'string' && obj.createdAt.trim()
        ? obj.createdAt
        : new Date().toISOString(),
    durationSec,
    language: typeof obj.language === 'string' && obj.language.trim() ? obj.language : 'auto',
    status,
    progress,
    stageMessage:
      typeof obj.stageMessage === 'string' && obj.stageMessage.trim()
        ? obj.stageMessage.trim()
        : undefined,
    error: typeof obj.error === 'string' && obj.error.trim() ? sanitizeErrorText(obj.error) : undefined,
    audioUrl,
    client: typeof obj.client === 'string' ? obj.client : undefined,
    tags: Array.isArray(obj.tags) ? asStringArray(obj.tags) : undefined,
    pinned: typeof obj.pinned === 'boolean' ? obj.pinned : undefined,
    speakers: normalizeSpeakers(obj.speakers),
    transcript: normalizeTranscript(obj.transcript),
    summary: typeof obj.summary === 'string' ? obj.summary : undefined,
    keyPoints: Array.isArray(obj.keyPoints) ? asStringArray(obj.keyPoints) : undefined,
    notes: normalizeNotes(obj.notes),
    analysis: normalizeAnalysis(obj.analysis),
    bookmarks: normalizeBookmarks(obj.bookmarks),
    actionItems: normalizeActionItems(obj.actionItems),
  };
}

function normalizeJobList(raw: unknown, baseUrl?: string): Job[] {
  if (!Array.isArray(raw)) {
    throw new ApiError('Malformed response: expected an array of recordings.');
  }
  return raw.map((item) => normalizeJob(item, baseUrl));
}

function parseContentDispositionFilename(
  disposition: string | null,
  fallback: string
): string {
  if (!disposition) return fallback;

  let rawName: string | null = null;

  // Prefer RFC 5987 UTF-8 encoded filename*
  const extMatch = disposition.match(/filename\*\s*=\s*(?:UTF-8''|[^']*'')([^;\r\n]+)/i);
  if (extMatch?.[1]) {
    try {
      rawName = decodeURIComponent(extMatch[1].trim().replace(/^["']|["']$/g, ''));
    } catch {
      rawName = extMatch[1].trim();
    }
  }

  if (!rawName) {
    const basicMatch = disposition.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;\r\n]+)/i);
    rawName = (basicMatch?.[1] ?? basicMatch?.[2] ?? '').trim();
  }

  if (!rawName) return fallback;

  const cleaned = rawName
    .replace(/[/\\<>:"|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .trim();

  return cleaned || fallback;
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { allowEmpty?: boolean }
): Promise<T> {
  const { allowEmpty = false, ...fetchInit } = init ?? {};
  const baseUrl = requireValidatedApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...fetchInit,
      headers: {
        ...(fetchInit.body && !(fetchInit.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(fetchInit.headers ?? {}),
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request cancelled', 0, { isAborted: true });
    }
    throw new ApiError(
      `Cannot reach the backend API at ${baseUrl}. Check that the server is running and CORS is enabled.`,
      0,
      { isNetworkError: true }
    );
  }

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }
    throw new ApiError(extractErrorMessage(res.status, bodyText), res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('text/html')) {
    throw new ApiError(
      'Received an HTML page instead of JSON from the API endpoint. Check your API base URL.',
      res.status
    );
  }

  const rawText = await res.text();
  if (!rawText.trim()) {
    if (allowEmpty) {
      return undefined as T;
    }
    throw new ApiError('Empty JSON response from backend API.', res.status);
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new ApiError('Malformed JSON response from backend API.', res.status);
  }
}

// ---------------------------------------------------------------------------
// Exported REST API Contract
// ---------------------------------------------------------------------------

export interface UploadController {
  supportsPause: boolean;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

/**
 * POST /api/jobs
 * Multipart upload using XMLHttpRequest with upload progress and cancellation.
 * Note: Native XMLHttpRequest cannot pause an active HTTP request stream;
 * pause/resume is available only in Mock Mode (supportsPause: true).
 */
export function createJob(
  payload: UploadJobPayload,
  onUploadProgress?: (percent: number) => void,
  registerController?: (ctrl: UploadController) => void
): Promise<{ jobId: string }> {
  const fileError = validateMediaFile(payload.file);
  if (fileError) {
    return Promise.reject(new ApiError(fileError, 400));
  }

  if (isMockMode()) {
    return new Promise((resolve, reject) => {
      let progress = 0;
      let paused = false;
      let cancelled = false;

      const timer = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(timer);
          return;
        }
        if (paused) return;

        progress = Math.min(100, progress + 14 + Math.floor(Math.random() * 12));
        onUploadProgress?.(progress);

        if (progress >= 100) {
          window.clearInterval(timer);
          const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const inferredSpeakers =
            payload.speakers === '1'
              ? [{ id: 'spk-1', name: 'Speaker 1', color: getDistinctSpeakerColor(0) }]
              : payload.speakers === '3'
                ? [
                    { id: 'spk-1', name: 'Speaker 1', color: getDistinctSpeakerColor(0) },
                    { id: 'spk-2', name: 'Speaker 2', color: getDistinctSpeakerColor(1) },
                    { id: 'spk-3', name: 'Speaker 3', color: getDistinctSpeakerColor(2) },
                  ]
                : payload.speakers === '4+'
                  ? [
                      { id: 'spk-1', name: 'Speaker 1', color: getDistinctSpeakerColor(0) },
                      { id: 'spk-2', name: 'Speaker 2', color: getDistinctSpeakerColor(1) },
                      { id: 'spk-3', name: 'Speaker 3', color: getDistinctSpeakerColor(2) },
                      { id: 'spk-4', name: 'Speaker 4', color: getDistinctSpeakerColor(3) },
                    ]
                  : [
                      { id: 'spk-1', name: 'Speaker 1', color: getDistinctSpeakerColor(0) },
                      { id: 'spk-2', name: 'Speaker 2', color: getDistinctSpeakerColor(1) },
                    ];

          const localMediaUrl = URL.createObjectURL(payload.file);
          mockUploadedFiles.set(id, payload.file);
          mockObjectUrls.set(id, localMediaUrl);

          const newJob: Job = {
            id,
            title: payload.title.trim() || payload.file.name,
            client: 'Unassigned',
            tags: ['uploaded'],
            pinned: false,
            createdAt: new Date().toISOString(),
            durationSec: 1320,
            language: payload.language === 'auto' ? 'en' : payload.language,
            status: 'queued',
            progress: 4,
            audioUrl: localMediaUrl,
            speakers: inferredSpeakers,
            transcript: [],
          };
          mockJobs = [newJob, ...mockJobs];
          mockLifecycles.set(id, {
            startedAt: Date.now(),
            durationMs: 15000,
            initialProgress: 4,
            context: payload.context,
          });
          resolve({ jobId: id });
        }
      }, 220);

      registerController?.({
        supportsPause: true,
        pause: () => {
          paused = true;
        },
        resume: () => {
          paused = false;
        },
        cancel: () => {
          cancelled = true;
          window.clearInterval(timer);
          reject(new ApiError('Upload cancelled', 0, { isAborted: true }));
        },
      });
    });
  }

  let baseUrl: string;
  try {
    baseUrl = requireValidatedApiBaseUrl();
  } catch (err) {
    return Promise.reject(err);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/api/jobs`, true);

    registerController?.({
      supportsPause: false,
      pause: () => {
        // Native XMLHttpRequest cannot pause an in-flight HTTP multipart stream.
        // Intentionally a no-op so an active upload is not accidentally aborted.
      },
      resume: () => {
        // Not supported on native XMLHttpRequest; Retry starts a fresh upload.
      },
      cancel: () => {
        xhr.abort();
      },
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0 && onUploadProgress) {
        const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onUploadProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onUploadProgress?.(100);
        try {
          const data = JSON.parse(xhr.responseText) as { jobId?: unknown };
          if (!data || typeof data.jobId !== 'string' || !data.jobId.trim()) {
            reject(new ApiError('Malformed upload response: missing jobId.', xhr.status));
            return;
          }
          resolve({ jobId: data.jobId });
        } catch {
          reject(new ApiError('Invalid JSON response from upload server.', xhr.status));
        }
      } else {
        reject(new ApiError(extractErrorMessage(xhr.status, xhr.responseText), xhr.status));
      }
    };

    xhr.onabort = () => {
      reject(new ApiError('Upload cancelled', 0, { isAborted: true }));
    };

    xhr.onerror = () => {
      reject(
        new ApiError(
          `Network error while uploading media file to ${baseUrl}. Check connectivity and CORS configuration.`,
          0,
          { isNetworkError: true }
        )
      );
    };

    xhr.ontimeout = () => {
      reject(new ApiError('Upload request timed out.', 0, { isNetworkError: true }));
    };

    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append('title', payload.title);
    formData.append('language', payload.language);
    formData.append('speakers', payload.speakers);
    formData.append('outputs', JSON.stringify(payload.outputs));
    formData.append('context', payload.context);

    xhr.send(formData);
  });
}

/**
 * GET /api/jobs -> Job[] (list view, no transcript)
 */
export async function listJobs(signal?: AbortSignal): Promise<Job[]> {
  if (isMockMode()) {
    advanceMockJobs();
    await new Promise((r) => setTimeout(r, 140));
    return mockJobs.map(({ transcript: _omit, ...rest }) => ({
      ...rest,
      speakers: rest.speakers.map((s) => ({ ...s })),
      tags: rest.tags ? [...rest.tags] : undefined,
      analysis: rest.analysis ? { ...rest.analysis } : undefined,
    }));
  }

  const baseUrl = requireValidatedApiBaseUrl();
  const raw = await apiFetch<unknown>('/api/jobs', { signal });
  return normalizeJobList(raw, baseUrl);
}

/**
 * Full-dataset fetch used for Command Palette transcript search & cross-call views.
 */
export async function listFullJobsForWorkspace(signal?: AbortSignal): Promise<Job[]> {
  if (isMockMode()) {
    advanceMockJobs();
    return mockJobs.map((j) => structuredClone(j));
  }
  return listJobs(signal);
}

/**
 * GET /api/jobs/{id} -> Job (full)
 */
export async function getJob(id: string, signal?: AbortSignal): Promise<Job> {
  if (isMockMode()) {
    advanceMockJobs();
    await new Promise((r) => setTimeout(r, 100));
    const found = mockJobs.find((j) => j.id === id);
    if (!found) {
      throw new ApiError('Recording not found', 404);
    }
    return structuredClone(found);
  }

  const baseUrl = requireValidatedApiBaseUrl();
  const raw = await apiFetch<unknown>(`/api/jobs/${encodeURIComponent(id)}`, { signal });
  return normalizeJob(raw, baseUrl);
}

export type PatchJobBody = Partial<
  Pick<
    Job,
    | 'title'
    | 'speakers'
    | 'transcript'
    | 'summary'
    | 'keyPoints'
    | 'notes'
    | 'analysis'
    | 'bookmarks'
    | 'actionItems'
    | 'pinned'
    | 'client'
    | 'tags'
  >
>;

/**
 * PATCH /api/jobs/{id} -> Job
 */
export async function patchJob(id: string, body: PatchJobBody): Promise<Job> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 120));
    const idx = mockJobs.findIndex((j) => j.id === id);
    if (idx === -1) {
      throw new ApiError('Recording not found', 404);
    }
    const updated: Job = {
      ...mockJobs[idx],
      ...body,
    };
    mockJobs[idx] = updated;
    return structuredClone(updated);
  }

  const baseUrl = requireValidatedApiBaseUrl();
  const raw = await apiFetch<unknown>(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return normalizeJob(raw, baseUrl);
}

/**
 * POST /api/jobs/{id}/cancel -> Job
 */
export async function cancelJob(id: string): Promise<Job> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 120));
    const idx = mockJobs.findIndex((j) => j.id === id);
    if (idx === -1) throw new ApiError('Recording not found', 404);
    mockLifecycles.delete(id);
    const updated: Job = {
      ...mockJobs[idx],
      status: 'cancelled',
      progress: 0,
      stageMessage: 'Cancelled by user.',
      error: 'Processing was cancelled by user.',
    };
    mockJobs[idx] = updated;
    return structuredClone(updated);
  }

  const baseUrl = requireValidatedApiBaseUrl();
  const raw = await apiFetch<unknown>(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
  return normalizeJob(raw, baseUrl);
}

/**
 * Retry / reprocess a failed, cancelled, or completed job via POST /api/jobs/{id}/retry.
 */
export async function reprocessJob(id: string): Promise<Job> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 160));
    const idx = mockJobs.findIndex((j) => j.id === id);
    if (idx === -1) throw new ApiError('Recording not found', 404);
    const updated: Job = {
      ...mockJobs[idx],
      status: 'queued',
      progress: 5,
      stageMessage: 'Re-queued for transcription...',
      error: undefined,
    };
    mockJobs[idx] = updated;
    mockLifecycles.set(id, {
      startedAt: Date.now(),
      durationMs: 15000,
      initialProgress: 5,
    });
    return structuredClone(updated);
  }

  const baseUrl = requireValidatedApiBaseUrl();
  const raw = await apiFetch<unknown>(`/api/jobs/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
  });
  return normalizeJob(raw, baseUrl);
}

export const retryJob = reprocessJob;

/**
 * GET /api/jobs/search?q=... -> TranscriptSearchHit[]
 */
export async function searchTranscripts(
  query: string,
  signal?: AbortSignal
): Promise<TranscriptSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (isMockMode()) {
    const q = trimmed.toLowerCase();
    const hits: TranscriptSearchHit[] = [];
    for (const job of mockJobs) {
      if (!job.transcript?.length) continue;
      const speakerMap = new Map(job.speakers.map((s) => [s.id, s.name]));
      for (const seg of job.transcript) {
        if (seg.text.toLowerCase().includes(q)) {
          hits.push({
            jobId: job.id,
            jobTitle: job.title,
            segmentId: seg.id,
            speakerId: seg.speakerId,
            speakerName: speakerMap.get(seg.speakerId) ?? seg.speakerId,
            start: seg.start,
            end: seg.end,
            text: seg.text,
          });
          if (hits.length >= 25) return hits;
        }
      }
    }
    return hits;
  }

  const params = new URLSearchParams({ q: trimmed, limit: '25' });
  const raw = await apiFetch<unknown>(`/api/jobs/search?${params.toString()}`, { signal });
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is TranscriptSearchHit =>
      Boolean(
        item &&
          typeof item === 'object' &&
          typeof (item as TranscriptSearchHit).jobId === 'string' &&
          typeof (item as TranscriptSearchHit).segmentId === 'string' &&
          typeof (item as TranscriptSearchHit).text === 'string'
      )
  );
}

/**
 * POST /api/jobs/{id}/regenerate -> Job
 */
export async function regenerateSection(
  id: string,
  section: RegenerateSection
): Promise<Job> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 750));
    const idx = mockJobs.findIndex((j) => j.id === id);
    if (idx === -1) throw new ApiError('Recording not found', 404);
    const job = mockJobs[idx];
    const updated = structuredClone(job);

    if (section === 'summary') {
      updated.summary = `${job.summary ?? ''}\n\n[Refined synthesis]: Key alignment centered on protecting the target launch date while keeping commercial terms predictable and surfacing integration dependencies early.`.trim();
      updated.keyPoints = [
        ...(job.keyPoints ?? []),
        'Confirmed weekly executive checkpoint cadence and escalation path for external vendor dependencies.',
      ].slice(0, 6);
    } else if (section === 'notes') {
      updated.notes = [
        ...(job.notes ?? []),
        {
          heading: 'Follow-up Governance & Risks',
          bullets: [
            'Weekly status digest to highlight blocker owners and milestone burn rate.',
            'Dependency freeze window scheduled two weeks ahead of production cutover.',
          ],
        },
      ];
    } else if (section === 'analysis' && updated.analysis) {
      updated.analysis = {
        ...updated.analysis,
        sentimentNote: `${updated.analysis.sentimentNote} (Refreshed with full-call cadence weighting.)`,
        nextSteps: [
          ...updated.analysis.nextSteps,
          'Verify all milestone owners in shared workspace channel.',
        ],
      };
    }

    mockJobs[idx] = updated;
    return structuredClone(updated);
  }

  const baseUrl = requireValidatedApiBaseUrl();
  const raw = await apiFetch<unknown>(`/api/jobs/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ section }),
  });
  return normalizeJob(raw, baseUrl);
}

/**
 * GET /api/jobs/{id}/export?format=docx|pdf|md|txt|srt|vtt
 */
export async function exportJob(
  id: string,
  format: ExportFormat,
  exportOptions?: ExportOptions
): Promise<void> {
  const settings = loadStoredSettings();
  const isSubtitleFormat = format === 'srt' || format === 'vtt';
  const effectiveIncludeTimestamps =
    exportOptions?.includeTimestamps ?? settings.exportIncludeTimestamps;
  const effectiveIncludeSpeakers = exportOptions?.includeSpeakers ?? false;

  if (isMockMode()) {
    const job = mockJobs.find((j) => j.id === id);
    if (!job) throw new ApiError('Recording not found', 404);
    downloadMockExport(job, format, {
      includeTimestamps: effectiveIncludeTimestamps,
      includeSpeakers: effectiveIncludeSpeakers,
      offsetSec: exportOptions?.offsetSec ?? 0,
    });
    return;
  }

  const baseUrl = requireValidatedApiBaseUrl();
  const params = new URLSearchParams({
    format,
    timestamps: String(effectiveIncludeTimestamps),
    speakers: String(effectiveIncludeSpeakers),
  });
  if (isSubtitleFormat && exportOptions?.offsetSec !== undefined && exportOptions.offsetSec !== 0) {
    params.set('offsetSec', String(exportOptions.offsetSec));
  }

  const url = `${baseUrl}/api/jobs/${encodeURIComponent(id)}/export?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError(
      `Cannot download export from ${baseUrl}. Check connectivity and CORS configuration.`,
      0,
      { isNetworkError: true }
    );
  }

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }
    throw new ApiError(extractErrorMessage(res.status, bodyText), res.status);
  }

  const blob = await res.blob();
  if (blob.size === 0) {
    throw new ApiError('Export returned an empty file.', res.status);
  }

  const safeFallbackId = id.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const fallbackName = `callscribe-${safeFallbackId}.${format}`;
  const filename = parseContentDispositionFilename(
    res.headers.get('content-disposition'),
    fallbackName
  );

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/**
 * GET /api/jobs/{id}/audio?format=mp3|wav
 * Extracts/streams the audio track from an uploaded video or audio recording.
 */
export async function downloadJobAudio(
  id: string,
  format: AudioFormat = 'mp3'
): Promise<{ actualFormat: AudioFormat }> {
  if (isMockMode()) {
    const job = mockJobs.find((j) => j.id === id);
    if (!job) throw new ApiError('Recording not found', 404);

    const safeBase =
      job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
      'callscribe-audio';

    const uploadedFile = mockUploadedFiles.get(id);
    if (uploadedFile) {
      const lowerName = uploadedFile.name.toLowerCase();
      if (lowerName.endsWith(`.${format}`)) {
        triggerBlobDownload(uploadedFile, `${safeBase}.${format}`);
        return { actualFormat: format };
      }
      const wavBlob = await extractAudioWavFromFile(uploadedFile);
      triggerBlobDownload(wavBlob, `${safeBase}.wav`);
      return { actualFormat: 'wav' };
    }

    if (job.audioUrl) {
      const res = await fetch(job.audioUrl);
      if (!res.ok) {
        throw new ApiError('Audio stream is unavailable for this recording.', res.status);
      }
      const blob = await res.blob();
      if (blob.size === 0) {
        throw new ApiError('Audio stream returned an empty file.', 500);
      }
      triggerBlobDownload(blob, `${safeBase}.wav`);
      return { actualFormat: 'wav' };
    }

    throw new ApiError('No media file is available for audio download.', 404);
  }

  const baseUrl = requireValidatedApiBaseUrl();
  const params = new URLSearchParams({ format });
  const url = `${baseUrl}/api/jobs/${encodeURIComponent(id)}/audio?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError(
      `Cannot download audio from ${baseUrl}. Check connectivity and CORS configuration.`,
      0,
      { isNetworkError: true }
    );
  }

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }
    throw new ApiError(extractErrorMessage(res.status, bodyText), res.status);
  }

  const blob = await res.blob();
  if (blob.size === 0) {
    throw new ApiError('Audio download returned an empty file.', res.status);
  }

  const safeFallbackId = id.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const fallbackName = `callscribe-${safeFallbackId}.${format}`;
  const filename = parseContentDispositionFilename(
    res.headers.get('content-disposition'),
    fallbackName
  );
  triggerBlobDownload(blob, filename);
  return { actualFormat: format };
}

/**
 * DELETE /api/jobs/{id}
 */
export async function deleteJob(id: string): Promise<void> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 120));
    mockJobs = mockJobs.filter((j) => j.id !== id);
    mockLifecycles.delete(id);
    mockUploadedFiles.delete(id);
    const objUrl = mockObjectUrls.get(id);
    if (objUrl) {
      URL.revokeObjectURL(objUrl);
      mockObjectUrls.delete(id);
    }
    return;
  }

  await apiFetch<void>(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    allowEmpty: true,
  });
}

/**
 * POST /api/ai/diarize-speakers (same-origin Express AI route)
 * Uses server-side Gemini to differentiate speakers across generated transcript segments.
 */
export async function diarizeJobSpeakers(
  job: Job,
  expectedSpeakers?: number,
  options?: { mode?: 'infer_names' | 'full_assist'; confidenceThreshold?: number }
): Promise<DiarizeSpeakersResult> {
  const settings = loadStoredSettings();
  if (!settings.enableCloudAi) {
    throw new ApiError(
      'Optional Gemini AI assistance is turned off in Settings > AI & Privacy.',
      403
    );
  }
  const transcript = job.transcript ?? [];
  if (transcript.length === 0) {
    throw new ApiError('No transcript segments are available to analyze.', 400);
  }

  let res: Response;
  try {
    res = await fetch('/api/ai/diarize-speakers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: job.title,
        language: job.language,
        expectedSpeakers,
        mode: options?.mode ?? 'full_assist',
        confidenceThreshold: options?.confidenceThreshold ?? settings.diarizationConfidenceThreshold,
        speakers: job.speakers,
        transcript,
      }),
    });
  } catch {
    throw new ApiError(
      'Could not reach the AI speaker differentiation service.',
      0,
      { isNetworkError: true }
    );
  }

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }
    throw new ApiError(extractErrorMessage(res.status, bodyText), res.status);
  }

  const data = (await res.json()) as Partial<DiarizeSpeakersResult>;
  if (!Array.isArray(data.speakers) || !Array.isArray(data.transcript)) {
    throw new ApiError('Malformed response from AI speaker differentiation service.', 502);
  }

  return {
    speakers: normalizeSpeakers(data.speakers),
    transcript: normalizeTranscript(data.transcript) ?? transcript,
    reasoning:
      typeof data.reasoning === 'string' && data.reasoning.trim()
        ? data.reasoning.trim()
        : 'Speakers differentiated across transcript segments.',
    changedCount: typeof data.changedCount === 'number' ? data.changedCount : 0,
  };
}

/**
 * POST /api/ai/summarize (same-origin Express AI route)
 * Sends transcript text + speaker names only (never audio) to Gemini for optional summary & action items.
 */
export async function summarizeJobWithAi(job: Job): Promise<AiSummarizeResult> {
  const settings = loadStoredSettings();
  if (!settings.enableCloudAi) {
    throw new ApiError(
      'Optional Gemini AI summarization is turned off in Settings > AI & Privacy.',
      403
    );
  }
  const transcript = job.transcript ?? [];
  if (transcript.length === 0) {
    throw new ApiError('No transcript segments are available to summarize.', 400);
  }

  let res: Response;
  try {
    res = await fetch('/api/ai/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: job.title,
        language: job.language,
        speakers: job.speakers,
        transcript,
      }),
    });
  } catch {
    throw new ApiError(
      'Could not reach the AI summarization service.',
      0,
      { isNetworkError: true }
    );
  }

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }
    throw new ApiError(extractErrorMessage(res.status, bodyText), res.status);
  }

  const data = (await res.json()) as Partial<AiSummarizeResult>;
  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    throw new ApiError('Malformed response from AI summarization service.', 502);
  }

  return {
    summary: data.summary.trim(),
    keyPoints: asStringArray(data.keyPoints),
    decisions: asStringArray(data.decisions),
    questionsRaised: asStringArray(data.questionsRaised),
    actionItems: normalizeActionItems(data.actionItems) ?? [],
    followUps: asStringArray(data.followUps),
  };
}

