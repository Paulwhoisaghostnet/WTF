#!/usr/bin/env python3
"""Generate FAQ narration locally with the Apache-2.0 Kokoro-82M model."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


SAMPLE_RATE = 24_000


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="shared/faq-tutorials.json")
    parser.add_argument("--output", default="output/faq-tutorials/narration")
    parser.add_argument("--voice", default="af_heart")
    args = parser.parse_args()

    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    silence = np.zeros(int(SAMPLE_RATE * 0.16), dtype=np.float32)

    for tutorial in catalog:
        chunks: list[np.ndarray] = []
        for _graphemes, _phonemes, audio in pipeline(
            tutorial["narration"], voice=args.voice, speed=1.04, split_pattern=r"\n+"
        ):
            samples = np.asarray(audio, dtype=np.float32).reshape(-1)
            if samples.size:
                chunks.extend([samples, silence])
        if not chunks:
            raise RuntimeError(f"Kokoro produced no audio for {tutorial['slug']}")
        waveform = np.concatenate(chunks)
        destination = output_dir / f"{tutorial['slug']}.wav"
        sf.write(destination, waveform, SAMPLE_RATE, subtype="PCM_16")
        print(f"[narration] {tutorial['slug']} -> {destination} ({waveform.size / SAMPLE_RATE:.2f}s)")


if __name__ == "__main__":
    main()
