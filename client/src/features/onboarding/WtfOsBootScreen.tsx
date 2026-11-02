import { useCallback, useEffect, useRef } from "react";
import { Button } from "react95";
import styled, { keyframes } from "styled-components";

const BOOT_DURATION_MS = 1600;

const loadDesktop = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

const BootBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: grid;
  place-items: center;
  padding: 18px;
  background: #008080;
  color: #fff;
  font-family: var(--wtf-mono-font, monospace);
`;

const BootPanel = styled.div`
  width: min(430px, 100%);
  padding: 24px;
  background: #000080;
  border: 3px outset #c0c0c0;
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.25);

  h1 {
    margin: 0 0 6px;
    font-size: clamp(30px, 9vw, 50px);
    line-height: 1;
    letter-spacing: -0.05em;
  }

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.4;
  }

  button {
    min-height: 40px;
    margin-top: 18px;
  }
`;

const ProgressTrack = styled.div`
  height: 18px;
  margin: 22px 0 10px;
  padding: 2px;
  overflow: hidden;
  border: 2px inset #fff;
  background: #101035;
`;

const ProgressFill = styled.div`
  width: 100%;
  height: 100%;
  transform-origin: left center;
  animation: ${loadDesktop} ${BOOT_DURATION_MS}ms linear both;
  background: repeating-linear-gradient(90deg, #fff 0 14px, #000080 14px 17px);

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transform: scaleX(1);
  }
`;

export function WtfOsBootScreen({ onFinish }: { onFinish: () => void }) {
  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    const timer = window.setTimeout(finish, BOOT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [finish]);

  return (
    <BootBackdrop data-wtfos-boot="true" role="dialog" aria-modal="true" aria-label="wtfOS starting">
      <BootPanel>
        <h1>wtfOS</h1>
        <p role="status">Starting wtfOS</p>
        <ProgressTrack aria-hidden="true"><ProgressFill /></ProgressTrack>
        <p>Loading your desktop…</p>
        <Button type="button" autoFocus onClick={finish}>Enter desktop now</Button>
      </BootPanel>
    </BootBackdrop>
  );
}
