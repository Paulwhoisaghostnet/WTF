import { Fragment, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { type DesktopAppearance } from "@shared/desktop";
import { getPrimaryFontFamily } from "../appearance/get-canvas-font";

const CustomCursorRoot = styled.div<{
  $x: number;
  $y: number;
  $visible: boolean;
}>`
  position: fixed;
  left: 0;
  top: 0;
  z-index: 7000;
  pointer-events: none;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transform: translate3d(${(p) => p.$x}px, ${(p) => p.$y}px, 0);
  filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.35));
`;

const CrosshairImpact = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 22px;
  height: 22px;
  z-index: 6999;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: crosshair-hole 920ms ease-out forwards;

  &::before {
    content: "";
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background:
      radial-gradient(circle, #050505 0 3px, #3a2414 3.5px 5px, transparent 5.5px),
      radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.85) 0 1px, transparent 1.6px);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.8),
      5px 0 0 -3px #111,
      -6px 2px 0 -4px #111,
      1px 6px 0 -4px #111;
  }

  &::after {
    content: "";
    position: absolute;
    left: -15px;
    top: 9px;
    width: 22px;
    height: 3px;
    background: linear-gradient(90deg, transparent, #fff200, #ff4a00);
    box-shadow: 0 0 4px #ff4a00;
    animation: crosshair-spark 180ms ease-out forwards;
  }

  @keyframes crosshair-hole {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.45);
    }
    12% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.15);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.92);
    }
  }

  @keyframes crosshair-spark {
    from {
      opacity: 1;
      transform: translateX(-8px) scaleX(1);
    }
    to {
      opacity: 0;
      transform: translateX(10px) scaleX(0.2);
    }
  }
`;

const BowShot = styled.div<{
  $fromX: number;
  $fromY: number;
  $distance: number;
  $angle: number;
}>`
  position: fixed;
  left: ${(p) => p.$fromX}px;
  top: ${(p) => p.$fromY}px;
  width: ${(p) => p.$distance}px;
  height: 12px;
  z-index: 6999;
  pointer-events: none;
  transform: translate(0, -6px) rotate(${(p) => p.$angle}rad);
  transform-origin: 0 50%;
`;

const BowShotArrow = styled.div<{ $distance: number }>`
  position: absolute;
  left: 0;
  top: 0;
  width: 38px;
  height: 12px;
  animation: bow-arrow-shot 560ms cubic-bezier(0.12, 0.78, 0.18, 1) forwards;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 5px;
    width: 29px;
    height: 3px;
    background: #6b3f1d;
    box-shadow: 0 1px 0 #d7aa5c;
  }

  &::after {
    content: "";
    position: absolute;
    left: 28px;
    top: 0;
    border-left: 10px solid #1d2227;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    filter: drop-shadow(1px 1px 0 rgba(255, 255, 255, 0.65));
  }

  span {
    position: absolute;
    left: -5px;
    top: 1px;
    width: 10px;
    height: 10px;
    background:
      linear-gradient(135deg, transparent 0 42%, #fff 42% 58%, transparent 58%),
      linear-gradient(45deg, transparent 0 42%, #fff 42% 58%, transparent 58%);
  }

  @keyframes bow-arrow-shot {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    82% {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: translateX(${(p) => Math.max(0, p.$distance - 32)}px);
    }
  }
`;

const BowHitMark = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 20px;
  height: 20px;
  z-index: 6998;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: bow-hit-fade 840ms ease-out forwards;

  &::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 9px;
    width: 16px;
    height: 2px;
    background: #6b3f1d;
    transform: rotate(-18deg);
    box-shadow: 10px -3px 0 -4px #1d2227;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 4px;
    border: 1px dashed #111111;
    border-radius: 50%;
    opacity: 0.8;
  }

  @keyframes bow-hit-fade {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.7);
    }
    18% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.08);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.94);
    }
  }
`;

const EmojiCursor = styled.div<{ $dx: number; $dy: number }>`
  transform: translate(${(p) => p.$dx}px, ${(p) => p.$dy}px);
  font-size: 31px;
  line-height: 1;
  user-select: none;
`;

const BlangCursor = styled.img<{ $pressed: boolean }>`
  width: ${(p) => (p.$pressed ? "60px" : "56px")};
  height: auto;
  display: block;
  transform: translate(${(p) => (p.$pressed ? "-30px, -37px" : "-28px, -34px")})
    rotate(${(p) => (p.$pressed ? "-5deg" : "-2deg")});
  transform-origin: 32px 38px;
  user-select: none;
`;

const TezosLogoCursor = styled.img`
  width: 38px;
  height: 46px;
  object-fit: contain;
  display: block;
  transform: translate(-19px, -23px);
  user-select: none;
`;

const HatchetCursor = styled.div<{ $pressed: boolean }>`
  display: block;
  width: 42px;
  height: 42px;
  transform: translate(-9px, -22px) rotate(0deg);
  transform-origin: 28px 31px;
  animation: ${(p) =>
    p.$pressed ? "hatchet-attack-swing 360ms cubic-bezier(0.16, 0.88, 0.2, 1) both" : "none"};

  @keyframes hatchet-attack-swing {
    0% {
      transform: translate(-9px, -22px) rotate(-36deg);
    }
    46% {
      transform: translate(-12px, -19px) rotate(32deg);
    }
    66% {
      transform: translate(-9px, -22px) rotate(8deg);
    }
    100% {
      transform: translate(-9px, -22px) rotate(0deg);
    }
  }
`;

type CursorDirection = 1 | -1;

interface CursorGlyphProps {
  style: DesktopAppearance["cursorStyle"];
  pressed: boolean;
  direction: CursorDirection;
  speed: number;
}

function CursorGlyph({ style, pressed, direction, speed }: CursorGlyphProps) {
  if (style === "pixel-arrow") {
    return (
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <polygon points="1,1 1,31 10,22 16,33 23,30 17,20 30,20" fill="#111111" />
        <polygon points="5,6 5,23 10,18 16,29 18,28 12,17 22,17" fill="#ffffff" />
        <polygon points="7,10 7,18 10,15 14,22 16,21 11,13 16,13" fill="#d7d7d7" />
        <rect x="5" y="6" width="2" height="2" fill="#f4fbff" />
      </svg>
    );
  }
  if (style === "crosshair") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: `translate(-21px, -21px) scale(${pressed ? 0.9 : 1})` }}
      >
        <circle cx="21" cy="21" r="8" fill="none" stroke="#ffffff" strokeWidth="5" />
        <circle cx="21" cy="21" r="8" fill="none" stroke="#111111" strokeWidth="2" />
        <path
          d="M21 2v12M21 28v12M2 21h12M28 21h12"
          stroke="#ffffff"
          strokeWidth="5"
          strokeLinecap="square"
        />
        <path
          d="M21 2v12M21 28v12M2 21h12M28 21h12"
          stroke="#111111"
          strokeWidth="2"
          strokeLinecap="square"
        />
        <circle cx="21" cy="21" r={pressed ? "2.4" : "1.6"} fill="#ff2a00" stroke="#111111" strokeWidth="1" />
      </svg>
    );
  }
  if (style === "bow-arrow") {
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-45px" : "-5px"}, -16px)` }}>
        <svg width="50" height="33" viewBox="0 0 64 42" aria-hidden="true">
          <g transform={direction > 0 ? undefined : "translate(64 0) scale(-1 1)"}>
            <path
              d="M13 5c-11 9-11 23 0 32"
              fill="none"
              stroke="#6b3f1d"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M14 6c8 10 8 20 0 30"
              fill="none"
              stroke={pressed ? "#fff8d8" : "#f3e0ad"}
              strokeWidth={pressed ? "2.5" : "1.5"}
              strokeLinecap="round"
            />
            <path d="M11 21h45" stroke="#6b3f1d" strokeWidth="3" strokeLinecap="round" />
            <path d="M56 21 45 15v12z" fill="#1d2227" stroke="#111111" strokeWidth="1.5" />
            <path d="M8 17 0 14M8 21 0 21M8 25 0 28" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <circle cx="57" cy="21" r="2" fill="#fff200" stroke="#111111" strokeWidth="1" />
          </g>
        </svg>
      </div>
    );
  }
  if (style === "carrot") {
    return (
      <svg
        width="46"
        height="46"
        viewBox="0 0 46 46"
        aria-hidden="true"
        style={{ transform: `translate(-9px, -37px) rotate(${pressed ? 7 : -4}deg)` }}
      >
        <path
          d="M28 5c3-5 7-3 6 2 5-2 8 2 3 5 4 2 3 6-3 5"
          fill="none"
          stroke="#2e9a47"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 39C12 26 18 14 29 8c6 8 6 17 2 25-8 2-15 4-22 6z"
          fill="#ff8a22"
          stroke="#111111"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M17 25h10M14 31h12M22 18h6" stroke="#c95a12" strokeWidth="2" strokeLinecap="round" />
        <path d="M9 39c4-2 6-3 9-7" stroke="#ffd17a" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (style === "horse-runner") {
    const gait = speed > 560 ? "0.16s" : speed > 160 ? "0.26s" : "0.52s";
    const farHindLeg = "M32 34l7 8-2 8";
    const farHindLegValues =
      "M32 34l7 8-2 8;M32 34l-7 8-9 4;M32 34l7 8-2 8";
    const nearHindLeg = "M25 34l-6 8-10 5";
    const nearHindLegValues =
      "M25 34l-6 8-10 5;M25 34l8 8-2 8;M25 34l-6 8-10 5";
    const farFrontLeg = "M58 34l-8 8-8 5";
    const farFrontLegValues =
      "M58 34l-8 8-8 5;M58 34l7 8 9 4;M58 34l-8 8-8 5";
    const nearFrontLeg = "M64 33l7 8 10 4";
    const nearFrontLegValues =
      "M64 33l7 8 10 4;M64 33l-6 9-3 8;M64 33l7 8 10 4";
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-82px" : "-5px"}, -21px)` }}>
        <svg
          width="88"
          height="54"
          viewBox="0 0 88 54"
          aria-hidden="true"
          shapeRendering="crispEdges"
        >
          <g transform={direction > 0 ? undefined : "translate(88 0) scale(-1 1)"}>
            <g strokeLinecap="square" strokeLinejoin="miter">
              <path d={farHindLeg} fill="none" stroke="#111111" strokeWidth="5">
                <animate attributeName="d" values={farHindLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={farHindLeg} fill="none" stroke="#6f3b1d" strokeWidth="2.5">
                <animate attributeName="d" values={farHindLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={farFrontLeg} fill="none" stroke="#111111" strokeWidth="5">
                <animate attributeName="d" values={farFrontLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={farFrontLeg} fill="none" stroke="#6f3b1d" strokeWidth="2.5">
                <animate attributeName="d" values={farFrontLegValues} dur={gait} repeatCount="indefinite" />
              </path>
            </g>
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0;0 -1;0 0"
                dur={gait}
                repeatCount="indefinite"
              />
              <polygon points="17,22 6,18 1,12 13,15 22,18" fill="#111111" />
              <polygon points="16,22 7,19 4,15 14,17 21,19" fill="#2b160b" />
              <polygon points="15,22 23,16 29,13 56,13 66,18 65,28 57,36 28,36 18,31" fill="#111111" />
              <polygon points="18,22 26,17 31,15 54,15 62,19 61,28 54,33 29,33 21,29" fill="#8a4e25" />
              <polygon points="26,18 37,16 54,16 59,19 44,21 28,21" fill="#b8753a" />
              <polygon points="31,30 52,30 47,33 30,33" fill="#6f3b1d" />
              <polygon points="56,15 66,8 73,10 68,25 59,27" fill="#111111" />
              <polygon points="59,16 67,10 71,12 65,23 60,24" fill="#9a5a2c" />
              <polygon points="67,8 81,10 87,15 83,21 72,21 65,15" fill="#111111" />
              <polygon points="69,10 80,12 84,15 82,18 73,19 68,15" fill="#a86431" />
              <polygon points="65,8 68,1 71,10" fill="#111111" />
              <polygon points="67,8 69,3 70,9" fill="#9a5a2c" />
              <polygon points="73,10 76,4 78,12" fill="#111111" />
              <polygon points="74,10 76,6 77,11" fill="#9a5a2c" />
              <rect x="56" y="15" width="4" height="4" fill="#2b160b" />
              <rect x="59" y="12" width="4" height="5" fill="#2b160b" />
              <rect x="62" y="10" width="4" height="5" fill="#2b160b" />
              <rect x="76" y="13" width="2" height="2" fill="#111111" />
              <rect x="84" y="16" width="3" height="2" fill="#111111" />
            </g>
            <g strokeLinecap="square" strokeLinejoin="miter">
              <path d={nearHindLeg} fill="none" stroke="#111111" strokeWidth="5">
                <animate attributeName="d" values={nearHindLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={nearHindLeg} fill="none" stroke="#9a5a2c" strokeWidth="2.5">
                <animate attributeName="d" values={nearHindLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={nearFrontLeg} fill="none" stroke="#111111" strokeWidth="5">
                <animate attributeName="d" values={nearFrontLegValues} dur={gait} repeatCount="indefinite" />
              </path>
              <path d={nearFrontLeg} fill="none" stroke="#9a5a2c" strokeWidth="2.5">
                <animate attributeName="d" values={nearFrontLegValues} dur={gait} repeatCount="indefinite" />
              </path>
            </g>
          </g>
        </svg>
      </div>
    );
  }
  if (style === "horf") {
    const gait = speed > 560 ? "0.18s" : speed > 160 ? "0.28s" : "0.55s";
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-78px" : "-4px"}, -23px)` }}>
        <svg width="82" height="52" viewBox="0 0 82 52" aria-hidden="true">
          <g transform={direction > 0 ? undefined : "translate(82 0) scale(-1 1)"}>
            <path
              d="M15 24c-7-1-11-5-13-10"
              fill="none"
              stroke="#4b2c18"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M14 25c4-12 27-15 43-8 8 4 10 12 4 18-11 8-35 7-46-1-4-3-4-6-1-9z"
              fill="#8f5630"
              stroke="#111111"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path
              d="M54 18c3-9 14-14 22-8 2 6-1 13-9 17-5-1-9-4-13-9z"
              fill="#a36236"
              stroke="#111111"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path d="M69 9 72 2l4 8" fill="#a36236" stroke="#111111" strokeWidth="2" strokeLinejoin="round" />
            <path d="M55 16c-5-2-14-3-24-2" stroke="#25140b" strokeWidth="5" strokeLinecap="round" />
            <path d="M74 19h3" stroke="#111111" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="68" cy="14" r="1.8" fill="#111111" />
            <path
              d="M16 26c5 4 18 6 33 3"
              fill="none"
              stroke="#c88a56"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.75"
            />
            <g stroke="#111111" strokeWidth="3" strokeLinecap="round">
              <path d="M24 34l-9 14">
                <animate attributeName="d" values="M24 34l-9 14;M24 34l10 13;M24 34l-9 14" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M36 35l9 13">
                <animate attributeName="d" values="M36 35l9 13;M36 35l-11 12;M36 35l9 13" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M54 33l-2 15">
                <animate attributeName="d" values="M54 33l-2 15;M54 33l13 10;M54 33l-2 15" dur={gait} repeatCount="indefinite" />
              </path>
            </g>
            <path d="M78 23c-2 2-4 2-6 1" stroke="#111111" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    );
  }
  if (style === "guinea-pig-runner") {
    const gait = speed > 520 ? "0.16s" : speed > 150 ? "0.25s" : "0.48s";
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-57px" : "-5px"}, -20px)` }}>
        <svg width="64" height="42" viewBox="0 0 64 42" aria-hidden="true">
          <g transform={direction > 0 ? undefined : "translate(64 0) scale(-1 1)"}>
            <ellipse cx="30" cy="24" rx="24" ry="13" fill="#d7a05f" stroke="#111111" strokeWidth="2.2" />
            <path d="M12 18c8-10 25-9 37-2" fill="none" stroke="#fff3d8" strokeWidth="8" strokeLinecap="round" />
            <ellipse cx="51" cy="20" rx="10" ry="9" fill="#c98a47" stroke="#111111" strokeWidth="2" />
            <circle cx="47" cy="12" r="4" fill="#c98a47" stroke="#111111" strokeWidth="1.5" />
            <circle cx="54" cy="18" r="1.5" fill="#111111" />
            <circle cx="59" cy="22" r="2" fill="#f0b0a2" stroke="#111111" strokeWidth="1" />
            <path d="M58 23h4M58 25h4" stroke="#111111" strokeWidth="1" strokeLinecap="round" />
            <g stroke="#111111" strokeWidth="2.3" strokeLinecap="round">
              <path d="M22 34l-4 5">
                <animate attributeName="d" values="M22 34l-4 5;M22 34l5 4;M22 34l-4 5" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M39 34l5 5">
                <animate attributeName="d" values="M39 34l5 5;M39 34l-5 4;M39 34l5 5" dur={gait} repeatCount="indefinite" />
              </path>
            </g>
          </g>
        </svg>
      </div>
    );
  }
  if (style === "ant-runner") {
    const gait = speed > 520 ? "0.13s" : speed > 150 ? "0.22s" : "0.44s";
    return (
      <div style={{ transform: `translate(${direction > 0 ? "-58px" : "-5px"}, -19px)` }}>
        <svg width="64" height="38" viewBox="0 0 64 38" aria-hidden="true">
          <g transform={direction > 0 ? undefined : "translate(64 0) scale(-1 1)"}>
            <ellipse cx="17" cy="20" rx="10" ry="8" fill="#111111" />
            <ellipse cx="33" cy="19" rx="9" ry="7" fill="#202020" />
            <circle cx="48" cy="18" r="8" fill="#111111" />
            <circle cx="51" cy="16" r="1.4" fill="#ffffff" />
            <path d="M53 13c4-7 7-7 9-5M54 16c5-3 7-2 9 1" stroke="#111111" strokeWidth="2" strokeLinecap="round" />
            <g stroke="#111111" strokeWidth="2.4" strokeLinecap="round">
              <path d="M17 20 7 8">
                <animate attributeName="d" values="M17 20 7 8;M17 20 4 25;M17 20 7 8" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M19 22 7 33">
                <animate attributeName="d" values="M19 22 7 33;M19 22 10 9;M19 22 7 33" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M33 20 25 7">
                <animate attributeName="d" values="M33 20 25 7;M33 20 22 31;M33 20 25 7" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M36 21 29 34">
                <animate attributeName="d" values="M36 21 29 34;M36 21 41 7;M36 21 29 34" dur={gait} repeatCount="indefinite" />
              </path>
              <path d="M47 21 56 33">
                <animate attributeName="d" values="M47 21 56 33;M47 21 39 7;M47 21 56 33" dur={gait} repeatCount="indefinite" />
              </path>
            </g>
          </g>
        </svg>
      </div>
    );
  }
  if (style === "a11-rocket") {
    return (
      <svg
        width="46"
        height="54"
        viewBox="0 0 46 54"
        aria-hidden="true"
        style={{ transform: `translate(-23px, -6px) rotate(${pressed ? 6 : 0}deg)` }}
      >
        <path
          d="M23 3c9 9 10 28 6 40H17C13 31 14 12 23 3z"
          fill="#f4f2e7"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M17 20h12M17 29h12" stroke="#111111" strokeWidth="1.4" />
        <path d="M17 33 8 44l9-2zM29 33l9 11-9-2z" fill="#d7d7d7" stroke="#111111" strokeWidth="2" />
        <path d="M20 11h6v23h-6z" fill="#111111" opacity="0.12" />
        <text
          x="23"
          y="27"
          textAnchor="middle"
          fontFamily={getPrimaryFontFamily("display")}
          fontSize="7"
          fill="#111111"
        >
          A11
        </text>
        <path
          d={pressed ? "M17 43c4 9 8 9 12 0 2 7-1 10-6 10s-8-3-6-10z" : "M18 43c3 6 7 6 10 0 1 5-1 8-5 8s-6-3-5-8z"}
          fill="#ff7a00"
          stroke="#111111"
          strokeWidth="1.5"
        />
        <path d="M21 44c1.5 4 2.5 4 4 0" stroke="#fff200" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (style === "hatchet") {
    return (
      <HatchetCursor $pressed={pressed}>
        <svg
          width="42"
          height="42"
          viewBox="0 0 42 42"
          aria-hidden="true"
          shapeRendering="crispEdges"
        >
          <polygon points="6,14 16,7 25,10 26,15 18,21 9,18" fill="#111111" />
          <polygon points="9,14 17,9 23,11 23,14 17,18 11,16" fill="#cfd4d8" />
          <polygon points="9,14 17,9 15,13 10,16" fill="#f4f7f8" />
          <polygon points="17,18 23,14 23,16 18,21 13,18" fill="#8e969c" />
          <polygon points="20,15 25,17 37,32 34,36 22,20 18,19" fill="#111111" />
          <polygon points="22,17 24,18 34,31 33,33 23,20 21,19" fill="#9a5a2c" />
          <polygon points="24,19 25,20 32,29 31,30" fill="#d49a54" />
          <rect x="20" y="14" width="5" height="5" fill="#111111" />
          <rect x="21" y="15" width="3" height="3" fill="#5a321b" />
          {pressed ? (
            <g>
              <path
                d="M5 29c6 5 13 8 22 8"
                fill="none"
                stroke="#fff200"
                strokeWidth="2"
                strokeLinecap="square"
              />
              <path
                d="M4 33c5 3 10 5 17 6"
                fill="none"
                stroke="#ff4a00"
                strokeWidth="1.5"
                strokeLinecap="square"
              />
            </g>
          ) : null}
        </svg>
      </HatchetCursor>
    );
  }
  if (style === "tezos-classic") {
    return (
      <svg
        width="36"
        height="49"
        viewBox="0 0 47 64"
        aria-hidden="true"
        style={{ transform: `translate(-18px, -24px) rotate(${pressed ? -5 : 0}deg)` }}
      >
        <path
          fill="#2c7df7"
          d="M30.252 63.441c-4.55 0-7.864-1.089-9.946-3.267-2.08-2.177-3.121-4.525-3.121-7.041 0-.92.181-1.694.544-2.323a3.993 3.993 0 0 1 1.489-1.489c.629-.363 1.403-.544 2.323-.544.92 0 1.693.181 2.323.544.629.363 1.125.86 1.488 1.489.363.629.544 1.403.544 2.323 0 1.113-.266 2.02-.798 2.722-.533.702-1.162 1.161-1.888 1.38.63.87 1.622 1.487 2.977 1.85 1.355.388 2.71.581 4.065.581 1.887 0 3.593-.508 5.118-1.524 1.524-1.017 2.65-2.517 3.376-4.501.726-1.984 1.089-4.235 1.089-6.752 0-2.734-.4-5.07-1.198-7.005-.775-1.96-1.924-3.412-3.449-4.356a9.21 9.21 0 0 0-4.936-1.415c-1.162 0-2.613.484-4.356 1.452l-3.194 1.597v-1.597L37.076 16.4H17.185v19.89c0 1.646.363 3.001 1.089 4.066s1.839 1.597 3.34 1.597c1.16 0 2.274-.387 3.339-1.162a11.803 11.803 0 0 0 2.758-2.83c.097-.219.218-.376.363-.473a.723.723 0 0 1 .472-.181c.266 0 .58.133.944.4.339.386.508.834.508 1.342a9.243 9.243 0 0 1-.182 1.017c-.822 1.839-1.96 3.242-3.412 4.21a8.457 8.457 0 0 1-4.79 1.452c-4.308 0-7.285-.847-8.93-2.54-1.645-1.695-2.468-3.994-2.468-6.897V16.4H.052v-3.703h10.164v-8.42L7.893 1.952V.066h6.751l2.54 1.306v11.325l26.28-.072 2.614 2.613-16.116 16.116a10.807 10.807 0 0 1 3.049-.726c1.742 0 3.702.557 5.88 1.67 2.202 1.089 3.896 2.59 5.081 4.5 1.186 1.888 1.948 3.703 2.287 5.445.363 1.743.545 3.291.545 4.646 0 3.098-.654 5.977-1.96 8.64-1.307 2.661-3.291 4.645-5.953 5.952-2.662 1.307-5.542 1.96-8.639 1.96z"
        />
      </svg>
    );
  }
  if (style === "tezos-current") {
    return <TezosLogoCursor src="/cursors/tezos-current-logo.png" alt="" draggable={false} />;
  }
  if (style === "blang-side-eye") {
    return (
      <BlangCursor
        src={pressed ? "/cursors/blang-facepalm.png" : "/cursors/blang-side-eye.png"}
        alt=""
        draggable={false}
        $pressed={pressed}
      />
    );
  }
  if (style === "middle-finger") {
    return <EmojiCursor $dx={-9} $dy={-5}>🖕</EmojiCursor>;
  }
  if (style === "eggplant") {
    return <EmojiCursor $dx={-8} $dy={-4}>🍆</EmojiCursor>;
  }
  if (style === "paintbrush") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: "translate(-5px, -31px)" }}
      >
        <path
          d="M21 17 33 5c1.4-1.4 3.7-1.4 5.1 0s1.4 3.7 0 5.1L26 22z"
          fill="#c2382b"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M15 23 21 17l7 7-6 6z"
          fill="#d7d7d7"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M5 31c2-5 6-9 10-8 4 1 6 4 6 7-4 4-10 6-17 5 0 0 0-2 1-4z"
          fill="#5a321b"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M7 32c3 0 6-1 9-4"
          fill="none"
          stroke="#9a6130"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="5" cy="31" r="2.3" fill="#ff3b8d">
          <animate attributeName="cy" values="31;34;31" dur="1.4s" repeatCount="indefinite" />
        </circle>
        <path d="M33 7 36 10" stroke="#ffb1aa" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (style === "rainbow-hitbox") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: "translate(-21px, -21px)" }}
      >
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 21 21"
            to="360 21 21"
            dur="1.6s"
            repeatCount="indefinite"
          />
          <path d="M21 2v11M21 29v11M2 21h11M29 21h11" stroke="#111111" strokeWidth="6" strokeLinecap="square" />
          <path d="M21 2v11M21 29v11M2 21h11M29 21h11" stroke="#ff004d" strokeWidth="3" strokeLinecap="square" />
          <path d="M7 7l8 8M27 27l8 8M35 7l-8 8M15 27l-8 8" stroke="#fff200" strokeWidth="3" />
        </g>
        <circle cx="21" cy="21" r="5" fill="#00f0ff" stroke="#111111" strokeWidth="2">
          <animate attributeName="r" values="4;7;4" dur="0.8s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }
  if (style === "spinning-slice") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: "translate(-7px, -34px)" }}
      >
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 19 20; 8 19 20; -8 19 20; 0 19 20"
            dur="0.9s"
            repeatCount="indefinite"
          />
          <path
            d="M7 34 34 8c-7-5-18-5-25 0z"
            fill="#ffd45a"
            stroke="#111111"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M10 8c7-4 16-4 24 0" fill="none" stroke="#c2382b" strokeWidth="5" strokeLinecap="round" />
          <circle cx="19" cy="17" r="2.7" fill="#c2382b" />
          <circle cx="25" cy="23" r="2.5" fill="#c2382b" />
          <circle cx="15" cy="26" r="2.3" fill="#c2382b" />
          <path d="M7 34c6-3 11-7 14-13" stroke="#fff0a0" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    );
  }
  if (style === "floppy-spinner") {
    return (
      <svg
        width="42"
        height="42"
        viewBox="0 0 42 42"
        aria-hidden="true"
        style={{ transform: "translate(-5px, -5px)" }}
      >
        <path
          d="M6 5h25l5 5v27H6z"
          fill="#252a34"
          stroke="#111111"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M12 5h16v12H12z" fill="#9ad7ff" stroke="#111111" strokeWidth="2" />
        <path d="M12 27h18v10H12z" fill="#f2f2f2" stroke="#111111" strokeWidth="2" />
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 21 22"
            to="360 21 22"
            dur="1s"
            repeatCount="indefinite"
          />
          <path d="M21 16a6 6 0 0 1 6 6h-4a2 2 0 0 0-2-2z" fill="#ff3b8d" />
          <path d="M21 28a6 6 0 0 1-6-6h4a2 2 0 0 0 2 2z" fill="#fff200" />
        </g>
      </svg>
    );
  }
  return (
    <svg
      width="54"
      height="54"
      viewBox="0 0 54 54"
      aria-hidden="true"
      style={{ transform: `translate(-8px, -6px) rotate(${pressed ? -5 : 0}deg)` }}
    >
      <path
        d="M15 41h20v9c-5 2-15 2-20 0z"
        fill="#5ab4ff"
        stroke="#111111"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8 7c2-4 8-4 10 0l8 15 1-6c1-4 7-4 8 0l1 6 2-4c2-4 8-3 8 2 0 7-2 13-6 18-4 5-9 7-16 7h-2c-9 0-15-5-17-13L3 22c-1-5 5-7 8-3l5 6z"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M18 25c5 4 12 5 20 2M26 22l-1 11M35 23l-4 10"
        fill="none"
        stroke="#d7d7d7"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9 8c2 1 5 1 8 0M9 14c3 1 6 1 10-1"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface CustomCursorState {
  x: number;
  y: number;
  visible: boolean;
  pressed: boolean;
  clickFlash: boolean;
  direction: CursorDirection;
  speed: number;
}

interface CrosshairImpactMark {
  id: number;
  x: number;
  y: number;
}

interface ArrowShotMark {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  distance: number;
  angle: number;
}

export function CustomCursor({ style }: { style: DesktopAppearance["cursorStyle"] }) {
  const [state, setState] = useState<CustomCursorState>({
    x: 0,
    y: 0,
    visible: false,
    pressed: false,
    clickFlash: false,
    direction: 1,
    speed: 0,
  });
  const [impacts, setImpacts] = useState<CrosshairImpactMark[]>([]);
  const [arrowShots, setArrowShots] = useState<ArrowShotMark[]>([]);
  const lastPointerRef = useRef({ x: 0, y: 0, t: 0, direction: 1 as CursorDirection });
  const impactIdRef = useRef(0);
  const impactTimeoutsRef = useRef<number[]>([]);
  const clickFlashTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (style === "system") return;
    const clearClickFlashTimeout = () => {
      if (clickFlashTimeoutRef.current != null) {
        window.clearTimeout(clickFlashTimeoutRef.current);
        clickFlashTimeoutRef.current = null;
      }
    };
    const move = (event: PointerEvent) => {
      const now = performance.now();
      const last = lastPointerRef.current;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      const dt = last.t > 0 ? Math.max(16, now - last.t) : 16;
      const direction = Math.abs(dx) > 1 ? (dx >= 0 ? 1 : -1) : last.direction;
      const speed = last.t > 0 ? Math.min(1200, (Math.hypot(dx, dy) / dt) * 1000) : 0;
      lastPointerRef.current = { x: event.clientX, y: event.clientY, t: now, direction };
      setState((prev) => ({
        ...prev,
        x: event.clientX,
        y: event.clientY,
        visible: true,
        direction,
        speed,
      }));
    };
    const press = (event: PointerEvent) => {
      if (event.button !== 0) return;
      clearClickFlashTimeout();
      setState((prev) => ({
        ...prev,
        x: event.clientX,
        y: event.clientY,
        visible: true,
        pressed: true,
        clickFlash: true,
      }));
      clickFlashTimeoutRef.current = window.setTimeout(() => {
        setState((prev) => ({ ...prev, clickFlash: false }));
        clickFlashTimeoutRef.current = null;
      }, 420);
      if (style === "crosshair") {
        const id = impactIdRef.current + 1;
        impactIdRef.current = id;
        setImpacts((prev) => [...prev.slice(-7), { id, x: event.clientX, y: event.clientY }]);
        const timeout = window.setTimeout(() => {
          setImpacts((prev) => prev.filter((impact) => impact.id !== id));
        }, 920);
        impactTimeoutsRef.current.push(timeout);
      }
      if (style === "bow-arrow") {
        const iconTarget =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-desktop-icon-root='true']")
            : null;
        const rect = iconTarget?.getBoundingClientRect();
        const fallbackDirection = lastPointerRef.current.direction;
        const toX = rect ? rect.left + rect.width / 2 : event.clientX + fallbackDirection * 86;
        const toY = rect ? rect.top + rect.height / 2 : event.clientY;
        const dx = toX - event.clientX;
        const dy = toY - event.clientY;
        const id = impactIdRef.current + 1;
        impactIdRef.current = id;
        setArrowShots((prev) => [
          ...prev.slice(-5),
          {
            id,
            fromX: event.clientX,
            fromY: event.clientY,
            toX,
            toY,
            distance: Math.max(30, Math.hypot(dx, dy)),
            angle: Math.atan2(dy, dx),
          },
        ]);
        const timeout = window.setTimeout(() => {
          setArrowShots((prev) => prev.filter((shot) => shot.id !== id));
        }, 900);
        impactTimeoutsRef.current.push(timeout);
      }
    };
    const release = () => {
      setState((prev) => ({ ...prev, pressed: false }));
    };
    const hide = () => {
      clearClickFlashTimeout();
      setState((prev) => ({
        ...prev,
        visible: false,
        pressed: false,
        clickFlash: false,
        speed: 0,
      }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
      clearClickFlashTimeout();
      impactTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      impactTimeoutsRef.current = [];
    };
  }, [style]);

  if (style === "system") return null;
  return (
    <>
      {style === "crosshair" &&
        impacts.map((impact) => (
          <CrosshairImpact key={impact.id} $x={impact.x} $y={impact.y} />
        ))}
      {style === "bow-arrow" &&
        arrowShots.map((shot) => (
          <Fragment key={shot.id}>
            <BowShot
              $fromX={shot.fromX}
              $fromY={shot.fromY}
              $distance={shot.distance}
              $angle={shot.angle}
            >
              <BowShotArrow $distance={shot.distance}>
                <span />
              </BowShotArrow>
            </BowShot>
            <BowHitMark $x={shot.toX} $y={shot.toY} />
          </Fragment>
        ))}
      <CustomCursorRoot
        data-desktop-cursor={style}
        $x={state.x}
        $y={state.y}
        $visible={state.visible}
      >
        <CursorGlyph
          style={style}
          pressed={state.pressed || state.clickFlash}
          direction={state.direction}
          speed={state.speed}
        />
      </CustomCursorRoot>
    </>
  );
}
