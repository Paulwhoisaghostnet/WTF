import { getNetwork, getRpcUrl } from "./loaders";

type ActivityStatus = "attempt" | "success" | "failure";

export interface ContractActivityContext {
  module: string;
  action: string;
  contractAddress?: string | null;
  entrypoint?: string | null;
  walletAddress?: string | null;
  params?: unknown;
}

function createInteractionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function serializeSafe(value: unknown): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function extractOpHash(result: unknown): string | null {
  if (typeof result === "string" && result.startsWith("op")) {
    return result;
  }
  if (
    typeof result === "object" &&
    result !== null &&
    "opHash" in result &&
    typeof (result as any).opHash === "string" &&
    (result as any).opHash.startsWith("op")
  ) {
    return (result as any).opHash;
  }
  return null;
}

async function sendActivity(payload: Record<string, unknown>) {
  try {
    await fetch("/api/contract-activity", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Do not block UX or contract execution if telemetry fails.
  }
}

export async function trackContractActivity<T>(
  context: ContractActivityContext,
  execute: () => Promise<T>
): Promise<T> {
  const interactionId = createInteractionId();
  const basePayload = {
    interactionId,
    module: context.module,
    action: context.action,
    contractAddress: context.contractAddress || null,
    entrypoint: context.entrypoint || null,
    walletAddress: context.walletAddress || null,
    network: getNetwork(),
    rpcUrl: getRpcUrl(),
    params: serializeSafe(context.params),
    clientTimestamp: new Date().toISOString(),
  };

  await sendActivity({
    ...basePayload,
    status: "attempt" satisfies ActivityStatus,
  });

  try {
    const result = await execute();
    await sendActivity({
      ...basePayload,
      status: "success" satisfies ActivityStatus,
      opHash: extractOpHash(result),
    });
    return result;
  } catch (err: any) {
    await sendActivity({
      ...basePayload,
      status: "failure" satisfies ActivityStatus,
      error: err?.message || String(err),
    });
    throw err;
  }
}
