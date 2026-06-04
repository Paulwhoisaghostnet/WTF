import { useMemo } from "react";
import styled, { keyframes } from "styled-components";

export const DESKTOP_WEATHER_RULES = ["off", "gentle", "stormy"] as const;
export type DesktopWeatherRule = (typeof DESKTOP_WEATHER_RULES)[number];

const STORAGE_KEY = "wtf.desktop.weather-cloud.v1";

export function normalizeDesktopWeatherRule(value: unknown): DesktopWeatherRule {
  return value === "gentle" || value === "stormy" ? value : "off";
}

export function loadDesktopWeatherRule(): DesktopWeatherRule {
  if (typeof window === "undefined") return "off";
  try {
    return normalizeDesktopWeatherRule(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "off";
  }
}

export function saveDesktopWeatherRule(rule: DesktopWeatherRule) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, rule);
  } catch {
    // Weather is decorative and should never block the desktop shell.
  }
}

export function DesktopWeatherCloud({
  bounds,
  rule,
}: {
  bounds: { width: number; height: number };
  rule: DesktopWeatherRule;
}) {
  const drops = useMemo(() => {
    const count = rule === "stormy" ? 28 : rule === "gentle" ? 10 : 0;
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      left: 8 + ((index * 37) % Math.max(60, bounds.width - 120)),
      delay: (index % 9) * 0.24,
      duration: rule === "stormy" ? 1.1 + (index % 4) * 0.12 : 2 + (index % 5) * 0.18,
    }));
  }, [bounds.width, rule]);

  return (
    <WeatherRoot aria-label="Desktop weather cloud">
      {rule !== "off" && (
        <CloudBody $rule={rule} style={{ left: Math.max(10, Math.min(bounds.width - 190, 148)), top: 18 }}>
          <span />
          <i />
        </CloudBody>
      )}
      {drops.map((drop) => (
        <RainDrop
          key={drop.id}
          $left={drop.left}
          $duration={drop.duration}
          $delay={drop.delay}
          $stormy={rule === "stormy"}
        />
      ))}
    </WeatherRoot>
  );
}

const rainFall = keyframes`
  from { transform: translateY(-12px); opacity: 0; }
  8% { opacity: 0.85; }
  to { transform: translateY(88vh); opacity: 0; }
`;

const cloudDrift = keyframes`
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(24px); }
`;

const WeatherRoot = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
`;

const CloudBody = styled.div<{ $rule: DesktopWeatherRule }>`
  position: absolute;
  width: 118px;
  height: 46px;
  pointer-events: none;
  border: 2px solid #111111;
  border-radius: 26px;
  background:
    radial-gradient(circle at 24% 42%, #ffffff 0 20px, transparent 20.5px),
    radial-gradient(circle at 54% 20%, #f8fafc 0 25px, transparent 25.5px),
    linear-gradient(180deg, ${(p) => (p.$rule === "stormy" ? "#94a3b8" : "#e0f2fe")}, #cbd5e1);
  box-shadow: 2px 3px 0 rgba(0, 0, 0, 0.24);
  animation: ${cloudDrift} 7s ease-in-out infinite;

  span,
  i {
    position: absolute;
    width: 18px;
    height: 4px;
    background: ${(p) => (p.$rule === "stormy" ? "#facc15" : "transparent")};
    left: 52px;
    bottom: -8px;
    transform: rotate(-18deg);
  }

  i {
    left: 72px;
    bottom: -15px;
  }
`;

const RainDrop = styled.span<{
  $left: number;
  $duration: number;
  $delay: number;
  $stormy: boolean;
}>`
  position: absolute;
  top: 62px;
  left: ${(p) => p.$left}px;
  width: ${(p) => (p.$stormy ? 3 : 2)}px;
  height: ${(p) => (p.$stormy ? 14 : 9)}px;
  background: ${(p) => (p.$stormy ? "#0ea5e9" : "#7dd3fc")};
  opacity: 0;
  animation: ${rainFall} ${(p) => p.$duration}s linear ${(p) => p.$delay}s infinite;
`;
