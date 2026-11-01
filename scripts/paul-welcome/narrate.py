#!/usr/bin/env python3
"""Render Paul's local narration and exact caption timing from the storyboard."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SAMPLE_RATE = 24_000
LEAD_SECONDS = 0.28
BETWEEN_SECONDS = 0.2
TAIL_SECONDS = 0.62


def silence(seconds: float) -> np.ndarray:
    return np.zeros(round(seconds * SAMPLE_RATE), dtype=np.float32)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--storyboard", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--voice", default="am_puck")
    parser.add_argument("--speed", type=float, default=1.04)
    args = parser.parse_args()

    scenes = json.loads(args.storyboard.read_text(encoding="utf-8"))
    args.output.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    manifest = []

    for scene in scenes:
        chunks = [silence(LEAD_SECONDS)]
        cursor_samples = chunks[0].size
        captions = []
        for index, line in enumerate(scene["spoken"]):
            utterances = []
            for _graphemes, _phonemes, audio in pipeline(
                line, voice=args.voice, speed=args.speed, split_pattern=r"\n+"
            ):
                samples = np.asarray(audio, dtype=np.float32).reshape(-1)
                if samples.size:
                    utterances.append(samples)
            if not utterances:
                raise RuntimeError(f"No narration for {scene['id']} line {index + 1}")
            spoken = np.concatenate(utterances)
            start = cursor_samples / SAMPLE_RATE
            chunks.append(spoken)
            cursor_samples += spoken.size
            captions.append(
                {
                    "text": line,
                    "startSeconds": round(start, 6),
                    "endSeconds": round(cursor_samples / SAMPLE_RATE, 6),
                }
            )
            if index < len(scene["spoken"]) - 1:
                gap = silence(BETWEEN_SECONDS)
                chunks.append(gap)
                cursor_samples += gap.size

        chunks.append(silence(TAIL_SECONDS))
        waveform = np.concatenate(chunks)
        wav_path = args.output / f"{scene['id']}.wav"
        sf.write(wav_path, waveform, SAMPLE_RATE, subtype="PCM_16")
        manifest.append(
            {
                "id": scene["id"],
                "durationSeconds": round(waveform.size / SAMPLE_RATE, 6),
                "captions": captions,
                "wav": str(wav_path),
            }
        )
        print(f"[paul narration] {scene['id']}: {waveform.size / SAMPLE_RATE:.2f}s")

    (args.output / "timings.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
