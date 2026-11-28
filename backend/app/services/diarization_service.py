from __future__ import annotations

import importlib.util
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

logger = logging.getLogger(__name__)

UNKNOWN_SPEAKER_ID = "spk-unknown"
UNKNOWN_SPEAKER_NAME = "Unknown Speaker"
UNKNOWN_SPEAKER_COLOR = "#71717A"

DISTINCT_SPEAKER_COLORS = [
    "#6366F1",  # Indigo
    "#06B6D4",  # Cyan
    "#10B981",  # Emerald
    "#F59E0B",  # Amber
    "#EC4899",  # Pink
    "#8B5CF6",  # Violet
    "#F97316",  # Orange
    "#14B8A6",  # Teal
]


@dataclass(frozen=True)
class DiarizationTurn:
    start: float
    end: float
    speaker_id: str


@dataclass(frozen=True)
class WordTimestamp:
    start: float
    end: float
    word: str


@dataclass(frozen=True)
class TranscriptSegmentInput:
    id: str
    start: float
    end: float
    text: str
    words: tuple[WordTimestamp, ...] = ()


@dataclass(frozen=True)
class AlignedSpeaker:
    id: str
    name: str
    color: str


@dataclass(frozen=True)
class AlignedSegment:
    id: str
    start: float
    end: float
    speaker_id: str
    text: str
    confidence: float
    uncertain: bool


@dataclass(frozen=True)
class DiarizationAlignmentResult:
    speakers: list[AlignedSpeaker]
    segments: list[AlignedSegment]
    used_unknown_speaker: bool


def _smooth_diarization_turns(
    turns: Sequence[DiarizationTurn],
    min_interruption_sec: float = 0.8,
) -> list[DiarizationTurn]:
    """Suppress brief micro-interruptions sandwiched between identical speakers."""
    ordered = sorted(
        (t for t in turns if t.end > t.start and t.speaker_id),
        key=lambda t: (t.start, t.end),
    )
    if len(ordered) < 3 or min_interruption_sec <= 0:
        return list(ordered)

    smoothed: list[DiarizationTurn] = []
    i = 0
    while i < len(ordered):
        cur = ordered[i]
        if (
            0 < i < len(ordered) - 1
            and (cur.end - cur.start) < min_interruption_sec
            and smoothed
            and smoothed[-1].speaker_id == ordered[i + 1].speaker_id
            and (cur.start - smoothed[-1].end) <= 0.6
            and (ordered[i + 1].start - cur.end) <= 0.6
        ):
            prev = smoothed[-1]
            smoothed[-1] = DiarizationTurn(
                start=prev.start,
                end=max(prev.end, cur.end),
                speaker_id=prev.speaker_id,
            )
            i += 1
            continue
        smoothed.append(cur)
        i += 1

    # Coalesce contiguous identical-speaker turns with tiny gaps
    coalesced: list[DiarizationTurn] = []
    for turn in smoothed:
        if (
            coalesced
            and coalesced[-1].speaker_id == turn.speaker_id
            and (turn.start - coalesced[-1].end) <= 0.25
        ):
            prev = coalesced[-1]
            coalesced[-1] = DiarizationTurn(
                start=prev.start,
                end=max(prev.end, turn.end),
                speaker_id=prev.speaker_id,
            )
        else:
            coalesced.append(turn)
    return coalesced


def _compute_overlap_confidence(
    start: float,
    end: float,
    turns: Sequence[DiarizationTurn],
    *,
    confidence_threshold: float,
) -> tuple[str, float, bool]:
    seg_dur = max(0.05, end - start)
    overlaps: dict[str, float] = {}

    for turn in turns:
        if turn.end <= start or turn.start >= end:
            continue
        ov = min(end, turn.end) - max(start, turn.start)
        if ov > 0:
            overlaps[turn.speaker_id] = overlaps.get(turn.speaker_id, 0.0) + ov

    if not overlaps:
        # Check if a turn ends or starts right next to this utterance (<= 0.4s)
        nearest_speaker: str | None = None
        nearest_dist = 0.41
        for turn in turns:
            dist = min(abs(turn.start - end), abs(start - turn.end))
            if dist < nearest_dist:
                nearest_dist = dist
                nearest_speaker = turn.speaker_id
        if nearest_speaker is not None:
            near_conf = round(max(0.15, 0.45 - nearest_dist * 0.5), 3)
            if near_conf >= confidence_threshold:
                return nearest_speaker, near_conf, True
            return UNKNOWN_SPEAKER_ID, near_conf, True
        return UNKNOWN_SPEAKER_ID, 0.0, True

    ranked = sorted(overlaps.items(), key=lambda item: item[1], reverse=True)
    best_spk, best_ov = ranked[0]
    runner_up_ov = ranked[1][1] if len(ranked) > 1 else 0.0
    total_ov = sum(overlaps.values())

    dominance = best_ov / total_ov if total_ov > 0 else 0.0
    coverage = min(1.0, best_ov / seg_dur)
    margin = (best_ov - runner_up_ov) / total_ov if total_ov > 0 else 0.0

    confidence = round(
        max(0.0, min(1.0, 0.50 * dominance + 0.30 * coverage + 0.20 * margin)),
        3,
    )

    if confidence < confidence_threshold:
        return UNKNOWN_SPEAKER_ID, confidence, True

    review_cutoff = min(0.75, confidence_threshold + 0.14)
    return best_spk, confidence, confidence < review_cutoff


def _split_segment_by_word_speakers(
    seg: TranscriptSegmentInput,
    turns: Sequence[DiarizationTurn],
    *,
    confidence_threshold: float,
) -> list[tuple[float, float, str, str, float, bool]]:
    """
    If word-level timestamps exist and the segment spans multiple speakers,
    split cleanly at speaker boundaries instead of assigning the entire segment
    using only its start timestamp.
    """
    if len(seg.words) < 2:
        spk, conf, unc = _compute_overlap_confidence(
            seg.start,
            seg.end,
            turns,
            confidence_threshold=confidence_threshold,
        )
        return [(seg.start, seg.end, spk, seg.text, conf, unc)]

    word_assignments: list[tuple[WordTimestamp, str, float, bool]] = []
    for w in seg.words:
        w_start = max(seg.start, w.start)
        w_end = max(w_start + 0.05, w.end)
        spk, conf, unc = _compute_overlap_confidence(
            w_start,
            w_end,
            turns,
            confidence_threshold=max(0.35, confidence_threshold - 0.1),
        )
        word_assignments.append((w, spk, conf, unc))

    # Smooth single-word speaker flips inside a longer run of the same speaker
    for idx in range(1, len(word_assignments) - 1):
        prev_spk = word_assignments[idx - 1][1]
        cur_w, cur_spk, _cur_conf, _cur_unc = word_assignments[idx]
        next_spk = word_assignments[idx + 1][1]
        if prev_spk == next_spk and cur_spk != prev_spk and prev_spk != UNKNOWN_SPEAKER_ID:
            word_assignments[idx] = (cur_w, prev_spk, word_assignments[idx - 1][2], True)

    # Group contiguous words by assigned speaker
    groups: list[list[tuple[WordTimestamp, str, float, bool]]] = []
    for item in word_assignments:
        if not groups or groups[-1][0][1] != item[1]:
            groups.append([item])
        else:
            groups[-1].append(item)

    # Only split if each sub-turn has >= 2 words (or >= 0.9s) so we don't shred sentences
    valid_multi_groups = len(groups) > 1 and all(
        len(g) >= 2 or (g[-1][0].end - g[0][0].start) >= 0.9 for g in groups
    )
    if not valid_multi_groups:
        spk, conf, unc = _compute_overlap_confidence(
            seg.start,
            seg.end,
            turns,
            confidence_threshold=confidence_threshold,
        )
        return [(seg.start, seg.end, spk, seg.text, conf, unc)]

    results: list[tuple[float, float, str, str, float, bool]] = []
    for g in groups:
        sub_start = g[0][0].start
        sub_end = max(sub_start + 0.1, g[-1][0].end)
        sub_text = " ".join(entry[0].word.strip() for entry in g if entry[0].word.strip()).strip()
        if not sub_text:
            continue
        spk, conf, unc = _compute_overlap_confidence(
            sub_start,
            sub_end,
            turns,
            confidence_threshold=confidence_threshold,
        )
        results.append((sub_start, sub_end, spk, sub_text, conf, unc))

    if not results:
        spk, conf, unc = _compute_overlap_confidence(
            seg.start,
            seg.end,
            turns,
            confidence_threshold=confidence_threshold,
        )
        return [(seg.start, seg.end, spk, seg.text, conf, unc)]
    return results


def align_transcript_with_diarization(
    segments: Sequence[TranscriptSegmentInput],
    diarization_turns: Sequence[DiarizationTurn],
    *,
    confidence_threshold: float = 0.55,
    smooth_interruption_sec: float = 0.8,
) -> DiarizationAlignmentResult:
    """
    Align ASR transcript segments with audio diarization turns using duration overlap
    and optional word-level timestamp splitting.

    Returns deterministic speaker assignments, normalized confidence scores, and
    an explicit 'Unknown Speaker' assignment whenever confidence falls below threshold.
    """
    threshold = max(0.2, min(0.95, float(confidence_threshold)))
    smoothed_turns = _smooth_diarization_turns(
        diarization_turns,
        min_interruption_sec=smooth_interruption_sec,
    )

    aligned: list[AlignedSegment] = []
    for seg in segments:
        pieces = _split_segment_by_word_speakers(
            seg,
            smoothed_turns,
            confidence_threshold=threshold,
        )
        if len(pieces) == 1:
            s_start, s_end, spk_id, text, conf, unc = pieces[0]
            aligned.append(
                AlignedSegment(
                    id=seg.id,
                    start=round(max(0.0, s_start), 3),
                    end=round(max(s_start, s_end), 3),
                    speaker_id=spk_id,
                    text=text,
                    confidence=conf,
                    uncertain=unc,
                )
            )
        else:
            for part_idx, (s_start, s_end, spk_id, text, conf, unc) in enumerate(pieces, start=1):
                aligned.append(
                    AlignedSegment(
                        id=f"{seg.id}-p{part_idx}",
                        start=round(max(0.0, s_start), 3),
                        end=round(max(s_start, s_end), 3),
                        speaker_id=spk_id,
                        text=text,
                        confidence=conf,
                        uncertain=unc,
                    )
                )

    # Canonicalize speaker IDs in order of first appearance (preserving Unknown Speaker separately)
    canonical_map: dict[str, str] = {}
    speakers: list[AlignedSpeaker] = []
    has_unknown = False
    color_idx = 0

    for seg in aligned:
        if seg.speaker_id == UNKNOWN_SPEAKER_ID:
            has_unknown = True
            continue
        if seg.speaker_id not in canonical_map:
            new_id = f"spk-{len(canonical_map) + 1}"
            canonical_map[seg.speaker_id] = new_id
            speakers.append(
                AlignedSpeaker(
                    id=new_id,
                    name=f"Speaker {len(canonical_map)}",
                    color=DISTINCT_SPEAKER_COLORS[color_idx % len(DISTINCT_SPEAKER_COLORS)],
                )
            )
            color_idx += 1

    final_segments = [
        AlignedSegment(
            id=seg.id,
            start=seg.start,
            end=seg.end,
            speaker_id=(
                UNKNOWN_SPEAKER_ID
                if seg.speaker_id == UNKNOWN_SPEAKER_ID
                else canonical_map[seg.speaker_id]
            ),
            text=seg.text,
            confidence=seg.confidence,
            uncertain=seg.uncertain,
        )
        for seg in aligned
    ]

    if has_unknown:
        speakers.append(
            AlignedSpeaker(
                id=UNKNOWN_SPEAKER_ID,
                name=UNKNOWN_SPEAKER_NAME,
                color=UNKNOWN_SPEAKER_COLOR,
            )
        )

    return DiarizationAlignmentResult(
        speakers=speakers,
        segments=final_segments,
        used_unknown_speaker=has_unknown,
    )


def is_pyannote_available() -> bool:
    try:
        return importlib.util.find_spec("pyannote.audio") is not None
    except ModuleNotFoundError:
        return False


def run_pyannote_diarization(
    wav_path: Path,
    *,
    expected_speakers: str = "auto",
    hf_token: str | None = None,
) -> list[DiarizationTurn]:
    """
    Run local audio-based speaker diarization via pyannote.audio on a 16kHz mono WAV file.
    Raises RuntimeError with an actionable message if pyannote.audio or HF_TOKEN is missing.
    """
    if not is_pyannote_available():
        raise RuntimeError(
            "Audio diarization requires the optional 'pyannote.audio' package, which is not installed in this environment."
        )

    resolved_token = (
        hf_token
        or os.environ.get("HF_TOKEN")
        or os.environ.get("HUGGINGFACE_TOKEN")
        or ""
    ).strip()
    if not resolved_token:
        raise RuntimeError(
            "Audio diarization requires HF_TOKEN (Hugging Face token with pyannote/speaker-diarization-3.1 access)."
        )

    from pyannote.audio import Pipeline  # type: ignore[import-not-found]

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=resolved_token,
    )

    kwargs: dict[str, int] = {}
    hint = expected_speakers.strip().lower()
    if hint == "2":
        kwargs["num_speakers"] = 2
    elif hint == "3":
        kwargs["num_speakers"] = 3
    elif hint in {"4", "4+"}:
        kwargs["min_speakers"] = 4

    diarization = pipeline(str(wav_path), **kwargs)
    turns: list[DiarizationTurn] = []
    for turn, _, speaker_label in diarization.itertracks(yield_label=True):
        turns.append(
            DiarizationTurn(
                start=float(turn.start),
                end=float(turn.end),
                speaker_id=str(speaker_label),
            )
        )
    return turns
