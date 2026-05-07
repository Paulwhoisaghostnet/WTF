import styled from "styled-components";

import type { CreationToolDefinition } from "./tool-registry";

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
  align-items: baseline;
  gap: 12px;
  padding: 8px 10px 0;
`;

const Title = styled.div`
  font-weight: 700;
  letter-spacing: 0.04em;
`;

const Subtitle = styled.div`
  color: #aaa;
  font-size: 12px;
`;

const ToolFrame = styled.iframe`
  flex: 1;
  width: 100%;
  min-height: 520px;
  border: 0;
  background: #000;
`;

export function CreationToolFrame({ tool }: { tool: CreationToolDefinition }) {
  return (
    <Shell>
      <Header>
        <Title>{tool.title}</Title>
        <Subtitle>{tool.subtitle}</Subtitle>
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
