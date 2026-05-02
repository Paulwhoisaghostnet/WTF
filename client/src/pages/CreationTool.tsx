import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";

const TOOLS = {
  "particle-painter": {
    title: "PArticle Painter",
    subtitle: "Audio-reactive particle studio from the local WTF/PP build.",
    src: "/creation-tools/particle-painter/index.html",
  },
  industrializer: {
    title: "INDUSTR1ALIZER",
    subtitle: "JACK INDUSTRIES image processing terminal, vendored from Objkt/IPFS.",
    src: "/creation-tools/industrializer/index.html",
  },
  "pauls-particles-v1": {
    title: "Paul's Particles V1.0",
    subtitle: "Original particle capture tool, vendored from Objkt/IPFS.",
    src: "/creation-tools/pauls-particles-v1/index.html",
  },
} as const;

type CreationToolId = keyof typeof TOOLS;

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

export function CreationTool({ toolId }: { toolId: string }) {
  const tool = TOOLS[toolId as CreationToolId];

  if (!tool) {
    return (
      <AppWindow title="Creation Tool">
        <p>Unknown creation tool: {toolId}</p>
      </AppWindow>
    );
  }

  return (
    <AppWindow title={tool.title}>
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
    </AppWindow>
  );
}
