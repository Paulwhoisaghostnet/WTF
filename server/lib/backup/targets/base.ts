export type BackupProducer =
  | {
      kind: "pg_dump";
      status: "ok";
      filename: string;
      filepath: string;
      bytes: number;
      sha256: string;
      createdAt: string;
    }
  | {
      kind: "fallback";
      status: "ok";
      sourceTarget: string;
      filename: string;
      filepath: string;
      bytes: number;
      sha256: string;
      createdAt: string;
    };

export type BackupTargetResult = {
  name: string;
  status: "ok" | "skipped" | "error";
  bytes: number;
  durationMs: number;
  sha256Match?: boolean;
  error?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type BackupTarget = {
  name: string;
  run(artifact: BackupProducer): Promise<BackupTargetResult>;
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function timedTarget(
  name: string,
  fn: () => Promise<Omit<BackupTargetResult, "name" | "durationMs">>
): Promise<BackupTargetResult> {
  const started = Date.now();
  try {
    return {
      name,
      durationMs: Date.now() - started,
      ...(await fn()),
    };
  } catch (error) {
    return {
      name,
      status: "error",
      bytes: 0,
      durationMs: Date.now() - started,
      error: errorMessage(error),
    };
  }
}
