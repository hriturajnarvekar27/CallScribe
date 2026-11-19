import { ExportFormat, Job } from '../types';
import { formatDuration, formatSrtTime, formatTimestamp, getLanguageLabel } from './format';

export interface SubtitleBuildOptions {
  includeSpeakers?: boolean;
  offsetSec?: number;
}

function buildPlainText(job: Job): string {
  const speakerMap = new Map(job.speakers.map((s) => [s.id, s.name]));
  const lines: string[] = [
    job.title,
    `Date: ${new Date(job.createdAt).toLocaleString()} | Duration: ${formatDuration(job.durationSec)} | Language: ${getLanguageLabel(job.language)}`,
    '',
  ];

  if (job.summary) {
    lines.push('SUMMARY', '-------', job.summary, '');
  }

  if (job.keyPoints?.length) {
    lines.push('KEY POINTS', '----------', ...job.keyPoints.map((p) => `- ${p}`), '');
  }

  if (job.notes?.length) {
    lines.push('MEETING NOTES', '-------------');
    for (const section of job.notes) {
      lines.push(section.heading);
      for (const b of section.bullets) {
        lines.push(`  • ${b}`);
      }
      lines.push('');
    }
  }

  if (job.transcript?.length) {
    lines.push('TRANSCRIPT', '----------');
    for (const seg of job.transcript) {
      const speaker = speakerMap.get(seg.speakerId) ?? seg.speakerId;
      lines.push(`[${formatTimestamp(seg.start)}] ${speaker}: ${seg.text}`);
    }
  }

  return lines.join('\n');
}

function buildMarkdown(job: Job): string {
  const speakerMap = new Map(job.speakers.map((s) => [s.id, s.name]));
  const lines: string[] = [
    `# ${job.title}`,
    '',
    `- **Date:** ${new Date(job.createdAt).toLocaleString()}`,
    `- **Duration:** ${formatDuration(job.durationSec)}`,
    `- **Language:** ${getLanguageLabel(job.language)}`,
    '',
  ];

  if (job.summary) {
    lines.push('## Summary', '', job.summary, '');
  }

  if (job.keyPoints?.length) {
    lines.push('### Key Points', '', ...job.keyPoints.map((p) => `- ${p}`), '');
  }

  if (job.notes?.length) {
    lines.push('## Notes', '');
    for (const section of job.notes) {
      lines.push(`### ${section.heading}`, '', ...section.bullets.map((b) => `- ${b}`), '');
    }
  }

  if (job.analysis) {
    lines.push('## Transcript Analysis', '');
    lines.push(`**Sentiment:** ${job.analysis.sentiment} — ${job.analysis.sentimentNote}`, '');
    if (job.analysis.decisions.length) {
      lines.push('**Key Decisions:**', ...job.analysis.decisions.map((d) => `- ${d}`), '');
    }
    if (job.analysis.risks.length) {
      lines.push('**Risks:**', ...job.analysis.risks.map((r) => `- ${r}`), '');
    }
  }

  if (job.transcript?.length) {
    lines.push('## Transcript', '');
    for (const seg of job.transcript) {
      const speaker = speakerMap.get(seg.speakerId) ?? seg.speakerId;
      lines.push(`**[${formatTimestamp(seg.start)}] ${speaker}:** ${seg.text}`, '');
    }
  }

  return lines.join('\n');
}

export function buildSrt(job: Job, options?: SubtitleBuildOptions): string {
  const includeSpeakers = options?.includeSpeakers ?? true;
  const offsetSec = options?.offsetSec ?? 0;
  const speakerMap = new Map(job.speakers.map((s) => [s.id, s.name]));
  const segments = job.transcript ?? [];
  return segments
    .map((seg, idx) => {
      const start = Math.max(0, seg.start + offsetSec);
      const end = Math.max(start + 0.5, seg.end + offsetSec);
      const speaker = speakerMap.get(seg.speakerId) ?? seg.speakerId;
      const body = includeSpeakers ? `${speaker}: ${seg.text}` : seg.text;
      return `${idx + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${body}\n`;
    })
    .join('\n');
}

export function buildVtt(job: Job, options?: SubtitleBuildOptions): string {
  const includeSpeakers = options?.includeSpeakers ?? true;
  const offsetSec = options?.offsetSec ?? 0;
  const speakerMap = new Map(job.speakers.map((s) => [s.id, s.name]));
  const segments = job.transcript ?? [];
  const cues = segments
    .map((seg) => {
      const startSec = Math.max(0, seg.start + offsetSec);
      const endSec = Math.max(startSec + 0.5, seg.end + offsetSec);
      const speaker = speakerMap.get(seg.speakerId) ?? seg.speakerId;
      const start = formatSrtTime(startSec).replace(',', '.');
      const end = formatSrtTime(endSec).replace(',', '.');
      const body = includeSpeakers ? `${speaker}: ${seg.text}` : seg.text;
      return `${start} --> ${end}\n${body}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${cues}`;
}

function buildMinimalPdfBlob(text: string): Blob {
  const sanitized = text
    .replace(/[^\x20-\x7E\n]/g, '?')
    .split('\n')
    .slice(0, 48);

  const escapedLines = sanitized.map((line) =>
    line.slice(0, 92).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  );

  const contentStream = [
    'BT',
    '/F1 10 Tf',
    '48 760 Td',
    '14 TL',
    ...escapedLines.map((line, i) => (i === 0 ? `(${line}) Tj` : `T* (${line}) Tj`)),
    'ET',
  ].join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function downloadMockExport(
  job: Job,
  format: ExportFormat,
  subtitleOptions?: SubtitleBuildOptions
): void {
  const safeBase =
    job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    'callscribe-export';
  let blob: Blob;
  let ext: string = format;

  switch (format) {
    case 'md':
      blob = new Blob([buildMarkdown(job)], { type: 'text/markdown;charset=utf-8' });
      break;
    case 'txt':
      blob = new Blob([buildPlainText(job)], { type: 'text/plain;charset=utf-8' });
      break;
    case 'srt':
      blob = new Blob([buildSrt(job, subtitleOptions)], { type: 'text/plain;charset=utf-8' });
      break;
    case 'vtt':
      blob = new Blob([buildVtt(job, subtitleOptions)], { type: 'text/vtt;charset=utf-8' });
      break;
    case 'docx': {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${job.title}</title></head><body><pre style="font-family:Calibri,sans-serif;white-space:pre-wrap;">${buildPlainText(job).replace(/</g, '&lt;')}</pre></body></html>`;
      blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
      ext = 'doc';
      break;
    }
    case 'pdf':
      blob = buildMinimalPdfBlob(buildPlainText(job));
      break;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeBase}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
