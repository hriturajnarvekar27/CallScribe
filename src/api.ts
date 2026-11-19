import { createInitialMockJobs } from './mockData';
import {
  AppSettings,
  ExportFormat,
  Job,
  JobStatus,
  RegenerateSection,
  TranscriptSegment,
  UploadJobPayload,
} from './types';
import { downloadMockExport, SubtitleBuildOptions } from './utils/exportMock';
import { getDistinctSpeakerColor } from './utils/format';
import { getMockAudioUrl } from './utils/mockAudio';

const SETTINGS_STORAGE_KEY = 'callscribe_settings_v2';

export const DEFAULT_SETTINGS: AppSettings = {
  defaultLanguage: 'auto',
  defaultOutputs: {
    summary: true,
    notes: true,
    analysis: true,
    subtitles: true,
  },
  defaultSubtitleFormat: 'srt',
  subtitleIncludeSpeakers: true,
  theme: 'dark',
  liveBackground: 'aurora',
  apiBaseUrl: '',
};

export function loadStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      defaultLanguage: parsed.defaultLanguage ?? DEFAULT_SETTINGS.defaultLanguage,
      defaultOutputs: {
        summary: parsed.defaultOutputs?.summary ?? DEFAULT_SETTINGS.defaultOutputs.summary,
        notes: parsed.defaultOutputs?.notes ?? DEFAULT_SETTINGS.defaultOutputs.notes,
        analysis: parsed.defaultOutputs?.analysis ?? DEFAULT_SETTINGS.defaultOutputs.analysis,
        subtitles: parsed.defaultOutputs?.subtitles ?? DEFAULT_SETTINGS.defaultOutputs.subtitles,
      },
      defaultSubtitleFormat: parsed.defaultSubtitleFormat ?? DEFAULT_SETTINGS.defaultSubtitleFormat,
      subtitleIncludeSpeakers:
        parsed.subtitleIncludeSpeakers ?? DEFAULT_SETTINGS.subtitleIncludeSpeakers,
      theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
      liveBackground: parsed.liveBackground ?? DEFAULT_SETTINGS.liveBackground,
      apiBaseUrl: parsed.apiBaseUrl ?? DEFAULT_SETTINGS.apiBaseUrl,
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

export function getEnvApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';
}

export function getEffectiveApiBaseUrl(): string {
  const settings = loadStoredSettings();
  const override = settings.apiBaseUrl.trim();
  const base = override || getEnvApiBaseUrl();
  return base.replace(/\/+$/, '');
}

export function isMockMode(): boolean {
  return getEffectiveApiBaseUrl() === '';
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
      audioUrl: getMockAudioUrl(),
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

  const contextSuffix = context?.trim() ? ` Context noted: "${context.trim()}".` : '';
  const speaker1Name = job.speakers[0]?.name || (isHindi ? 'Priya Deshmukh' : 'Nadia Vance');
  const speaker2Name = job.speakers[1]?.name || (isHindi ? 'Vikram Rao' : 'Liam O’Connor');

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
      speakerId: 'spk-2',
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
      speakerId: 'spk-2',
      text: 'Let us lock Week 3 for the pilot cohort of 12 team leads and circulate the security checklist tomorrow morning.',
    },
  ];

  return {
    audioUrl: getMockAudioUrl(),
    speakers: [
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
    if (progress >= 100) {
      status = 'done';
    } else if (progress >= 78) {
      status = 'analyzing';
    } else if (progress >= 38) {
      status = 'transcribing';
    } else if (progress >= 15) {
      status = 'extracting_audio';
    } else {
      status = 'queued';
    }

    if (status === 'done') {
      mockLifecycles.delete(job.id);
      const completedFields = buildCompletedMockContent(job, lifecycle.context);
      return {
        ...job,
        ...completedFields,
        status: 'done',
        progress: 100,
      };
    }

    return {
      ...job,
      status,
      progress,
    };
  });
}

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getEffectiveApiBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const json = JSON.parse(text) as { error?: string; message?: string };
          message = json.error || json.message || text;
        } catch {
          message = text;
        }
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Exported REST API Contract
// ---------------------------------------------------------------------------

export interface UploadController {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

/**
 * POST /api/jobs
 * Multipart upload using XMLHttpRequest with optional pause/cancel handle for Upload Tray.
 */
export function createJob(
  payload: UploadJobPayload,
  onUploadProgress?: (percent: number) => void,
  registerController?: (ctrl: UploadController) => void
): Promise<{ jobId: string }> {
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
            payload.speakers === '3'
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
        pause: () => {
          paused = true;
        },
        resume: () => {
          paused = false;
        },
        cancel: () => {
          cancelled = true;
          window.clearInterval(timer);
          reject(new Error('Upload cancelled'));
        },
      });
    });
  }

  return new Promise((resolve, reject) => {
    const baseUrl = getEffectiveApiBaseUrl();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/api/jobs`, true);

    registerController?.({
      pause: () => {
        // Native XHR cannot pause mid-stream; cancel instead on live HTTP
        xhr.abort();
      },
      resume: () => {
        // Handled via retry in UploadTray for live HTTP
      },
      cancel: () => {
        xhr.abort();
      },
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        const pct = Math.round((event.loaded / event.total) * 100);
        onUploadProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { jobId: string };
          resolve(data);
        } catch {
          reject(new Error('Invalid JSON response from server'));
        }
      } else {
        reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onabort = () => {
      reject(new Error('Upload cancelled'));
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading media file'));
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
export async function listJobs(): Promise<Job[]> {
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

  return apiFetch<Job[]>('/api/jobs');
}

/**
 * Full-dataset fetch used for Command Palette transcript search & cross-call views.
 */
export async function listFullJobsForWorkspace(): Promise<Job[]> {
  if (isMockMode()) {
    advanceMockJobs();
    return mockJobs.map((j) => structuredClone(j));
  }
  return listJobs();
}

/**
 * GET /api/jobs/{id} -> Job (full)
 */
export async function getJob(id: string): Promise<Job> {
  if (isMockMode()) {
    advanceMockJobs();
    await new Promise((r) => setTimeout(r, 100));
    const found = mockJobs.find((j) => j.id === id);
    if (!found) {
      throw new Error('Recording not found');
    }
    return structuredClone(found);
  }

  return apiFetch<Job>(`/api/jobs/${encodeURIComponent(id)}`);
}

export type PatchJobBody = Partial<
  Pick<Job, 'title' | 'speakers' | 'transcript' | 'notes' | 'pinned' | 'client' | 'tags'>
>;

/**
 * PATCH /api/jobs/{id} -> Job
 */
export async function patchJob(id: string, body: PatchJobBody): Promise<Job> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 120));
    const idx = mockJobs.findIndex((j) => j.id === id);
    if (idx === -1) {
      throw new Error('Recording not found');
    }
    const updated: Job = {
      ...mockJobs[idx],
      ...body,
    };
    mockJobs[idx] = updated;
    return structuredClone(updated);
  }

  return apiFetch<Job>(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * Retry / reprocess a failed or completed job.
 */
export async function reprocessJob(id: string): Promise<Job> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 160));
    const idx = mockJobs.findIndex((j) => j.id === id);
    if (idx === -1) throw new Error('Recording not found');
    const updated: Job = {
      ...mockJobs[idx],
      status: 'queued',
      progress: 5,
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

  return apiFetch<Job>(`/api/jobs/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ section: 'summary' }),
  });
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
    if (idx === -1) throw new Error('Recording not found');
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

  return apiFetch<Job>(`/api/jobs/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ section }),
  });
}

/**
 * GET /api/jobs/{id}/export?format=docx|pdf|md|txt|srt|vtt
 */
export async function exportJob(
  id: string,
  format: ExportFormat,
  subtitleOptions?: SubtitleBuildOptions
): Promise<void> {
  if (isMockMode()) {
    const job = mockJobs.find((j) => j.id === id);
    if (!job) throw new Error('Recording not found');
    const settings = loadStoredSettings();
    downloadMockExport(job, format, {
      includeSpeakers: settings.subtitleIncludeSpeakers,
      ...(subtitleOptions ?? {}),
    });
    return;
  }

  const baseUrl = getEffectiveApiBaseUrl();
  const params = new URLSearchParams({ format });
  if (subtitleOptions?.includeSpeakers !== undefined) {
    params.set('speakers', String(subtitleOptions.includeSpeakers));
  }
  if (subtitleOptions?.offsetSec) {
    params.set('offsetSec', String(subtitleOptions.offsetSec));
  }
  const url = `${baseUrl}/api/jobs/${encodeURIComponent(id)}/export?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition');
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] ?? `callscribe-${id}.${format}`;

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
 * DELETE /api/jobs/{id}
 */
export async function deleteJob(id: string): Promise<void> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 120));
    mockJobs = mockJobs.filter((j) => j.id !== id);
    mockLifecycles.delete(id);
    return;
  }

  await apiFetch<void>(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
