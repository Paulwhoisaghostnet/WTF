import styled from "styled-components";
import { usePresentationShell } from "../../lib/presentation-shell";
import type { CreationToolDefinition } from "./tool-registry";

type CreationToolFrameProps = {
  tool: CreationToolDefinition;
};

export function CreationToolFrame({ tool }: CreationToolFrameProps) {
  const presentation = usePresentationShell();
  const provenance = tool.provenance;
  const routeSearch = typeof window !== "undefined" ? window.location.search : "";
  const frameSrc = routeSearch
    ? `${tool.src}${tool.src.includes("?") ? "&" : "?"}${routeSearch.slice(1)}`
    : tool.src;
  const xLabel = provenance?.xHandle
    ? `@${provenance.xHandle.replace(/^@+/, "")}`
    : null;

  return (
    <Shell
      data-creation-tool-surface="iframe-shell"
      data-creation-tool-presentation-host={presentation.host}
      data-creation-tool-id={tool.id}
      data-tool-domain={tool.domain}
    >
      <Header data-creation-tool-region="header">
        <TitleBlock data-creation-tool-region="title-block">
          <Title>{tool.title}</Title>
          <Subtitle>{tool.subtitle}</Subtitle>
        </TitleBlock>
        {provenance && (
          <Attribution data-creation-tool-region="attribution">
            <span title={provenance.creatorAddress}>By {provenance.tezosIdentity || provenance.creatorName}</span>
            {xLabel && provenance.xUrl && (
              <a href={provenance.xUrl} target="_blank" rel="noopener noreferrer">
                {xLabel}
              </a>
            )}
            {provenance.sourceUrl && (
              <a href={provenance.sourceUrl} target="_blank" rel="noopener noreferrer">
                Source
              </a>
            )}
            {provenance.tokenUrl && (
              <a href={provenance.tokenUrl} target="_blank" rel="noopener noreferrer">
                Support
              </a>
            )}
          </Attribution>
        )}
      </Header>
      <ToolFrame
        data-creation-tool-region="iframe"
        title={tool.title}
        src={frameSrc}
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
        allow={
          tool.id === "pixalerce"
            ? "camera; microphone; fullscreen; clipboard-read; clipboard-write"
            : "clipboard-read; clipboard-write"
        }
      />
    </Shell>
  );
}

const Shell = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #111;
  color: #f2f2f2;

  &[data-creation-tool-presentation-host="gamma"] {
    min-height: 100%;
    gap: 12px;
    background: #070706;
    background-image: none;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: none;
    text-shadow: none;
  }

  &[data-creation-tool-presentation-host="gamma"],
  &[data-creation-tool-presentation-host="gamma"] * {
    box-sizing: border-box;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 10px 0;

  [data-creation-tool-presentation-host="gamma"] & {
    padding: 12px 14px;
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.28);
    border-radius: 6px;
    box-shadow: none;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;
`;

const Title = styled.div`
  font-weight: 700;
  letter-spacing: 0.04em;

  [data-creation-tool-presentation-host="gamma"] & {
    color: #f2ead9;
    font-size: 16px;
    letter-spacing: 0;
    line-height: 1.2;
    text-shadow: none;
  }
`;

const Subtitle = styled.div`
  color: #aaa;
  font-size: 12px;

  [data-creation-tool-presentation-host="gamma"] & {
    max-width: 72ch;
    color: rgba(242, 234, 217, 0.72);
    font-size: 13px;
    line-height: 1.45;
  }
`;

const Attribution = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  color: #bdbdbd;
  font-size: 12px;
  line-height: 1.3;
  text-align: right;

  a {
    color: #f2f2f2;
    text-decoration: none;
  }

  a:hover {
    color: #88d8ff;
  }

  [data-creation-tool-presentation-host="gamma"] & {
    color: rgba(242, 234, 217, 0.68);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
  }

  [data-creation-tool-presentation-host="gamma"] & a {
    color: #00d2ff;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  [data-creation-tool-presentation-host="gamma"] & a:hover {
    color: #f2ead9;
  }
`;

const ToolFrame = styled.iframe`
  flex: 1;
  width: 100%;
  min-height: 520px;
  border: 0;
  background: #000;

  [data-creation-tool-presentation-host="gamma"] & {
    min-height: 620px;
    background: #000;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.3);
    border-radius: 6px;
    box-shadow: none;
  }
`;
