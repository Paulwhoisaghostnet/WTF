import styled, { keyframes, css } from "styled-components";

const gammaTVScope = `[data-tv-presentation-host="gamma"]`;

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

export const flicker = keyframes`
  0%,100% { opacity:1 }
  92% { opacity:1 }
  93% { opacity:.6 }
  94% { opacity:1 }
`;

export const powerOnGlow = keyframes`
  0%   { transform: scaleY(0.005) scaleX(0.8); filter: brightness(8) }
  40%  { transform: scaleY(0.005) scaleX(1); filter: brightness(5) }
  60%  { transform: scaleY(1) scaleX(1); filter: brightness(1.5) }
  100% { transform: scaleY(1) scaleX(1); filter: brightness(1) }
`;

/* ------------------------------------------------------------------ */
/*  Cabinet + Physical TV Styled Components                            */
/* ------------------------------------------------------------------ */

export const TVWrapper = styled.div`
  width: calc(100% + 16px);
  height: calc(100% + 16px);
  margin: -8px;
  display: flex;
  box-sizing: border-box;

  &[data-tv-presentation-host="gamma"] {
    width: 100%;
    height: 100%;
    margin: 0;
    background: #070706;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-tv-presentation-host="gamma"] [data-tv-region="cabinet"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="screen-bezel"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="crt-screen"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="control-panel"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="osd"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="mtv-overlay"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="menu-overlay"] {
    background-image: none !important;
    border-width: 1px !important;
    box-shadow: none !important;
  }

  &[data-tv-presentation-host="gamma"] [data-tv-region="cabinet"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="screen-bezel"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="crt-screen"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="mtv-overlay"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="menu-overlay"] {
    border-radius: 6px !important;
  }

  &[data-tv-presentation-host="gamma"] [data-tv-region="cabinet"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="crt-screen"] {
    background: #070706 !important;
  }

  &[data-tv-presentation-host="gamma"] [data-tv-region="screen-bezel"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="control-panel"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="mtv-overlay"],
  &[data-tv-presentation-host="gamma"] [data-tv-region="menu-overlay"] {
    background: #11110f !important;
  }

  &[data-tv-presentation-host="gamma"] [data-tv-region="osd"] {
    background: #11110f !important;
    border-radius: 4px !important;
    color: #00d2ff !important;
    text-shadow: none !important;
  }

  &[data-tv-presentation-host="gamma"] [data-tv-region="menu-overlay"] {
    animation: none !important;
    color: #f2ead9 !important;
  }
`;

export const Cabinet = styled.div`
  width: 100%;
  height: 100%;
  background:
    repeating-linear-gradient(
      92deg,
      rgba(90, 55, 25, 0.12) 0px,
      transparent 1px,
      transparent 2px,
      rgba(70, 40, 15, 0.08) 3px,
      transparent 4px,
      transparent 7px
    ),
    repeating-linear-gradient(
      88deg,
      rgba(110, 70, 30, 0.06) 0px,
      transparent 2px,
      transparent 11px
    ),
    linear-gradient(
      180deg,
      #5c3a1e 0%,
      #4f3018 8%,
      #462a14 30%,
      #3d2410 60%,
      #331e0c 85%,
      #2a1808 100%
    );
  border-radius: 12px 12px 6px 6px;
  border: 3px solid #1e1008;
  box-shadow:
    inset 0 1px 0 rgba(255, 200, 120, 0.1),
    inset 0 -3px 8px rgba(0, 0, 0, 0.5),
    inset 2px 0 4px rgba(0, 0, 0, 0.15),
    inset -2px 0 4px rgba(0, 0, 0, 0.15),
    0 8px 32px rgba(0, 0, 0, 0.6),
    0 2px 8px rgba(0, 0, 0, 0.3);
  padding: clamp(10px, 1.5vw, 16px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;

  ${gammaTVScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
    padding: clamp(8px, 1.4vw, 14px);
  }
`;

export const BrandStrip = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 10px 8px;
  flex-shrink: 0;

  ${gammaTVScope} & {
    border-bottom: 1px solid rgba(242, 234, 217, 0.18);
    margin-bottom: 10px;
    padding: 0 0 10px;
  }
`;

export const BrandName = styled.div`
  font-family: var(--wtf-display-font);
  font-weight: bold;
  font-size: clamp(14px, 2.2vw, 22px);
  letter-spacing: 0;
  color: #d0a64f;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.7),
    0 -1px 0 rgba(255, 220, 140, 0.2),
    0 0 7px rgba(120, 74, 20, 0.35);
  text-transform: uppercase;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));

  ${gammaTVScope} & {
    color: #00d2ff;
    filter: none;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    text-shadow: none;
  }
`;

export const ModelLabel = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  color: #7a5a30;
  letter-spacing: 0;
  opacity: 0.8;

  ${gammaTVScope} & {
    color: rgba(242, 234, 217, 0.58);
  }
`;

export const BodyRow = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0;

  @media (max-width: 700px) {
    flex-direction: column;
  }
`;

export const ScreenBay = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;

  ${gammaTVScope} & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
    padding: clamp(8px, 1.5vw, 14px);
  }
`;

export const ScreenBezel = styled.div`
  flex: 1;
  min-height: 0;
  background: linear-gradient(
    145deg,
    #1c1c1c 0%,
    #141414 30%,
    #0e0e0e 70%,
    #0a0a0a 100%
  );
  border: 4px solid #060606;
  border-radius: 14px;
  padding: clamp(10px, 2vw, 22px);
  box-shadow:
    inset 0 2px 6px rgba(255, 255, 255, 0.04),
    inset 0 -2px 8px rgba(0, 0, 0, 0.8),
    inset 3px 0 8px rgba(0, 0, 0, 0.4),
    inset -3px 0 8px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(40, 40, 40, 0.5);
  display: flex;
  flex-direction: column;
`;

export const CRTScreen = styled.div<{ $on: boolean }>`
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 12px / 10px;
  overflow: hidden;
  background: radial-gradient(
    ellipse at 50% 48%,
    #101820 0%,
    #080e16 45%,
    #030508 100%
  );
  border: 2px solid #000;

  ${({ $on }) =>
    $on &&
    css`
      box-shadow:
        inset 0 0 80px rgba(100, 180, 255, 0.04),
        inset 0 0 20px rgba(80, 140, 200, 0.03),
        0 0 2px rgba(100, 180, 255, 0.1);
    `}

  ${({ $on }) =>
    !$on &&
    css`
      box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.5);
    `}

  ${gammaTVScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
  }
`;

export const ScanLines = styled.div`
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 1px,
    rgba(0, 0, 0, 0.06) 1px,
    rgba(0, 0, 0, 0.06) 2px
  );
  z-index: 10;
  border-radius: 12px / 10px;

  ${gammaTVScope} & {
    display: none;
  }
`;

export const CRTCurve = styled.div`
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 12px / 10px;
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 60%,
    rgba(0, 0, 0, 0.15) 75%,
    rgba(0, 0, 0, 0.4) 90%,
    rgba(0, 0, 0, 0.6) 100%
  );
  box-shadow:
    inset 0 0 100px 20px rgba(0, 0, 0, 0.25),
    inset 0 0 6px rgba(0, 0, 0, 0.5);
  z-index: 11;

  ${gammaTVScope} & {
    display: none;
  }

  &::after {
    content: "";
    position: absolute;
    top: 4%;
    left: 8%;
    width: 30%;
    height: 15%;
    background: radial-gradient(
      ellipse at 30% 50%,
      rgba(255, 255, 255, 0.04) 0%,
      transparent 70%
    );
    border-radius: 50%;
    transform: rotate(-8deg);
  }
`;

/**
 * Off-screen sink for hidden preloader media elements.
 * Kept in the document (not display:none) so the browser actually
 * downloads the bytes and fills its media+HTTP caches — when the
 * visible <video> later mounts the same URL it should load from
 * cache rather than hit the network again.
 */
export const PreloadSink = styled.div`
  position: absolute;
  left: -99999px;
  top: -99999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  contain: strict;
`;

export const StallStaticOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  /* Dampen the borrowed TVStatic down to a breathy overlay on top of
     the frozen playback frame.  The underlying StaticCanvas carries
     its own opacity/blend, so we multiply it here with a soft fade-in
     so the indicator appears gently rather than snapping on. */
  opacity: 0.28;
  transition: opacity 300ms ease-in;
`;

export const SkipNoticeBanner = styled.div`
  position: absolute;
  left: 50%;
  bottom: 18%;
  transform: translateX(-50%);
  z-index: 9;
  pointer-events: none;
  padding: 8px 18px;
  border-radius: 4px;
  background: rgba(12, 12, 14, 0.72);
  color: #f5e9c6;
  font-family: var(--wtf-mono-font);
  font-size: 18px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid rgba(245, 233, 198, 0.35);
  box-shadow:
    0 0 12px rgba(0, 0, 0, 0.5),
    0 0 24px rgba(245, 233, 198, 0.08);
  animation: skipNoticeFade 2600ms ease-out forwards;

  ${gammaTVScope} & {
    background: #11110f;
    border: 1px solid rgba(0, 210, 255, 0.38);
    border-radius: 4px;
    box-shadow: none;
    color: #00d2ff;
    letter-spacing: 0;
  }

  @keyframes skipNoticeFade {
    0% { opacity: 0; transform: translate(-50%, 6px); }
    10% { opacity: 0.95; transform: translate(-50%, 0); }
    85% { opacity: 0.9; }
    100% { opacity: 0; transform: translate(-50%, -6px); }
  }
`;

export const PowerOnFlash = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 50%,
    rgba(140, 200, 255, 0.6) 0%,
    rgba(60, 120, 180, 0.2) 40%,
    transparent 70%
  );
  animation: ${powerOnGlow} 0.6s ease-out forwards;
  z-index: 8;

  ${gammaTVScope} & {
    display: none;
  }
`;

export const OffScreen = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, #0c131b 0%, #020406 70%);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;

  ${gammaTVScope} & {
    background: #070706;
    background-image: none;
  }
`;

export const OffScreenLabel = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: clamp(13px, 1.4vw, 16px);
  color: #1a2a35;
  text-transform: uppercase;
  letter-spacing: 0;

  ${gammaTVScope} & {
    color: rgba(242, 234, 217, 0.42);
  }
`;

export const PowerDot = styled.div<{ $on: boolean }>`
  width: clamp(6px, 0.9vw, 9px);
  height: clamp(6px, 0.9vw, 9px);
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.4);
  background: ${({ $on }) =>
    $on
      ? "radial-gradient(circle at 40% 35%, #88ff88, #33cc33 60%, #228822)"
      : "radial-gradient(circle at 40% 35%, #443333, #221111)"};
  box-shadow: ${({ $on }) =>
    $on
      ? "0 0 6px #44dd44, 0 0 14px rgba(68,221,68,0.25), inset 0 -1px 2px rgba(0,0,0,0.3)"
      : "inset 0 1px 2px rgba(0,0,0,0.3)"};
  transition: all 0.4s;

  ${gammaTVScope} & {
    background: ${({ $on }) => ($on ? "#d6ff3f" : "#11110f")};
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.22);
    box-shadow: none;
  }
`;

export const MediaVideo = styled.video`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* Must sit above StaticCanvas (z:4) and StaticScan (z:5) so that
   * during the brief window when both are mounted (bumper preloading
   * while the transition flag is still true) the viewer doesn't see
   * static painted over the actual video.  Must stay below the
   * ScanLines/CRTCurve overlays (z:10/11) so those still simulate
   * the glass surface. */
  z-index: 6;
  background: #000;
  animation: ${flicker} 8s infinite;
`;

export const GifFrame = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  z-index: 6;
  background: #000;
  animation: ${flicker} 8s infinite;
`;

export const ExternalEmbedFrame = styled.iframe`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  z-index: 6;
  background: #000;
  animation: ${flicker} 8s infinite;
`;

export const OSD = styled.div`
  position: absolute;
  left: clamp(8px, 2%, 20px);
  top: clamp(8px, 2%, 20px);
  z-index: 12;
  font-family: var(--wtf-mono-font);
  font-size: clamp(13px, 1.6vw, 16px);
  color: #88ddff;
  background: rgba(0, 15, 30, 0.75);
  border: 1px solid rgba(100, 180, 240, 0.3);
  padding: clamp(3px, 0.6vw, 8px) clamp(6px, 1vw, 14px);
  max-width: 80%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 0 6px rgba(100, 180, 240, 0.6);

  ${gammaTVScope} & {
    background: #11110f;
    border: 1px solid rgba(0, 210, 255, 0.36);
    border-radius: 4px;
    box-shadow: none;
    color: #00d2ff;
    text-shadow: none;
  }
`;

/* ---------- MTV-style metadata overlay ------------------------------
 * Shows during the opening and closing ~5 s of each video, and on the
 * first and third loops of a GIF (GIFs always play exactly three
 * times).  Deliberately echoes the look of MTV's late-80s "video info
 * bar": bottom-left placement, yellow/white heading, thin rules, and
 * an optional eyebrow badge above the title. */
export const mtvOverlayCardCss = css<{ $visible: boolean }>`
  position: absolute;
  left: clamp(10px, 2.4%, 26px);
  bottom: clamp(12px, 3.6%, 36px);
  z-index: 13;
  max-width: min(68%, 520px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: clamp(6px, 1vw, 12px) clamp(9px, 1.3vw, 16px) clamp(7px, 1.1vw, 14px);
  font-family: var(--wtf-app-font);
  color: #fff;
  background: linear-gradient(
    120deg,
    rgba(10, 10, 14, 0.78) 0%,
    rgba(20, 20, 26, 0.66) 60%,
    rgba(10, 10, 14, 0.78) 100%
  );
  border: 1px solid rgba(255, 219, 77, 0.45);
  box-shadow:
    inset 0 3px 0 #ffdb4d,
    0 6px 18px rgba(0, 0, 0, 0.55);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: translateY(${({ $visible }) => ($visible ? "0" : "6px")});
  transition: opacity 420ms ease, transform 420ms ease;

  ${gammaTVScope} & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.36);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
  }
`;

export const MtvOverlay = styled.div<{ $visible: boolean }>`
  ${mtvOverlayCardCss}
  pointer-events: none;
`;

export const MtvOverlayLink = styled.a<{ $visible: boolean }>`
  ${mtvOverlayCardCss}
  pointer-events: ${({ $visible }) => ($visible ? "auto" : "none")};
  cursor: pointer;
  text-decoration: none;

  &:hover {
    border-color: rgba(255, 255, 255, 0.72);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
  }

  ${gammaTVScope} &:hover {
    border-color: #00d2ff;
    box-shadow: none;
  }
`;

export const MtvEyebrow = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  letter-spacing: 0;
  text-transform: uppercase;
  color: #ffdb4d;
  text-shadow: 0 0 4px rgba(255, 219, 77, 0.4);

  ${gammaTVScope} & {
    color: #00d2ff;
    text-shadow: none;
  }
`;

export const MtvTitle = styled.div`
  font-weight: 700;
  font-size: clamp(15px, 2.3vw, 22px);
  line-height: 1.15;
  letter-spacing: 0.01em;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.7);

  ${gammaTVScope} & {
    color: #f2ead9;
    letter-spacing: 0;
    text-shadow: none;
  }
`;

export const MtvCreator = styled.div`
  font-weight: 500;
  font-size: clamp(12px, 1.7vw, 16px);
  color: #f0f0f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${gammaTVScope} & {
    color: rgba(242, 234, 217, 0.82);
  }
`;

export const MtvSubline = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  letter-spacing: 0;
  color: #c8c8c8;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${gammaTVScope} & {
    color: rgba(242, 234, 217, 0.62);
  }
`;

export const MtvWallet = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  letter-spacing: 0;
  color: #d8d8d8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${gammaTVScope} & {
    color: rgba(242, 234, 217, 0.72);
  }
`;

/* ------------------------------------------------------------------ */
/*  On-Screen Menu (rendered inside the CRT)                           */
/* ------------------------------------------------------------------ */

export const MenuOverlay = styled.div.attrs<{ "data-tv-region"?: string }>({
  "data-tv-region": "menu-overlay",
})`
  position: absolute;
  inset: 0;
  z-index: 15;
  background: rgba(0, 8, 16, 0.94);
  display: flex;
  flex-direction: column;
  padding: clamp(12px, 3%, 28px) clamp(14px, 4%, 36px);
  overflow-y: auto;
  font-family: var(--wtf-mono-font);
  color: #88ffaa;
  animation: ${flicker} 8s infinite;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;

  ${gammaTVScope} & {
    animation: none;
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    scrollbar-color: rgba(0, 210, 255, 0.55) #11110f;
  }

  ${gammaTVScope} & a {
    color: #00d2ff !important;
  }
`;

export const MenuTitle = styled.div`
  font-size: clamp(16px, 2.4vw, 24px);
  font-weight: bold;
  color: #ccff66;
  text-shadow: 0 0 10px rgba(180, 255, 80, 0.4);
  margin-bottom: clamp(10px, 2%, 20px);
  border-bottom: 1px solid rgba(136, 255, 170, 0.25);
  padding-bottom: clamp(6px, 1%, 12px);
  display: flex;
  justify-content: space-between;
  align-items: center;

  ${gammaTVScope} & {
    border-bottom: 1px solid rgba(242, 234, 217, 0.18);
    color: #00d2ff;
    text-shadow: none;
  }
`;

export const MenuItem = styled.div<{ $selected?: boolean; $disabled?: boolean }>`
  padding: clamp(8px, 1.4%, 14px) clamp(10px, 1.6%, 18px);
  margin: 3px 0;
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  border: 1px solid
    ${({ $selected }) =>
      $selected ? "rgba(136,255,170,0.5)" : "transparent"};
  border-radius: 3px;
  background: ${({ $selected }) =>
    $selected ? "rgba(136,255,170,0.12)" : "transparent"};
  color: ${({ $disabled }) => ($disabled ? "#3a6a4a" : "#88ffaa")};
  font-size: clamp(13px, 1.8vw, 18px);
  transition: background 0.15s;

  &:hover {
    background: ${({ $disabled }) =>
      $disabled ? "transparent" : "rgba(136,255,170,0.08)"};
  }

  ${gammaTVScope} & {
    background: ${({ $selected }) => ($selected ? "rgba(0, 210, 255, 0.12)" : "transparent")};
    border: 1px solid ${({ $selected }) => ($selected ? "rgba(0, 210, 255, 0.38)" : "transparent")};
    border-radius: 4px;
    color: ${({ $disabled }) => ($disabled ? "rgba(242, 234, 217, 0.36)" : "#f2ead9")};
  }

  ${gammaTVScope} &:hover {
    background: ${({ $disabled }) => ($disabled ? "transparent" : "rgba(242, 234, 217, 0.08)")};
    color: ${({ $disabled }) => ($disabled ? "rgba(242, 234, 217, 0.36)" : "#00d2ff")};
  }
`;

export const MenuRow = styled.div`
  display: flex;
  align-items: center;
  gap: clamp(6px, 1vw, 12px);
`;

export const MenuLabel = styled.span`
  font-size: clamp(13px, 1.4vw, 15px);
  color: #55aa77;

  ${gammaTVScope} & {
    color: rgba(242, 234, 217, 0.64);
  }
`;

export const MenuInput = styled.input`
  background: rgba(0, 20, 10, 0.8);
  border: 1px solid #2a5a3a;
  color: #88ffaa;
  font-family: var(--wtf-mono-font);
  font-size: clamp(13px, 1.5vw, 16px);
  padding: clamp(5px, 0.8vw, 10px) clamp(6px, 1vw, 12px);
  outline: none;
  width: 100%;
  border-radius: 2px;

  &:focus {
    border-color: #44cc66;
    box-shadow: 0 0 6px rgba(68, 204, 102, 0.3);
  }

  &::placeholder {
    color: #2a5a3a;
  }

  ${gammaTVScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 4px;
    box-shadow: none;
    color: #f2ead9;
  }

  ${gammaTVScope} &:focus {
    border-color: #00d2ff;
    box-shadow: none;
  }

  ${gammaTVScope} &::placeholder {
    color: rgba(242, 234, 217, 0.44);
  }
`;

export const MenuSelect = styled.select`
  background: rgba(0, 20, 10, 0.9);
  border: 1px solid #2a5a3a;
  color: #88ffaa;
  font-family: var(--wtf-mono-font);
  font-size: clamp(13px, 1.35vw, 15px);
  padding: clamp(5px, 0.8vw, 10px) clamp(6px, 1vw, 10px);
  border-radius: 2px;
  outline: none;

  &:focus {
    border-color: #44cc66;
    box-shadow: 0 0 6px rgba(68, 204, 102, 0.3);
  }

  ${gammaTVScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 4px;
    box-shadow: none;
    color: #f2ead9;
  }

  ${gammaTVScope} &:focus {
    border-color: #00d2ff;
    box-shadow: none;
  }
`;

export const MenuBtn = styled.button<{ $accent?: boolean }>`
  background: ${({ $accent }) =>
    $accent
      ? "linear-gradient(180deg, #3a8a5a, #2a6a3a)"
      : "rgba(30, 60, 40, 0.8)"};
  border: 1px solid ${({ $accent }) => ($accent ? "#55cc77" : "#2a5a3a")};
  color: ${({ $accent }) => ($accent ? "#ccffdd" : "#88ffaa")};
  min-height: 32px;
  font-family: var(--wtf-mono-font);
  font-size: clamp(13px, 1.4vw, 15px);
  padding: clamp(4px, 0.6vw, 8px) clamp(10px, 1.4vw, 18px);
  cursor: pointer;
  white-space: nowrap;
  border-radius: 2px;

  &:hover {
    background: rgba(60, 120, 80, 0.6);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }

  ${gammaTVScope} & {
    background: ${({ $accent }) => ($accent ? "#00d2ff" : "#11110f")};
    background-image: none;
    border: 1px solid ${({ $accent }) => ($accent ? "#00d2ff" : "rgba(242, 234, 217, 0.22)")};
    border-radius: 4px;
    color: ${({ $accent }) => ($accent ? "#070706" : "#f2ead9")};
  }

  ${gammaTVScope} &:hover {
    background: ${({ $accent }) => ($accent ? "#00d2ff" : "rgba(242, 234, 217, 0.08)")};
  }
`;

export const MenuDivider = styled.div`
  border-top: 1px solid rgba(136, 255, 170, 0.12);
  margin: clamp(8px, 1.4%, 16px) 0;

  ${gammaTVScope} & {
    border-top: 1px solid rgba(242, 234, 217, 0.18);
  }
`;

export const MenuScrollList = styled.div`
  flex: 1;
  min-height: 60px;
  max-height: 40%;
  overflow-y: auto;
  border: 1px solid #1a3a2a;
  border-radius: 3px;
  margin: 6px 0;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;

  ${gammaTVScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 4px;
    scrollbar-color: rgba(0, 210, 255, 0.55) #11110f;
  }
`;

export const MenuTokenGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, 120px);
  justify-content: center;
  grid-auto-rows: min-content;
  gap: 6px;

  scrollbar-width: thin;
  scrollbar-color: #2a5a3a #0a1a0e;

  ${gammaTVScope} & {
    scrollbar-color: rgba(0, 210, 255, 0.55) #11110f;
  }
`;

export const MenuTokenCard = styled.div`
  width: 120px;
  border: 1px solid #1a3a2a;
  border-radius: 4px;
  padding: 6px;
  font-size: var(--wtf-type-caption, 13px);
  color: #88ffaa;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;

  &:hover {
    border-color: #44cc66;
    background: rgba(68, 204, 102, 0.1);
  }

  ${gammaTVScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 4px;
    color: #f2ead9;
  }

  ${gammaTVScope} &:hover {
    background: rgba(242, 234, 217, 0.08);
    border-color: #00d2ff;
  }
`;

export const TokenPreview = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid #204028;
  background: radial-gradient(circle at 50% 40%, #0f2018 0%, #08110c 100%);
  display: flex;
  align-items: center;
  justify-content: center;

  ${gammaTVScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 4px;
  }
`;

export const TokenPreviewMedia = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
`;

export const TokenPreviewFallback = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  letter-spacing: 0;
  color: #3f7a54;
`;

/* ------------------------------------------------------------------ */
/*  Physical Control Panel (right side of cabinet)                     */
/* ------------------------------------------------------------------ */

export const ControlPanel = styled.div`
  width: clamp(100px, 14vw, 140px);
  flex-shrink: 0;
  background:
    repeating-linear-gradient(
      91deg,
      rgba(80, 55, 25, 0.1) 0px,
      transparent 1px,
      transparent 3px,
      rgba(60, 38, 15, 0.06) 4px,
      transparent 5px,
      transparent 8px
    ),
    linear-gradient(
      180deg,
      #503820 0%,
      #46301a 40%,
      #3c2814 70%,
      #32200e 100%
    );
  border-left: 3px solid #1a1008;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: clamp(10px, 2%, 20px) clamp(6px, 1%, 12px);
  gap: clamp(8px, 1.5vh, 18px);
  position: relative;
  box-shadow: inset 1px 0 4px rgba(0, 0, 0, 0.3);

  ${gammaTVScope} & {
    background: #11110f;
    background-image: none;
    border-left: 1px solid rgba(242, 234, 217, 0.18);
    box-shadow: none;
  }

  @media (max-width: 700px) {
    width: 100%;
    flex-direction: row;
    justify-content: space-evenly;
    padding: 10px 14px;
    border-left: none;
    border-top: 3px solid #1a1008;
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.3);

    ${gammaTVScope} & {
      border-top: 1px solid rgba(242, 234, 217, 0.18);
      box-shadow: none;
    }
  }
`;

export const KnobGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
`;

export const KnobLabel = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  letter-spacing: 0;
  color: #a08050;
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);

  ${gammaTVScope} & {
    color: rgba(242, 234, 217, 0.58);
    text-shadow: none;
  }
`;

export const Knob = styled.button<{ $active?: boolean; $color?: string }>`
  width: clamp(36px, 4.5vw, 50px);
  height: clamp(36px, 4.5vw, 50px);
  border-radius: 50%;
  border: 2px solid #100a04;
  background: ${({ $active, $color }) => {
    if ($active) {
      return `
        radial-gradient(circle at 38% 30%, rgba(255,255,240,0.4) 0%, transparent 40%),
        conic-gradient(from 0deg, #a89840, #c8b860, #a89840, #8a7828, #a89840),
        radial-gradient(circle, #b0a048 0%, #887828 100%)
      `;
    }
    if ($color === "red") {
      return `
        radial-gradient(circle at 38% 30%, rgba(255,200,200,0.3) 0%, transparent 40%),
        conic-gradient(from 0deg, #994040, #bb5858, #994040, #774040, #994040),
        radial-gradient(circle, #aa4848 0%, #773030 100%)
      `;
    }
    return `
      radial-gradient(circle at 38% 30%, rgba(255,255,255,0.25) 0%, transparent 40%),
      conic-gradient(from 0deg, #908878, #b0a898, #908878, #706858, #908878),
      radial-gradient(circle, #a09888 0%, #686058 100%)
    `;
  }};
  cursor: pointer;
  position: relative;
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.15),
    inset 0 -1px 2px rgba(0, 0, 0, 0.3),
    0 3px 8px rgba(0, 0, 0, 0.5),
    0 1px 2px rgba(0, 0, 0, 0.4);
  transition: transform 0.1s;

  &::before {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 35%;
    background: #222;
    transform: translate(-50%, -85%);
    border-radius: 1px;
    box-shadow: 0 0 1px rgba(0, 0, 0, 0.5);
  }

  &:active {
    transform: scale(0.94);
    box-shadow:
      inset 0 1px 3px rgba(0, 0, 0, 0.3),
      0 1px 3px rgba(0, 0, 0, 0.4);
  }

  ${gammaTVScope} & {
    background: ${({ $active, $color }) =>
      $active ? "#00d2ff" : $color === "red" ? "#11110f" : "#070706"};
    background-image: none;
    border: 1px solid ${({ $active, $color }) =>
      $active ? "#00d2ff" : $color === "red" ? "rgba(214, 255, 63, 0.58)" : "rgba(242, 234, 217, 0.24)"};
    border-radius: 6px;
    box-shadow: none;
    color: ${({ $active }) => ($active ? "#070706" : "#f2ead9")};
  }

  ${gammaTVScope} &::before,
  ${gammaTVScope} &::after {
    display: none;
  }

  ${gammaTVScope} &:active {
    transform: scale(0.98);
    box-shadow: none;
  }
`;

export const KnobText = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: #2a2a2a;
  pointer-events: none;
  z-index: 1;
`;

export const VolumeSlider = styled.input`
  writing-mode: vertical-lr;
  direction: rtl;
  appearance: none;
  width: clamp(40px, 5vw, 60px);
  height: clamp(60px, 10vh, 100px);
  min-height: 44px;
  background: transparent;
  cursor: pointer;

  @media (max-width: 700px) {
    width: 80px;
    height: 44px;
  }

  &::-webkit-slider-track {
    width: 4px;
    background: linear-gradient(180deg, #3a3020, #1a1008);
    border-radius: 2px;
    border: 1px solid #0a0a0a;
  }

  ${gammaTVScope} &::-webkit-slider-track {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 4px;
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 12px;
    background: linear-gradient(180deg, #c8c0a8, #8a8268);
    border: 1px solid #3a3020;
    border-radius: 2px;
    cursor: pointer;
  }

  ${gammaTVScope} &::-webkit-slider-thumb {
    background: #00d2ff;
    background-image: none;
    border: 1px solid #00d2ff;
    border-radius: 4px;
  }

  &::-moz-range-track {
    width: 4px;
    background: linear-gradient(180deg, #3a3020, #1a1008);
    border-radius: 2px;
    border: 1px solid #0a0a0a;
  }

  ${gammaTVScope} &::-moz-range-track {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 4px;
  }

  &::-moz-range-thumb {
    width: 18px;
    height: 12px;
    background: linear-gradient(180deg, #c8c0a8, #8a8268);
    border: 1px solid #3a3020;
    border-radius: 2px;
    cursor: pointer;
  }

  ${gammaTVScope} &::-moz-range-thumb {
    background: #00d2ff;
    background-image: none;
    border: 1px solid #00d2ff;
    border-radius: 4px;
  }

  @media (max-width: 700px) {
    writing-mode: horizontal-tb;
    direction: ltr;
    width: 80px;
    height: 20px;
  }
`;

export const SpeakerGrill = styled.div`
  width: clamp(55px, 8vw, 85px);
  height: clamp(55px, 8vw, 85px);
  border-radius: 50%;
  background: #18100a;
  border: 3px solid #120c06;
  position: relative;
  box-shadow:
    inset 0 3px 10px rgba(0, 0, 0, 0.7),
    inset 0 -1px 3px rgba(60, 40, 20, 0.2),
    0 1px 0 rgba(80, 55, 30, 0.15);
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 3px;
    background: repeating-linear-gradient(
      0deg,
      #120c06 0px,
      #120c06 2px,
      #221810 2px,
      #221810 3px,
      #1a1008 3px,
      #1a1008 5px
    );
    border-radius: 50%;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: radial-gradient(
      circle at 40% 35%,
      rgba(80, 55, 30, 0.15) 0%,
      transparent 50%
    );
  }

  @media (max-width: 700px) {
    width: 40px;
    height: 40px;
  }

  ${gammaTVScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
  }

  ${gammaTVScope} &::before,
  ${gammaTVScope} &::after {
    display: none;
  }
`;

export const FootStrip = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 4px 20px 0;
  flex-shrink: 0;

  ${gammaTVScope} & {
    display: none;
  }
`;

export const Foot = styled.div`
  width: clamp(30px, 4.5vw, 48px);
  height: 10px;
  background: linear-gradient(180deg, #3e2e1a 0%, #2a1a0e 60%, #1e1208 100%);
  border-radius: 0 0 5px 5px;
  box-shadow:
    0 3px 6px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(80, 55, 30, 0.2);
`;

export const ChannelDisplay = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: clamp(14px, 2vw, 20px);
  font-weight: bold;
  color: #ff4422;
  text-shadow:
    0 0 6px rgba(255, 68, 34, 0.6),
    0 0 12px rgba(255, 68, 34, 0.2);
  background: #060402;
  border: 2px solid #1a1008;
  padding: clamp(3px, 0.5vw, 6px) clamp(8px, 1.2vw, 14px);
  text-align: center;
  min-width: clamp(40px, 4.5vw, 54px);
  border-radius: 3px;
  box-shadow:
    inset 0 1px 4px rgba(0, 0, 0, 0.6),
    0 1px 0 rgba(80, 55, 30, 0.1);

  ${gammaTVScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 4px;
    box-shadow: none;
    color: #00d2ff;
    text-shadow: none;
  }
`;
