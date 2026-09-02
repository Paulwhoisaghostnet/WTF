#!/usr/bin/env python3
"""Generate script-only Tommy narration locally with Apache-2.0 Kokoro-82M."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


SAMPLE_RATE = 24_000


def speech_pronunciation(text: str) -> str:
    """Keep captions canonical while giving Kokoro stable product pronunciation."""
    return re.sub(r"\bTezos\b", "Tez-ose", text, flags=re.IGNORECASE)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="shared/faq-tutorials.json")
    parser.add_argument("--output", default="output/faq-tutorials/narration")
    parser.add_argument("--voice", default="am_puck")
    parser.add_argument("--speed", type=float, default=1.02)
    parser.add_argument("--slug")
    args = parser.parse_args()

    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    if args.slug:
        catalog = [item for item in catalog if item.get("slug") == args.slug]
        if not catalog:
            raise RuntimeError(f"Unknown catalog slug: {args.slug}")
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    chunk_silence = np.zeros(int(SAMPLE_RATE * 0.08), dtype=np.float32)
    segment_silence = np.zeros(int(SAMPLE_RATE * 0.22), dtype=np.float32)

    for tutorial in catalog:
        chunks: list[np.ndarray] = []
        timings: list[dict[str, object]] = []
        spoken_steps = tutorial.get("spokenSteps") or [tutorial["narration"]]
        cursor_samples = 0
        for index, script_line in enumerate(spoken_steps):
            speech_line = speech_pronunciation(script_line)
            line_chunks: list[np.ndarray] = []
            for _graphemes, _phonemes, audio in pipeline(
                speech_line, voice=args.voice, speed=args.speed, split_pattern=r"\n+"
            ):
                samples = np.asarray(audio, dtype=np.float32).reshape(-1)
                if samples.size:
                    if line_chunks:
                        line_chunks.append(chunk_silence)
                    line_chunks.append(samples)
            if not line_chunks:
                raise RuntimeError(
                    f"Kokoro produced no audio for {tutorial['slug']} segment {index + 1}"
                )
            line_audio = np.concatenate(line_chunks)
            start_seconds = cursor_samples / SAMPLE_RATE
            chunks.append(line_audio)
            cursor_samples += line_audio.size
            end_seconds = cursor_samples / SAMPLE_RATE
            timings.append(
                {
                    "index": index,
                    "text": script_line,
                    "startSeconds": round(start_seconds, 6),
                    "endSeconds": round(end_seconds, 6),
                    "durationSeconds": round(end_seconds - start_seconds, 6),
                }
            )
            if index < len(spoken_steps) - 1:
                chunks.append(segment_silence)
                cursor_samples += segment_silence.size
        if not chunks:
            raise RuntimeError(f"Kokoro produced no audio for {tutorial['slug']}")
        waveform = np.concatenate(chunks)
        destination = output_dir / f"{tutorial['slug']}.wav"
        sf.write(destination, waveform, SAMPLE_RATE, subtype="PCM_16")
        timing_destination = output_dir / f"{tutorial['slug']}.timings.json"
        timing_destination.write_text(
            json.dumps(
                {
                    "slug": tutorial["slug"],
                    "voice": args.voice,
                    "speed": args.speed,
                    "sampleRate": SAMPLE_RATE,
                    "totalDurationSeconds": round(waveform.size / SAMPLE_RATE, 6),
                    "segments": timings,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"[narration] {tutorial['slug']} -> {destination} ({waveform.size / SAMPLE_RATE:.2f}s)")


if __name__ == "__main__":
    main()
