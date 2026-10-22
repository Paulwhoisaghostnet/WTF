import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { OperatorSignerEnvelope, OperatorSignerResponse } from "../../../shared/operator-signer";
import { refuse } from "./policy";

type Envelope = Extract<OperatorSignerEnvelope, { intent: "wtfiap_escrow" }>;
type Entry = { payloadHash: string; attemptedAt: string; response?: OperatorSignerResponse };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
async function syncDir(path: string): Promise<void> {
  const directory = await open(path, "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

/** The journal contains no auth token, key material or reusable signature.
 * A checkpoint precedes the irreversible send. Ambiguous sends never resend.
 * An exact duplicate returns its durable hash; reconciliation owns applied status.
 */
export async function journalWtfIapSend(
  directory: string, envelope: Envelope, send: () => Promise<OperatorSignerResponse>,
): Promise<OperatorSignerResponse> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const key = hash(`${envelope.intent}:${envelope.requestId}`);
  const file = join(directory, `${key}.json`);
  const payloadHash = hash(canonical({ walletId: envelope.walletId, payload: envelope.payload }));
  let handle;
  try { handle = await open(file, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // A partial/corrupt record is not evidence that a send did not occur.
    let existing: Entry;
    try { existing = JSON.parse(await readFile(file, "utf8")); }
    catch { return refuse("WTFIAP journal needs operator reconciliation", "WTFIAP_JOURNAL_UNREADABLE", envelope.requestId); }
    if (existing.payloadHash !== payloadHash) return refuse("Request ID reused with different WTFIAP terms", "WTFIAP_INTENT_CONFLICT", envelope.requestId);
    return existing.response ?? refuse("WTFIAP submission outcome is unknown; reconcile on-chain before any new intent", "WTFIAP_SUBMISSION_UNKNOWN", envelope.requestId);
  }
  const entry: Entry = { payloadHash, attemptedAt: new Date().toISOString() };
  try { await handle.writeFile(JSON.stringify(entry)); await handle.sync(); }
  finally { await handle.close(); }
  await syncDir(directory);
  // Do not catch and turn send errors into retry permission. The checkpoint remains.
  const response = await send();
  const temporary = join(directory, `${key}.${randomUUID()}.tmp`);
  const output = await open(temporary, "wx", 0o600);
  try { await output.writeFile(JSON.stringify({ ...entry, response })); await output.sync(); }
  finally { await output.close(); }
  await rename(temporary, file);
  await syncDir(directory);
  return response;
}

/** The single service process serializes a wallet's submissions. Cross-process
 * replay safety is independently enforced by the exclusive journal checkpoint.
 */
export class WtfIapSigningQueue {
  private queues = new Map<string, Promise<unknown>>();
  run<T>(walletId: string, work: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(walletId) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(work);
    this.queues.set(walletId, next);
    void next.finally(() => { if (this.queues.get(walletId) === next) this.queues.delete(walletId); }).catch(() => undefined);
    return next;
  }
}
