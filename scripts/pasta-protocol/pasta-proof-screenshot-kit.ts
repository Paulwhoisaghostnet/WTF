import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

import type { Locator, Page } from "playwright";

export const PASTA_PROOF_SCREENSHOT_SCHEMA = "pastaprotocol-screenshot-evidence@1";
export const PASTA_PROOF_VIEWPORT = Object.freeze({ width: 1440, height: 900 });

const MINIMUM_SCREENSHOT_BYTES = 2_000;
const MINIMUM_UNIQUE_COLORS = 8;
const MINIMUM_LUMA_STANDARD_DEVIATION = 4;
const MAX_EVIDENCE_TEXT_LENGTH = 1_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SAFE_COMPONENT = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "file:"]);
const PROHIBITED_SIDECAR_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "credential",
  "mnemonic",
  "passphrase",
  "password",
  "privatekey",
  "secretkey",
  "seedphrase",
  "signature",
]);
const SENSITIVE_URL_KEY = /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|bearer|credential|jwt|mnemonic|pass(?:word|phrase)?|private[_-]?key|secret(?:[_-]?key)?|seed(?:[_-]?phrase)?|signature)$/i;
const SENSITIVE_HASH_PARAMETER = /(?:^|[?&#])(?:access[_-]?token|api[_-]?key|auth(?:orization)?|bearer|credential|jwt|mnemonic|pass(?:word|phrase)?|private[_-]?key|secret(?:[_-]?key)?|seed(?:[_-]?phrase)?|signature)=/i;
const DEFAULT_FATAL_SELECTORS = Object.freeze([
  "vite-error-overlay",
  "#webpack-dev-server-client-overlay",
  "[data-pasta-fatal='true']",
  "[data-fatal-error='true']",
  "[role='alert'][data-severity='fatal']",
]);

const SECRET_PATTERNS = Object.freeze([
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{40,100}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{24,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*\b/i,
  /\b(?:api[_ -]?key|authorization|mnemonic|passphrase|password|private[_ -]?key|secret[_ -]?key|seed[_ -]?phrase)\s*[:=]\s*(?!REDACTED\b)["']?[^\s"'<>]{8,}/i,
]);

const SECRET_REPLACEMENTS = Object.freeze([
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
  /\b(?:edsk|p2sk|spsk)[1-9A-HJ-NP-Za-km-z]{40,100}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{24,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*\b/gi,
  /\b(?:api[_ -]?key|authorization|mnemonic|passphrase|password|private[_ -]?key|secret[_ -]?key|seed[_ -]?phrase)\s*[:=]\s*(?!REDACTED\b)["']?[^\s"'<>]{8,}/gi,
]);

export type PastaProofClassification = "UI-LIVE" | "UI-MOCK";

export type RequiredDomEvidence = {
  selector: string;
  name?: string;
  expectedText?: string | RegExp;
  index?: number;
};

export type RecordedDomEvidence = {
  selector: string;
  name?: string;
  matchCount: number;
  selectedIndex: number;
  text: string;
};

export type PastaProofViewport = {
  width: number;
  height: number;
  deviceScaleFactor: 1;
};

export type PastaProofScreenshotSidecar = {
  schema: typeof PASTA_PROOF_SCREENSHOT_SCHEMA;
  app: string;
  capability: string;
  stageOrdinal: number;
  stageName: string;
  url: string;
  timestampUtc: string;
  viewport: PastaProofViewport;
  sha256: string;
  byteCount: number;
  domEvidence: RecordedDomEvidence[];
  classification: PastaProofClassification;
};

export type PastaProofFatalEvent = {
  kind: "console.error" | "pageerror" | "navigation-request" | "navigation-response";
  message: string;
};

export type CapturePastaProofStageInput = {
  page: Page;
  monitor: PastaProofPageMonitor;
  outputRoot: string;
  app: string;
  capability: string;
  stageOrdinal: number;
  stageName: string;
  classification: PastaProofClassification;
  requiredEvidence: RequiredDomEvidence[];
  redactSelectors?: string[];
  fatalSelectors?: string[];
  waitForLoadState?: "load" | "domcontentloaded" | "networkidle" | "none";
  timeoutMs?: number;
  now?: () => Date;
};

export type CapturePastaProofStageResult = {
  appDirectory: string;
  pngPath: string;
  sidecarPath: string;
  pngRelativePath: string;
  sidecarRelativePath: string;
  filenameStem: string;
  sidecar: PastaProofScreenshotSidecar;
  manifestScreenshot: {
    stage: string;
    path: string;
    sha256: string;
    caption: string;
  };
  manifestSidecarArtifact: {
    id: string;
    kind: "screenshot-sidecar";
    path: string;
    sha256: string;
  };
};

export class PastaProofScreenshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PastaProofScreenshotError";
  }
}

function fail(message: string): never {
  throw new PastaProofScreenshotError(message);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function redactSecrets(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_REPLACEMENTS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, "REDACTED");
  }
  return redacted;
}

function assertNoSecrets(value: string, label: string): void {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      fail(`${label} contains probable signing material or credentials; capture was blocked`);
    }
  }
}

function normalizeLabel(value: string, label: string): string {
  if (typeof value !== "string") fail(`${label} must be a string`);
  const normalized = normalizeText(value);
  if (!normalized || normalized.length > 160) {
    fail(`${label} must be between 1 and 160 normalized characters`);
  }
  assertNoSecrets(normalized, label);
  return normalized;
}

function slug(value: string, label: string): string {
  const expanded = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const result = expanded.length <= 80
    ? expanded
    : `${expanded.slice(0, 63).replace(/-+$/g, "")}-${createHash("sha256").update(expanded).digest("hex").slice(0, 16)}`;
  if (!SAFE_COMPONENT.test(result)) fail(`${label} cannot be converted to a safe evidence name`);
  return result;
}

function boundedEvidenceId(value: string, maximumLength = 128): string {
  if (value.length <= maximumLength) return value;
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 16);
  return `${value.slice(0, maximumLength - digest.length - 1).replace(/-+$/g, "")}-${digest}`;
}

export function deterministicScreenshotStem(input: {
  capability: string;
  stageOrdinal: number;
  stageName: string;
}): string {
  if (!Number.isSafeInteger(input.stageOrdinal) || input.stageOrdinal < 1 || input.stageOrdinal > 999) {
    fail("stage ordinal must be an integer from 1 through 999");
  }
  const capability = slug(normalizeLabel(input.capability, "capability"), "capability");
  const stage = slug(normalizeLabel(input.stageName, "stage name"), "stage name");
  return `${String(input.stageOrdinal).padStart(3, "0")}-${capability}-${stage}`;
}

export function sanitizeEvidenceUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("page URL is not an absolute URL");
  }
  if (!SAFE_URL_PROTOCOLS.has(parsed.protocol)) {
    fail(`page URL protocol is not proof-safe: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    fail("page URL contains embedded credentials; capture was blocked");
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_URL_KEY.test(key)) parsed.searchParams.set(key, "REDACTED");
  }
  const rawHash = parsed.hash.slice(1);
  if (rawHash && (SENSITIVE_HASH_PARAMETER.test(rawHash) || SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(rawHash);
  }))) {
    parsed.hash = "#REDACTED";
  }
  const sanitized = parsed.toString();
  assertNoSecrets(sanitized, "page URL");
  return sanitized;
}

function safeMonitorUrl(rawUrl: string): string {
  try {
    return sanitizeEvidenceUrl(rawUrl);
  } catch {
    return "[BLOCKED URL]";
  }
}

export class PastaProofPageMonitor {
  private readonly fatalEvents: PastaProofFatalEvent[] = [];
  private disposed = false;

  private readonly onConsole = (message: { type(): string; text(): string }): void => {
    if (message.type() === "error") {
      this.fatalEvents.push({ kind: "console.error", message: redactSecrets(message.text()) });
    }
  };

  private readonly onPageError = (error: Error): void => {
    this.fatalEvents.push({ kind: "pageerror", message: redactSecrets(error.message) });
  };

  private readonly onRequestFailed = (request: {
    isNavigationRequest(): boolean;
    frame(): unknown;
    url(): string;
    failure(): { errorText?: string } | null;
  }): void => {
    if (request.isNavigationRequest() && request.frame() === this.page.mainFrame()) {
      const failure = redactSecrets(request.failure()?.errorText || "unknown navigation failure");
      this.fatalEvents.push({
        kind: "navigation-request",
        message: `${safeMonitorUrl(request.url())}: ${failure}`,
      });
    }
  };

  private readonly onResponse = (response: {
    status(): number;
    request(): { isNavigationRequest(): boolean; frame(): unknown };
    url(): string;
  }): void => {
    const request = response.request();
    if (
      response.status() >= 400 &&
      request.isNavigationRequest() &&
      request.frame() === this.page.mainFrame()
    ) {
      this.fatalEvents.push({
        kind: "navigation-response",
        message: `${response.status()} ${safeMonitorUrl(response.url())}`,
      });
    }
  };

  constructor(private readonly page: Page) {
    page.on("console", this.onConsole);
    page.on("pageerror", this.onPageError);
    page.on("requestfailed", this.onRequestFailed);
    page.on("response", this.onResponse);
  }

  list(): readonly PastaProofFatalEvent[] {
    return this.fatalEvents.map((event) => ({ ...event }));
  }

  reset(): void {
    if (this.disposed) fail("page monitor has been disposed");
    this.fatalEvents.length = 0;
  }

  assertAttachedTo(page: Page): void {
    if (this.disposed) fail("page monitor has been disposed");
    if (page !== this.page) fail("page monitor belongs to a different browser page");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.page.off("console", this.onConsole);
    this.page.off("pageerror", this.onPageError);
    this.page.off("requestfailed", this.onRequestFailed);
    this.page.off("response", this.onResponse);
  }
}

export function monitorPastaProofPage(page: Page): PastaProofPageMonitor {
  return new PastaProofPageMonitor(page);
}

function assertMonitorClean(monitor: PastaProofPageMonitor): void {
  const events = monitor.list();
  if (events.length === 0) return;
  const summary = events
    .slice(0, 5)
    .map((event) => `${event.kind}: ${event.message}`)
    .join(" | ");
  fail(`page emitted fatal browser errors; capture was blocked (${summary})`);
}

function validSelector(value: string, label: string): string {
  const selector = value.trim();
  if (!selector || selector.length > 512 || /[\r\n\0]/.test(selector)) {
    fail(`${label} must be a single-line selector between 1 and 512 characters`);
  }
  return selector;
}

async function visibleLocator(locator: Locator, index: number, label: string): Promise<Locator> {
  const count = await locator.count();
  if (count === 0) fail(`${label} is absent`);
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) {
    fail(`${label} selected index ${index} outside ${count} matches`);
  }
  const selected = locator.nth(index);
  if (!(await selected.isVisible())) fail(`${label} is present but not visible`);
  return selected;
}

async function validateRedactionSelectors(page: Page, selectors: string[]): Promise<Locator[]> {
  const masks: Locator[] = [];
  for (const [index, rawSelector] of selectors.entries()) {
    const selector = validSelector(rawSelector, `redaction selector ${index + 1}`);
    let nativeMatchCount: number;
    try {
      nativeMatchCount = await page.evaluate((cssSelector) => document.querySelectorAll(cssSelector).length, selector);
    } catch {
      fail(`redaction selector ${selector} must be a native CSS selector`);
    }
    const locator = page.locator(selector);
    if (nativeMatchCount === 0 || (await locator.count()) === 0) {
      fail(`redaction selector ${selector} is absent; capture was blocked rather than risking exposure`);
    }
    masks.push(locator);
  }
  return masks;
}

async function isInsideRedaction(locator: Locator, selectors: string[]): Promise<boolean> {
  if (selectors.length === 0) return false;
  return locator.evaluate((element, redactions) =>
    redactions.some((selector) => element.matches(selector) || Boolean(element.closest(selector))),
  selectors);
}

function matchesExpectedText(actual: string, expected: string | RegExp): boolean {
  if (typeof expected === "string") return actual.includes(normalizeText(expected));
  expected.lastIndex = 0;
  const matches = expected.test(actual);
  expected.lastIndex = 0;
  return matches;
}

async function collectDomEvidence(
  page: Page,
  requirements: RequiredDomEvidence[],
  redactionSelectors: string[],
): Promise<RecordedDomEvidence[]> {
  if (requirements.length === 0) fail("at least one required DOM evidence selector is required");
  const evidence: RecordedDomEvidence[] = [];
  for (const [requirementIndex, requirement] of requirements.entries()) {
    const selector = validSelector(requirement.selector, `required evidence selector ${requirementIndex + 1}`);
    const locator = page.locator(selector);
    const count = await locator.count();
    const selectedIndex = requirement.index ?? 0;
    const selected = await visibleLocator(locator, selectedIndex, `required evidence selector ${selector}`);
    const redacted = await isInsideRedaction(selected, redactionSelectors);
    const actualText = normalizeText(await selected.innerText());
    if (!redacted && requirement.expectedText !== undefined && !matchesExpectedText(actualText, requirement.expectedText)) {
      fail(`required evidence selector ${selector} does not contain its expected text`);
    }
    if (!redacted) assertNoSecrets(actualText, `DOM evidence for ${selector}`);
    evidence.push({
      selector,
      ...(requirement.name ? { name: normalizeLabel(requirement.name, `evidence name ${requirementIndex + 1}`) } : {}),
      matchCount: count,
      selectedIndex,
      text: redacted ? "REDACTED" : actualText.slice(0, MAX_EVIDENCE_TEXT_LENGTH),
    });
  }
  return evidence;
}

async function collectPageTextForSecretScan(page: Page, redactionSelectors: string[]): Promise<string> {
  return page.evaluate((selectors) => {
    const clone = document.body?.cloneNode(true) as HTMLElement | undefined;
    if (!clone) return "";
    clone.querySelectorAll("script, style, noscript, template").forEach((element) => element.remove());
    for (const selector of selectors) {
      clone.querySelectorAll(selector).forEach((element) => {
        element.textContent = "REDACTED";
        for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
      });
    }
    const values: string[] = [];
    for (const element of document.querySelectorAll("input, textarea, [contenteditable='true']")) {
      let redacted = false;
      for (const selector of selectors) {
        if (element.matches(selector) || element.closest(selector)) {
          redacted = true;
          break;
        }
      }
      if (redacted) continue;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) values.push(element.value);
      else values.push(element.textContent || "");
    }
    return [clone.textContent || "", ...values].join("\n");
  }, redactionSelectors);
}

async function assertNoFatalSurface(page: Page, selectors: string[]): Promise<void> {
  for (const rawSelector of selectors) {
    const selector = validSelector(rawSelector, "fatal selector");
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible()) {
        fail(`visible fatal error surface ${selector} blocked screenshot capture`);
      }
    }
  }
}

function paethPredictor(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

type PngVisualStats = {
  width: number;
  height: number;
  uniqueColors: number;
  lumaStandardDeviation: number;
};

export function inspectScreenshotPng(bytes: Uint8Array): PngVisualStats {
  const png = Buffer.from(bytes);
  if (png.length < 33 || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail("screenshot is not a valid PNG file");
  }
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  const idat: Buffer[] = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) fail("screenshot PNG contains a truncated chunk");
    if (type === "IHDR") {
      if (length !== 13) fail("screenshot PNG has an invalid IHDR chunk");
      width = png.readUInt32BE(dataStart);
      height = png.readUInt32BE(dataStart + 4);
      bitDepth = png[dataStart + 8];
      colorType = png[dataStart + 9];
      interlace = png[dataStart + 12];
    } else if (type === "IDAT") {
      idat.push(png.subarray(dataStart, dataEnd));
    }
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  if (!width || !height || idat.length === 0) fail("screenshot PNG is missing image data");
  if (width > 4_096 || height > 4_096) fail("screenshot PNG dimensions exceed the proof safety limit");
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    fail(`screenshot PNG uses unsupported pixel encoding (depth=${bitDepth}, color=${colorType}, interlace=${interlace})`);
  }
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowLength = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  const expectedInflatedLength = (rowLength + 1) * height;
  if (inflated.length !== expectedInflatedLength) fail("screenshot PNG has an unexpected decoded byte length");

  let previous = Buffer.alloc(rowLength);
  const colors = new Set<number>();
  let sampleCount = 0;
  let lumaSum = 0;
  let lumaSquaredSum = 0;
  const sampleEvery = Math.max(1, Math.floor((width * height) / 30_000));
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (rowLength + 1)];
    if (filter > 4) fail(`screenshot PNG uses unknown row filter ${filter}`);
    const sourceStart = y * (rowLength + 1) + 1;
    const row = Buffer.allocUnsafe(rowLength);
    for (let byteIndex = 0; byteIndex < rowLength; byteIndex += 1) {
      const source = inflated[sourceStart + byteIndex];
      const left = byteIndex >= bytesPerPixel ? row[byteIndex - bytesPerPixel] : 0;
      const up = previous[byteIndex];
      const upperLeft = byteIndex >= bytesPerPixel ? previous[byteIndex - bytesPerPixel] : 0;
      const predicted =
        filter === 0 ? 0 :
        filter === 1 ? left :
        filter === 2 ? up :
        filter === 3 ? Math.floor((left + up) / 2) :
        paethPredictor(left, up, upperLeft);
      row[byteIndex] = (source + predicted) & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      if (pixelIndex % sampleEvery !== 0) continue;
      const byteIndex = x * bytesPerPixel;
      const alpha = bytesPerPixel === 4 ? row[byteIndex + 3] / 255 : 1;
      const red = Math.round(row[byteIndex] * alpha + 255 * (1 - alpha));
      const green = Math.round(row[byteIndex + 1] * alpha + 255 * (1 - alpha));
      const blue = Math.round(row[byteIndex + 2] * alpha + 255 * (1 - alpha));
      if (colors.size < 4_096) colors.add((red << 16) | (green << 8) | blue);
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      sampleCount += 1;
      lumaSum += luma;
      lumaSquaredSum += luma * luma;
    }
    previous = row;
  }
  const lumaMean = lumaSum / sampleCount;
  const variance = Math.max(0, lumaSquaredSum / sampleCount - lumaMean * lumaMean);
  return {
    width,
    height,
    uniqueColors: colors.size,
    lumaStandardDeviation: Math.sqrt(variance),
  };
}

export function validateScreenshotPng(bytes: Uint8Array): PngVisualStats {
  if (bytes.byteLength < MINIMUM_SCREENSHOT_BYTES) {
    fail(`screenshot is too small to be evidence (${bytes.byteLength} bytes)`);
  }
  const stats = inspectScreenshotPng(bytes);
  if (stats.width !== PASTA_PROOF_VIEWPORT.width || stats.height !== PASTA_PROOF_VIEWPORT.height) {
    fail(`screenshot dimensions ${stats.width}x${stats.height} do not match fixed proof viewport ${PASTA_PROOF_VIEWPORT.width}x${PASTA_PROOF_VIEWPORT.height}`);
  }
  if (
    stats.uniqueColors < MINIMUM_UNIQUE_COLORS ||
    stats.lumaStandardDeviation < MINIMUM_LUMA_STANDARD_DEVIATION
  ) {
    fail(`screenshot appears blank or visually empty (colors=${stats.uniqueColors}, lumaStdDev=${stats.lumaStandardDeviation.toFixed(2)})`);
  }
  return stats;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertNoSensitiveKeys(value: unknown, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveKeys(entry, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (PROHIBITED_SIDECAR_KEYS.has(normalizedKey)) {
      fail(`${label}.${key} is prohibited in screenshot evidence`);
    }
    assertNoSensitiveKeys(child, `${label}.${key}`);
  }
}

function validateSidecarRecord(value: unknown): PastaProofScreenshotSidecar {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("screenshot sidecar must be an object");
  assertNoSensitiveKeys(value, "screenshot sidecar");
  const record = value as Record<string, unknown>;
  if (record.schema !== PASTA_PROOF_SCREENSHOT_SCHEMA) fail("screenshot sidecar schema is unsupported");
  if (typeof record.app !== "string" || slug(normalizeLabel(record.app, "sidecar app"), "sidecar app") !== record.app) {
    fail("screenshot sidecar app must be a canonical app slug");
  }
  if (typeof record.capability !== "string") fail("screenshot sidecar capability is missing");
  normalizeLabel(record.capability, "sidecar capability");
  if (!Number.isSafeInteger(record.stageOrdinal) || Number(record.stageOrdinal) < 1 || Number(record.stageOrdinal) > 999) {
    fail("screenshot sidecar stage ordinal is invalid");
  }
  if (typeof record.stageName !== "string") fail("screenshot sidecar stage name is missing");
  normalizeLabel(record.stageName, "sidecar stage name");
  if (typeof record.url !== "string" || sanitizeEvidenceUrl(record.url) !== record.url) {
    fail("screenshot sidecar URL is not safely redacted");
  }
  if (typeof record.timestampUtc !== "string") fail("screenshot sidecar UTC timestamp is missing");
  const timestamp = new Date(record.timestampUtc);
  if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== record.timestampUtc) {
    fail("screenshot sidecar UTC timestamp is not canonical ISO-8601");
  }
  const viewport = record.viewport;
  if (!viewport || typeof viewport !== "object" || Array.isArray(viewport)) fail("screenshot sidecar viewport is invalid");
  const viewportRecord = viewport as Record<string, unknown>;
  if (
    viewportRecord.width !== PASTA_PROOF_VIEWPORT.width ||
    viewportRecord.height !== PASTA_PROOF_VIEWPORT.height ||
    viewportRecord.deviceScaleFactor !== 1
  ) {
    fail("screenshot sidecar viewport does not match the fixed proof viewport");
  }
  if (typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    fail("screenshot sidecar SHA-256 is invalid");
  }
  if (!Number.isSafeInteger(record.byteCount) || Number(record.byteCount) < MINIMUM_SCREENSHOT_BYTES) {
    fail("screenshot sidecar byte count is invalid");
  }
  if (record.classification !== "UI-LIVE" && record.classification !== "UI-MOCK") {
    fail("screenshot sidecar classification is invalid");
  }
  if (!Array.isArray(record.domEvidence) || record.domEvidence.length === 0) {
    fail("screenshot sidecar DOM evidence is missing");
  }
  for (const [index, entry] of record.domEvidence.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail(`sidecar DOM evidence ${index} is invalid`);
    const evidence = entry as Record<string, unknown>;
    if (typeof evidence.selector !== "string") fail(`sidecar DOM evidence ${index} selector is missing`);
    validSelector(evidence.selector, `sidecar DOM evidence ${index} selector`);
    if (evidence.name !== undefined) {
      if (typeof evidence.name !== "string") fail(`sidecar DOM evidence ${index} name is invalid`);
      normalizeLabel(evidence.name, `sidecar DOM evidence ${index} name`);
    }
    if (!Number.isSafeInteger(evidence.matchCount) || Number(evidence.matchCount) < 1) {
      fail(`sidecar DOM evidence ${index} match count is invalid`);
    }
    if (
      !Number.isSafeInteger(evidence.selectedIndex) ||
      Number(evidence.selectedIndex) < 0 ||
      Number(evidence.selectedIndex) >= Number(evidence.matchCount)
    ) {
      fail(`sidecar DOM evidence ${index} selected index is invalid`);
    }
    if (typeof evidence.text !== "string" || evidence.text.length > MAX_EVIDENCE_TEXT_LENGTH) {
      fail(`sidecar DOM evidence ${index} text is invalid`);
    }
    assertNoSecrets(evidence.text, `sidecar DOM evidence ${index} text`);
  }
  return value as PastaProofScreenshotSidecar;
}

async function writeEvidencePair(
  pngPath: string,
  sidecarPath: string,
  pngBytes: Uint8Array,
  sidecarBytes: Uint8Array,
): Promise<void> {
  const token = `${process.pid}-${randomUUID()}`;
  const pngTemp = `${pngPath}.${token}.tmp`;
  const sidecarTemp = `${sidecarPath}.${token}.tmp`;
  let replacementStarted = false;
  try {
    await writeFile(pngTemp, pngBytes, { flag: "wx" });
    await writeFile(sidecarTemp, sidecarBytes, { flag: "wx" });
    replacementStarted = true;
    await Promise.all([rm(pngPath, { force: true }), rm(sidecarPath, { force: true })]);
    await rename(pngTemp, pngPath);
    await rename(sidecarTemp, sidecarPath);
  } catch (error) {
    const cleanup = [
      rm(pngTemp, { force: true }),
      rm(sidecarTemp, { force: true }),
    ];
    if (replacementStarted) cleanup.push(rm(pngPath, { force: true }), rm(sidecarPath, { force: true }));
    await Promise.all(cleanup);
    throw error;
  }
}

export async function capturePastaProofStage(
  input: CapturePastaProofStageInput,
): Promise<CapturePastaProofStageResult> {
  if (input.classification !== "UI-LIVE" && input.classification !== "UI-MOCK") {
    fail("classification must be UI-LIVE or UI-MOCK");
  }
  input.monitor.assertAttachedTo(input.page);
  if (typeof input.outputRoot !== "string" || !input.outputRoot.trim()) fail("output root is required");
  const app = slug(normalizeLabel(input.app, "app"), "app");
  const capability = normalizeLabel(input.capability, "capability");
  const stageName = normalizeLabel(input.stageName, "stage name");
  const filenameStem = deterministicScreenshotStem({
    capability,
    stageOrdinal: input.stageOrdinal,
    stageName,
  });
  const timeoutMs = input.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    fail("capture timeout must be an integer from 1000 through 120000 milliseconds");
  }
  const timestamp = (input.now ?? (() => new Date()))();
  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) fail("capture clock returned an invalid date");

  await input.page.setViewportSize(PASTA_PROOF_VIEWPORT);
  const waitForLoadState = input.waitForLoadState ?? "networkidle";
  if (waitForLoadState !== "none") await input.page.waitForLoadState(waitForLoadState, { timeout: timeoutMs });
  await input.page.emulateMedia({ reducedMotion: "reduce" });
  const deviceScaleFactor = await input.page.evaluate(() => window.devicePixelRatio);
  if (deviceScaleFactor !== 1) {
    fail(`browser deviceScaleFactor must be 1 for deterministic proof captures; received ${deviceScaleFactor}`);
  }

  assertMonitorClean(input.monitor);
  const redactionSelectors = (input.redactSelectors ?? []).map((selector, index) =>
    validSelector(selector, `redaction selector ${index + 1}`));
  const masks = await validateRedactionSelectors(input.page, redactionSelectors);
  await assertNoFatalSurface(input.page, input.fatalSelectors ?? [...DEFAULT_FATAL_SELECTORS]);
  const domEvidence = await collectDomEvidence(input.page, input.requiredEvidence, redactionSelectors);
  const pageText = await collectPageTextForSecretScan(input.page, redactionSelectors);
  assertNoSecrets(pageText, "rendered page text");
  const url = sanitizeEvidenceUrl(input.page.url());

  const pngBytes = await input.page.screenshot({
    type: "png",
    fullPage: false,
    animations: "disabled",
    caret: "hide",
    mask: masks,
    maskColor: "#202225",
    timeout: timeoutMs,
  });
  assertMonitorClean(input.monitor);
  validateScreenshotPng(pngBytes);

  const appDirectory = path.join(path.resolve(input.outputRoot), app);
  const pngPath = path.join(appDirectory, "screenshots", `${filenameStem}.png`);
  const sidecarPath = path.join(appDirectory, "artifacts", `screenshot-${filenameStem}.json`);
  const pngRelativePath = `screenshots/${filenameStem}.png`;
  const sidecarRelativePath = `artifacts/screenshot-${filenameStem}.json`;
  const sidecar: PastaProofScreenshotSidecar = {
    schema: PASTA_PROOF_SCREENSHOT_SCHEMA,
    app,
    capability,
    stageOrdinal: input.stageOrdinal,
    stageName,
    url,
    timestampUtc: timestamp.toISOString(),
    viewport: {
      width: PASTA_PROOF_VIEWPORT.width,
      height: PASTA_PROOF_VIEWPORT.height,
      deviceScaleFactor: 1,
    },
    sha256: sha256(pngBytes),
    byteCount: pngBytes.byteLength,
    domEvidence,
    classification: input.classification,
  };
  const sidecarBytes = Buffer.from(`${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
  const manifestScreenshot = {
    stage: boundedEvidenceId(filenameStem),
    path: pngRelativePath,
    sha256: sidecar.sha256,
    caption: `${app}: ${capability} — ${stageName}`,
  };
  const manifestSidecarArtifact = {
    id: boundedEvidenceId(`screenshot-sidecar-${filenameStem}`),
    kind: "screenshot-sidecar" as const,
    path: sidecarRelativePath,
    sha256: sha256(sidecarBytes),
  };

  await Promise.all([
    mkdir(path.dirname(pngPath), { recursive: true }),
    mkdir(path.dirname(sidecarPath), { recursive: true }),
  ]);
  await writeEvidencePair(pngPath, sidecarPath, pngBytes, sidecarBytes);
  input.monitor.reset();
  return {
    appDirectory,
    pngPath,
    sidecarPath,
    pngRelativePath,
    sidecarRelativePath,
    filenameStem,
    sidecar,
    manifestScreenshot,
    manifestSidecarArtifact,
  };
}

export async function verifyScreenshotSidecar(
  pngPath: string,
  sidecarPath: string,
): Promise<PastaProofScreenshotSidecar> {
  const [pngBytes, sidecarBytes] = await Promise.all([readFile(pngPath), readFile(sidecarPath, "utf8")]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(sidecarBytes);
  } catch {
    fail("screenshot sidecar is not valid JSON");
  }
  const sidecar = validateSidecarRecord(parsed);
  validateScreenshotPng(pngBytes);
  if (sidecar.sha256 !== sha256(pngBytes)) fail("screenshot sidecar SHA-256 does not match PNG bytes");
  if (sidecar.byteCount !== pngBytes.byteLength) fail("screenshot sidecar byte count does not match PNG bytes");
  const expectedStem = deterministicScreenshotStem({
    capability: sidecar.capability,
    stageOrdinal: sidecar.stageOrdinal,
    stageName: sidecar.stageName,
  });
  if (path.basename(pngPath) !== `${expectedStem}.png` || path.basename(path.dirname(pngPath)) !== "screenshots") {
    fail("screenshot PNG path does not match its sidecar stage identity");
  }
  if (
    path.basename(sidecarPath) !== `screenshot-${expectedStem}.json` ||
    path.basename(path.dirname(sidecarPath)) !== "artifacts"
  ) {
    fail("screenshot sidecar path does not match its stage identity");
  }
  assertNoSecrets(sidecarBytes, "screenshot sidecar");
  return sidecar;
}
