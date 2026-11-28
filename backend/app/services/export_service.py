from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from fpdf import FPDF

from app.schemas import ExportFormat, JobDetailSchema

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
NOTO_SANS_REGULAR = FONTS_DIR / "NotoSans-Regular.ttf"
NOTO_SANS_BOLD = FONTS_DIR / "NotoSans-Bold.ttf"
NOTO_DEVANAGARI_REGULAR = FONTS_DIR / "NotoSansDevanagari-Regular.ttf"
NOTO_DEVANAGARI_BOLD = FONTS_DIR / "NotoSansDevanagari-Bold.ttf"

LANGUAGE_LABELS = {
    "auto": "Auto-detect",
    "en": "English",
    "hi": "Hindi (हिन्दी)",
    "mr": "Marathi (मराठी)",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
}


@dataclass(frozen=True)
class ExportedFile:
    content: bytes
    media_type: str
    content_disposition: str


@dataclass(frozen=True)
class MeaningfulSegment:
    id: str
    start: float
    end: float
    text: str


def _format_duration(total_seconds: float) -> str:
    safe = max(0, int(total_seconds))
    hours = safe // 3600
    minutes = (safe % 3600) // 60
    seconds = safe % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def _format_srt_time(seconds: float) -> str:
    safe = max(0.0, float(seconds))
    whole = int(safe)
    hrs = whole // 3600
    mins = (whole % 3600) // 60
    secs = whole % 60
    ms = int(round((safe - whole) * 1000))
    if ms >= 1000:
        ms = 999
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def _format_vtt_time(seconds: float) -> str:
    return _format_srt_time(seconds).replace(",", ".")


def _safe_filename_base(title: str, job_id: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", title.strip()).strip("-")
    if slug:
        return slug[:80].lower()
    safe_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", job_id)
    return f"callscribe-{safe_id}"


def _build_content_disposition(title: str, job_id: str, ext: str) -> str:
    ascii_base = _safe_filename_base(title, job_id)
    ascii_name = f"{ascii_base}.{ext}"

    utf8_base = re.sub(r'[/\\<>:"|?*\x00-\x1f]', "_", title.strip()).strip(".") or ascii_base
    utf8_name = f"{utf8_base[:80]}.{ext}"
    encoded_utf8 = quote(utf8_name, safe="")
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded_utf8}'


def _speaker_map(job: JobDetailSchema) -> dict[str, str]:
    return {spk.id: spk.name for spk in job.speakers}


def _language_label(code: str) -> str:
    return LANGUAGE_LABELS.get(code, code.upper())


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _ends_with_sentence(text: str) -> bool:
    return bool(re.search(r'[.?!।]["\')\]]?$', text.strip()))


def _group_paragraphs_for_export(job: JobDetailSchema) -> list[str]:
    """
    Build clean editorial paragraphs from the canonical transcript segments.
    Speaker changes are ignored so continuous transcripts read naturally.
    """
    paragraphs: list[str] = []
    current_parts: list[str] = []
    current_text = ""
    prev_end: float | None = None

    for seg in job.transcript:
        text = _normalize_text(seg.text)
        if not text:
            continue

        pause_gap = (seg.start - prev_end) if prev_end is not None else 0.0
        should_break = False
        if current_parts:
            if pause_gap > 2.2:
                should_break = True
            elif len(current_text) >= 260 and _ends_with_sentence(current_text):
                should_break = True
            elif len(current_text) + len(text) + 1 >= 480:
                should_break = True

        if should_break:
            paragraphs.append(current_text)
            current_parts = []
            current_text = ""

        current_parts.append(text)
        current_text = f"{current_text} {text}" if current_text else text
        prev_end = seg.end

    if current_text:
        paragraphs.append(current_text)

    return paragraphs


def _group_meaningful_segments(job: JobDetailSchema) -> list[MeaningfulSegment]:
    """
    Coalesce overly fragmented ASR micro-cues into meaningful timestamped segments
    while keeping complete sentences distinct and preserving canonical timing bounds.
    """
    result: list[MeaningfulSegment] = []
    curr_id = ""
    curr_start = 0.0
    curr_end = 0.0
    curr_text = ""

    for seg in job.transcript:
        text = _normalize_text(seg.text)
        if not text:
            continue

        if not curr_text:
            curr_id = seg.id
            curr_start = seg.start
            curr_end = seg.end
            curr_text = text
            continue

        gap = seg.start - curr_end
        projected_duration = seg.end - curr_start
        projected_len = len(curr_text) + 1 + len(text)

        should_merge = (
            gap <= 0.75
            and projected_duration <= 16.0
            and projected_len <= 220
            and not (_ends_with_sentence(curr_text) and len(curr_text) >= 35)
        )

        if should_merge:
            curr_text = f"{curr_text} {text}"
            curr_end = max(curr_end, seg.end)
        else:
            result.append(
                MeaningfulSegment(
                    id=curr_id,
                    start=curr_start,
                    end=curr_end,
                    text=curr_text,
                )
            )
            curr_id = seg.id
            curr_start = seg.start
            curr_end = seg.end
            curr_text = text

    if curr_text:
        result.append(
            MeaningfulSegment(
                id=curr_id,
                start=curr_start,
                end=curr_end,
                text=curr_text,
            )
        )

    return result


def _format_transcript_prefix(
    start_sec: float,
    speaker: str,
    *,
    include_timestamps: bool,
    include_speakers: bool,
) -> str:
    if include_timestamps and include_speakers:
        return f"[{_format_duration(start_sec)}] {speaker}: "
    if include_timestamps:
        return f"[{_format_duration(start_sec)}] "
    if include_speakers:
        return f"{speaker}: "
    return ""


def _build_plain_text(
    job: JobDetailSchema,
    *,
    include_timestamps: bool = True,
    include_speakers: bool = False,
) -> str:
    spk_map = _speaker_map(job)
    lines: list[str] = [
        job.title,
        (
            f"Date: {job.createdAt} | Duration: {_format_duration(job.durationSec)} "
            f"| Language: {_language_label(job.language)} | Status: {job.status}"
        ),
        "",
    ]

    if job.summary:
        lines.extend(["SUMMARY", "-------", job.summary, ""])

    if job.keyPoints:
        lines.extend(["KEY POINTS", "----------", *[f"- {p}" for p in job.keyPoints], ""])

    if job.notes:
        lines.extend(["MEETING NOTES", "-------------"])
        for section in job.notes:
            lines.append(section.heading)
            for bullet in section.bullets:
                lines.append(f"  * {bullet}")
            lines.append("")

    if job.analysis:
        lines.extend(
            [
                "TRANSCRIPT ANALYSIS",
                "-------------------",
                f"Sentiment: {job.analysis.sentiment}"
                + (f" - {job.analysis.sentimentNote}" if job.analysis.sentimentNote else ""),
            ]
        )
        if job.analysis.topics:
            lines.append(f"Topics: {', '.join(job.analysis.topics)}")
        if job.analysis.decisions:
            lines.extend(["Decisions:", *[f"  - {d}" for d in job.analysis.decisions]])
        if job.analysis.concerns:
            lines.extend(["Concerns:", *[f"  - {c}" for c in job.analysis.concerns]])
        if job.analysis.risks:
            lines.extend(["Risks:", *[f"  - {r}" for r in job.analysis.risks]])
        if job.analysis.questionsRaised:
            lines.extend(["Questions raised:", *[f"  - {q}" for q in job.analysis.questionsRaised]])
        if job.analysis.nextSteps:
            lines.extend(["Next steps:", *[f"  - {n}" for n in job.analysis.nextSteps]])
        lines.append("")

    if job.actionItems:
        lines.extend(["ACTION ITEMS", "------------"])
        for item in job.actionItems:
            mark = "x" if item.completed else " "
            meta_parts: list[str] = []
            if item.owner:
                meta_parts.append(f"Owner: {item.owner}")
            if item.deadline:
                meta_parts.append(f"Due: {item.deadline}")
            if item.timestampSec is not None:
                meta_parts.append(f"@{_format_duration(item.timestampSec)}")
            suffix = f" ({', '.join(meta_parts)})" if meta_parts else ""
            lines.append(f"- [{mark}] {item.task}{suffix}")
        lines.append("")

    if job.bookmarks:
        lines.extend(["BOOKMARKS", "---------"])
        for bm in sorted(job.bookmarks, key=lambda b: b.timeSec):
            note_part = f" — {bm.note}" if bm.note else ""
            lines.append(f"- [{_format_duration(bm.timeSec)}] [{bm.category}] {bm.label}{note_part}")
        lines.append("")

    lines.extend(["TRANSCRIPT", "----------"])
    if job.transcript:
        if not include_timestamps and not include_speakers:
            for para in _group_paragraphs_for_export(job):
                lines.extend([para, ""])
        elif include_timestamps and not include_speakers:
            for seg in _group_meaningful_segments(job):
                lines.append(f"[{_format_duration(seg.start)}] {seg.text}")
        else:
            for seg in job.transcript:
                speaker = spk_map.get(seg.speakerId, seg.speakerId)
                prefix = _format_transcript_prefix(
                    seg.start,
                    speaker,
                    include_timestamps=include_timestamps,
                    include_speakers=include_speakers,
                )
                lines.append(f"{prefix}{_normalize_text(seg.text)}")
    else:
        lines.append("No transcript segments available yet.")

    return "\n".join(lines)


def _build_markdown(
    job: JobDetailSchema,
    *,
    include_timestamps: bool = True,
    include_speakers: bool = False,
) -> str:
    spk_map = _speaker_map(job)
    lines: list[str] = [
        f"# {job.title}",
        "",
        f"- **Date:** {job.createdAt}",
        f"- **Duration:** {_format_duration(job.durationSec)}",
        f"- **Language:** {_language_label(job.language)}",
        f"- **Status:** {job.status}",
        "",
    ]

    if job.summary:
        lines.extend(["## Summary", "", job.summary, ""])

    if job.keyPoints:
        lines.extend(["### Key Points", "", *[f"- {p}" for p in job.keyPoints], ""])

    if job.notes:
        lines.extend(["## Notes", ""])
        for section in job.notes:
            lines.extend([f"### {section.heading}", "", *[f"- {b}" for b in section.bullets], ""])

    if job.analysis:
        lines.extend(["## Transcript Analysis", ""])
        note = f" — {job.analysis.sentimentNote}" if job.analysis.sentimentNote else ""
        lines.extend([f"**Sentiment:** {job.analysis.sentiment}{note}", ""])
        if job.analysis.topics:
            lines.extend([f"**Topics:** {', '.join(job.analysis.topics)}", ""])
        if job.analysis.decisions:
            lines.extend(["**Decisions:**", *[f"- {d}" for d in job.analysis.decisions], ""])
        if job.analysis.concerns:
            lines.extend(["**Concerns:**", *[f"- {c}" for c in job.analysis.concerns], ""])
        if job.analysis.risks:
            lines.extend(["**Risks:**", *[f"- {r}" for r in job.analysis.risks], ""])
        if job.analysis.questionsRaised:
            lines.extend(["**Questions Raised:**", *[f"- {q}" for q in job.analysis.questionsRaised], ""])
        if job.analysis.nextSteps:
            lines.extend(["**Next Steps:**", *[f"- {n}" for n in job.analysis.nextSteps], ""])

    if job.actionItems:
        lines.extend(["## Action Items", ""])
        for item in job.actionItems:
            mark = "x" if item.completed else " "
            meta_parts: list[str] = []
            if item.owner:
                meta_parts.append(f"Owner: {item.owner}")
            if item.deadline:
                meta_parts.append(f"Due: {item.deadline}")
            if item.timestampSec is not None:
                meta_parts.append(f"@{_format_duration(item.timestampSec)}")
            suffix = f" *({', '.join(meta_parts)})*" if meta_parts else ""
            lines.append(f"- [{mark}] {item.task}{suffix}")
        lines.append("")

    if job.bookmarks:
        lines.extend(["## Bookmarks", ""])
        for bm in sorted(job.bookmarks, key=lambda b: b.timeSec):
            note_part = f" — {bm.note}" if bm.note else ""
            lines.append(f"- **[{_format_duration(bm.timeSec)}]** `{bm.category}` {bm.label}{note_part}")
        lines.append("")

    lines.extend(["## Transcript", ""])
    if job.transcript:
        if not include_timestamps and not include_speakers:
            for para in _group_paragraphs_for_export(job):
                lines.extend([para, ""])
        elif include_timestamps and not include_speakers:
            for seg in _group_meaningful_segments(job):
                lines.extend([f"**[{_format_duration(seg.start)}]** {seg.text}", ""])
        else:
            for seg in job.transcript:
                speaker = spk_map.get(seg.speakerId, seg.speakerId)
                clean_text = _normalize_text(seg.text)
                if include_timestamps and include_speakers:
                    lines.append(f"**[{_format_duration(seg.start)}] {speaker}:** {clean_text}")
                elif include_timestamps:
                    lines.append(f"**[{_format_duration(seg.start)}]** {clean_text}")
                else:
                    lines.append(f"**{speaker}:** {clean_text}")
                lines.append("")
    else:
        lines.append("_No transcript segments available yet._")

    return "\n".join(lines)


def _build_srt(job: JobDetailSchema, *, include_speakers: bool, offset_sec: float) -> str:
    blocks: list[str] = []
    if include_speakers:
        spk_map = _speaker_map(job)
        for idx, seg in enumerate(job.transcript, start=1):
            start = max(0.0, seg.start + offset_sec)
            end = max(start + 0.5, seg.end + offset_sec)
            speaker = spk_map.get(seg.speakerId, seg.speakerId)
            body = f"{speaker}: {_normalize_text(seg.text)}"
            blocks.append(f"{idx}\n{_format_srt_time(start)} --> {_format_srt_time(end)}\n{body}\n")
    else:
        for idx, seg in enumerate(_group_meaningful_segments(job), start=1):
            start = max(0.0, seg.start + offset_sec)
            end = max(start + 0.5, seg.end + offset_sec)
            blocks.append(f"{idx}\n{_format_srt_time(start)} --> {_format_srt_time(end)}\n{seg.text}\n")
    return "\n".join(blocks)


def _build_vtt(job: JobDetailSchema, *, include_speakers: bool, offset_sec: float) -> str:
    cues: list[str] = []
    if include_speakers:
        spk_map = _speaker_map(job)
        for seg in job.transcript:
            start = max(0.0, seg.start + offset_sec)
            end = max(start + 0.5, seg.end + offset_sec)
            speaker = spk_map.get(seg.speakerId, seg.speakerId)
            body = f"{speaker}: {_normalize_text(seg.text)}"
            cues.append(f"{_format_vtt_time(start)} --> {_format_vtt_time(end)}\n{body}\n")
    else:
        for seg in _group_meaningful_segments(job):
            start = max(0.0, seg.start + offset_sec)
            end = max(start + 0.5, seg.end + offset_sec)
            cues.append(f"{_format_vtt_time(start)} --> {_format_vtt_time(end)}\n{seg.text}\n")
    return "WEBVTT\n\n" + "\n".join(cues)


def _set_paragraph_bottom_border(paragraph, color_hex: str = "E2E8F0", sz: str = "6") -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), sz)
    bottom.set(qn("w:space"), "6")
    bottom.set(qn("w:color"), color_hex)
    p_bdr.append(bottom)
    p_pr.append(p_bdr)


def _set_table_borderless(table) -> None:
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:val"), "none")
        borders.append(el)
    tbl_pr.append(borders)


def _set_cell_margins(cell, *, top: int = 40, bottom: int = 80, left: int = 0, right: int = 80) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = OxmlElement("w:tcMar")
    for side, val in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        node = OxmlElement(f"w:{side}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tc_mar.append(node)
    tc_pr.append(tc_mar)


def _add_docx_section_heading(doc: Document, title: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(title)
    run.bold = True
    run.font.size = Pt(13)
    run.font.color.rgb = RGBColor(0x31, 0x2E, 0x81)
    _set_paragraph_bottom_border(p, color_hex="E2E8F0", sz="4")


def _add_docx_subheading(doc: Document, title: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(title)
    run.bold = True
    run.font.size = Pt(10.5)
    run.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)


def _add_docx_bullet(doc: Document, text: str) -> None:
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.2
    run = p.add_run(text)
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)


def _build_docx(
    job: JobDetailSchema,
    *,
    include_timestamps: bool = True,
    include_speakers: bool = False,
) -> bytes:
    spk_map = _speaker_map(job)
    doc = Document()

    for section in doc.sections:
        section.top_margin = Inches(0.85)
        section.bottom_margin = Inches(0.85)
        section.left_margin = Inches(0.85)
        section.right_margin = Inches(0.85)
        footer_para = section.footer.paragraphs[0]
        footer_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        footer_run = footer_para.add_run(f"CallScribe Transcript Export  •  {job.title}")
        footer_run.font.size = Pt(8.5)
        footer_run.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    normal_style = doc.styles["Normal"]
    normal_style.font.name = "Calibri"
    normal_style.font.size = Pt(10.5)
    normal_style.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)

    # Document Header
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(3)
    title_run = title_p.add_run(job.title)
    title_run.bold = True
    title_run.font.size = Pt(20)
    title_run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

    meta_p = doc.add_paragraph()
    meta_p.paragraph_format.space_before = Pt(0)
    meta_p.paragraph_format.space_after = Pt(10)
    meta_run = meta_p.add_run(
        f"Date: {job.createdAt}   •   Duration: {_format_duration(job.durationSec)}   •   "
        f"Language: {_language_label(job.language)}   •   Status: {job.status}"
    )
    meta_run.font.size = Pt(9.5)
    meta_run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
    _set_paragraph_bottom_border(meta_p, color_hex="CBD5E1", sz="6")

    if job.summary:
        _add_docx_section_heading(doc, "Summary")
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.line_spacing = 1.28
        r = p.add_run(job.summary)
        r.font.size = Pt(10.5)

    if job.keyPoints:
        _add_docx_subheading(doc, "Key Points")
        for point in job.keyPoints:
            _add_docx_bullet(doc, point)

    if job.notes:
        _add_docx_section_heading(doc, "Meeting Notes")
        for section in job.notes:
            _add_docx_subheading(doc, section.heading)
            for bullet in section.bullets:
                _add_docx_bullet(doc, bullet)

    if job.analysis:
        _add_docx_section_heading(doc, "Transcript Analysis")
        note = f" — {job.analysis.sentimentNote}" if job.analysis.sentimentNote else ""
        sent_p = doc.add_paragraph()
        sent_p.paragraph_format.space_after = Pt(4)
        sent_label = sent_p.add_run("Sentiment: ")
        sent_label.bold = True
        sent_p.add_run(f"{job.analysis.sentiment}{note}")
        if job.analysis.topics:
            topic_p = doc.add_paragraph()
            topic_p.paragraph_format.space_after = Pt(4)
            topic_label = topic_p.add_run("Topics: ")
            topic_label.bold = True
            topic_p.add_run(", ".join(job.analysis.topics))
        for heading, items in (
            ("Decisions", job.analysis.decisions),
            ("Concerns", job.analysis.concerns),
            ("Risks", job.analysis.risks),
            ("Questions Raised", job.analysis.questionsRaised or []),
            ("Next Steps", job.analysis.nextSteps),
        ):
            if items:
                _add_docx_subheading(doc, heading)
                for item in items:
                    _add_docx_bullet(doc, item)

    if job.actionItems:
        _add_docx_section_heading(doc, "Action Items")
        for item in job.actionItems:
            mark = "[x]" if item.completed else "[ ]"
            meta_parts: list[str] = []
            if item.owner:
                meta_parts.append(f"Owner: {item.owner}")
            if item.deadline:
                meta_parts.append(f"Due: {item.deadline}")
            if item.timestampSec is not None:
                meta_parts.append(f"@{_format_duration(item.timestampSec)}")
            suffix = f" ({', '.join(meta_parts)})" if meta_parts else ""
            _add_docx_bullet(doc, f"{mark} {item.task}{suffix}")

    if job.bookmarks:
        _add_docx_section_heading(doc, "Bookmarks")
        for bm in sorted(job.bookmarks, key=lambda b: b.timeSec):
            note_part = f" — {bm.note}" if bm.note else ""
            _add_docx_bullet(doc, f"[{_format_duration(bm.timeSec)}] [{bm.category}] {bm.label}{note_part}")

    _add_docx_section_heading(doc, "Transcript")
    if job.transcript:
        if not include_timestamps and not include_speakers:
            for para in _group_paragraphs_for_export(job):
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(0)
                p.paragraph_format.space_after = Pt(8)
                p.paragraph_format.line_spacing = 1.32
                r = p.add_run(para)
                r.font.size = Pt(10.5)
        elif include_timestamps and not include_speakers:
            segments = _group_meaningful_segments(job)
            table = doc.add_table(rows=0, cols=2)
            table.autofit = False
            _set_table_borderless(table)
            for seg in segments:
                row = table.add_row()
                ts_cell, text_cell = row.cells[0], row.cells[1]
                ts_cell.width = Inches(0.85)
                text_cell.width = Inches(5.95)
                _set_cell_margins(ts_cell, top=30, bottom=90, left=0, right=80)
                _set_cell_margins(text_cell, top=30, bottom=90, left=0, right=0)

                ts_p = ts_cell.paragraphs[0]
                ts_p.paragraph_format.space_after = Pt(0)
                ts_run = ts_p.add_run(f"[{_format_duration(seg.start)}]")
                ts_run.bold = True
                ts_run.font.size = Pt(9.5)
                ts_run.font.color.rgb = RGBColor(0x4F, 0x46, 0xE5)

                txt_p = text_cell.paragraphs[0]
                txt_p.paragraph_format.space_after = Pt(0)
                txt_p.paragraph_format.line_spacing = 1.28
                txt_run = txt_p.add_run(seg.text)
                txt_run.font.size = Pt(10.5)
                txt_run.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
        else:
            for seg in job.transcript:
                speaker = spk_map.get(seg.speakerId, seg.speakerId)
                prefix_str = _format_transcript_prefix(
                    seg.start,
                    speaker,
                    include_timestamps=include_timestamps,
                    include_speakers=include_speakers,
                )
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(6)
                p.paragraph_format.line_spacing = 1.28
                if prefix_str:
                    prefix = p.add_run(prefix_str)
                    prefix.bold = True
                    prefix.font.color.rgb = RGBColor(0x31, 0x2E, 0x81)
                p.add_run(_normalize_text(seg.text))
    else:
        empty_p = doc.add_paragraph("No transcript segments available yet.")
        empty_p.paragraph_format.space_after = Pt(6)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _configure_pdf_unicode_fonts(pdf: FPDF) -> str:
    """Register bundled Noto Sans and Noto Sans Devanagari Unicode fonts for English/Hindi/Marathi."""
    if not (
        NOTO_SANS_REGULAR.is_file()
        and NOTO_SANS_BOLD.is_file()
        and NOTO_DEVANAGARI_REGULAR.is_file()
        and NOTO_DEVANAGARI_BOLD.is_file()
    ):
        raise RuntimeError(
            "Bundled Unicode PDF fonts are missing from backend/app/assets/fonts/."
        )

    pdf.add_font("NotoSans", "", str(NOTO_SANS_REGULAR))
    pdf.add_font("NotoSans", "B", str(NOTO_SANS_BOLD))
    pdf.add_font("NotoDevanagari", "", str(NOTO_DEVANAGARI_REGULAR))
    pdf.add_font("NotoDevanagari", "B", str(NOTO_DEVANAGARI_BOLD))
    pdf.set_fallback_fonts(["NotoDevanagari"])
    return "NotoSans"


class _CallScribePDF(FPDF):
    def __init__(self, doc_title: str) -> None:
        super().__init__()
        self.doc_title = doc_title
        self.unicode_font = "NotoSans"

    def footer(self) -> None:
        self.set_y(-13)
        self.set_font(self.unicode_font, size=8)
        self.set_text_color(148, 163, 184)
        self.cell(self.epw * 0.65, 5, "CallScribe Transcript Export", align="L")
        self.cell(self.epw * 0.35, 5, f"Page {self.page_no()}/{{nb}}", align="R")


def _pdf_section_heading(pdf: FPDF, font_family: str, title: str) -> None:
    if pdf.get_y() > pdf.h - 34:
        pdf.add_page()
    pdf.ln(4)
    pdf.set_font(font_family, style="B", size=11.5)
    pdf.set_text_color(49, 46, 129)
    pdf.set_x(pdf.l_margin)
    pdf.cell(pdf.epw, 7, title, new_x="LMARGIN", new_y="NEXT")
    y = pdf.get_y()
    pdf.set_draw_color(226, 232, 240)
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.ln(3)
    pdf.set_text_color(31, 41, 55)


def _pdf_subheading(pdf: FPDF, font_family: str, title: str) -> None:
    if pdf.get_y() > pdf.h - 26:
        pdf.add_page()
    pdf.ln(1.5)
    pdf.set_font(font_family, style="B", size=10)
    pdf.set_text_color(31, 41, 55)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, 5.5, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(0.5)


def _pdf_bullet(pdf: FPDF, font_family: str, text: str) -> None:
    pdf.set_font(font_family, size=9.8)
    pdf.set_text_color(31, 41, 55)
    pdf.set_x(pdf.l_margin + 3)
    pdf.multi_cell(pdf.epw - 3, 5.4, f"-  {text}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)


def _build_pdf(
    job: JobDetailSchema,
    *,
    include_timestamps: bool = True,
    include_speakers: bool = False,
) -> bytes:
    pdf = _CallScribePDF(job.title)
    pdf.set_margins(18, 18, 18)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.alias_nb_pages()
    font_family = _configure_pdf_unicode_fonts(pdf)
    pdf.unicode_font = font_family
    pdf.add_page()

    # Header
    pdf.set_font(font_family, style="B", size=17)
    pdf.set_text_color(15, 23, 42)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, 8.5, job.title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1.5)

    pdf.set_font(font_family, size=9)
    pdf.set_text_color(100, 116, 139)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(
        pdf.epw,
        5,
        (
            f"Date: {job.createdAt}   |   Duration: {_format_duration(job.durationSec)}   |   "
            f"Language: {_language_label(job.language)}   |   Status: {job.status}"
        ),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(2.5)
    y = pdf.get_y()
    pdf.set_draw_color(203, 213, 225)
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.ln(4)

    if job.summary:
        _pdf_section_heading(pdf, font_family, "Summary")
        pdf.set_font(font_family, size=10)
        pdf.set_text_color(31, 41, 55)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 5.6, job.summary, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    if job.keyPoints:
        _pdf_subheading(pdf, font_family, "Key Points")
        for point in job.keyPoints:
            _pdf_bullet(pdf, font_family, point)

    if job.notes:
        _pdf_section_heading(pdf, font_family, "Meeting Notes")
        for section in job.notes:
            _pdf_subheading(pdf, font_family, section.heading)
            for bullet in section.bullets:
                _pdf_bullet(pdf, font_family, bullet)

    if job.analysis:
        _pdf_section_heading(pdf, font_family, "Transcript Analysis")
        pdf.set_font(font_family, size=10)
        pdf.set_text_color(31, 41, 55)
        note = f" — {job.analysis.sentimentNote}" if job.analysis.sentimentNote else ""
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 5.5, f"Sentiment: {job.analysis.sentiment}{note}", new_x="LMARGIN", new_y="NEXT")
        if job.analysis.topics:
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(pdf.epw, 5.5, f"Topics: {', '.join(job.analysis.topics)}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        for heading, items in (
            ("Decisions", job.analysis.decisions),
            ("Concerns", job.analysis.concerns),
            ("Risks", job.analysis.risks),
            ("Questions Raised", job.analysis.questionsRaised or []),
            ("Next Steps", job.analysis.nextSteps),
        ):
            if items:
                _pdf_subheading(pdf, font_family, heading)
                for item in items:
                    _pdf_bullet(pdf, font_family, item)

    if job.actionItems:
        _pdf_section_heading(pdf, font_family, "Action Items")
        for item in job.actionItems:
            mark = "[x]" if item.completed else "[ ]"
            meta_parts: list[str] = []
            if item.owner:
                meta_parts.append(f"Owner: {item.owner}")
            if item.deadline:
                meta_parts.append(f"Due: {item.deadline}")
            if item.timestampSec is not None:
                meta_parts.append(f"@{_format_duration(item.timestampSec)}")
            suffix = f" ({', '.join(meta_parts)})" if meta_parts else ""
            _pdf_bullet(pdf, font_family, f"{mark} {item.task}{suffix}")

    if job.bookmarks:
        _pdf_section_heading(pdf, font_family, "Bookmarks")
        for bm in sorted(job.bookmarks, key=lambda b: b.timeSec):
            note_part = f" — {bm.note}" if bm.note else ""
            _pdf_bullet(pdf, font_family, f"[{_format_duration(bm.timeSec)}] [{bm.category}] {bm.label}{note_part}")

    _pdf_section_heading(pdf, font_family, "Transcript")
    if job.transcript:
        if not include_timestamps and not include_speakers:
            pdf.set_font(font_family, size=10)
            pdf.set_text_color(31, 41, 55)
            for para in _group_paragraphs_for_export(job):
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(pdf.epw, 5.8, para, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(3.2)
        elif include_timestamps and not include_speakers:
            for seg in _group_meaningful_segments(job):
                if pdf.get_y() > pdf.h - 28:
                    pdf.add_page()
                row_y = pdf.get_y()
                pdf.set_xy(pdf.l_margin, row_y)
                pdf.set_font(font_family, style="B", size=9)
                pdf.set_text_color(79, 70, 229)
                pdf.cell(17, 5.6, f"[{_format_duration(seg.start)}]")

                pdf.set_xy(pdf.l_margin + 18, row_y)
                pdf.set_font(font_family, size=10)
                pdf.set_text_color(31, 41, 55)
                pdf.multi_cell(pdf.epw - 18, 5.6, seg.text, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(2.6)
        else:
            spk_map = _speaker_map(job)
            for seg in job.transcript:
                speaker = spk_map.get(seg.speakerId, seg.speakerId)
                prefix_str = _format_transcript_prefix(
                    seg.start,
                    speaker,
                    include_timestamps=include_timestamps,
                    include_speakers=include_speakers,
                )
                pdf.set_font(font_family, size=10)
                pdf.set_text_color(31, 41, 55)
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(
                    pdf.epw,
                    5.6,
                    f"{prefix_str}{_normalize_text(seg.text)}",
                    new_x="LMARGIN",
                    new_y="NEXT",
                )
                pdf.ln(2.2)
    else:
        pdf.set_font(font_family, size=10)
        pdf.set_text_color(100, 116, 139)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 5.5, "No transcript segments available yet.", new_x="LMARGIN", new_y="NEXT")

    raw_output = pdf.output()
    return bytes(raw_output)


def export_job_file(
    job: JobDetailSchema,
    *,
    fmt: ExportFormat,
    timestamps: bool = True,
    speakers: bool = False,
    offset_sec: float = 0.0,
) -> ExportedFile:
    disposition = _build_content_disposition(job.title, job.id, fmt)

    if fmt == "txt":
        return ExportedFile(
            content=_build_plain_text(
                job,
                include_timestamps=timestamps,
                include_speakers=speakers,
            ).encode("utf-8"),
            media_type="text/plain; charset=utf-8",
            content_disposition=disposition,
        )
    if fmt == "md":
        return ExportedFile(
            content=_build_markdown(
                job,
                include_timestamps=timestamps,
                include_speakers=speakers,
            ).encode("utf-8"),
            media_type="text/markdown; charset=utf-8",
            content_disposition=disposition,
        )
    if fmt == "srt":
        return ExportedFile(
            content=_build_srt(job, include_speakers=speakers, offset_sec=offset_sec).encode("utf-8"),
            media_type="application/x-subrip; charset=utf-8",
            content_disposition=disposition,
        )
    if fmt == "vtt":
        return ExportedFile(
            content=_build_vtt(job, include_speakers=speakers, offset_sec=offset_sec).encode("utf-8"),
            media_type="text/vtt; charset=utf-8",
            content_disposition=disposition,
        )
    if fmt == "docx":
        return ExportedFile(
            content=_build_docx(
                job,
                include_timestamps=timestamps,
                include_speakers=speakers,
            ),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            content_disposition=disposition,
        )
    if fmt == "pdf":
        return ExportedFile(
            content=_build_pdf(
                job,
                include_timestamps=timestamps,
                include_speakers=speakers,
            ),
            media_type="application/pdf",
            content_disposition=disposition,
        )

    raise ValueError(f"Unsupported export format: {fmt}")
