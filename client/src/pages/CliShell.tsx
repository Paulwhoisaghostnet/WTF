import { useCallback } from "react";
import styled from "styled-components";
import {
  presentationRouteHref,
  usePresentationShell,
} from "../lib/presentation-shell";
import { WtfOsCliShell } from "../features/wtfos-cli/WtfOsCliShell";

const CliPresentationSurface = styled.div`
  display: grid;
  min-height: 0;

  &[data-gamma-utility-presentation-host="gamma"] {
    color: #f2ead9;
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
    font-size: 15px;
    line-height: 1.45;
  }

  &[data-gamma-utility-presentation-host="gamma"],
  &[data-gamma-utility-presentation-host="gamma"] * {
    box-sizing: border-box;
    letter-spacing: 0;
    text-shadow: none;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region] {
    background-image: none;
    box-shadow: none;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="cli-frame"] {
    min-height: min(76vh, 760px);
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: #070706;
    color: #f2ead9;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="cli-status"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="cli-output"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="cli-prompt"] {
    border-color: rgba(242, 234, 217, 0.22);
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="cli-glyph"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="cli-status"] {
    color: #00d2ff;
  }

  &[data-gamma-utility-presentation-host="gamma"] :where(button, input) {
    border-radius: 4px;
  }

  &[data-gamma-utility-presentation-host="gamma"] button:not(:disabled) {
    color: #f2ead9;
  }
`;

export function CliShell() {
  const presentation = usePresentationShell();
  const makePresentationRoute = useCallback(
    (path: string) => presentationRouteHref(path, presentation.host),
    [presentation.host]
  );

  if (presentation.host !== "gamma") {
    return <WtfOsCliShell />;
  }

  return (
    <CliPresentationSurface
      data-gamma-utility-surface="cli"
      data-gamma-utility-presentation-host={presentation.host}
      data-gamma-utility-region="surface"
    >
      <WtfOsCliShell makePresentationRoute={makePresentationRoute} />
    </CliPresentationSurface>
  );
}
