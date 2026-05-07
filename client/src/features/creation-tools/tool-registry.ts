export type CreationToolId =
  | "particle-painter"
  | "industrializer"
  | "pauls-particles-v1";

export interface CreationToolDefinition {
  id: CreationToolId;
  title: string;
  subtitle: string;
  src: string;
  requiredAssets?: string[];
}

export const CREATION_TOOLS: Record<CreationToolId, CreationToolDefinition> = {
  "particle-painter": {
    id: "particle-painter",
    title: "PArticle Painter",
    subtitle: "Audio-reactive particle studio from the local WTF/PP build.",
    src: "/creation-tools/particle-painter/index.html",
  },
  industrializer: {
    id: "industrializer",
    title: "INDUSTR1ALIZER",
    subtitle: "JACK INDUSTRIES image processing terminal, vendored from Objkt/IPFS.",
    src: "/creation-tools/industrializer/index.html",
    requiredAssets: [
      "/creation-tools/industrializer/background.gif",
      "/creation-tools/industrializer/fonts/SyneMono-Regular.ttf",
      "/creation-tools/industrializer/start.ogg",
      "/creation-tools/industrializer/message-01.ogg",
    ],
  },
  "pauls-particles-v1": {
    id: "pauls-particles-v1",
    title: "Paul's Particles V1.0",
    subtitle: "Original particle capture tool, vendored from Objkt/IPFS.",
    src: "/creation-tools/pauls-particles-v1/index.html",
    requiredAssets: [
      "/creation-tools/pauls-particles-v1/sketch.js",
      "/creation-tools/pauls-particles-v1/lib/p5.min.js",
      "/creation-tools/pauls-particles-v1/lib/CCapture.all.min.js",
      "/creation-tools/pauls-particles-v1/lib/gif.worker.js",
    ],
  },
};

export function getCreationToolDefinition(toolId: string) {
  return CREATION_TOOLS[toolId as CreationToolId];
}
