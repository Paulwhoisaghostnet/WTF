import { ingestSystemEvent } from "../../challenges/events/ingest";

export type CrpEventActor = "browser" | "mcp";

export type CrpEventInput = {
  eventType: string;
  userId: number;
  actor?: CrpEventActor;
  rawRefType?: string;
  rawRefId?: string;
  metadata?: Record<string, unknown>;
  mcpTokenPrefix?: string | null;
  mcpToolName?: string | null;
};

export function emitCrpNominationEvent(input: CrpEventInput): void {
  const actor = input.actor ?? "browser";
  void ingestSystemEvent({
    eventType: input.eventType,
    userId: input.userId,
    source: actor === "mcp" ? "mcp" : "crp-nominations",
    sourceModule: actor === "mcp" ? "wtf-mcp" : "crp-nominations",
    rawRefType: input.rawRefType ?? "crp_nomination",
    rawRefId: input.rawRefId ?? String(input.userId),
    metadata: {
      actor,
      agentActingOnBehalfOfUser: actor === "mcp",
      mcpTokenPrefix: input.mcpTokenPrefix ?? null,
      mcpToolName: input.mcpToolName ?? null,
      ...(input.metadata ?? {}),
    },
  }).catch((err) => {
    console.warn("[crp-nominations] failed to emit event:", err);
  });
}
