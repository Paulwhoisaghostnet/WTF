export type CreationToolDomain = "visual-art" | "particle-art";

export type CreationToolDefinition = {
  id: string;
  title: string;
  subtitle: string;
  domain: CreationToolDomain;
  routePath: string;
  src: string;
  requiredAssets: readonly string[];
};

export const CREATION_TOOLS = [
  {
    id: "particle-painter",
    title: "PArticle Painter",
    subtitle: "Audio-reactive particle studio from the local WTF/PP build.",
    domain: "particle-art",
    routePath: "/tools/particle-painter",
    src: "/creation-tools/particle-painter/index.html",
    requiredAssets: [
      "/creation-tools/particle-painter/index.html",
      "/creation-tools/particle-painter/assets/index-CwPOmQ7R.js",
      "/creation-tools/particle-painter/ffmpeg-core/ffmpeg-core.wasm",
    ],
  },
  {
    id: "industrializer",
    title: "INDUSTR1ALIZER",
    subtitle: "JACK INDUSTRIES image processing terminal, vendored from Objkt/IPFS.",
    domain: "visual-art",
    routePath: "/tools/industrializer",
    src: "/creation-tools/industrializer/index.html",
    requiredAssets: [
      "/creation-tools/industrializer/index.html",
      "/creation-tools/industrializer/assets/index-CI3aD45K.js",
      "/creation-tools/industrializer/assets/index-gPcUMwJk.css",
      "/creation-tools/industrializer/background.gif",
      "/creation-tools/industrializer/fonts/SyneMono-Regular.ttf",
      "/creation-tools/industrializer/start.ogg",
      "/creation-tools/industrializer/message-01.ogg",
    ],
  },
  {
    id: "pauls-particles-v1",
    title: "Paul's Particles V1.0",
    subtitle: "Original particle capture tool, vendored from Objkt/IPFS.",
    domain: "particle-art",
    routePath: "/tools/pauls-particles-v1",
    src: "/creation-tools/pauls-particles-v1/index.html",
    requiredAssets: [
      "/creation-tools/pauls-particles-v1/index.html",
      "/creation-tools/pauls-particles-v1/sketch.js",
      "/creation-tools/pauls-particles-v1/lib/p5.min.js",
      "/creation-tools/pauls-particles-v1/lib/CCapture.all.min.js",
      "/creation-tools/pauls-particles-v1/lib/gif.worker.js",
    ],
  },
  {
    id: "nikshumika-paint",
    title: "Nikshumika Paint",
    subtitle: "Cell-art painting grid with palette, stamp, dither, and sequencer tools.",
    domain: "visual-art",
    routePath: "/tools/nikshumika-paint",
    src: "/creation-tools/nikshumika-paint/index.html",
    requiredAssets: [
      "/creation-tools/nikshumika-paint/index.html",
      "/creation-tools/nikshumika-paint/lib/react.production.min.js",
      "/creation-tools/nikshumika-paint/lib/react-dom.production.min.js",
      "/creation-tools/nikshumika-paint/lib/babel.min.js",
    ],
  },
  {
    id: "kandinsky-composer",
    title: "Kandinsky Composer",
    subtitle: "Shape-and-motion composition studio for visual music sketches.",
    domain: "visual-art",
    routePath: "/tools/kandinsky-composer",
    src: "/creation-tools/kandinsky-composer/index.html",
    requiredAssets: ["/creation-tools/kandinsky-composer/index.html"],
  },
] as const satisfies readonly CreationToolDefinition[];

export type CreationToolId = (typeof CREATION_TOOLS)[number]["id"];

export function getCreationTool(toolId: string): CreationToolDefinition | undefined {
  return CREATION_TOOLS.find((tool) => tool.id === toolId);
}
