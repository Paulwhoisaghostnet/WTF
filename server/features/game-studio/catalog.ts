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
  kind: "sprite" | "tileset" | "background" | "audio" | "ui" | "font" | "shader";
  tags: string[];
  license: string;
  uri: string;
};

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

export const GAME_STUDIO_STOCK_ASSETS: GameStudioStockAsset[] = [
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
  if (asset.kind === "font") {
    return `const ${name}Info = await fetch(${resolvedPath}).then((res) => res.text());`;
  }
  return `const ${name} = new Image();\n${name}.src = ${resolvedPath};`;
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
