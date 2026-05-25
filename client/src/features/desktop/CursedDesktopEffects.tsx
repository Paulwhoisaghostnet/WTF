import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { hasWtfCurse, type WtfCurseStatus } from "@shared/curses";

const GreenLens = styled.div`
  position: absolute;
  inset: 0;
  z-index: 6990;
  pointer-events: none;
  background: rgba(0, 255, 72, 0.18);
  mix-blend-mode: color;
`;

const InvertedCursorRoot = styled.div<{ $x: number; $y: number; $visible: boolean }>`
  position: fixed;
  left: 0;
  top: 0;
  z-index: 7001;
  pointer-events: none;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transform: translate3d(${(p) => p.$x}px, ${(p) => p.$y}px, 0);
  filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.4));
`;

const InvertedCursorGlyph = styled.div<{ $active: boolean }>`
  width: 34px;
  height: 34px;
  transform: translate(-3px, -3px) rotate(${(p) => (p.$active ? "180deg" : "0deg")});
  transition: transform 120ms ease;

  svg {
    display: block;
  }
`;

const WaiverToast = styled.div`
  position: fixed;
  left: 12px;
  bottom: 42px;
  z-index: 7002;
  max-width: min(420px, calc(100vw - 24px));
  padding: 8px 10px;
  border: 2px solid #111111;
  background: #ffffd8;
  color: #111111;
  font: 12px/1.35 "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.28);
`;

function pixelArrow() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" shapeRendering="crispEdges">
      <polygon points="1,1 1,31 10,22 16,33 23,30 17,20 30,20" fill="#111111" />
      <polygon points="5,6 5,23 10,18 16,29 18,28 12,17 22,17" fill="#ffffff" />
      <polygon points="7,10 7,18 10,15 14,22 16,21 11,13 16,13" fill="#d7d7d7" />
    </svg>
  );
}

export function CursedDesktopEffects({ curses }: { curses: WtfCurseStatus[] }) {
  const greenLens = hasWtfCurse(curses, "green_lens");
  const invertedMouse = hasWtfCurse(curses, "inverted_click_mouse");
  const liabilityWaiver = hasWtfCurse(curses, "liability_waiver");
  const [waiverNotice, setWaiverNotice] = useState("");
  const [cursor, setCursor] = useState({ x: 0, y: 0, visible: false, inverted: false });
  const lastPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!liabilityWaiver) return;
    const selector = [
      "button",
      "a",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[data-desktop-icon-root='true']",
    ].join(",");
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(selector) : null;
      if (!target || target.closest("[data-curse-waiver-skip='true']")) return;
      const accepted = window.confirm(
        "WTF OS liability waiver: this interaction may trigger consequences including lost time, confusing UI, on-chain regret, social embarrassment, and administrative interpretation. By continuing, you accept all risk and waive claims derived from this click."
      );
      if (!accepted) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setWaiverNotice("Interaction cancelled by curse waiver.");
      } else {
        setWaiverNotice("Waiver accepted for one interaction.");
      }
    };
    window.addEventListener("click", handleClick, true);
    return () => window.removeEventListener("click", handleClick, true);
  }, [liabilityWaiver]);

  useEffect(() => {
    if (!waiverNotice) return;
    const timeout = window.setTimeout(() => setWaiverNotice(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [waiverNotice]);

  useEffect(() => {
    if (!invertedMouse) return;
    const handleMove = (event: PointerEvent) => {
      setCursor((current) => {
        const last = lastPointerRef.current;
        const dx = event.clientX - last.x;
        const dy = event.clientY - last.y;
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        if (!current.visible) {
          return { ...current, x: event.clientX, y: event.clientY, visible: true };
        }
        if (!current.inverted) {
          return { ...current, x: event.clientX, y: event.clientY, visible: true };
        }
        return {
          ...current,
          x: Math.max(0, Math.min(window.innerWidth, current.x - dx)),
          y: Math.max(0, Math.min(window.innerHeight, current.y - dy)),
          visible: true,
        };
      });
    };
    const toggle = (event: PointerEvent) => {
      if (event.button !== 0) return;
      setCursor((current) => ({
        ...current,
        x: event.clientX,
        y: event.clientY,
        visible: true,
        inverted: !current.inverted,
      }));
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const hide = () => setCursor((current) => ({ ...current, visible: false }));
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerdown", toggle, true);
    window.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerdown", toggle, true);
      window.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
    };
  }, [invertedMouse]);

  const cursorGlyph = useMemo(() => pixelArrow(), []);

  return (
    <>
      {greenLens ? <GreenLens data-wtf-curse="green_lens" /> : null}
      {invertedMouse ? (
        <InvertedCursorRoot
          data-wtf-curse="inverted_click_mouse"
          $x={cursor.x}
          $y={cursor.y}
          $visible={cursor.visible}
        >
          <InvertedCursorGlyph $active={cursor.inverted}>{cursorGlyph}</InvertedCursorGlyph>
        </InvertedCursorRoot>
      ) : null}
      {waiverNotice ? <WaiverToast data-curse-waiver-skip="true">{waiverNotice}</WaiverToast> : null}
    </>
  );
}
