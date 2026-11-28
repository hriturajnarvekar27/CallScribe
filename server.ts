import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';

const DISTINCT_SPEAKER_COLORS = [
  '#6366F1',
  '#06B6D4',
  '#10B981',
  '#F59E0B',
  '#EC4899',
  '#8B5CF6',
  '#F97316',
  '#14B8A6',
];

interface IncomingSpeaker {
  id: string;
  name: string;
  color?: string;
}

interface IncomingSegment {
  id: string;
  start: number;
  end: number;
  speakerId: string;
  text: string;
  confidence?: number;
  uncertain?: boolean;
}

interface DiarizeRequestBody {
  title?: string;
  language?: string;
  expectedSpeakers?: number;
  mode?: 'infer_names' | 'full_assist';
  confidenceThreshold?: number;
  speakers?: IncomingSpeaker[];
  transcript?: IncomingSegment[];
}

interface SummarizeRequestBody {
  title?: string;
  language?: string;
  context?: string;
  speakers?: IncomingSpeaker[];
  transcript?: IncomingSegment[];
}

interface ModelSpeakerOutput {
  id: string;
  name: string;
}

interface ModelAssignmentOutput {
  segmentId: string;
  speakerId: string;
  confidence?: number;
  uncertain?: boolean;
}

interface ModelDiarizeResponse {
  speakers: ModelSpeakerOutput[];
  assignments: ModelAssignmentOutput[];
  reasoning: string;
}

interface ModelSummarizeActionItem {
  task: string;
  owner?: string;
  deadline?: string;
  timestampSec?: number;
}

interface ModelSummarizeResponse {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  questionsRaised: string[];
  actionItems: ModelSummarizeActionItem[];
  followUps: string[];
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractGeminiError(err: unknown): { status: number; message: string } {
  if (err && typeof err === 'object') {
    const anyErr = err as { status?: number; message?: string };
    const rawMsg = typeof anyErr.message === 'string' ? anyErr.message : 'AI request failed.';
    const lower = rawMsg.toLowerCase();

    if (anyErr.status === 403 || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
      return {
        status: 403,
        message: 'Gemini API key is invalid or unauthorized. Please verify your key in Settings > Secrets.',
      };
    }
    if (anyErr.status === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
      return {
        status: 429,
        message: 'Gemini rate limit or quota reached. Please wait a moment and try again.',
      };
    }
    if (anyErr.status === 404 || lower.includes('not_found')) {
      return {
        status: 404,
        message: 'Configured Gemini model was not found.',
      };
    }
    return {
      status: typeof anyErr.status === 'number' && anyErr.status >= 400 ? anyErr.status : 502,
      message: rawMsg.length > 240 ? `${rawMsg.slice(0, 237)}...` : rawMsg,
    };
  }
  return { status: 502, message: 'AI request failed.' };
}

async function runWithRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (attempt < retries && (status === 429 || status === 503)) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
      throw err;
    }
  }
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.post('/api/ai/diarize-speakers', async (req: Request, res: Response) => {
    const ai = getGenAIClient();
    if (!ai) {
      res.status(503).json({
        detail:
          'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable AI speaker differentiation.',
      });
      return;
    }

    const body = (req.body ?? {}) as DiarizeRequestBody;
    const rawTranscript = Array.isArray(body.transcript) ? body.transcript : [];
    const rawSpeakers = Array.isArray(body.speakers) ? body.speakers : [];

    if (rawTranscript.length === 0) {
      res.status(400).json({ detail: 'Transcript has no segments to analyze.' });
      return;
    }

    const segments = rawTranscript
      .filter(
        (seg): seg is IncomingSegment =>
          Boolean(seg && typeof seg.id === 'string' && typeof seg.text === 'string')
      )
      .slice(0, 260);

    if (segments.length === 0) {
      res.status(400).json({ detail: 'No valid transcript segments provided.' });
      return;
    }

    const mode = body.mode === 'infer_names' ? 'infer_names' : 'full_assist';
    const rawThreshold =
      typeof body.confidenceThreshold === 'number' && Number.isFinite(body.confidenceThreshold)
        ? body.confidenceThreshold
        : 0.55;
    const confidenceThreshold = Math.max(0.2, Math.min(0.95, rawThreshold));

    const existingSpeakerById = new Map<string, IncomingSpeaker>();
    for (const spk of rawSpeakers) {
      if (spk && typeof spk.id === 'string' && spk.id.trim()) {
        existingSpeakerById.set(spk.id.trim(), {
          id: spk.id.trim(),
          name: typeof spk.name === 'string' && spk.name.trim() ? spk.name.trim() : spk.id.trim(),
          color: typeof spk.color === 'string' && spk.color.trim() ? spk.color.trim() : undefined,
        });
      }
    }

    const expectedHint =
      typeof body.expectedSpeakers === 'number' && body.expectedSpeakers >= 2
        ? `Expected number of speakers: approximately ${body.expectedSpeakers}.`
        : 'Infer the true number of distinct speakers conservatively from textual evidence.';

    const transcriptLines = segments.map((seg, index) => ({
      index,
      segmentId: seg.id,
      startSec: Number(seg.start.toFixed(1)),
      endSec: Number(seg.end.toFixed(1)),
      currentSpeakerId: seg.speakerId,
      text: seg.text.trim(),
    }));

    const prompt = [
      `Recording Title: ${body.title?.trim() || 'Untitled recording'}`,
      `Language: ${body.language?.trim() || 'auto'}`,
      `Mode: ${mode}`,
      expectedHint,
      `Existing speaker labels: ${JSON.stringify(Array.from(existingSpeakerById.values()))}`,
      '',
      'Transcript segments (in chronological order, text only):',
      JSON.stringify(transcriptLines),
    ].join('\n');

    const modeRule =
      mode === 'infer_names'
        ? '2. MODE IS infer_names: Preserve existing currentSpeakerId turn boundaries whenever reasonable; focus on inferring real speaker names/roles and flagging genuinely ambiguous segments as uncertain instead of aggressively reshuffling audio-derived turns.'
        : '2. MODE IS full_assist: If segments were collapsed under one generic label (like "Speaker 1") or clearly misattributed based on explicit turn-taking cues, assign each segment to the most plausible speaker. If evidence is weak, mark uncertain=true and lower confidence.';

    const systemInstruction = [
      'You are an assistant for transcript speaker naming and turn review.',
      'CRITICAL GROUNDING RULE: You are only reading text — you do NOT have raw audio or acoustic voiceprints. Never claim acoustic voice identification and never invent personal names not evidenced in the transcript or existing labels.',
      'Rules:',
      '1. Use explicit cues only: greetings, self-introductions, direct address (e.g., "Thanks, Maya" means the previous or other speaker is Maya), Q&A alternations, and role context (Host vs Guest, Vendor vs Client).',
      modeRule,
      '3. When names are absent from the text, use neutral role labels like "Speaker 1 (Host)" or keep "Speaker 1", "Speaker 2".',
      '4. Provide a calibrated confidence score from 0.0 to 1.0 and boolean uncertain for EVERY segmentId. If a segment cannot be attributed with confidence, assign speakerId "spk-unknown" (Unknown Speaker) or low confidence (< 0.55) with uncertain=true.',
      '5. Use clean stable IDs like "spk-1", "spk-2", or "spk-unknown". Return an assignment for EVERY single input segmentId.',
      '6. Keep reasoning to 1-2 honest sentences stating only textual cues observed and noting any uncertain segments.',
    ].join('\n');

    try {
      const response = await runWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                speakers: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                    },
                    required: ['id', 'name'],
                  },
                },
                assignments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      segmentId: { type: Type.STRING },
                      speakerId: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                      uncertain: { type: Type.BOOLEAN },
                    },
                    required: ['segmentId', 'speakerId', 'confidence', 'uncertain'],
                  },
                },
                reasoning: { type: Type.STRING },
              },
              required: ['speakers', 'assignments', 'reasoning'],
            },
          },
        })
      );

      const rawJson = (response.text ?? '').trim();
      if (!rawJson) {
        res.status(502).json({ detail: 'AI returned an empty speaker differentiation response.' });
        return;
      }

      const parsed = JSON.parse(rawJson) as ModelDiarizeResponse;
      const modelSpeakers = Array.isArray(parsed.speakers) ? parsed.speakers : [];
      const modelAssignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];

      if (modelSpeakers.length === 0 || modelAssignments.length === 0) {
        res.status(502).json({ detail: 'AI could not extract speaker assignments from this transcript.' });
        return;
      }

      const usedColors = new Set<string>();
      const normalizedSpeakers: { id: string; name: string; color: string }[] = [];
      const validSpeakerIds = new Set<string>();

      modelSpeakers.forEach((s, idx) => {
        const cleanId = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `spk-${idx + 1}`;
        if (validSpeakerIds.has(cleanId)) return;
        validSpeakerIds.add(cleanId);

        if (cleanId === 'spk-unknown') {
          normalizedSpeakers.push({
            id: 'spk-unknown',
            name: 'Unknown Speaker',
            color: '#71717A',
          });
          return;
        }

        const existing = existingSpeakerById.get(cleanId);
        let color = existing?.color ?? DISTINCT_SPEAKER_COLORS[idx % DISTINCT_SPEAKER_COLORS.length];
        if (usedColors.has(color)) {
          const unused = DISTINCT_SPEAKER_COLORS.find((c) => !usedColors.has(c));
          color = unused ?? DISTINCT_SPEAKER_COLORS[idx % DISTINCT_SPEAKER_COLORS.length];
        }
        usedColors.add(color);

        const cleanName =
          typeof s.name === 'string' && s.name.trim()
            ? s.name.trim()
            : existing?.name ?? `Speaker ${idx + 1}`;

        normalizedSpeakers.push({
          id: cleanId,
          name: cleanName,
          color,
        });
      });

      const assignmentMap = new Map<string, { speakerId: string; confidence: number; uncertain: boolean }>();
      for (const a of modelAssignments) {
        if (a && typeof a.segmentId === 'string' && typeof a.speakerId === 'string') {
          const rawConf =
            typeof a.confidence === 'number' && Number.isFinite(a.confidence)
              ? Math.max(0, Math.min(1, Number(a.confidence.toFixed(3))))
              : 0.7;
          const belowThreshold = rawConf < confidenceThreshold;
          const targetSpk = belowThreshold || a.speakerId.trim() === 'spk-unknown'
            ? 'spk-unknown'
            : validSpeakerIds.has(a.speakerId.trim())
              ? a.speakerId.trim()
              : normalizedSpeakers[0].id;
          assignmentMap.set(a.segmentId.trim(), {
            speakerId: targetSpk,
            confidence: rawConf,
            uncertain: Boolean(a.uncertain) || belowThreshold || targetSpk === 'spk-unknown',
          });
        }
      }

      const fallbackSpeakerId = normalizedSpeakers[0].id;
      let changedCount = 0;

      const updatedTranscript = rawTranscript.map((seg) => {
        const mapped = assignmentMap.get(seg.id);
        const nextSpeakerId = mapped
          ? mapped.speakerId
          : validSpeakerIds.has(seg.speakerId)
            ? seg.speakerId
            : fallbackSpeakerId;
        if (nextSpeakerId !== seg.speakerId) {
          changedCount += 1;
        }
        return {
          ...seg,
          speakerId: nextSpeakerId,
          confidence: mapped?.confidence ?? seg.confidence ?? 0.75,
          uncertain: mapped?.uncertain ?? seg.uncertain ?? false,
        };
      });

      const referencedIds = new Set(updatedTranscript.map((seg) => seg.speakerId));
      if (referencedIds.has('spk-unknown') && !normalizedSpeakers.some((s) => s.id === 'spk-unknown')) {
        normalizedSpeakers.push({
          id: 'spk-unknown',
          name: 'Unknown Speaker',
          color: '#71717A',
        });
      }
      const activeSpeakers = normalizedSpeakers.filter((spk) => referencedIds.has(spk.id));
      const finalSpeakers = activeSpeakers.length > 0 ? activeSpeakers : normalizedSpeakers;

      res.json({
        speakers: finalSpeakers,
        transcript: updatedTranscript,
        reasoning:
          typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
            ? parsed.reasoning.trim()
            : `Reviewed ${updatedTranscript.length} transcript segments across ${finalSpeakers.length} speaker label${finalSpeakers.length === 1 ? '' : 's'}.`,
        changedCount,
      });
    } catch (err) {
      const mapped = extractGeminiError(err);
      res.status(mapped.status).json({ detail: mapped.message });
    }
  });

  app.post('/api/ai/summarize', async (req: Request, res: Response) => {
    const ai = getGenAIClient();
    if (!ai) {
      res.status(503).json({
        detail:
          'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable AI summarization.',
      });
      return;
    }

    const body = (req.body ?? {}) as SummarizeRequestBody;
    const rawTranscript = Array.isArray(body.transcript) ? body.transcript : [];
    const segments = rawTranscript
      .filter(
        (seg): seg is IncomingSegment =>
          Boolean(seg && typeof seg.id === 'string' && typeof seg.text === 'string' && seg.text.trim())
      )
      .slice(0, 400);

    if (segments.length === 0) {
      res.status(400).json({ detail: 'Transcript has no text segments to summarize.' });
      return;
    }

    const speakerMap = new Map<string, string>();
    for (const spk of Array.isArray(body.speakers) ? body.speakers : []) {
      if (spk && typeof spk.id === 'string' && typeof spk.name === 'string') {
        speakerMap.set(spk.id, spk.name.trim() || spk.id);
      }
    }

    const transcriptText = segments
      .map((seg) => {
        const spkName = speakerMap.get(seg.speakerId) || seg.speakerId;
        const sec = Math.max(0, Math.round(seg.start));
        return `[${sec}s] ${spkName}: ${seg.text.trim()}`;
      })
      .join('\n');

    const prompt = [
      `Recording Title: ${body.title?.trim() || 'Untitled recording'}`,
      `Language: ${body.language?.trim() || 'auto'}`,
      body.context?.trim() ? `User Context: ${body.context.trim()}` : '',
      '',
      'Chronological Transcript (text only):',
      transcriptText,
    ]
      .filter(Boolean)
      .join('\n');

    const systemInstruction = [
      'You are a careful meeting documentation assistant summarizing ONLY the provided transcript.',
      'STRICT GROUNDING RULES:',
      '1. Never invent facts, owners, deadlines, metrics, or decisions that are not explicitly stated in the transcript.',
      '2. If an action item or follow-up lacks an explicit owner or deadline in the transcript, leave owner/deadline omitted or state "Unclear from transcript".',
      '3. Write the executive summary in clear, concise prose (2-4 sentences).',
      '4. Extract keyPoints (3-6 bullets), decisions (only explicit agreements), questionsRaised (unresolved questions asked in the transcript), actionItems (with timestampSec matching the [Ns] line where discussed), and followUps.',
      '5. Keep empty arrays [] if a category has no grounded items.',
    ].join('\n');

    try {
      const response = await runWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                decisions: { type: Type.ARRAY, items: { type: Type.STRING } },
                questionsRaised: { type: Type.ARRAY, items: { type: Type.STRING } },
                actionItems: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      task: { type: Type.STRING },
                      owner: { type: Type.STRING },
                      deadline: { type: Type.STRING },
                      timestampSec: { type: Type.NUMBER },
                    },
                    required: ['task'],
                  },
                },
                followUps: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'summary',
                'keyPoints',
                'decisions',
                'questionsRaised',
                'actionItems',
                'followUps',
              ],
            },
          },
        })
      );

      const rawJson = (response.text ?? '').trim();
      if (!rawJson) {
        res.status(502).json({ detail: 'AI returned an empty summary response.' });
        return;
      }

      const parsed = JSON.parse(rawJson) as ModelSummarizeResponse;
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      if (!summary) {
        res.status(502).json({ detail: 'AI could not produce a valid summary from this transcript.' });
        return;
      }

      const cleanStrings = (arr: unknown): string[] =>
        Array.isArray(arr)
          ? arr.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
          : [];

      const actionItems = Array.isArray(parsed.actionItems)
        ? parsed.actionItems
            .filter((item) => item && typeof item.task === 'string' && item.task.trim().length > 0)
            .map((item, idx) => ({
              id: `act-ai-${Date.now()}-${idx + 1}`,
              task: item.task.trim(),
              ...(typeof item.owner === 'string' && item.owner.trim() ? { owner: item.owner.trim() } : {}),
              ...(typeof item.deadline === 'string' && item.deadline.trim()
                ? { deadline: item.deadline.trim() }
                : {}),
              ...(typeof item.timestampSec === 'number' && Number.isFinite(item.timestampSec) && item.timestampSec >= 0
                ? { timestampSec: Math.round(item.timestampSec) }
                : {}),
              completed: false,
            }))
        : [];

      res.json({
        summary,
        keyPoints: cleanStrings(parsed.keyPoints),
        decisions: cleanStrings(parsed.decisions),
        questionsRaised: cleanStrings(parsed.questionsRaised),
        actionItems,
        followUps: cleanStrings(parsed.followUps),
      });
    } catch (err) {
      const mapped = extractGeminiError(err);
      res.status(mapped.status).json({ detail: mapped.message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CallScribe server listening on http://0.0.0.0:${PORT}`);
  });
}

void createApp();
