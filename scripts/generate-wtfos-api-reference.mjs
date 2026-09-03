import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SERVER_ROOT = path.join(ROOT, "server");
const OUTPUT = path.join(ROOT, "docs", "reference", "wtfos-api.md");
const ROUTE_OUTPUT = path.join(ROOT, "shared", "wtfos-public-api-routes.generated.ts");
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "all"]);
const API_PATH_PREFIXES = ["/api/", "/.well-known/", "/xrpc/", "/mcp", "/oembed", "/internal/"];

const FAMILY_USES = {
  access: "Public capability and canonical-origin discovery.",
  admin: "Administrative control plane: users, permissions, registrations, diagnostics, storage, rewards, and platform configuration.",
  "admin-inbox": "User-to-admin support threads and replies.",
  apphost: "Authenticated proxy for launching, streaming, controlling, and stopping host-run applications.",
  apps: "Desktop application catalogue and launchability.",
  arcade: "Arcade catalogue, sessions, scores, leaderboards, reports, and source imports.",
  atproto: "AT Protocol account, OAuth, PDS, relay, firehose, record, and AppView operations.",
  attendance: "Attendance check-ins and event attendance records.",
  auth: "Cookie-session authentication, OAuth, wallet sign-in, account recovery, and CSRF bootstrap.",
  barter: "On-chain barter listings, offers, settlements, and synchronization.",
  board: "Message-board channels, posts, reactions, moderation, search, and inbound webhooks.",
  browser: "Server-assisted browser/session tooling.",
  "bug-reports": "Bug report creation, reading, and administration.",
  calendar: "Calendar sources, events, subscriptions, and synchronization.",
  casino: "Casino catalogue, game sessions, balances, wagers, and leaderboards.",
  challenges: "Challenge catalogue, progress, completions, and reward automation.",
  cli: "CLI route discovery and authorization checks.",
  cockpit: "Operational cockpit status, queues, jobs, sync, and diagnostics.",
  collection: "Collection factory and collection metadata workflows.",
  collekt: "Collekt discovery and collection-facing data.",
  comms: "Communication preferences and conversation surfaces.",
  console: "Console game bundles, SDK assets, dependency proxying, scores, sessions, and reports.",
  contracts: "Contract activity, indexing, and synchronization.",
  "control-board": "Control-board operational state and actions.",
  crp: "CRP nomination status, credits, submissions, and resolution.",
  dedrooms: "DedRooms world sessions, commands, state, and administration.",
  desktop: "Desktop state, shortcuts, events, sessions, and preferences.",
  dex: "Decentralized-exchange market data and actions.",
  diary: "Personal diary entries and related profile data.",
  dicksword: "Dicksword game state, commands, and scoring.",
  discovery: "Random and spotlight content discovery.",
  etherlink: "Etherlink wallet linking, balances, tokens, and synchronization.",
  faq: "FAQ content retrieval and management.",
  gallery: "Gallery feeds, tokens, collections, and curation.",
  "game-studio": "Game Studio projects, builds, files, and publishing.",
  health: "Liveness, readiness, authenticated diagnostics, metrics, and disk status.",
  "in-app-market": "In-app market catalogue, purchases, sales, pricing, and reconciliation.",
  ipfs: "IPFS pinning configuration, uploads, registry, and provider operations.",
  leaderboard: "Platform leaderboards and ranking data.",
  links: "User and platform link records.",
  macaroni: "Macaroni drop publishing, packages, installers, previews, and guarded IPFS uploads.",
  mail: "Mailbox, aliases, messages, attachments, and delivery administration.",
  marketplace: "NFT marketplace listings, offers, purchases, and chain synchronization.",
  mastodon: "Mastodon connection, timelines, identity, and posting.",
  mcp: "MCP pairing-token management; the root `/mcp` endpoint carries Streamable HTTP MCP traffic.",
  media: "Media library metadata, uploads, imports, files, and lifecycle management.",
  messages: "Direct-message conversations, messages, participants, and read state.",
  mint: "Mint portal configuration and minting workflows.",
  music: "Music catalogue, playback metadata, and library actions.",
  notifications: "Notification feeds, preferences, and read state.",
  objkt: "Objkt operator configuration and marketplace actions.",
  operator: "Operator-wallet configuration and transaction workflows.",
  pasta: "Pasta suite installer and package discovery.",
  penne: "Penne installer discovery.",
  porcupin: "Porcupin pinning service status and operations.",
  portfolio: "Wallet portfolio positions and valuation views.",
  profile: "Current-user profile, social identities, settings, and public user views.",
  rat: "Rat Race feeds, token candidates, voting, and results.",
  reggie: "Reggie quest state, actions, and administration.",
  rewards: "Reward catalogue, claims, balances, and ledger operations.",
  rotini: "Rotini installer discovery.",
  seasons: "Season catalogue and active-season state.",
  side: "Side-quest catalogue, progress, and completion.",
  skywire: "Bluesky/Skywire accounts, feeds, posts, chat, moderation, and OAuth.",
  social: "Social-automation drafts, promotion queues, approvals, and opt-in controls.",
  spaghetti: "Spaghetti installer discovery.",
  studio: "Studio projects, files, annotations, chat, drive, administration, and workflows.",
  system: "Client/server system logs and operational event retrieval.",
  telegram: "Telegram digest configuration and delivery.",
  tezos: "Tezos intelligence, tokens, wallets, contracts, and indexer-backed analysis.",
  tokens: "Token archive lookup and management.",
  tv: "WTF TV channels, playlists, schedules, playback, cache, telemetry, and media.",
  tz2at: "Tezos-to-AT Protocol bridge state, outbox, publishing, PDS, and firehose data.",
  users: "Public user profiles, activity, listings, DMs, and trade boards.",
  w: "W social timeline, posts, reactions, follows, spaces, group chat, and DMs.",
  wallets: "Linked Tezos wallets, balances, tokens, domains, dossiers, and synchronization.",
  "wtf-auctions": "WTF auction creation, bidding, state transitions, and settlement.",
  "wtf-live": "WTF LIVE rooms, stages, broadcasts, messages, access, invites, and show controls.",
  "wtf-recapture": "WTF Recapture personal state and leaderboard.",
  "wtf-sites": "User-site claiming, pages, assets, publishing, rollback, and administration.",
  "wtf-subdomains": "wtfos.me and wtf.tez subdomain claims, registrar workflows, configuration, and administration.",
  protocol: "Non-REST protocol and discovery endpoints.",
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!/\.(?:ts|tsx|js|mjs)$/.test(entry.name) || entry.name.includes(".test.")) return [];
    return [full];
  });
}

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.mjs"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function productionFiles() {
  const files = new Set();
  function visit(file) {
    if (files.has(file)) return;
    files.add(file);
    const sourceFile = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (
        (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const resolved = resolveLocalImport(file, statement.moduleSpecifier.text);
        if (resolved) visit(resolved);
      }
    }
  }
  visit(path.join(SERVER_ROOT, "index.ts"));
  return [...files];
}

function literalValues(node, sourceFile, constants) {
  if (!node) return [];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isRegularExpressionLiteral(node)) return [node.getText(sourceFile)];
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => literalValues(element, sourceFile, constants));
  }
  if (ts.isIdentifier(node) && constants.has(node.text)) return constants.get(node.text);
  return [];
}

function enclosingForOfValues(node, sourceFile, constants) {
  if (!ts.isIdentifier(node)) return [];
  let cursor = node.parent;
  while (cursor) {
    if (
      ts.isForOfStatement(cursor) &&
      ts.isVariableDeclarationList(cursor.initializer) &&
      cursor.initializer.declarations.some((declaration) => declaration.name.getText(sourceFile) === node.text)
    ) {
      return literalValues(cursor.expression, sourceFile, constants);
    }
    cursor = cursor.parent;
  }
  return [];
}

function isApiPath(routePath) {
  if (routePath.startsWith("/^")) return routePath.includes("\\/api\\/");
  return API_PATH_PREFIXES.some((prefix) => routePath === prefix.replace(/\/$/, "") || routePath.startsWith(prefix));
}

function accessFor(routePath, callText) {
  if (routePath.startsWith("/internal/")) return "Internal";
  if (routePath === "/mcp") return "MCP bearer";
  if (/^\/api\/admin(?:\/|$)/.test(routePath) || /requireAdmin|access_admin_panel/.test(callText)) return "Admin";
  if (/requirePermission|requireAnyPermission|requireRole/.test(callText)) return "Permission";
  if (/require[A-Za-z]+Api|authenticateApp|appApi/.test(callText)) return "App key";
  if (/isAuthenticated|requireAuthenticated|requireUser/.test(callText)) return "Session";
  if (/optionalAuth|maybeAuthenticated/.test(callText)) return "Optional session";
  return "Public/handler";
}

function familyFor(routePath) {
  if (!routePath.startsWith("/api/")) return "protocol";
  const parts = routePath.slice(5).split("/").filter(Boolean);
  if (parts[0] === "admin") return "admin";
  if (parts[0] === "health" || parts[0] === "metrics") return "health";
  if (parts[0] === "contract-activity") return "contracts";
  if (parts[0] === "collection-factory") return "collection";
  if (parts[0] === "mint-portal") return "mint";
  if (parts[0] === "operator-wallet") return "operator";
  if (parts[0] === "token-archive") return "tokens";
  if (parts[0] === "tezos-intel") return "tezos";
  if (parts[0] === "crp-nominations") return "crp";
  if (parts[0] === "rat-race") return "rat";
  if (parts[0] === "side-quests") return "side";
  if (parts[0] === "social-automation") return "social";
  if (parts[0] === "challenge-automation") return "challenges";
  if (parts[0] === "in-app-market") return "in-app-market";
  return parts[0] || "protocol";
}

function readablePath(routePath) {
  return routePath
    .replace(/^\/api\//, "")
    .replace(/^\//, "")
    .replace(/[:{}]/g, "")
    .replace(/[\/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function useFor(method, routePath) {
  const resource = readablePath(routePath) || "API root";
  if (method === "GET") return `Read or list ${resource}.`;
  if (method === "POST") return `Create, submit, or run ${resource}.`;
  if (method === "PUT") return `Replace or set ${resource}.`;
  if (method === "PATCH") return `Partially update ${resource}.`;
  if (method === "DELETE") return `Delete, revoke, or stop ${resource}.`;
  return `Handle the supported methods for ${resource}.`;
}

function collectExpressRoutes() {
  const found = [];
  for (const file of productionFiles()) {
    const source = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const constants = new Map();

    function collectConstants(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const values = literalValues(node.initializer, sourceFile, constants);
        if (values.length) constants.set(node.name.text, values);
      }
      ts.forEachChild(node, collectConstants);
    }
    collectConstants(sourceFile);

    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        HTTP_METHODS.has(node.expression.name.text) &&
        ["router", "app"].includes(node.expression.expression.getText(sourceFile))
      ) {
        const first = node.arguments[0];
        const values = [
          ...literalValues(first, sourceFile, constants),
          ...enclosingForOfValues(first, sourceFile, constants),
        ];
        for (const routePath of new Set(values)) {
          if (!isApiPath(routePath)) continue;
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          found.push({
            method: node.expression.name.text.toUpperCase(),
            path: routePath,
            file: path.relative(ROOT, file),
            line,
            access: accessFor(routePath, node.getText(sourceFile)),
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  const deduped = new Map();
  for (const route of found) {
    const key = `${route.method} ${route.path}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, { ...route, sources: [`${route.file}:${route.line}`] });
    } else {
      existing.sources.push(`${route.file}:${route.line}`);
      if (existing.access === "Public/handler" && route.access !== "Public/handler") existing.access = route.access;
    }
  }
  return [...deduped.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function collectMcpTools() {
  const files = [
    path.join(ROOT, "server", "lib", "wtf-mcp.ts"),
    path.join(ROOT, "server", "features", "crp-nominations", "mcp.ts"),
  ];
  const tools = [];
  for (const file of files) {
    const sourceFile = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "registerTool" &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const config = node.arguments[1];
        let description = "Registered wtfOS MCP capability.";
        if (config && ts.isObjectLiteralExpression(config)) {
          const property = config.properties.find(
            (item) => ts.isPropertyAssignment(item) && item.name.getText(sourceFile) === "description",
          );
          if (property && ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)) {
            description = property.initializer.text;
          }
        }
        tools.push({
          name: node.arguments[0].text,
          description,
          source: `${path.relative(ROOT, file)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

function collectCollektRoutes() {
  const base = path.join(ROOT, "apps", "collekt", "app", "api");
  if (!fs.existsSync(base)) return [];
  return walk(base).flatMap((file) => {
    if (path.basename(file) !== "route.ts") return [];
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(base, path.dirname(file)).split(path.sep).join("/");
    return [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => ({
      method: match[1],
      path: `/api/${relative}`,
      source: `${path.relative(ROOT, file)}:${source.slice(0, match.index).split("\n").length}`,
    }));
  });
}

const routes = collectExpressRoutes();
const families = new Map();
for (const route of routes) {
  const family = familyFor(route.path);
  if (!families.has(family)) families.set(family, []);
  families.get(family).push(route);
}

const accessCounts = routes.reduce((counts, route) => {
  counts[route.access] = (counts[route.access] || 0) + 1;
  return counts;
}, {});
const methodCounts = routes.reduce((counts, route) => {
  counts[route.method] = (counts[route.method] || 0) + 1;
  return counts;
}, {});
const sourceCount = new Set(routes.flatMap((route) => route.sources.map((source) => source.split(":")[0]))).size;
const collektRoutes = collectCollektRoutes();
const mcpTools = collectMcpTools();

const lines = [];
lines.push("# wtfOS API reference", "");
lines.push(
  `This is the source-derived inventory of the main wtfOS HTTP API: **${routes.length} unique method/path operations**, grouped into **${families.size} route families** and declared across **${sourceCount} server modules**. It documents what each endpoint is for and the gate visible at its route declaration; handler code remains authoritative for payload schemas and conditional authorization.`,
  "",
  "> Evidence: `[source]`. Probe budget: zero-call pass. Actual spend: zero network calls, zero writes, and no production data access. The inventory was extracted from the local route AST, then deduplicated by method and path.",
  "",
  "## Public platform surface",
  "",
  `wtfOS exposes ${routes.length} unique method/path declarations across production-reachable routers, four WebSocket transports, and a Streamable HTTP MCP server with ${mcpTools.length} registered tools. Feature flags and runtime modes can disable or replace some declared routes.`,
  "",
  "The public developer boundary is additive: `/api/v1` aliases the established handlers behind paired bearer-token scopes, `/api/v1/openapi.json` serves OpenAPI 3.1, and `/api/v1/docs` serves the grouped human reference. The legacy `/api/*` surface remains unchanged for browser and internal callers.",
  "",
  "MCP retains its workflow-specific tools and mirrors the complete `/api/v1` contract through an agent-friendly portal: search allowed operations, inspect one operation, call it by stable `operationId`, or use the backward-compatible `wtf_api_request` path bridge. Both call paths retain read/write/admin scopes, account roles, ownership checks, and app gates.",
  "",
  "## How the API is structured",
  "",
  "- **Public transport:** versioned HTTP under `/api/v1/*`, authenticated with `Authorization: Bearer wtf_mcp_...`. Discovery, OpenAPI, and docs are public.",
  "- **Compatibility transport:** same-origin JSON under `/api/*`. Existing browser clients continue to use cookie sessions and `credentials: include`.",
  "- **Protocol surfaces:** AT Protocol discovery under `/.well-known/*`, AppView XRPC aliases under `/xrpc/*`, oEmbed at `/oembed`, and Streamable HTTP MCP at `/mcp`.",
  "- **Real time:** authenticated WebSockets use `/ws`, `/ws/wtf-live`, `/ws/dedrooms`, and `/ws/apphost`.",
  "- **Route composition:** `server/routes.ts` mounts domain routers from `server/routes/`, `server/features/*`, and `server/challenges/routes/`. Domains own validation, persistence, and upstream integrations.",
  "- **Responses:** JSON is standard. Successful download, media, embed, and stream routes may return binary, HTML, redirects, or byte ranges. Errors conventionally use `{ \"error\": string }` with an appropriate HTTP status.",
  "",
  "## Authentication, mutation, and limits",
  "",
  "| Concern | Contract |",
  "| --- | --- |",
  "| Browser auth | Session cookie established by `/api/auth/*`; protected routes declare `isAuthenticated` or a permission/admin middleware. |",
  "| Public API auth | Paired access token in `Authorization: Bearer wtf_mcp_...`; `api:read`, `api:write`, and admin-only `api:admin` scopes layer over normal route authorization. |",
  "| CSRF | Cookie-authenticated legacy `POST`, `PUT`, `PATCH`, and `DELETE` calls require `X-CSRF-Token`, obtained from `GET /api/auth/csrf-token`, except explicit exemptions. Bearer-authenticated `/api/v1` mutations do not use browser cookies and are CSRF-exempt. |",
  "| MCP | `/mcp` ignores browser identity and requires a paired bearer token. `/api/mcp/tokens*` manages those tokens through the signed-in browser session. |",
  "| App APIs | Some routes accept app-scoped credentials or tickets in addition to user/admin sessions; check the named middleware in the source before integrating. |",
  "| Generic limit | `/api/*` defaults to 200 requests/minute per IP; authenticated `/api/v1` traffic keys that limit by one-way token hash. Streaming reads and `/api/apphost/*` are deliberately separated. |",
  "| Narrow limits | Client logs 30/min; CLI probes 60/min; password auth 20/15 min; wallet auth 30/15 min; OAuth starts 15/15 min; apphost 6,000/min per session/IP; TV prefetch 12/min; media file reads 600/min; media imports 60/15 min; uploads 20/15 min. Domain routes may add tighter limits. |",
  "| CORS | Production accepts configured origins and credentials; the arcade source surface has a narrowly scoped null-origin exception. |",
  "",
  "The `Access` column is intentionally conservative: `Public/handler` means no reusable gate was visible in the route call, not that every response or operation is unconditionally public. Some handlers perform feature-flag, ownership, token, signature, or permission checks internally.",
  "",
  "## MCP surface",
  "",
  `The MCP transport is \`GET/POST/DELETE /mcp\`, authenticated exclusively with a paired bearer token and limited to 60 requests/minute by default. The browser-session routes \`GET/POST /api/mcp/tokens\` and \`DELETE /api/mcp/tokens/:id\` bootstrap pairing; versioned aliases live at \`/api/v1/tokens\`. The server currently registers ${mcpTools.length} tools, including searchable, operationId-based API coverage plus the backward-compatible \`wtf_api_request\` path bridge:`,
  "",
  "| Tool | Use | Source |",
  "| --- | --- | --- |",
);
for (const tool of mcpTools) {
  lines.push(`| \`${tool.name}\` | ${tool.description.replaceAll("|", "\\|")} | \`${tool.source}\` |`);
}
lines.push(
  "",
  "## Route-family map",
  "",
  "| Family | Operations | Use |",
  "| --- | ---: | --- |",
);
for (const [family, familyRoutes] of [...families].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`| \`${family}\` | ${familyRoutes.length} | ${FAMILY_USES[family] || `Operations for the ${family.replace(/-/g, " ")} domain.`} |`);
}

lines.push(
  "",
  "## Complete endpoint inventory",
  "",
  `Method totals: ${Object.entries(methodCounts).sort().map(([key, value]) => `**${key} ${value}**`).join(", ")}. Declared-gate totals: ${Object.entries(accessCounts).sort().map(([key, value]) => `**${key} ${value}**`).join(", ")}.`,
  "",
);

for (const [family, familyRoutes] of [...families].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`<details>`, `<summary><code>${family}</code> — ${familyRoutes.length} operations</summary>`, "");
  lines.push(FAMILY_USES[family] || `Operations for the ${family.replace(/-/g, " ")} domain.`, "");
  lines.push("| Method | Path | Use | Access | Source |", "| --- | --- | --- | --- | --- |");
  for (const route of familyRoutes) {
    const source = route.sources.map((item) => `\`${item}\``).join("<br>");
    lines.push(`| ${route.method} | \`${route.path.replaceAll("|", "\\|")}\` | ${useFor(route.method, route.path)} | ${route.access} | ${source} |`);
  }
  lines.push("", "</details>", "");
}

lines.push(
  "## Other first-party API surfaces",
  "",
  "### Apphost daemon (private)",
  "",
  "The browser-facing `/api/apphost/*` family above proxies a separate daemon over a Unix socket or host loopback. Its raw `/health` and `/apps*` endpoints must stay private to the host. See `apphost/docs/API.md` for request and response contracts; browser integrations should use the authenticated wtfOS proxy instead.",
  "",
  "### Collekt Next.js sub-application",
  "",
  "These endpoints belong to the separately deployed `apps/collekt` application, not the main Express process:",
  "",
  "| Method | Path | Use | Source |",
  "| --- | --- | --- | --- |",
);
for (const route of collektRoutes.sort((a, b) => a.path.localeCompare(b.path))) {
  lines.push(`| ${route.method} | \`${route.path}\` | ${useFor(route.method, route.path)} | \`${route.source}\` |`);
}

lines.push(
  "",
  "## Integration pattern",
  "",
  "```ts",
  "const response = await fetch('https://wtfos.app/api/v1/me', {",
  "  headers: {",
  "    Accept: 'application/json',",
  "    Authorization: `Bearer ${process.env.WTFOS_ACCESS_TOKEN}`",
  "  },",
  "});",
  "if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);",
  "const result = await response.json();",
  "```",
  "",
  "External integrations should use `/api/v1` and the OpenAPI contract. Existing in-browser code should keep using `client/src/lib/api.ts`; it supplies cookies, request IDs, CSRF tokens, one CSRF retry, and normalized legacy API errors. Server-side code in the same process should import domain services directly instead of making loopback HTTP calls.",
  "",
  "## Maintenance",
  "",
  "Regenerate after route changes:",
  "",
  "```bash",
  "node scripts/generate-wtfos-api-reference.mjs",
  "```",
  "",
  "The generator deliberately inventories declarations without calling the live service. A live probe is unnecessary for route completeness and would not prove conditional handler behavior. For exact query/body/response schemas, follow the source reference on the relevant row and its focused tests.",
);

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${lines.join("\n")}\n`);
const generatedRoutes = routes.map((route) => ({
  method: route.method,
  path: route.path,
  purpose: useFor(route.method, route.path),
  declaredAccess: route.access,
  sources: route.sources,
}));
fs.writeFileSync(
  ROUTE_OUTPUT,
  [
    "// Generated by scripts/generate-wtfos-api-reference.mjs. Do not edit by hand.",
    "export const WTFOS_PUBLIC_API_ROUTES =",
    `${JSON.stringify(generatedRoutes, null, 2)} as const;`,
    "",
    "export type WtfOsPublicApiRoute = (typeof WTFOS_PUBLIC_API_ROUTES)[number];",
    "",
  ].join("\n"),
);
console.log(`Wrote ${path.relative(ROOT, OUTPUT)} and ${path.relative(ROOT, ROUTE_OUTPUT)} with ${routes.length} main API operations and ${collektRoutes.length} Collekt operations.`);
