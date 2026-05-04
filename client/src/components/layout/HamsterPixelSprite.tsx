import type { CSSProperties } from "react";

export interface HamsterSpriteScheme {
  fur: string;
  belly: string;
  ear: string;
  spot: string;
  accent: string;
}

interface HamsterPixelSpriteProps {
  alive: boolean;
  moving?: boolean;
  scheme: HamsterSpriteScheme;
  width?: number;
  height?: number;
  className?: string;
}

export function HamsterPixelSprite({
  alive,
  moving = false,
  scheme,
  width = 88,
  height = 60,
  className,
}: HamsterPixelSpriteProps) {
  const style =
    {
      "--ham-fur": alive ? scheme.fur : "#8a8a8a",
      "--ham-belly": alive ? scheme.belly : "#d0d0d0",
      "--ham-ear": alive ? scheme.ear : "#9a9a9a",
      "--ham-spot": alive ? scheme.spot : "#5f5f5f",
      "--ham-accent": alive ? scheme.accent : "#444444",
      width,
      height,
    } as CSSProperties;

  return (
    <svg
      className={className}
      viewBox="0 0 96 64"
      role="img"
      aria-label="Pixel hamster"
      shapeRendering="crispEdges"
      style={style}
      data-moving={moving ? "true" : "false"}
      data-alive={alive ? "true" : "false"}
    >
      <style>{`
        svg[data-moving="true"] .hamster-body {
          animation: hamster-pixel-bob 0.42s steps(2) infinite;
        }
        svg[data-moving="true"] .hamster-leg-a {
          animation: hamster-pixel-step-a 0.42s steps(2) infinite;
        }
        svg[data-moving="true"] .hamster-leg-b {
          animation: hamster-pixel-step-b 0.42s steps(2) infinite;
        }
        svg[data-moving="false"] .hamster-idle {
          animation: hamster-pixel-idle 1.15s steps(2) infinite;
        }
        @keyframes hamster-pixel-bob {
          50% { transform: translateY(-2px); }
        }
        @keyframes hamster-pixel-step-a {
          50% { transform: translate(4px, -1px); }
        }
        @keyframes hamster-pixel-step-b {
          50% { transform: translate(-3px, 1px); }
        }
        @keyframes hamster-pixel-idle {
          50% { transform: translateY(1px); }
        }
      `}</style>

      <ellipse cx="48" cy="55" rx="35" ry="4" fill="rgba(0,0,0,0.28)" />

      <g className="hamster-body hamster-idle">
        <path
          d="M7 33h3v-9h4v-5h6v-4h9v-3h19v3h8v4h6v-3h10v3h7v4h5v6h4v12h-4v5h-5v4h-9v3H50v4H31v-4H19v-4h-7v-5H7z"
          fill="#141414"
        />
        <path
          d="M12 34h3V25h4v-5h7v-3h20v3h8v4h7v-3h10v3h6v5h4v10h-4v5h-7v4H51v4H32v-4H20v-4h-5v-5h-3z"
          fill="var(--ham-belly)"
        />
        <path
          d="M12 34h3v-9h4v-5h7v-3h13v3h-4v5h-6v6h-4v11h-9v-3h-4z"
          fill="var(--ham-fur)"
        />
        <path
          d="M43 20h11v4h7v-3h10v3h6v5h4v10h-4v4h-8v-4h-4v-7h-6v-4H47v-4h-4z"
          fill="var(--ham-fur)"
        />
        <path
          d="M28 18h10v4h-4v5h-6v6h-4v10h-8v-4h4v-9h4v-7h4z"
          fill="rgba(0,0,0,0.13)"
        />
        <path
          d="M16 41h8v4h8v3H20v-4h-4z"
          fill="rgba(255,255,255,0.45)"
        />

        <g className="hamster-leg-a">
          <path d="M22 49h10v4h-4v3H18v-4h4z" fill="#141414" />
          <path d="M23 49h7v3h-3v2h-6v-2h2z" fill="var(--ham-accent)" />
        </g>
        <g className="hamster-leg-b">
          <path d="M56 48h11v4h-4v3H52v-4h4z" fill="#141414" />
          <path d="M57 48h8v3h-3v2h-7v-2h2z" fill="var(--ham-accent)" />
        </g>

        <path d="M65 15h6v3h4v8h-4v3h-8v-4h-3v-6h5z" fill="#141414" />
        <path d="M66 18h5v3h2v4h-3v2h-5v-3h-2v-4h3z" fill="var(--ham-ear)" />
        <path d="M60 17h5v3h3v6h-3v3h-6v-3h-3v-6h4z" fill="#141414" />
        <path d="M61 19h4v3h1v3h-2v2h-4v-2h-2v-3h3z" fill="var(--ham-ear)" />

        <path
          d="M61 25h9v3h4v8h-4v5h-8v-4h-4v-8h3z"
          fill="var(--ham-spot)"
          opacity="0.82"
        />
        <rect x="69" y="31" width="4" height="5" fill="#0f0f0f" />
        <rect x="71" y="31" width="1" height="1" fill="#ffffff" />
        <path d="M81 36h6v4h-3v3h-5v-3h2z" fill="#141414" />
        <path d="M80 35h5v4h-3v2h-4v-3h2z" fill="#fff5ed" />
        <rect x="84" y="38" width="3" height="3" fill="var(--ham-accent)" />
        <rect x="88" y="36" width="3" height="2" fill="#141414" />
        <rect x="88" y="41" width="3" height="2" fill="#141414" />

        <rect x="62" y="21" width="3" height="3" fill="var(--ham-spot)" />
        <rect x="66" y="20" width="3" height="3" fill="var(--ham-spot)" />
        <rect x="70" y="22" width="3" height="3" fill="var(--ham-spot)" />
        <rect x="64" y="24" width="3" height="3" fill="#141414" opacity="0.35" />

        <rect x="38" y="52" width="7" height="3" fill="#141414" opacity="0.3" />
        <rect x="68" y="48" width="6" height="3" fill="#141414" opacity="0.32" />
        {!alive && (
          <g>
            <rect x="67" y="30" width="2" height="8" fill="#141414" transform="rotate(45 68 34)" />
            <rect x="67" y="30" width="2" height="8" fill="#141414" transform="rotate(-45 68 34)" />
          </g>
        )}
      </g>
    </svg>
  );
}
