import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "pino";
import type { SignerEnv } from "./env";

export async function appendAuditLine(
  env: SignerEnv,
  logger: Logger,
  line: Record<string, unknown>
): Promise<void> {
  try {
    await mkdir(dirname(env.WTF_OPERATOR_SIGNER_AUDIT_LOG), {
      recursive: true,
    });
    await appendFile(
      env.WTF_OPERATOR_SIGNER_AUDIT_LOG,
      JSON.stringify({ ts: new Date().toISOString(), ...line }) + "\n"
    );
  } catch (err) {
    logger.warn({ err }, "audit log append failed");
  }
}
