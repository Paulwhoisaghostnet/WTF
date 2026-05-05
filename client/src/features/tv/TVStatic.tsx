import { useEffect, useRef } from "react";
import styled, { keyframes } from "styled-components";

const noise = keyframes`
  0%   { transform: translate(0,0) scale(1); opacity:.35 }
  20%  { transform: translate(-2%,1%) scale(1.02); opacity:.45 }
  40%  { transform: translate(1.5%,-1.5%) scale(1.01); opacity:.32 }
  60%  { transform: translate(-1%,2%) scale(1.03); opacity:.5 }
  80%  { transform: translate(2%,-1%) scale(1.02); opacity:.4 }
  100% { transform: translate(0,0) scale(1); opacity:.36 }
`;

const StaticCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 4;
  image-rendering: pixelated;
  pointer-events: none;
  opacity: 0.82;
  mix-blend-mode: screen;
  animation: ${noise} 220ms steps(4) infinite;
`;

const StaticScan = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgba(255, 255, 255, 0) 0px,
    rgba(255, 255, 255, 0) 2px,
    rgba(255, 255, 255, 0.08) 2px,
    rgba(255, 255, 255, 0.08) 3px
  );
  mix-blend-mode: overlay;
  opacity: 0.55;
`;

interface TVStaticProps {
  audio?: boolean;
}

export function TVStatic({ audio = true }: TVStaticProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d", { alpha: false });
    if (!ctx) return;
    const W = 192;
    const H = 108;
    cv.width = W;
    cv.height = H;
    const img = ctx.createImageData(W, H);
    const data = img.data;
    let raf = 0;
    let lastMs = 0;
    const FRAME_MS = 1000 / 24;
    const step = (t: number) => {
      if (t - lastMs >= FRAME_MS) {
        lastMs = t;
        for (let i = 0; i < data.length; i += 4) {
          const v = (Math.random() * 255) | 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!audio) return;
    let ac: AudioContext | null = null;
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    try {
      const AC: typeof AudioContext =
        (window.AudioContext as typeof AudioContext | undefined) ||
        ((window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext as typeof AudioContext | undefined) ||
        (undefined as unknown as typeof AudioContext);
      if (!AC) return;
      ac = new AC();
      const bufferSize = 2 * ac.sampleRate;
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const out = buffer.getChannelData(0);
      // Paul Kellett's pink noise filter — cheap and plausible for
      // the "hushed CRT hiss" the user asked for.
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        out[i] = pink * 0.11;
        b6 = white * 0.115926;
      }
      source = ac.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      gain = ac.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(ac.destination);
      source.start();
      const now = ac.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.18);
      if (ac.state === "suspended") {
        ac.resume().catch(() => undefined);
      }
    } catch {
      // If WebAudio refuses, silently fall back to visual-only static.
    }
    return () => {
      try {
        if (gain && ac) {
          const now = ac.currentTime;
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.15);
        }
      } catch {
        /* ignore */
      }
      const srcRef = source;
      const acRef = ac;
      window.setTimeout(() => {
        try {
          srcRef?.stop();
        } catch {
          /* ignore */
        }
        try {
          acRef?.close();
        } catch {
          /* ignore */
        }
      }, 220);
    };
  }, [audio]);

  return (
    <>
      <StaticCanvas ref={canvasRef} aria-hidden />
      <StaticScan aria-hidden />
    </>
  );
}
