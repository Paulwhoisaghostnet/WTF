import fs from "node:fs";
import path from "node:path";

export type GameStudioTemplate = {
  id: string;
  title: string;
  engine: "vanilla-canvas" | "phaser-ready" | "three-ready";
  genre: string;
  description: string;
  files: string[];
  sdkHooks: string[];
};

export type GameStudioStockAsset = {
  id: string;
  title: string;
  kind:
    | "sprite"
    | "tileset"
    | "background"
    | "audio"
    | "ui"
    | "font"
    | "shader"
    | "model";
  tags: string[];
  license: string;
  sourceName?: string;
  sourceUrl?: string;
  licenseUrl?: string;
  sourceFile?: string;
  contentType?: string;
  frameWidth?: number;
  frameHeight?: number;
  uri: string;
};

type SourceManifestAsset = {
  sourceEntry?: string;
  output?: string;
  sizeBytes?: number;
  sha256?: string;
  kind?: GameStudioStockAsset["kind"];
  title?: string;
  tags?: string[];
  contentType?: string;
  frameWidth?: number;
  frameHeight?: number;
};

type SourceManifest = {
  name: string;
  author: string;
  sourceUrl: string;
  downloadUrl?: string;
  license: string;
  licenseUrl?: string;
  assets?: SourceManifestAsset[];
  importedAt?: string;
  source?: string;
};

const CC0_SOURCE_ROOT = path.resolve(process.cwd(), "public", "game-studio-assets", "cc0");
const CC0_MANIFEST_FILENAME = "SOURCE.json";
const CC0_SOURCE_KIND_VALUES = new Set([
  "sprite",
  "tileset",
  "background",
  "audio",
  "ui",
  "font",
  "shader",
  "model",
]);
const MODEL_MIME_TYPES = new Set([
  "model/gltf-binary",
  "model/gltf+json",
  "model/obj",
  "model/mtl",
]);
let CC0_SOURCE_ASSETS_CACHE: GameStudioStockAsset[] | null = null;

function normalizeSourceEntryPath(value: string): string {
  return String(value || "")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\\+/g, "/")
    .trim();
}

function manifestTagSetFrom(manifest: SourceManifest, asset: SourceManifestAsset): string[] {
  const tags = new Set<string>();
  const license = String(manifest.license || "").toLowerCase();
  if (/\bcc0\b/.test(license) || /\bpublic domain\b/.test(license)) tags.add("cc0");
  if (/\bmit\b/.test(license)) tags.add("mit");
  if (manifest.source === "polyhaven") {
    tags.add("polyhaven");
  }

  const manifestName = String(manifest.name || "").toLowerCase();
  if (manifestName.includes("objkt")) {
    tags.add("objkt");
    tags.add("model");
  }
  if (asset.kind === "model") {
    tags.add("3d");
    tags.add("model");
  }
  for (const tag of asset.tags || []) {
    if (typeof tag === "string") {
      const normalized = tag.trim().toLowerCase();
      if (normalized) tags.add(normalized);
    }
  }
  return Array.from(tags);
}

function inferKindForManifestAsset(
  asset: SourceManifestAsset,
  output: string,
  contentType: string
): GameStudioStockAsset["kind"] {
  if (asset.kind && CC0_SOURCE_KIND_VALUES.has(asset.kind)) return asset.kind;
  if (MODEL_MIME_TYPES.has(String(contentType).toLowerCase())) return "model";

  const ext = path.extname(output).toLowerCase();
  if (ext === ".gltf" || ext === ".glb" || ext === ".obj" || ext === ".mtl") return "model";
  if (asset.tags?.includes("audio")) return "audio";
  if (asset.tags?.includes("shader")) return "shader";
  if (asset.tags?.includes("font")) return "font";
  if (asset.tags?.includes("ui")) return "ui";
  if (asset.tags?.includes("background")) return "background";
  if (asset.tags?.includes("tileset")) return "tileset";
  return "sprite";
}

function parseCc0Manifest(filePath: string): SourceManifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as SourceManifest;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.name || typeof parsed.name !== "string") return null;
    if (!parsed.author || typeof parsed.author !== "string") return null;
    if (!parsed.sourceUrl || typeof parsed.sourceUrl !== "string") return null;
    if (!parsed.license || typeof parsed.license !== "string") return null;
    return {
      ...parsed,
      assets: Array.isArray(parsed.assets)
        ? parsed.assets.filter((entry) => {
            const output = normalizeSourceEntryPath(entry.output || entry.sourceEntry || "");
            return Boolean(output);
          })
        : [],
    };
  } catch {
    return null;
  }
}

function listCc0Manifests(): string[] {
  if (!fs.existsSync(CC0_SOURCE_ROOT) || !fs.statSync(CC0_SOURCE_ROOT).isDirectory()) return [];
  const manifests: string[] = [];
  const stack: string[] = [CC0_SOURCE_ROOT];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(candidate);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        stack.push(candidate);
      } else if (entry === CC0_MANIFEST_FILENAME) {
        manifests.push(candidate);
      }
    }
  }

  manifests.sort();
  return manifests;
}

function loadCc0ManifestStockAssets(): GameStudioStockAsset[] {
  if (CC0_SOURCE_ASSETS_CACHE) return CC0_SOURCE_ASSETS_CACHE;

  const loaded: GameStudioStockAsset[] = [];
  const seen = new Set<string>();
  const root = path.resolve(CC0_SOURCE_ROOT);

  for (const manifestPath of listCc0Manifests()) {
    const manifest = parseCc0Manifest(manifestPath);
    if (!manifest) continue;
    const manifestDir = path.dirname(manifestPath);
    const manifestRelDir = path
      .relative(CC0_SOURCE_ROOT, manifestDir)
      .replace(/\\+/g, "/")
      .replace(/^\.+\/?/g, "");

    const manifestAssets = manifest.assets ?? [];
    for (const [index, asset] of manifestAssets.entries()) {
      const output = normalizeSourceEntryPath(asset.output || asset.sourceEntry || "");
      if (!output || /(^|\/)\.\.(\/|$)/.test(output)) continue;

      const sourceFile = path.resolve(manifestDir, output);
      if (!sourceFile.startsWith(root + path.sep) || !fs.existsSync(sourceFile)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(sourceFile);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;

      const relSource = path
        .relative(CC0_SOURCE_ROOT, sourceFile)
        .replace(/\\+/g, "/");
      const uri = `/game-studio-assets/cc0/${relSource}`;

      const contentType = String(asset.contentType || contentTypeForAssetFile(sourceFile)).trim();
      const inferredKind = inferKindForManifestAsset(asset, output, contentType);
      const title = String(asset.title || output)
        .replace(/[-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const tags = manifestTagSetFrom(manifest, asset);
      const id = `cc0-${manifestRelDir
        ? `${manifestRelDir.replace(/[\\/]+/g, "-")}-`
        : ""}${String(output)
        .replace(/\.[a-z0-9]{1,8}$/i, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()
        .slice(0, 100) || `asset-${index}`}`;

      if (seen.has(id)) continue;
      seen.add(id);
      loaded.push({
        id,
        title: title || output,
        kind: inferredKind,
        tags,
        license: manifest.license || "CC0-1.0",
        sourceName: manifest.name || manifest.author,
        sourceUrl: manifest.sourceUrl,
        licenseUrl: manifest.licenseUrl,
        sourceFile: `public/game-studio-assets/cc0/${relSource}`,
        contentType,
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
        uri,
      });
    }
  }

  CC0_SOURCE_ASSETS_CACHE = loaded.sort((a, b) => a.id.localeCompare(b.id));
  return CC0_SOURCE_ASSETS_CACHE;
}

export type GameStudioStockAssetDescriptor = GameStudioStockAsset & {
  bundlePath: string;
  importSnippet: string;
};

export type GameStudioStockAssetFile = {
  asset: GameStudioStockAsset;
  filename: string;
  path: string;
  contentType: string;
  bytes: Buffer;
};

export type GameStudioCodeSnippet = {
  id: string;
  title: string;
  category: "sdk" | "input" | "physics" | "spawning" | "ui";
  description: string;
  tags: string[];
  targetFile: string;
  code: string;
};

export type GameStudioTarget = {
  id: "arcade" | "console";
  label: string;
  mode: "public-paid-play" | "personal-owned-media";
  sdkSurface: string;
  publishEndpoint: string | null;
  notes: string[];
};

export const GAME_STUDIO_TARGETS: GameStudioTarget[] = [
  {
    id: "arcade",
    label: "WTF Arcade",
    mode: "public-paid-play",
    sdkSurface: "WTF Game SDK in Arcade host mode",
    publishEndpoint: "/api/arcade/submit",
    notes: [
      "Public catalog placement",
      "Play sessions consume WTF Arcade Play tickets",
      "Uses the same in-app market contract checkout path as store items",
    ],
  },
  {
    id: "console",
    label: "WTF Console",
    mode: "personal-owned-media",
    sdkSurface: "WTF Game SDK in personal console host mode",
    publishEndpoint: null,
    notes: [
      "Personal owned media experience",
      "ZIP bundles can be downloaded or imported through each user's media library",
      "Universal stock console games remain available on every account",
    ],
  },
];

export const GAME_STUDIO_TEMPLATES: GameStudioTemplate[] = [
  {
    id: "endless-runner",
    title: "Endless Runner",
    engine: "vanilla-canvas",
    genre: "arcade",
    description: "One-button jump loop with distance scoring and mobile controls.",
    files: ["index.html", "game.js", "styles.css", "assets/player.svg"],
    sdkHooks: ["ready", "startSession", "updateScore", "gameOver"],
  },
  {
    id: "arena-survival",
    title: "Arena Survival",
    engine: "vanilla-canvas",
    genre: "action",
    description: "Top-down movement, enemy waves, pickups, and survival scoring.",
    files: ["index.html", "game.js", "styles.css", "assets/actor.svg"],
    sdkHooks: ["ready", "startSession", "updateScore", "gameOver", "pause"],
  },
  {
    id: "match-puzzle",
    title: "Match Puzzle",
    engine: "vanilla-canvas",
    genre: "puzzle",
    description: "Grid matching, timed rounds, combo scoring, and touch input.",
    files: ["index.html", "game.js", "styles.css", "assets/gems.svg"],
    sdkHooks: ["ready", "startSession", "updateScore", "gameOver"],
  },
  {
    id: "micro-pinball",
    title: "Micro Pinball",
    engine: "vanilla-canvas",
    genre: "physics",
    description: "Compact flipper table tuned for keyboard and touch buttons.",
    files: ["index.html", "game.js", "styles.css", "assets/table.svg"],
    sdkHooks: ["ready", "startSession", "updateScore", "gameOver"],
  },
  {
    id: "three-gallery-run",
    title: "3D Gallery Run",
    engine: "three-ready",
    genre: "3d",
    description: "Three.js scene scaffold with lanes, collectibles, and camera follow.",
    files: ["index.html", "game.js", "styles.css", "assets/materials.json"],
    sdkHooks: ["ready", "startSession", "updateScore", "gameOver"],
  },
];

const BUILTIN_GAME_STUDIO_STOCK_ASSETS: GameStudioStockAsset[] = [
  { id: "sprite-neon-runner", title: "Neon Runner", kind: "sprite", tags: ["player", "arcade", "animated"], license: "WTF creator commons", uri: "/api/game-studio/assets/sprite-neon-runner/raw" },
  { id: "sprite-hover-board", title: "Hover Board", kind: "sprite", tags: ["vehicle", "runner"], license: "WTF creator commons", uri: "/api/game-studio/assets/sprite-hover-board/raw" },
  { id: "sprite-orbit-drone", title: "Orbit Drone", kind: "sprite", tags: ["enemy", "sci-fi"], license: "WTF creator commons", uri: "/api/game-studio/assets/sprite-orbit-drone/raw" },
  { id: "sprite-bumper", title: "Arcade Bumper", kind: "sprite", tags: ["physics", "pinball"], license: "WTF creator commons", uri: "/api/game-studio/assets/sprite-bumper/raw" },
  { id: "sprite-prize-gem", title: "Prize Gem", kind: "sprite", tags: ["collectible", "score"], license: "WTF creator commons", uri: "/api/game-studio/assets/sprite-prize-gem/raw" },
  { id: "sprite-boss-core", title: "Boss Core", kind: "sprite", tags: ["enemy", "boss"], license: "WTF creator commons", uri: "/api/game-studio/assets/sprite-boss-core/raw" },
  { id: "sprite-jump-pad", title: "Jump Pad", kind: "sprite", tags: ["platformer", "boost"], license: "WTF creator commons", uri: "/api/game-studio/assets/sprite-jump-pad/raw" },
  { id: "sprite-checkpoint", title: "Checkpoint Beacon", kind: "sprite", tags: ["checkpoint", "runner"], license: "WTF creator commons", uri: "/api/game-studio/assets/sprite-checkpoint/raw" },
  { id: "tileset-city-night", title: "City Night Tiles", kind: "tileset", tags: ["platformer", "urban"], license: "WTF creator commons", uri: "/api/game-studio/assets/tileset-city-night/raw" },
  { id: "tileset-lab", title: "Lab Tiles", kind: "tileset", tags: ["puzzle", "sci-fi"], license: "WTF creator commons", uri: "/api/game-studio/assets/tileset-lab/raw" },
  { id: "tileset-stage", title: "Stage Tiles", kind: "tileset", tags: ["show", "arena"], license: "WTF creator commons", uri: "/api/game-studio/assets/tileset-stage/raw" },
  { id: "tileset-ruins", title: "Ancient Ruins Tiles", kind: "tileset", tags: ["adventure", "platformer"], license: "WTF creator commons", uri: "/api/game-studio/assets/tileset-ruins/raw" },
  { id: "tileset-space-hull", title: "Space Hull Tiles", kind: "tileset", tags: ["sci-fi", "maze"], license: "WTF creator commons", uri: "/api/game-studio/assets/tileset-space-hull/raw" },
  { id: "tileset-candy", title: "Candy Puzzle Tiles", kind: "tileset", tags: ["puzzle", "match"], license: "WTF creator commons", uri: "/api/game-studio/assets/tileset-candy/raw" },
  { id: "bg-rooftops", title: "Rooftops Parallax", kind: "background", tags: ["runner", "parallax"], license: "WTF creator commons", uri: "/api/game-studio/assets/bg-rooftops/raw" },
  { id: "bg-grid", title: "CRT Grid Backdrop", kind: "background", tags: ["retro", "arcade"], license: "WTF creator commons", uri: "/api/game-studio/assets/bg-grid/raw" },
  { id: "bg-stage-lights", title: "Stage Lights", kind: "background", tags: ["gameshow", "arena"], license: "WTF creator commons", uri: "/api/game-studio/assets/bg-stage-lights/raw" },
  { id: "bg-neon-alley", title: "Neon Alley", kind: "background", tags: ["urban", "night"], license: "WTF creator commons", uri: "/api/game-studio/assets/bg-neon-alley/raw" },
  { id: "bg-deep-space", title: "Deep Space", kind: "background", tags: ["space", "parallax"], license: "WTF creator commons", uri: "/api/game-studio/assets/bg-deep-space/raw" },
  { id: "bg-sunrise-clouds", title: "Sunrise Clouds", kind: "background", tags: ["sky", "runner"], license: "WTF creator commons", uri: "/api/game-studio/assets/bg-sunrise-clouds/raw" },
  { id: "bg-underwater", title: "Underwater Haze", kind: "background", tags: ["water", "adventure"], license: "WTF creator commons", uri: "/api/game-studio/assets/bg-underwater/raw" },
  { id: "audio-jump-a", title: "Jump Blip A", kind: "audio", tags: ["sfx", "jump"], license: "WTF creator commons", uri: "/api/game-studio/assets/audio-jump-a/raw" },
  { id: "audio-score-a", title: "Score Chime A", kind: "audio", tags: ["sfx", "score"], license: "WTF creator commons", uri: "/api/game-studio/assets/audio-score-a/raw" },
  { id: "audio-hit-a", title: "Hit Pop A", kind: "audio", tags: ["sfx", "impact"], license: "WTF creator commons", uri: "/api/game-studio/assets/audio-hit-a/raw" },
  { id: "audio-loop-120", title: "Arcade Loop 120", kind: "audio", tags: ["music", "loop"], license: "WTF creator commons", uri: "/api/game-studio/assets/audio-loop-120/raw" },
  { id: "audio-powerup-a", title: "Powerup Ping", kind: "audio", tags: ["sfx", "powerup"], license: "WTF creator commons", uri: "/api/game-studio/assets/audio-powerup-a/raw" },
  { id: "audio-countdown-a", title: "Countdown Tick", kind: "audio", tags: ["sfx", "timer"], license: "WTF creator commons", uri: "/api/game-studio/assets/audio-countdown-a/raw" },
  { id: "audio-menu-click", title: "Menu Click", kind: "audio", tags: ["ui", "sfx"], license: "WTF creator commons", uri: "/api/game-studio/assets/audio-menu-click/raw" },
  { id: "audio-loop-dream", title: "Dream Loop 90", kind: "audio", tags: ["music", "ambient"], license: "WTF creator commons", uri: "/api/game-studio/assets/audio-loop-dream/raw" },
  { id: "ui-button-pack", title: "Button Pack", kind: "ui", tags: ["hud", "mobile"], license: "WTF creator commons", uri: "/api/game-studio/assets/ui-button-pack/raw" },
  { id: "ui-score-panel", title: "Score Panel", kind: "ui", tags: ["hud", "score"], license: "WTF creator commons", uri: "/api/game-studio/assets/ui-score-panel/raw" },
  { id: "ui-touch-controls", title: "Touch Controls", kind: "ui", tags: ["mobile", "controls"], license: "WTF creator commons", uri: "/api/game-studio/assets/ui-touch-controls/raw" },
  { id: "ui-health-bar", title: "Health Bar", kind: "ui", tags: ["hud", "health"], license: "WTF creator commons", uri: "/api/game-studio/assets/ui-health-bar/raw" },
  { id: "ui-dialog-box", title: "Dialog Box", kind: "ui", tags: ["rpg", "text"], license: "WTF creator commons", uri: "/api/game-studio/assets/ui-dialog-box/raw" },
  { id: "ui-inventory-slots", title: "Inventory Slots", kind: "ui", tags: ["inventory", "rpg"], license: "WTF creator commons", uri: "/api/game-studio/assets/ui-inventory-slots/raw" },
  { id: "font-pixel-condensed", title: "Pixel Condensed", kind: "font", tags: ["pixel", "hud"], license: "WTF creator commons", uri: "/api/game-studio/assets/font-pixel-condensed/raw" },
  { id: "font-terminal-mono", title: "Terminal Mono", kind: "font", tags: ["terminal", "hud"], license: "WTF creator commons", uri: "/api/game-studio/assets/font-terminal-mono/raw" },
  { id: "font-score-fat", title: "Score Fat", kind: "font", tags: ["score", "arcade"], license: "WTF creator commons", uri: "/api/game-studio/assets/font-score-fat/raw" },
  { id: "shader-crt-lite", title: "CRT Lite Shader", kind: "shader", tags: ["post", "retro"], license: "WTF creator commons", uri: "/api/game-studio/assets/shader-crt-lite/raw" },
  { id: "shader-speed-lines", title: "Speed Lines Shader", kind: "shader", tags: ["motion", "runner"], license: "WTF creator commons", uri: "/api/game-studio/assets/shader-speed-lines/raw" },
  { id: "shader-water-ripple", title: "Water Ripple Shader", kind: "shader", tags: ["water", "post"], license: "WTF creator commons", uri: "/api/game-studio/assets/shader-water-ripple/raw" },
  { id: "shader-hit-flash", title: "Hit Flash Shader", kind: "shader", tags: ["combat", "post"], license: "WTF creator commons", uri: "/api/game-studio/assets/shader-hit-flash/raw" },
  { id: "shader-pixelate", title: "Pixelate Shader", kind: "shader", tags: ["retro", "post"], license: "WTF creator commons", uri: "/api/game-studio/assets/shader-pixelate/raw" },
];

const KENNEY_PIXEL_PLATFORMER_SOURCE = {
  sourceName: "Kenney Pixel Platformer",
  sourceUrl: "https://kenney.nl/assets/pixel-platformer",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  license: "CC0-1.0",
};

const KENNEY_MOBILE_CONTROLS_SOURCE = {
  sourceName: "Kenney Mobile Controls",
  sourceUrl: "https://kenney.nl/assets/mobile-controls",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  license: "CC0-1.0",
};

const IMPORTED_CC0_STOCK_ASSETS: GameStudioStockAsset[] = [
  {
    id: "kenney-pixel-platformer-tilesheet",
    title: "Kenney Pixel Platformer Tilesheet",
    kind: "tileset",
    tags: ["cc0", "kenney", "pixel", "platformer", "tilesheet"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/tilemap.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/tilemap.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-pixel-platformer-packed-tiles",
    title: "Kenney Packed Platform Tiles",
    kind: "tileset",
    tags: ["cc0", "kenney", "pixel", "platformer", "packed"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/tilemap-packed.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/tilemap-packed.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-pixel-platformer-characters",
    title: "Kenney Pixel Characters Sheet",
    kind: "sprite",
    tags: ["cc0", "kenney", "pixel", "character", "animated"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/characters.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/characters.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-pixel-platformer-backgrounds",
    title: "Kenney Pixel Background Tiles",
    kind: "background",
    tags: ["cc0", "kenney", "pixel", "background", "platformer"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/backgrounds.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/backgrounds.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-pixel-hero-a",
    title: "Kenney Pixel Hero A",
    kind: "sprite",
    tags: ["cc0", "kenney", "pixel", "player", "avatar"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/character-hero-a.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/character-hero-a.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-pixel-hero-b",
    title: "Kenney Pixel Hero B",
    kind: "sprite",
    tags: ["cc0", "kenney", "pixel", "player", "avatar"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/character-hero-b.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/character-hero-b.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-pixel-enemy-a",
    title: "Kenney Pixel Enemy A",
    kind: "sprite",
    tags: ["cc0", "kenney", "pixel", "enemy"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/character-enemy-a.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/character-enemy-a.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-platform-tile-a",
    title: "Kenney Platform Tile A",
    kind: "tileset",
    tags: ["cc0", "kenney", "pixel", "platform"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/platform-tile-a.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/platform-tile-a.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-platform-tile-b",
    title: "Kenney Platform Tile B",
    kind: "tileset",
    tags: ["cc0", "kenney", "pixel", "platform"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/platform-tile-b.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/platform-tile-b.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-platform-tile-c",
    title: "Kenney Platform Tile C",
    kind: "tileset",
    tags: ["cc0", "kenney", "pixel", "platform"],
    uri: "/game-studio-assets/cc0/kenney/pixel-platformer/platform-tile-c.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/pixel-platformer/platform-tile-c.png",
    contentType: "image/png",
    frameWidth: 18,
    frameHeight: 18,
    ...KENNEY_PIXEL_PLATFORMER_SOURCE,
  },
  {
    id: "kenney-mobile-dpad",
    title: "Kenney Mobile D-Pad",
    kind: "ui",
    tags: ["cc0", "kenney", "mobile", "controls", "dpad"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/dpad-highlight.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/dpad-highlight.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
  {
    id: "kenney-mobile-joystick-pad",
    title: "Kenney Joystick Pad",
    kind: "ui",
    tags: ["cc0", "kenney", "mobile", "controls", "joystick"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/joystick-pad-highlight.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/joystick-pad-highlight.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
  {
    id: "kenney-mobile-joystick-nub",
    title: "Kenney Joystick Nub",
    kind: "ui",
    tags: ["cc0", "kenney", "mobile", "controls", "joystick"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/joystick-nub-highlight.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/joystick-nub-highlight.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
  {
    id: "kenney-mobile-action-button",
    title: "Kenney Action Button",
    kind: "ui",
    tags: ["cc0", "kenney", "mobile", "controls", "button"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/button-circle-highlight.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/button-circle-highlight.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
  {
    id: "kenney-icon-jump",
    title: "Kenney Jump Icon",
    kind: "ui",
    tags: ["cc0", "kenney", "hud", "jump", "icon"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/icon-jump.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/icon-jump.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
  {
    id: "kenney-icon-fire",
    title: "Kenney Fire Icon",
    kind: "ui",
    tags: ["cc0", "kenney", "hud", "fire", "icon"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/icon-fire.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/icon-fire.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
  {
    id: "kenney-icon-pause",
    title: "Kenney Pause Icon",
    kind: "ui",
    tags: ["cc0", "kenney", "hud", "pause", "icon"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/icon-pause.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/icon-pause.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
  {
    id: "kenney-icon-play",
    title: "Kenney Play Icon",
    kind: "ui",
    tags: ["cc0", "kenney", "hud", "play", "icon"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/icon-play.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/icon-play.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
  {
    id: "kenney-icon-sound",
    title: "Kenney Sound Icon",
    kind: "ui",
    tags: ["cc0", "kenney", "hud", "audio", "icon"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/icon-sound.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/icon-sound.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
  {
    id: "kenney-icon-skull",
    title: "Kenney Skull Icon",
    kind: "ui",
    tags: ["cc0", "kenney", "hud", "danger", "icon"],
    uri: "/game-studio-assets/cc0/kenney/mobile-controls/icon-skull.png",
    sourceFile: "public/game-studio-assets/cc0/kenney/mobile-controls/icon-skull.png",
    contentType: "image/png",
    ...KENNEY_MOBILE_CONTROLS_SOURCE,
  },
];

export const GAME_STUDIO_STOCK_ASSETS: GameStudioStockAsset[] = [
  ...BUILTIN_GAME_STUDIO_STOCK_ASSETS,
  ...IMPORTED_CC0_STOCK_ASSETS,
  ...loadCc0ManifestStockAssets(),
];

export const GAME_STUDIO_CODE_SNIPPETS: GameStudioCodeSnippet[] = [
  {
    id: "sdk-session-score-loop",
    title: "Arcade Session + Score Loop",
    category: "sdk",
    description: "Start a WTF game SDK session, keep local score, and publish score previews.",
    tags: ["arcade", "console", "score", "session"],
    targetFile: "game.js",
    code: `let score = 0;

await window.WTFConsole.ready({ slug: "replace-with-your-game-slug" });
await window.WTFConsole.startSession();

function addScore(points, reason = "score") {
  score += points;
  window.WTFConsole.updateScore(score, { reason }).catch(() => {});
}
`,
  },
  {
    id: "sdk-game-over",
    title: "Verified Game Over",
    category: "sdk",
    description: "Submit the final score once, then stop the game loop.",
    tags: ["console", "game-over", "score"],
    targetFile: "game.js",
    code: `let ended = false;

async function endRun(finalScore, metadata = {}) {
  if (ended) return;
  ended = true;
  await window.WTFConsole.gameOver(finalScore, {
    ...metadata,
    endedAt: new Date().toISOString(),
  });
}
`,
  },
  {
    id: "sdk-player-avatar-sprite",
    title: "Player Avatar Sprite",
    category: "sdk",
    description: "Load the signed-in player's profile avatar as a normalized square PNG for game actors.",
    tags: ["avatar", "profile", "player", "sprite"],
    targetFile: "game.js",
    code: `const avatar = await window.WTFConsole.getAvatarAsset({
  size: 128,
  fit: "cover",
  pixelated: true,
});

const playerAvatar = new Image();
playerAvatar.src = avatar.url || "./assets/player.svg";
`,
  },
  {
    id: "sdk-player-avatar-spritesheet",
    title: "Avatar Sprite Sheet",
    category: "sdk",
    description: "Build a four-frame billboard spritesheet from the player's profile avatar without AI conversion.",
    tags: ["avatar", "profile", "spritesheet", "billboard"],
    targetFile: "game.js",
    code: `const avatarSheet = await window.WTFConsole.getAvatarSpriteSheet({
  size: 96,
  pixelated: true,
});

const avatarSpriteSheet = new Image();
avatarSpriteSheet.src = avatarSheet.url;
`,
  },
  {
    id: "keyboard-motion",
    title: "Keyboard Movement",
    category: "input",
    description: "Track arrow/WASD keys and convert them to a normalized movement vector.",
    tags: ["keyboard", "wasd", "movement"],
    targetFile: "game.js",
    code: `const keys = new Set();

window.addEventListener("keydown", (event) => keys.add(event.key.toLowerCase()));
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

function readMoveInput() {
  const x = (keys.has("arrowright") || keys.has("d") ? 1 : 0) -
    (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
  const y = (keys.has("arrowdown") || keys.has("s") ? 1 : 0) -
    (keys.has("arrowup") || keys.has("w") ? 1 : 0);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
`,
  },
  {
    id: "touch-action-button",
    title: "Mobile Action Button",
    category: "input",
    description: "Add a touch-friendly action button that works in mobile preview, Arcade, and Console.",
    tags: ["touch", "mobile", "button"],
    targetFile: "game.js",
    code: `const actionButton = document.createElement("button");
actionButton.textContent = "ACTION";
Object.assign(actionButton.style, {
  position: "fixed",
  right: "20px",
  bottom: "20px",
  zIndex: "10",
  padding: "14px 18px",
});
document.body.appendChild(actionButton);

let actionPressed = false;
actionButton.addEventListener("pointerdown", () => { actionPressed = true; });
actionButton.addEventListener("pointerup", () => { actionPressed = false; });
`,
  },
  {
    id: "aabb-collision",
    title: "Box Collision Helper",
    category: "physics",
    description: "Detect overlap between two rectangular actors.",
    tags: ["collision", "physics", "helper"],
    targetFile: "game.js",
    code: `function overlaps(a, b) {
  return a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;
}
`,
  },
  {
    id: "spawn-pool",
    title: "Spawn Pool",
    category: "spawning",
    description: "Spawn timed actors without allocating a new object every frame.",
    tags: ["spawn", "pool", "performance"],
    targetFile: "game.js",
    code: `const actors = [];
let nextSpawnAt = 0;

function spawnActor(now) {
  if (now < nextSpawnAt) return;
  nextSpawnAt = now + 900;
  const actor = actors.find((entry) => !entry.active) || {};
  actor.active = true;
  actor.x = canvas.width + 40;
  actor.y = 80 + Math.random() * (canvas.height - 160);
  actor.w = 36;
  actor.h = 36;
  actor.vx = -260;
  if (!actors.includes(actor)) actors.push(actor);
}
`,
  },
];

export function findGameStudioTemplate(id: string) {
  return GAME_STUDIO_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function describeGameStudioStockAsset(
  asset: GameStudioStockAsset
): GameStudioStockAssetDescriptor {
  const file = buildGameStudioStockAssetFile(asset.id);
  const bundlePath = file?.path || `assets/stock/${safeAssetFilename(asset.id)}.txt`;
  return {
    ...asset,
    bundlePath,
    importSnippet: buildAssetImportSnippet(asset, bundlePath),
  };
}

export function listGameStudioStockAssetDescriptors(
  assets: GameStudioStockAsset[] = GAME_STUDIO_STOCK_ASSETS
): GameStudioStockAssetDescriptor[] {
  return assets.map(describeGameStudioStockAsset);
}

export function listGameStudioCodeSnippets(
  snippets: GameStudioCodeSnippet[] = GAME_STUDIO_CODE_SNIPPETS
): GameStudioCodeSnippet[] {
  return snippets;
}

export function buildGameStudioScaffold(templateId: string) {
  const template = findGameStudioTemplate(templateId) ?? GAME_STUDIO_TEMPLATES[0];
  const gameSlug = template.id;
  return {
    template,
    files: {
      "index.html": `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${template.title}</title>
    <link rel="stylesheet" href="./styles.css" />
    <script src="/api/console/sdk.js" data-game="${gameSlug}"></script>
  </head>
  <body>
    <canvas id="game" width="960" height="540"></canvas>
    <script type="module" src="./game.js"></script>
  </body>
</html>
`,
      "styles.css": `html, body { margin: 0; width: 100%; height: 100%; background: #090912; overflow: hidden; }
#game { width: 100vw; height: 100vh; display: block; touch-action: none; background: #101026; }
`,
      "game.js": `const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let score = 0;
let running = true;

await window.WTFConsole.ready({ slug: "${gameSlug}" });
await window.WTFConsole.startSession();

function tick() {
  if (!running) return;
  score += 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#41f5b4";
  ctx.fillRect(80 + (score % 620), 230, 64, 64);
  ctx.fillStyle = "#f6f7ff";
  ctx.font = "24px monospace";
  ctx.fillText("Score " + score, 24, 40);
  if (score >= 1000) {
    running = false;
    awaitGameOver();
    return;
  }
  requestAnimationFrame(tick);
}

async function awaitGameOver() {
  await window.WTFConsole.gameOver(score, { template: "${template.id}" });
}

tick();
`,
    },
  };
}

export function buildGameStudioStockAssetFile(
  assetId: string
): GameStudioStockAssetFile | null {
  const asset = GAME_STUDIO_STOCK_ASSETS.find((entry) => entry.id === assetId);
  if (!asset) return null;

  if (asset.sourceFile) {
    const filePath = resolvePublicSourceFile(asset.sourceFile);
    const ext = path.extname(filePath).toLowerCase();
    const filename = `${safeAssetFilename(asset.id)}${ext || ".bin"}`;
    return {
      asset,
      filename,
      path: `assets/stock/${filename}`,
      contentType: asset.contentType || contentTypeForAssetFile(filePath),
      bytes: fs.readFileSync(filePath),
    };
  }

  if (asset.kind === "audio") {
    const filename = `${safeAssetFilename(asset.id)}.wav`;
    return {
      asset,
      filename,
      path: `assets/stock/${filename}`,
      contentType: "audio/wav",
      bytes: buildSilentWav(),
    };
  }

  if (asset.kind === "shader") {
    const filename = `${safeAssetFilename(asset.id)}.txt`;
    return {
      asset,
      filename,
      path: `assets/stock/${filename}`,
      contentType: "text/plain",
      bytes: Buffer.from(
        `// ${asset.title}\nvec4 wtfStudioEffect(vec2 uv, vec4 color) {\n  return vec4(color.rgb * (0.85 + 0.15 * sin(uv.y * 240.0)), color.a);\n}\n`,
        "utf8"
      ),
    };
  }

  if (asset.kind === "font") {
    const filename = `${safeAssetFilename(asset.id)}.txt`;
    return {
      asset,
      filename,
      path: `assets/stock/${filename}`,
      contentType: "text/plain",
      bytes: Buffer.from(
        "Pixel Condensed placeholder font asset. Replace with a licensed .woff2 in production bundles.",
        "utf8"
      ),
    };
  }

  const filename = `${safeAssetFilename(asset.id)}.svg`;
  return {
    asset,
    filename,
    path: `assets/stock/${filename}`,
    contentType: "image/svg+xml",
    bytes: Buffer.from(buildSvgAsset(asset.title, asset.kind), "utf8"),
  };
}

function resolvePublicSourceFile(sourceFile: string): string {
  const filePath = path.resolve(process.cwd(), sourceFile);
  const publicRoot = path.resolve(process.cwd(), "public");
  if (!filePath.startsWith(publicRoot + path.sep)) {
    throw new Error(`Stock asset source must live under public/: ${sourceFile}`);
  }
  return filePath;
}

function contentTypeForAssetFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".gltf") return "model/gltf+json";
  if (ext === ".glb") return "model/gltf-binary";
  if (ext === ".obj") return "model/obj";
  if (ext === ".mtl") return "model/mtl";
  if (ext === ".json") return "application/json";
  return "application/octet-stream";
}

function buildSvgAsset(title: string, kind: string): string {
  const palette: Record<string, [string, string, string]> = {
    sprite: ["#48f5b4", "#101026", "#f7f7ff"],
    tileset: ["#ffcb5c", "#17172d", "#37214f"],
    background: ["#4da3ff", "#0a0f24", "#f7f7ff"],
    ui: ["#f35c7a", "#161629", "#f7f7ff"],
  };
  const [accent, bg, ink] = palette[kind] || ["#48f5b4", "#101026", "#f7f7ff"];
  const safeTitle = escapeXml(title);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${safeTitle}">
  <rect width="512" height="512" fill="${bg}"/>
  <path d="M64 360 L448 360 L400 144 L112 144 Z" fill="${accent}" opacity="0.22"/>
  <circle cx="256" cy="238" r="82" fill="${accent}" opacity="0.9"/>
  <rect x="104" y="348" width="304" height="30" rx="6" fill="${ink}" opacity="0.85"/>
  <text x="256" y="424" text-anchor="middle" font-family="monospace" font-size="26" fill="${ink}">${safeTitle}</text>
</svg>`;
}

function buildAssetImportSnippet(
  asset: GameStudioStockAsset,
  bundlePath: string
): string {
  const path = `./${bundlePath}`;
  const resolvedPath = `window.WTFStudio?.asset("${path}") || "${path}"`;
  const name = safeJsIdentifier(asset.id);
  if (asset.kind === "audio") {
    return `const ${name} = new Audio(${resolvedPath});\n${name}.volume = 0.6;`;
  }
  if (asset.kind === "shader") {
    return `const ${name}Source = await fetch(${resolvedPath}).then((res) => res.text());`;
  }
  if (asset.kind === "model") {
    if (asset.contentType === "model/obj" || asset.contentType === "model/mtl") {
      return `const ${name}Text = await fetch(${resolvedPath}).then((res) => res.text());`;
    }
    return `const ${name}ModelBytes = await fetch(${resolvedPath}).then((res) => res.arrayBuffer());`;
  }
  if (asset.kind === "font") {
    return `const ${name}Info = await fetch(${resolvedPath}).then((res) => res.text());`;
  }
  const frameInfo =
    asset.frameWidth && asset.frameHeight
      ? `\nconst ${name}Frames = { frameWidth: ${asset.frameWidth}, frameHeight: ${asset.frameHeight} };`
      : "";
  return `const ${name} = new Image();\n${name}.src = ${resolvedPath};${frameInfo}`;
}

function safeJsIdentifier(value: string): string {
  const normalized = String(value || "asset")
    .replace(/[^a-zA-Z0-9_$]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part, index) =>
      index === 0
        ? part.toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join("");
  const safe = normalized || "asset";
  return /^[a-zA-Z_$]/.test(safe) ? safe : `asset${safe}`;
}

function buildSilentWav(): Buffer {
  const sampleRate = 8000;
  const samples = 800;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

function safeAssetFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "asset";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
