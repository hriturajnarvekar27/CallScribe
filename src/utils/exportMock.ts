import { ExportFormat, ExportOptions, Job } from '../types';
import { formatDuration, formatSrtTime, formatTimestamp, getLanguageLabel } from './format';
import {
  buildMeaningfulSegments,
  buildReadableParagraphs,
} from './transcriptFormat';

export type SubtitleBuildOptions = ExportOptions;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPlainText(job: Job, options?: ExportOptions): string {
  const includeTimestamps = options?.includeTimestamps ?? true;
  const includeSpeakers = options?.includeSpeakers ?? false;
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

  if (job.analysis) {
    lines.push('TRANSCRIPT ANALYSIS', '-------------------');
    lines.push(
      `Sentiment: ${job.analysis.sentiment}${job.analysis.sentimentNote ? ` — ${job.analysis.sentimentNote}` : ''}`
    );
    if (job.analysis.topics?.length) lines.push(`Topics: ${job.analysis.topics.join(', ')}`);
    if (job.analysis.decisions?.length) {
      lines.push('Decisions:', ...job.analysis.decisions.map((d) => `  - ${d}`));
    }
    if (job.analysis.questionsRaised?.length) {
      lines.push('Questions raised:', ...job.analysis.questionsRaised.map((q) => `  - ${q}`));
    }
    if (job.analysis.risks?.length) {
      lines.push('Risks:', ...job.analysis.risks.map((r) => `  - ${r}`));
    }
    if (job.analysis.nextSteps?.length) {
      lines.push('Next steps:', ...job.analysis.nextSteps.map((n) => `  - ${n}`));
    }
    lines.push('');
  }

  if (job.actionItems?.length) {
    lines.push('ACTION ITEMS', '------------');
    for (const item of job.actionItems) {
      const mark = item.completed ? 'x' : ' ';
      const meta: string[] = [];
      if (item.owner) meta.push(`Owner: ${item.owner}`);
      if (item.deadline) meta.push(`Due: ${item.deadline}`);
      if (typeof item.timestampSec === 'number') meta.push(`@${formatTimestamp(item.timestampSec)}`);
      const suffix = meta.length ? ` (${meta.join(', ')})` : '';
      lines.push(`- [${mark}] ${item.task}${suffix}`);
    }
    lines.push('');
  }

  if (job.bookmarks?.length) {
    lines.push('BOOKMARKS', '---------');
    const ordered = [...job.bookmarks].sort((a, b) => a.timeSec - b.timeSec);
    for (const bm of ordered) {
      const notePart = bm.note ? ` — ${bm.note}` : '';
      lines.push(`- [${formatTimestamp(bm.timeSec)}] [${bm.category}] ${bm.label}${notePart}`);
    }
    lines.push('');
  }

  if (job.transcript?.length) {
    lines.push('TRANSCRIPT', '----------');
    if (includeSpeakers) {
      for (const seg of job.transcript) {
        const speaker = speakerMap.get(seg.speakerId) ?? seg.speakerId;
        const tsPrefix = includeTimestamps ? `[${formatTimestamp(seg.start)}] ` : '';
        lines.push(`${tsPrefix}${speaker}: ${seg.text}`);
      }
    } else if (!includeTimestamps) {
      for (const para of buildReadableParagraphs(job.transcript)) {
        lines.push(para.text, '');
      }
    } else {
      for (const seg of buildMeaningfulSegments(job.transcript)) {
        lines.push(`[${formatTimestamp(seg.start)}] ${seg.text}`, '');
      }
    }
  }

  return lines.join('\n');
}

function buildMarkdown(job: Job, options?: ExportOptions): string {
  const includeTimestamps = options?.includeTimestamps ?? true;
  const includeSpeakers = options?.includeSpeakers ?? false;
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
    if (job.analysis.questionsRaised?.length) {
      lines.push('**Questions Raised:**', ...job.analysis.questionsRaised.map((q) => `- ${q}`), '');
    }
    if (job.analysis.risks.length) {
      lines.push('**Risks:**', ...job.analysis.risks.map((r) => `- ${r}`), '');
    }
    if (job.analysis.nextSteps?.length) {
      lines.push('**Next Steps:**', ...job.analysis.nextSteps.map((n) => `- ${n}`), '');
    }
  }

  if (job.actionItems?.length) {
    lines.push('## Action Items', '');
    for (const item of job.actionItems) {
      const mark = item.completed ? 'x' : ' ';
      const meta: string[] = [];
      if (item.owner) meta.push(`Owner: ${item.owner}`);
      if (item.deadline) meta.push(`Due: ${item.deadline}`);
      if (typeof item.timestampSec === 'number') meta.push(`@${formatTimestamp(item.timestampSec)}`);
      const suffix = meta.length ? ` *(${meta.join(', ')})*` : '';
      lines.push(`- [${mark}] ${item.task}${suffix}`);
    }
    lines.push('');
  }

  if (job.bookmarks?.length) {
    lines.push('## Bookmarks', '');
    const ordered = [...job.bookmarks].sort((a, b) => a.timeSec - b.timeSec);
    for (const bm of ordered) {
      const notePart = bm.note ? ` — ${bm.note}` : '';
      lines.push(`- **[${formatTimestamp(bm.timeSec)}]** \`${bm.category}\` ${bm.label}${notePart}`);
    }
    lines.push('');
  }

  if (job.transcript?.length) {
    lines.push('## Transcript', '');
    if (includeSpeakers) {
      for (const seg of job.transcript) {
        const speaker = speakerMap.get(seg.speakerId) ?? seg.speakerId;
        if (includeTimestamps) {
          lines.push(`**[${formatTimestamp(seg.start)}] ${speaker}:** ${seg.text}`, '');
        } else {
          lines.push(`**${speaker}:** ${seg.text}`, '');
        }
      }
    } else if (!includeTimestamps) {
      for (const para of buildReadableParagraphs(job.transcript)) {
        lines.push(para.text, '');
      }
    } else {
      for (const seg of buildMeaningfulSegments(job.transcript)) {
        lines.push(`**[${formatTimestamp(seg.start)}]** ${seg.text}`, '');
      }
    }
  }

  return lines.join('\n');
}

export function buildSrt(job: Job, options?: ExportOptions): string {
  const includeSpeakers = options?.includeSpeakers ?? false;
  const offsetSec = options?.offsetSec ?? 0;
  const speakerMap = new Map(job.speakers.map((s) => [s.id, s.name]));
  const rawSegments = job.transcript ?? [];
  const cues = includeSpeakers ? rawSegments : buildMeaningfulSegments(rawSegments);

  return cues
    .map((seg, idx) => {
      const start = Math.max(0, seg.start + offsetSec);
      const end = Math.max(start + 0.5, seg.end + offsetSec);
      const body =
        includeSpeakers && 'speakerId' in seg
          ? `${speakerMap.get(seg.speakerId) ?? seg.speakerId}: ${seg.text}`
          : seg.text;
      return `${idx + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${body}\n`;
    })
    .join('\n');
}

export function buildVtt(job: Job, options?: ExportOptions): string {
  const includeSpeakers = options?.includeSpeakers ?? false;
  const offsetSec = options?.offsetSec ?? 0;
  const speakerMap = new Map(job.speakers.map((s) => [s.id, s.name]));
  const rawSegments = job.transcript ?? [];
  const cues = includeSpeakers ? rawSegments : buildMeaningfulSegments(rawSegments);

  const formattedCues = cues
    .map((seg) => {
      const startSec = Math.max(0, seg.start + offsetSec);
      const endSec = Math.max(startSec + 0.5, seg.end + offsetSec);
      const start = formatSrtTime(startSec).replace(',', '.');
      const end = formatSrtTime(endSec).replace(',', '.');
      const body =
        includeSpeakers && 'speakerId' in seg
          ? `${speakerMap.get(seg.speakerId) ?? seg.speakerId}: ${seg.text}`
          : seg.text;
      return `${start} --> ${end}\n${body}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${formattedCues}`;
}

function buildDocxHtml(job: Job, options?: ExportOptions): string {
  const includeTimestamps = options?.includeTimestamps ?? true;
  const includeSpeakers = options?.includeSpeakers ?? false;
  const speakerMap = new Map(job.speakers.map((s) => [s.id, s.name]));
  const dateStr = new Date(job.createdAt).toLocaleString();
  const durationStr = formatDuration(job.durationSec);
  const langStr = getLanguageLabel(job.language);

  const sections: string[] = [];

  if (job.summary) {
    sections.push(`
      <h2>Summary</h2>
      <p class="summary">${escapeHtml(job.summary)}</p>
    `);
  }

  if (job.keyPoints?.length) {
    sections.push(`
      <h3>Key Points</h3>
      <ul>${job.keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
    `);
  }

  if (job.notes?.length) {
    const noteHtml = job.notes
      .map(
        (sec) => `
        <h3>${escapeHtml(sec.heading)}</h3>
        <ul>${sec.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
      `
      )
      .join('');
    sections.push(`<h2>Meeting Notes</h2>${noteHtml}`);
  }

  if (job.analysis) {
    const parts: string[] = [
      `<p><strong>Sentiment:</strong> ${escapeHtml(job.analysis.sentiment)}${
        job.analysis.sentimentNote ? ` — ${escapeHtml(job.analysis.sentimentNote)}` : ''
      }</p>`,
    ];
    if (job.analysis.topics?.length) {
      parts.push(`<p><strong>Topics:</strong> ${escapeHtml(job.analysis.topics.join(', '))}</p>`);
    }
    if (job.analysis.decisions?.length) {
      parts.push(
        `<h3>Key Decisions</h3><ul>${job.analysis.decisions
          .map((d) => `<li>${escapeHtml(d)}</li>`)
          .join('')}</ul>`
      );
    }
    if (job.analysis.questionsRaised?.length) {
      parts.push(
        `<h3>Questions Raised</h3><ul>${job.analysis.questionsRaised
          .map((q) => `<li>${escapeHtml(q)}</li>`)
          .join('')}</ul>`
      );
    }
    if (job.analysis.risks?.length) {
      parts.push(
        `<h3>Risks</h3><ul>${job.analysis.risks
          .map((r) => `<li>${escapeHtml(r)}</li>`)
          .join('')}</ul>`
      );
    }
    if (job.analysis.nextSteps?.length) {
      parts.push(
        `<h3>Next Steps</h3><ul>${job.analysis.nextSteps
          .map((n) => `<li>${escapeHtml(n)}</li>`)
          .join('')}</ul>`
      );
    }
    sections.push(`<h2>Transcript Analysis</h2>${parts.join('')}`);
  }

  if (job.actionItems?.length) {
    const items = job.actionItems
      .map((item) => {
        const mark = item.completed ? '[x]' : '[ ]';
        const meta: string[] = [];
        if (item.owner) meta.push(`Owner: ${item.owner}`);
        if (item.deadline) meta.push(`Due: ${item.deadline}`);
        if (typeof item.timestampSec === 'number') meta.push(`@${formatTimestamp(item.timestampSec)}`);
        const suffix = meta.length ? ` <span class="muted">(${escapeHtml(meta.join(', '))})</span>` : '';
        return `<li><code>${mark}</code> ${escapeHtml(item.task)}${suffix}</li>`;
      })
      .join('');
    sections.push(`<h2>Action Items</h2><ul>${items}</ul>`);
  }

  if (job.bookmarks?.length) {
    const ordered = [...job.bookmarks].sort((a, b) => a.timeSec - b.timeSec);
    const items = ordered
      .map((bm) => {
        const notePart = bm.note ? ` — ${escapeHtml(bm.note)}` : '';
        return `<li><span class="ts">[${formatTimestamp(bm.timeSec)}]</span> <strong>${escapeHtml(
          bm.category
        )}:</strong> ${escapeHtml(bm.label)}${notePart}</li>`;
      })
      .join('');
    sections.push(`<h2>Bookmarks</h2><ul>${items}</ul>`);
  }

  if (job.transcript?.length) {
    let bodyHtml = '';
    if (includeSpeakers) {
      bodyHtml = job.transcript
        .map((seg) => {
          const speaker = speakerMap.get(seg.speakerId) ?? seg.speakerId;
          const ts = includeTimestamps ? `<span class="ts">[${formatTimestamp(seg.start)}]</span> ` : '';
          return `<p class="seg">${ts}<strong>${escapeHtml(speaker)}:</strong> ${escapeHtml(seg.text)}</p>`;
        })
        .join('');
    } else if (!includeTimestamps) {
      bodyHtml = buildReadableParagraphs(job.transcript)
        .map((para) => `<p class="prose">${escapeHtml(para.text)}</p>`)
        .join('');
    } else {
      const rows = buildMeaningfulSegments(job.transcript)
        .map(
          (seg) => `
          <tr>
            <td class="ts-col">${formatTimestamp(seg.start)}</td>
            <td class="text-col">${escapeHtml(seg.text)}</td>
          </tr>
        `
        )
        .join('');
      bodyHtml = `<table class="transcript-table">${rows}</table>`;
    }
    sections.push(`<h2>Transcript</h2>${bodyHtml}`);
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(job.title)}</title>
<style>
  @page { margin: 0.85in; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; color: #18181b; font-size: 10.5pt; line-height: 1.55; margin: 0; }
  .header { border-bottom: 1.5pt solid #e4e4e7; padding-bottom: 10pt; margin-bottom: 16pt; }
  h1 { font-size: 20pt; font-weight: 700; color: #111827; margin: 0 0 6pt 0; }
  .meta { font-size: 9.5pt; color: #52525b; margin: 0; }
  h2 { font-size: 13pt; font-weight: 700; color: #312e81; border-bottom: 0.75pt solid #e4e4e7; padding-bottom: 3pt; margin: 18pt 0 8pt 0; page-break-after: avoid; }
  h3 { font-size: 10.5pt; font-weight: 700; color: #27272a; margin: 12pt 0 5pt 0; page-break-after: avoid; }
  p { margin: 0 0 8pt 0; }
  p.summary { background: #f8fafc; border-left: 2.5pt solid #4f46e5; padding: 8pt 10pt; }
  p.prose { margin: 0 0 10pt 0; line-height: 1.62; }
  p.seg { margin: 0 0 7pt 0; }
  ul { margin: 4pt 0 10pt 18pt; padding: 0; }
  li { margin: 0 0 4pt 0; }
  .ts { font-family: Consolas, 'Courier New', monospace; font-size: 9pt; color: #64748b; }
  .muted { color: #71717a; font-size: 9.5pt; }
  table.transcript-table { width: 100%; border-collapse: collapse; margin-top: 6pt; }
  table.transcript-table td { vertical-align: top; padding: 4pt 0 8pt 0; }
  td.ts-col { width: 54pt; font-family: Consolas, 'Courier New', monospace; font-size: 9pt; color: #64748b; padding-right: 10pt; white-space: nowrap; }
  td.text-col { font-size: 10.5pt; line-height: 1.58; color: #18181b; }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(job.title)}</h1>
    <p class="meta">${escapeHtml(dateStr)} &nbsp;&bull;&nbsp; ${escapeHtml(durationStr)} &nbsp;&bull;&nbsp; ${escapeHtml(langStr)}</p>
  </div>
  ${sections.join('\n')}
</body>
</html>`;
}

function pdfSafeText(raw: string): string {
  return raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/[^\x20-\x7E]/g, '?');
}

function escapePdfString(text: string): string {
  return pdfSafeText(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = pdfSafeText(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildStructuredPdfBlob(job: Job, options?: ExportOptions): Blob {
  const includeTimestamps = options?.includeTimestamps ?? true;
  const includeSpeakers = options?.includeSpeakers ?? false;
  const speakerMap = new Map(job.speakers.map((s) => [s.id, s.name]));

  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 52;
  const topY = 742;
  const bottomY = 58;

  const pages: string[][] = [[]];
  let y = topY;

  const currentPage = () => pages[pages.length - 1];
  const ensureSpace = (needed: number) => {
    if (y - needed < bottomY) {
      pages.push([]);
      y = topY;
    }
  };

  const drawText = (
    font: 'F1' | 'F2',
    size: number,
    x: number,
    posY: number,
    rgb: [number, number, number],
    text: string
  ) => {
    currentPage().push(
      `BT /${font} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg 1 0 0 1 ${x} ${posY.toFixed(1)} Tm (${escapePdfString(text)}) Tj ET`
    );
  };

  const drawRule = (posY: number, width = pageWidth - marginX * 2) => {
    currentPage().push(
      `q 0.85 0.87 0.90 RG 0.65 w ${marginX} ${posY.toFixed(1)} m ${marginX + width} ${posY.toFixed(1)} l S Q`
    );
  };

  const addHeading = (title: string) => {
    ensureSpace(34);
    y -= 8;
    drawText('F2', 11.5, marginX, y, [0.19, 0.18, 0.51], title);
    y -= 5;
    drawRule(y);
    y -= 14;
  };

  const addSubheading = (title: string) => {
    ensureSpace(22);
    y -= 3;
    drawText('F2', 10, marginX, y, [0.16, 0.16, 0.18], title);
    y -= 14;
  };

  const addParagraph = (text: string, opts?: { x?: number; maxChars?: number; size?: number; lineHeight?: number; gapAfter?: number; rgb?: [number, number, number] }) => {
    const x = opts?.x ?? marginX;
    const maxChars = opts?.maxChars ?? 88;
    const size = opts?.size ?? 10;
    const lineHeight = opts?.lineHeight ?? 14.5;
    const gapAfter = opts?.gapAfter ?? 6;
    const rgb = opts?.rgb ?? [0.12, 0.13, 0.15];

    const wrapped = wrapText(text, maxChars);
    for (const line of wrapped) {
      ensureSpace(lineHeight + 4);
      drawText('F1', size, x, y, rgb, line);
      y -= lineHeight;
    }
    y -= gapAfter;
  };

  const addBullet = (text: string) => {
    const wrapped = wrapText(text, 82);
    for (let i = 0; i < wrapped.length; i++) {
      ensureSpace(16);
      if (i === 0) {
        drawText('F2', 10, marginX + 4, y, [0.31, 0.27, 0.9], '-');
      }
      drawText('F1', 10, marginX + 16, y, [0.15, 0.16, 0.18], wrapped[i]);
      y -= 14;
    }
    y -= 2;
  };

  // Title Header
  for (const titleLine of wrapText(job.title, 54)) {
    ensureSpace(22);
    drawText('F2', 16, marginX, y, [0.07, 0.09, 0.15], titleLine);
    y -= 20;
  }
  const metaLine = `${new Date(job.createdAt).toLocaleString()}  |  ${formatDuration(job.durationSec)}  |  ${getLanguageLabel(job.language)}`;
  drawText('F1', 9, marginX, y, [0.4, 0.43, 0.49], metaLine);
  y -= 8;
  drawRule(y);
  y -= 14;

  if (job.summary) {
    addHeading('Summary');
    addParagraph(job.summary, { gapAfter: 8 });
  }

  if (job.keyPoints?.length) {
    addSubheading('Key Points');
    for (const kp of job.keyPoints) addBullet(kp);
    y -= 4;
  }

  if (job.notes?.length) {
    addHeading('Meeting Notes');
    for (const sec of job.notes) {
      addSubheading(sec.heading);
      for (const b of sec.bullets) addBullet(b);
      y -= 3;
    }
  }

  if (job.analysis) {
    addHeading('Transcript Analysis');
    addParagraph(
      `Sentiment: ${job.analysis.sentiment}${job.analysis.sentimentNote ? ` - ${job.analysis.sentimentNote}` : ''}`,
      { gapAfter: 5 }
    );
    if (job.analysis.decisions?.length) {
      addSubheading('Key Decisions');
      for (const d of job.analysis.decisions) addBullet(d);
    }
    if (job.analysis.questionsRaised?.length) {
      addSubheading('Questions Raised');
      for (const q of job.analysis.questionsRaised) addBullet(q);
    }
    if (job.analysis.risks?.length) {
      addSubheading('Risks');
      for (const r of job.analysis.risks) addBullet(r);
    }
    if (job.analysis.nextSteps?.length) {
      addSubheading('Next Steps');
      for (const n of job.analysis.nextSteps) addBullet(n);
    }
  }

  if (job.actionItems?.length) {
    addHeading('Action Items');
    for (const item of job.actionItems) {
      const mark = item.completed ? '[x]' : '[ ]';
      const meta: string[] = [];
      if (item.owner) meta.push(`Owner: ${item.owner}`);
      if (item.deadline) meta.push(`Due: ${item.deadline}`);
      if (typeof item.timestampSec === 'number') meta.push(`@${formatTimestamp(item.timestampSec)}`);
      const suffix = meta.length ? ` (${meta.join(', ')})` : '';
      addBullet(`${mark} ${item.task}${suffix}`);
    }
  }

  if (job.bookmarks?.length) {
    addHeading('Bookmarks');
    const ordered = [...job.bookmarks].sort((a, b) => a.timeSec - b.timeSec);
    for (const bm of ordered) {
      const notePart = bm.note ? ` - ${bm.note}` : '';
      addBullet(`[${formatTimestamp(bm.timeSec)}] [${bm.category}] ${bm.label}${notePart}`);
    }
  }

  if (job.transcript?.length) {
    addHeading('Transcript');
    if (includeSpeakers) {
      for (const seg of job.transcript) {
        const speaker = speakerMap.get(seg.speakerId) ?? seg.speakerId;
        const tsPrefix = includeTimestamps ? `[${formatTimestamp(seg.start)}] ` : '';
        addParagraph(`${tsPrefix}${speaker}: ${seg.text}`, { gapAfter: 6 });
      }
    } else if (!includeTimestamps) {
      for (const para of buildReadableParagraphs(job.transcript)) {
        addParagraph(para.text, { gapAfter: 9, lineHeight: 15 });
      }
    } else {
      for (const seg of buildMeaningfulSegments(job.transcript)) {
        const ts = formatTimestamp(seg.start);
        const wrapped = wrapText(seg.text, 76);
        ensureSpace(18);
        drawText('F2', 9, marginX, y, [0.42, 0.45, 0.52], ts);
        for (const line of wrapped) {
          ensureSpace(16);
          drawText('F1', 10, marginX + 52, y, [0.12, 0.13, 0.15], line);
          y -= 14.5;
        }
        y -= 6;
      }
    }
  }

  // Add subtle footer to each page
  const totalPages = pages.length;
  for (let p = 0; p < totalPages; p++) {
    const pageOps = pages[p];
    pageOps.push(
      `q 0.88 0.89 0.92 RG 0.5 w ${marginX} 40 m ${pageWidth - marginX} 40 l S Q`,
      `BT /F1 8 Tf 0.45 0.48 0.54 rg 1 0 0 1 ${marginX} 27 Tm (CallScribe Transcript Export) Tj ET`,
      `BT /F1 8 Tf 0.45 0.48 0.54 rg 1 0 0 1 ${pageWidth - marginX - 52} 27 Tm (Page ${p + 1} of ${totalPages}) Tj ET`
    );
  }

  // Build PDF object table:
  // 1 = Catalog, 2 = Pages, 3 = F1 (Helvetica), 4 = F2 (Helvetica-Bold),
  // then pairs of (Page, ContentStream) for each page.
  const objects: string[] = [];
  const pageObjNums: number[] = [];
  const nextObjStart = 5;
  for (let i = 0; i < totalPages; i++) {
    pageObjNums.push(nextObjStart + i * 2);
  }

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${totalPages} >>\nendobj\n`
  );
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  for (let i = 0; i < totalPages; i++) {
    const pageObj = nextObjStart + i * 2;
    const streamObj = pageObj + 1;
    const stream = pages[i].join('\n');
    objects.push(
      `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamObj} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n`
    );
    objects.push(
      `${streamObj} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  }

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
  options?: ExportOptions
): void {
  const safeBase =
    job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    'callscribe-export';
  let blob: Blob;
  let ext: string = format;

  switch (format) {
    case 'md':
      blob = new Blob([buildMarkdown(job, options)], { type: 'text/markdown;charset=utf-8' });
      break;
    case 'txt':
      blob = new Blob([buildPlainText(job, options)], { type: 'text/plain;charset=utf-8' });
      break;
    case 'srt':
      blob = new Blob([buildSrt(job, options)], { type: 'text/plain;charset=utf-8' });
      break;
    case 'vtt':
      blob = new Blob([buildVtt(job, options)], { type: 'text/vtt;charset=utf-8' });
      break;
    case 'docx': {
      blob = new Blob([buildDocxHtml(job, options)], { type: 'application/msword;charset=utf-8' });
      ext = 'doc';
      break;
    }
    case 'pdf':
      blob = buildStructuredPdfBlob(job, options);
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
