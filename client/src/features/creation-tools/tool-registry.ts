import { COBWEBSAINTS_FULL_USER_ROLE, type UserRole } from "@shared/types";

export type CreationToolDomain =
  | "visual-art"
  | "particle-art"
  | "pattern-art"
  | "drop-studio"
  | "pasta-protocol";

export type CreationToolProvenance = {
  creatorName: string;
  creatorAddress?: string;
  tezosIdentity?: string;
  xHandle?: string;
  xUrl?: string;
  tokenUrl?: string;
  explorerUrl?: string;
};

export type CreationToolDefinition = {
  id: string;
  title: string;
  subtitle: string;
  domain: CreationToolDomain;
  routePath: string;
  src: string;
  requiredAssets: readonly string[];
  roles?: readonly UserRole[];
  provenance?: CreationToolProvenance;
};

const GREG_NIKSHUMIKA = {
  creatorName: "Greg Nikshumika",
  creatorAddress: "tz1g9jiDLMcadVEfMxMhToUWNB6hvMcMsFKY",
  tezosIdentity: "Greg Nikshumika",
  xHandle: "GregNikshumika",
  xUrl: "https://x.com/GregNikshumika",
} as const;

export const CREATION_TOOLS = [
  {
    id: "broot",
    title: "Broot",
    subtitle: "Tezos-native Photoshop alternative with Fabric canvas, local drafts, WebGL bakes, IPFS, and FA2 exports.",
    domain: "visual-art",
    routePath: "/tools/broot",
    src: "/creation-tools/broot/index.html",
    requiredAssets: [
      "/creation-tools/broot/index.html",
      "/creation-tools/broot/css/broot.css",
      "/creation-tools/broot/js/app.js",
      "/creation-tools/broot/js/broot-worker.js",
      "/creation-tools/broot/lib/react.production.min.js",
      "/creation-tools/broot/lib/react-dom.production.min.js",
      "/creation-tools/broot/lib/fabric.min.js",
      "/creation-tools/broot/lib/glfx.js",
      "/creation-tools/broot/lib/ffmpeg.js",
      "/creation-tools/broot/lib/814.ffmpeg.js",
      "/creation-tools/broot/lib/ffmpeg-core.js",
      "/creation-tools/broot/lib/ffmpeg-core.wasm",
      "/creation-tools/macaroni/vendor/tezos.js",
      "/creation-tools/macaroni/vendor/octez-connect.js",
      "/creation-tools/macaroni/js/octez-wallet.js",
    ],
    provenance: {
      creatorName: "WTF OS",
    },
  },
  {
    id: "particle-painter",
    title: "PArticle Painter",
    subtitle: "Audio-reactive particle studio from the local WTF/PP build.",
    domain: "particle-art",
    routePath: "/tools/particle-painter",
    src: "/creation-tools/particle-painter/index.html",
    requiredAssets: [
      "/creation-tools/particle-painter/index.html",
      "/creation-tools/particle-painter/assets/index-B--Bh6Oo.js",
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
    provenance: {
      ...GREG_NIKSHUMIKA,
      tokenUrl: "https://objkt.com/tokens/KT1BXjCyRFrti1n9ErYJb2JAPfCxqGL1FjmT/39",
      explorerUrl: "https://tzkt.io/KT1BXjCyRFrti1n9ErYJb2JAPfCxqGL1FjmT/tokens/39",
    },
  },
  {
    id: "kandinsky-composer",
    title: "Kandinsky Composer",
    subtitle: "Shape-and-motion composition studio for visual music sketches.",
    domain: "visual-art",
    routePath: "/tools/kandinsky-composer",
    src: "/creation-tools/kandinsky-composer/index.html",
    requiredAssets: ["/creation-tools/kandinsky-composer/index.html"],
    provenance: {
      ...GREG_NIKSHUMIKA,
      tokenUrl: "https://objkt.com/tokens/KT1PXuvCEiabZePZcAm5Qmtebt15v3yEqgha/3",
      explorerUrl: "https://tzkt.io/KT1PXuvCEiabZePZcAm5Qmtebt15v3yEqgha/tokens/3",
    },
  },
  {
    id: "pixel-patterns",
    title: "PixelPatterns",
    subtitle: "Procedural tiling pattern studio — generate, mutate, and export seamless pixel art textures.",
    domain: "pattern-art",
    routePath: "/tools/pixel-patterns",
    src: "/creation-tools/pixel-patterns/index.html",
    requiredAssets: ["/creation-tools/pixel-patterns/index.html"],
    provenance: {
      creatorName: "skllzrmy",
      tezosIdentity: "skllzrmy",
      xHandle: "skllzrmy",
      xUrl: "https://x.com/skllzrmy",
    },
  },
  {
    id: "penrose-backgrounds",
    title: "PenRose Backgrounds",
    subtitle: "Infinite aperiodic Penrose tiling backgrounds — parametric color and scale controls.",
    domain: "pattern-art",
    routePath: "/tools/penrose-backgrounds",
    src: "/creation-tools/penrose-backgrounds/index.html",
    requiredAssets: ["/creation-tools/penrose-backgrounds/index.html"],
    provenance: {
      creatorName: "skllzrmy",
      tezosIdentity: "skllzrmy",
      xHandle: "skllzrmy",
      xUrl: "https://x.com/skllzrmy",
    },
  },
  {
    id: "macaroni",
    title: "Macaroni",
    subtitle: "Blind-mint drop studio for originating creator-owned Tezos token factories.",
    domain: "drop-studio",
    routePath: "/tools/macaroni",
    src: "/creation-tools/macaroni/index.html",
    requiredAssets: [
      "/creation-tools/macaroni/index.html",
      "/creation-tools/macaroni/studio.html",
      "/creation-tools/macaroni/drop.html",
      "/creation-tools/macaroni/css/theme.css",
      "/creation-tools/macaroni/js/common.js",
      "/creation-tools/macaroni/js/studio.js",
      "/creation-tools/macaroni/js/drop.js",
      "/creation-tools/macaroni/js/site-bundle.js",
      "/creation-tools/macaroni/vendor/tezos.js",
      "/creation-tools/macaroni/contract/mydrop.contract.json",
    ],
    roles: ["admin", "host", "cohost", "trusted_creator", COBWEBSAINTS_FULL_USER_ROLE],
    provenance: {
      creatorName: "WTF OS",
    },
  },
  {
    id: "spaghetti",
    title: "Spaghetti",
    subtitle: "Standard collection and token-product publisher for Tezos FA2 contracts.",
    domain: "pasta-protocol",
    routePath: "/tools/spaghetti",
    src: "/creation-tools/spaghetti/index.html",
    requiredAssets: [
      "/creation-tools/spaghetti/index.html",
      "/creation-tools/spaghetti/css/theme.css",
      "/creation-tools/spaghetti/js/common.js",
      "/creation-tools/spaghetti/js/studio.js",
      "/creation-tools/spaghetti/site.html",
      "/creation-tools/spaghetti/css/site.css",
      "/creation-tools/spaghetti/js/site.js",
      "/creation-tools/spaghetti/js/site-bundle.js",
      "/creation-tools/spaghetti/js/octez-wallet.js",
      "/creation-tools/spaghetti/js/pasta-foundation.js",
      "/creation-tools/spaghetti/vendor/tezos.js",
      "/creation-tools/spaghetti/vendor/octez-connect.js",
      "/creation-tools/spaghetti/contract/pasta-standard-collection.contract.json",
    ],
    provenance: {
      creatorName: "WTF OS",
    },
  },
  {
    id: "gnocchi",
    title: "Gnocchi",
    subtitle: "Open-edition publisher with timed, forever, supply-limited, and bonding-curve modes.",
    domain: "pasta-protocol",
    routePath: "/tools/gnocchi",
    src: "/creation-tools/gnocchi/index.html",
    requiredAssets: [
      "/creation-tools/gnocchi/index.html",
      "/creation-tools/gnocchi/css/theme.css",
      "/creation-tools/gnocchi/js/common.js",
      "/creation-tools/gnocchi/js/studio.js",
      "/creation-tools/gnocchi/site.html",
      "/creation-tools/gnocchi/css/site.css",
      "/creation-tools/gnocchi/js/site.js",
      "/creation-tools/gnocchi/js/site-bundle.js",
      "/creation-tools/gnocchi/js/octez-wallet.js",
      "/creation-tools/gnocchi/js/pasta-foundation.js",
      "/creation-tools/gnocchi/vendor/tezos.js",
      "/creation-tools/gnocchi/vendor/octez-connect.js",
      "/creation-tools/gnocchi/contract/pasta-open-edition.contract.json",
    ],
    provenance: {
      creatorName: "WTF OS",
    },
  },
  {
    id: "ravioli",
    title: "Ravioli",
    subtitle: "Bundle publisher for art packs, redeemables, mystery, and wrapped sets.",
    domain: "pasta-protocol",
    routePath: "/tools/ravioli",
    src: "/creation-tools/ravioli/index.html",
    requiredAssets: [
      "/creation-tools/ravioli/index.html",
      "/creation-tools/ravioli/css/theme.css",
      "/creation-tools/ravioli/js/common.js",
      "/creation-tools/ravioli/js/studio.js",
      "/creation-tools/ravioli/site.html",
      "/creation-tools/ravioli/css/site.css",
      "/creation-tools/ravioli/js/site.js",
      "/creation-tools/ravioli/js/site-bundle.js",
      "/creation-tools/ravioli/js/octez-wallet.js",
      "/creation-tools/ravioli/js/pasta-foundation.js",
      "/creation-tools/ravioli/vendor/tezos.js",
      "/creation-tools/ravioli/vendor/octez-connect.js",
      "/creation-tools/ravioli/contract/pasta-bundle.contract.json",
    ],
    provenance: {
      creatorName: "WTF OS",
    },
  },
  {
    id: "rotini",
    title: "Rotini",
    subtitle: "Generative publisher for trait-layered Tezos collections.",
    domain: "pasta-protocol",
    routePath: "/tools/rotini",
    src: "/creation-tools/rotini/index.html",
    requiredAssets: [
      "/creation-tools/rotini/index.html",
      "/creation-tools/rotini/css/theme.css",
      "/creation-tools/rotini/js/common.js",
      "/creation-tools/rotini/js/studio.js",
      "/creation-tools/rotini/site.html",
      "/creation-tools/rotini/css/site.css",
      "/creation-tools/rotini/js/site.js",
      "/creation-tools/rotini/js/site-bundle.js",
      "/creation-tools/rotini/js/octez-wallet.js",
      "/creation-tools/rotini/js/pasta-foundation.js",
      "/creation-tools/rotini/vendor/tezos.js",
      "/creation-tools/rotini/vendor/octez-connect.js",
      "/creation-tools/rotini/contract/pasta-generative-collection.contract.json",
    ],
    provenance: {
      creatorName: "WTF OS",
    },
  },
  {
    id: "penne",
    title: "Penne",
    subtitle: "Distribution publisher for airdrops, claims, and participation rewards.",
    domain: "pasta-protocol",
    routePath: "/tools/penne",
    src: "/creation-tools/penne/index.html",
    requiredAssets: [
      "/creation-tools/penne/index.html",
      "/creation-tools/penne/css/theme.css",
      "/creation-tools/penne/js/common.js",
      "/creation-tools/penne/js/studio.js",
      "/creation-tools/penne/site.html",
      "/creation-tools/penne/css/site.css",
      "/creation-tools/penne/js/site.js",
      "/creation-tools/penne/js/site-bundle.js",
      "/creation-tools/penne/js/octez-wallet.js",
      "/creation-tools/penne/js/pasta-foundation.js",
      "/creation-tools/penne/vendor/tezos.js",
      "/creation-tools/penne/vendor/octez-connect.js",
      "/creation-tools/penne/contract/pasta-distribution.contract.json",
    ],
    provenance: {
      creatorName: "WTF OS",
    },
  },
  {
    id: "lasagna",
    title: "Lasagna",
    subtitle: "On-chain curation and exhibition publisher.",
    domain: "pasta-protocol",
    routePath: "/tools/lasagna",
    src: "/creation-tools/lasagna/index.html",
    requiredAssets: [
      "/creation-tools/lasagna/index.html",
      "/creation-tools/lasagna/css/theme.css",
      "/creation-tools/lasagna/js/common.js",
      "/creation-tools/lasagna/js/studio.js",
      "/creation-tools/lasagna/site.html",
      "/creation-tools/lasagna/css/site.css",
      "/creation-tools/lasagna/js/site.js",
      "/creation-tools/lasagna/js/site-bundle.js",
      "/creation-tools/lasagna/js/octez-wallet.js",
      "/creation-tools/lasagna/js/pasta-foundation.js",
      "/creation-tools/lasagna/vendor/tezos.js",
      "/creation-tools/lasagna/vendor/octez-connect.js",
      "/creation-tools/lasagna/contract/pasta-exhibition.contract.json",
    ],
    provenance: {
      creatorName: "WTF OS",
    },
  },
] as const satisfies readonly CreationToolDefinition[];

export type CreationToolId = (typeof CREATION_TOOLS)[number]["id"];

export function getCreationTool(toolId: string): CreationToolDefinition | undefined {
  return CREATION_TOOLS.find((tool) => tool.id === toolId);
}
