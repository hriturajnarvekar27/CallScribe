import { TranscriptSegment } from '../types';

export interface TranscriptParagraph {
  id: string;
  start: number;
  end: number;
  text: string;
  segments: TranscriptSegment[];
}

export interface MeaningfulSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  segments: TranscriptSegment[];
  segmentIds: string[];
}

const SENTENCE_END_RE = /[.!?।]["')\]]*$/;

export function normalizeTranscriptText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function endsWithSentencePunctuation(text: string): boolean {
  return SENTENCE_END_RE.test(text.trim());
}

/**
 * Groups canonical timestamped segments into clean, flowing readable paragraphs.
 * Ignores speaker boundaries and never alters spoken wording.
 */
export function buildReadableParagraphs(segments: TranscriptSegment[]): TranscriptParagraph[] {
  const ordered = segments.filter((seg) => normalizeTranscriptText(seg.text).length > 0);
  if (ordered.length === 0) return [];

  const paragraphs: TranscriptParagraph[] = [];
  let bucket: TranscriptSegment[] = [ordered[0]];
  let charCount = normalizeTranscriptText(ordered[0].text).length;

  const flush = () => {
    if (bucket.length === 0) return;
    paragraphs.push({
      id: `para-${bucket[0].id}`,
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      text: bucket.map((s) => normalizeTranscriptText(s.text)).filter(Boolean).join(' '),
      segments: bucket,
    });
  };

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const seg = ordered[i];
    const prevText = normalizeTranscriptText(prev.text);
    const segText = normalizeTranscriptText(seg.text);
    const gap = seg.start - prev.end;

    const pauseBreak = gap > 2.2;
    const sentenceBreak = charCount >= 260 && endsWithSentencePunctuation(prevText);
    const hardCapBreak = charCount >= 480;

    if (pauseBreak || sentenceBreak || hardCapBreak) {
      flush();
      bucket = [seg];
      charCount = segText.length;
    } else {
      bucket.push(seg);
      charCount += 1 + segText.length;
    }
  }

  flush();
  return paragraphs;
}

/**
 * Coalesces fragmented ASR cues into meaningful, readable timestamped segments
 * while retaining exact canonical segment references and timestamps.
 */
export function buildMeaningfulSegments(segments: TranscriptSegment[]): MeaningfulSegment[] {
  const ordered = segments.filter((seg) => normalizeTranscriptText(seg.text).length > 0);
  if (ordered.length === 0) return [];

  const grouped: MeaningfulSegment[] = [];
  let bucket: TranscriptSegment[] = [ordered[0]];
  let charCount = normalizeTranscriptText(ordered[0].text).length;

  const flush = () => {
    if (bucket.length === 0) return;
    grouped.push({
      id: bucket[0].id,
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      text: bucket.map((s) => normalizeTranscriptText(s.text)).filter(Boolean).join(' '),
      segments: bucket,
      segmentIds: bucket.map((s) => s.id),
    });
  };

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const seg = ordered[i];
    const prevText = normalizeTranscriptText(prev.text);
    const segText = normalizeTranscriptText(seg.text);
    const gap = seg.start - prev.end;
    const combinedDuration = seg.end - bucket[0].start;
    const combinedChars = charCount + 1 + segText.length;

    const pauseBreak = gap > 0.75;
    const naturalSentenceBreak = endsWithSentencePunctuation(prevText) && charCount >= 65;
    const durationCap = combinedDuration > 16;
    const lengthCap = combinedChars > 220;

    if (pauseBreak || naturalSentenceBreak || durationCap || lengthCap) {
      flush();
      bucket = [seg];
      charCount = segText.length;
    } else {
      bucket.push(seg);
      charCount = combinedChars;
    }
  }

  flush();
  return grouped;
}

/**
 * Redistributes edited text back across the underlying canonical segments
 * so every segment retains its exact id, start, and end timestamps for playback sync.
 */
export function redistributeParagraphText(
  segments: TranscriptSegment[],
  editedText: string
): Array<{ id: string; text: string }> {
  const cleaned = editedText.replace(/\s+/g, ' ').trim();
  if (segments.length === 0) return [];
  if (segments.length === 1) {
    return [{ id: segments[0].id, text: cleaned }];
  }

  const newWords = cleaned ? cleaned.split(' ') : [];
  if (newWords.length === 0) {
    return segments.map((seg, idx) => ({ id: seg.id, text: idx === 0 ? '' : '' }));
  }

  const origCounts = segments.map((s) => {
    const words = normalizeTranscriptText(s.text).split(' ').filter(Boolean);
    return Math.max(1, words.length);
  });
  const totalOrig = origCounts.reduce((acc, c) => acc + c, 0);

  const updates: Array<{ id: string; text: string }> = [];
  let cursor = 0;

  for (let i = 0; i < segments.length; i += 1) {
    if (i === segments.length - 1) {
      updates.push({
        id: segments[i].id,
        text: newWords.slice(cursor).join(' '),
      });
      break;
    }

    const remainingSegments = segments.length - 1 - i;
    const remainingWords = newWords.length - cursor;
    const share = Math.round((origCounts[i] / totalOrig) * newWords.length);
    const maxAllowed = Math.max(0, remainingWords - remainingSegments);
    const take = Math.min(maxAllowed, Math.max(remainingWords > remainingSegments ? 1 : 0, share));

    updates.push({
      id: segments[i].id,
      text: newWords.slice(cursor, cursor + take).join(' '),
    });
    cursor += take;
  }

  return updates;
}

/**
 * Finds the active segment index for playback synchronization and caption display.
 */
export function findActiveSegmentIndex<T extends { start: number; end: number }>(
  items: T[],
  currentTime: number
): number {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const isLast = i === items.length - 1;
    if (currentTime >= item.start && (currentTime < item.end || (isLast && currentTime <= item.end + 0.1))) {
      return i;
    }
  }
  return -1;
}
