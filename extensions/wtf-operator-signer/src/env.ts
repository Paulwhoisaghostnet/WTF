import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  WTF_OPERATOR_SIGNER_RPC: z.string().url(),
  WTF_OPERATOR_SIGNER_SOCKET: z.string().min(1),
  WTF_OPERATOR_SIGNER_AUTH_TOKEN: z.string().min(12),
  WTF_OPERATOR_SIGNER_SECRET: z.string().min(10),
  WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
    ),
  WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ: z.coerce
    .number()
    .int()
    .min(0)
    .default(100_000_000),
  WTF_OPERATOR_SIGNER_MAX_RECIPIENTS: z.coerce
    .number()
    .int()
    .min(1)
    .default(200),
  WTF_OPERATOR_SIGNER_ALLOW_CUSTOM: z.coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(0),
  WTF_OPERATOR_SIGNER_AUDIT_LOG: z
    .string()
    .default("/var/log/wtf/operator-signer.log"),
});

export type SignerEnv = z.infer<typeof schema>;

export function loadEnv(): SignerEnv {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid signer env: ${issues}`);
  }
  return parsed.data;
}
