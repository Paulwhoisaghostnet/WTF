import styled from "styled-components";
import type { CreationToolDefinition } from "./tool-registry";

type CreationToolFrameProps = {
  tool: CreationToolDefinition;
};

export function CreationToolFrame({ tool }: CreationToolFrameProps) {
  const provenance = tool.provenance;
  const xLabel = provenance?.xHandle
    ? `@${provenance.xHandle.replace(/^@+/, "")}`
    : null;

  return (
    <Shell data-tool-domain={tool.domain}>
      <Header>
        <TitleBlock>
          <Title>{tool.title}</Title>
          <Subtitle>{tool.subtitle}</Subtitle>
        </TitleBlock>
        {provenance && (
          <Attribution>
            <span title={provenance.creatorAddress}>By {provenance.tezosIdentity || provenance.creatorName}</span>
            {xLabel && provenance.xUrl && (
              <a href={provenance.xUrl} target="_blank" rel="noreferrer">
                {xLabel}
              </a>
            )}
            {provenance.tokenUrl && (
              <a href={provenance.tokenUrl} target="_blank" rel="noreferrer">
                Support
              </a>
            )}
          </Attribution>
        )}
      </Header>
      <ToolFrame
        title={tool.title}
        src={tool.src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
        allow="clipboard-read; clipboard-write"
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
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 10px 0;
`;

const TitleBlock = styled.div`
  min-width: 0;
`;

const Title = styled.div`
  font-weight: 700;
  letter-spacing: 0.04em;
`;

const Subtitle = styled.div`
  color: #aaa;
  font-size: 12px;
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
`;

const ToolFrame = styled.iframe`
  flex: 1;
  width: 100%;
  min-height: 520px;
  border: 0;
  background: #000;
`;
