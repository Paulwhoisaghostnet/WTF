import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_CREDENTIALS_PATH = join(
  homedir(),
  ".wtf-gameshow",
  "e2e-puppets.local.json",
);

function envStr(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseSteps(raw) {
  return String(raw)
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function parseMix(raw) {
  // "lobby:0.5,browse:0.3,room:0.2"
  const out = [];
  for (const part of String(raw).split(",")) {
    const [name, weightRaw] = part.split(":");
    const key = (name || "").trim();
    const weight = Number(weightRaw);
    if (key && Number.isFinite(weight) && weight > 0) {
      out.push({ name: key, weight });
    }
  }
  return out.length ? out : [{ name: "lobby", weight: 1 }];
}

export function loadConfig() {
  const baseUrl = envStr("WTF_LOAD_BASE_URL", "http://127.0.0.1:3000").replace(
    /\/$/,
    "",
  );
  const wsUrl = envStr(
    "WTF_LOAD_WS_URL",
    baseUrl.replace(/^http/, "ws") + "/ws/wtf-live",
  );
  return {
    baseUrl,
    wsUrl,
    metricsToken: envStr("WTF_METRICS_TOKEN", ""),
    steps: parseSteps(envStr("WTF_LOAD_STEPS", "1,5,10,25,50")),
    stepSeconds: envInt("WTF_LOAD_STEP_SECONDS", 30),
    settleSeconds: envInt("WTF_LOAD_SETTLE_SECONDS", 6),
    sampleMs: envInt("WTF_LOAD_SAMPLE_MS", 2000),
    mix: parseMix(envStr("WTF_LOAD_MIX", "lobby:0.5,browse:0.35,room:0.15")),
    auth: envStr("WTF_LOAD_AUTH", "auto"), // auto | guest | required | wallet
    credentialsPath: envStr(
      "WTF_LOAD_CREDENTIALS_PATH",
      DEFAULT_CREDENTIALS_PATH,
    ),
    roomId: envStr("WTF_LOAD_ROOM_ID", ""),
    outDir: envStr("WTF_LOAD_OUT_DIR", join("tests", "load", "results")),
    label: envStr("WTF_LOAD_LABEL", "local"),
    // safety: refuse to hammer production without an explicit opt-in
    allowProduction: envStr("WTF_LOAD_ALLOW_PRODUCTION", "") === "1",
    // gentle-probe caps for production baseline runs
    maxRps: envInt("WTF_LOAD_MAX_RPS", 0), // 0 = unlimited
  };
}

export async function loadPuppetCredentials(config) {
  if (config.auth === "guest") return null;
  if (!existsSync(config.credentialsPath)) {
    if (config.auth === "required" || config.auth === "wallet") {
      throw new Error(
        `WTF_LOAD_AUTH=${config.auth} but no puppet credentials at ${config.credentialsPath}. Run: npm run test:e2e:puppets:seed`,
      );
    }
    return null;
  }
  const parsed = JSON.parse(await readFile(config.credentialsPath, "utf8"));
  if (parsed?.version !== 1 || !Array.isArray(parsed.actors)) {
    throw new Error(`Unsupported puppet credentials file: ${config.credentialsPath}`);
  }
  return parsed.actors;
}

export function isProductionHost(baseUrl) {
  let host = "";
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    host = "";
  }
  return /(^|\.)wtfos\.app$/.test(host) || /(^|\.)wtfgameshow\.app$/.test(host);
}
