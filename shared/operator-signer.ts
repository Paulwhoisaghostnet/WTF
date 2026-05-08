import { z } from "zod";

export const OPERATOR_SIGNER_PROTOCOL_VERSION = 1 as const;

export const tezosAddressSchema = z
  .string()
  .regex(/^(tz[1-3]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/);

export const tezosContractAddressSchema = z
  .string()
  .regex(/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/);

export const platformWalletIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const platformWalletRoleSchema = z.enum([
  "platform_root",
  "operator",
  "arcade_treasury",
  "domain_controller",
  "reward_disburser",
  "buyback_operator",
  "contract_admin",
  "testing",
  "custom",
]);

export const platformWalletNetworkSchema = z.enum([
  "mainnet",
  "ghostnet",
  "shadownet",
  "custom",
]);

export const platformWalletPublicSchema = z.object({
  id: platformWalletIdSchema,
  label: z.string().min(1).max(120),
  role: platformWalletRoleSchema,
  network: platformWalletNetworkSchema,
  address: tezosAddressSchema,
  publicKey: z.string().min(1).optional(),
  chainId: z.string().min(1).max(64).optional(),
  did: z
    .string()
    .regex(/^did:pkh:tezos:[^:]+:tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/)
    .optional(),
  source: z.enum(["keyring", "legacy_env"]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type PlatformWalletRole = z.infer<typeof platformWalletRoleSchema>;
export type PlatformWalletNetwork = z.infer<typeof platformWalletNetworkSchema>;
export type PlatformWalletPublic = z.infer<typeof platformWalletPublicSchema>;

export const operatorSignerIntentSchema = z.enum([
  "health",
  "list_platform_wallets",
  "create_platform_wallet",
  "disburse_wtf",
  "fund_buyback",
  "withdraw_buyback_xtz",
  "withdraw_buyback_wtf",
  "pause_buyback",
  "unpause_buyback",
  "custom",
]);

export type OperatorSignerIntent = z.infer<typeof operatorSignerIntentSchema>;

export const operatorSignerFa2TransferPayloadSchema = z.object({
  tokenContract: tezosContractAddressSchema,
  tokenId: z.coerce.number().int().min(0),
  transfers: z
    .array(
      z.object({
        to: tezosAddressSchema,
        amount: z.string().regex(/^[0-9]+$/),
      })
    )
    .min(1),
});

export const operatorSignerXtzTransferPayloadSchema = z.object({
  to: tezosAddressSchema,
  mutez: z.coerce.number().int().min(1),
});

export const operatorSignerContractCallPayloadSchema = z.object({
  contract: tezosContractAddressSchema,
  entrypoint: z.string().min(1).max(120),
  args: z.unknown().optional().nullable(),
  mutez: z.coerce.number().int().min(0).default(0),
});

const operatorSignerEnvelopeBaseSchema = z.object({
  version: z.literal(OPERATOR_SIGNER_PROTOCOL_VERSION),
  auth: z.string().min(1),
  requestId: z.string().min(1).max(128),
  runId: z.string().min(1).max(128).optional(),
  walletId: platformWalletIdSchema.optional(),
});

export const operatorSignerHealthEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("health"),
    payload: z.object({}).default({}),
  });

export const operatorSignerListPlatformWalletsEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("list_platform_wallets"),
    payload: z.object({}).default({}),
  });

export const operatorSignerCreatePlatformWalletEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("create_platform_wallet"),
    payload: z.object({
      id: platformWalletIdSchema,
      label: z.string().trim().min(1).max(120),
      role: platformWalletRoleSchema.default("custom"),
      network: platformWalletNetworkSchema.default("mainnet"),
    }),
  });

export const operatorSignerDisburseEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("disburse_wtf"),
    payload: operatorSignerFa2TransferPayloadSchema,
  });

export const operatorSignerFundBuybackEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("fund_buyback"),
    payload: operatorSignerContractCallPayloadSchema,
  });

export const operatorSignerWithdrawBuybackXtzEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("withdraw_buyback_xtz"),
    payload: operatorSignerContractCallPayloadSchema,
  });

export const operatorSignerWithdrawBuybackWtfEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("withdraw_buyback_wtf"),
    payload: operatorSignerContractCallPayloadSchema,
  });

export const operatorSignerPauseBuybackEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("pause_buyback"),
    payload: operatorSignerContractCallPayloadSchema,
  });

export const operatorSignerUnpauseBuybackEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("unpause_buyback"),
    payload: operatorSignerContractCallPayloadSchema,
  });

export const operatorSignerCustomEnvelopeSchema =
  operatorSignerEnvelopeBaseSchema.extend({
    intent: z.literal("custom"),
    payload: operatorSignerContractCallPayloadSchema,
  });

export const operatorSignerEnvelopeSchema = z.discriminatedUnion("intent", [
  operatorSignerHealthEnvelopeSchema,
  operatorSignerListPlatformWalletsEnvelopeSchema,
  operatorSignerCreatePlatformWalletEnvelopeSchema,
  operatorSignerDisburseEnvelopeSchema,
  operatorSignerFundBuybackEnvelopeSchema,
  operatorSignerWithdrawBuybackXtzEnvelopeSchema,
  operatorSignerWithdrawBuybackWtfEnvelopeSchema,
  operatorSignerPauseBuybackEnvelopeSchema,
  operatorSignerUnpauseBuybackEnvelopeSchema,
  operatorSignerCustomEnvelopeSchema,
]);

export type OperatorSignerEnvelope = z.infer<
  typeof operatorSignerEnvelopeSchema
>;
export type OperatorSignerFa2TransferPayload = z.infer<
  typeof operatorSignerFa2TransferPayloadSchema
>;
export type OperatorSignerXtzTransferPayload = z.infer<
  typeof operatorSignerXtzTransferPayloadSchema
>;
export type OperatorSignerContractCallPayload = z.infer<
  typeof operatorSignerContractCallPayloadSchema
>;

export const operatorSignerSuccessResponseSchema = z.object({
  ok: z.literal(true),
  version: z.literal(OPERATOR_SIGNER_PROTOCOL_VERSION),
  requestId: z.string().optional(),
  intent: operatorSignerIntentSchema.optional(),
  opHash: z.string().optional(),
  signedBy: tezosAddressSchema.optional(),
  rawIntent: operatorSignerIntentSchema.optional(),
  level: z.number().optional(),
  keyringConfigured: z.boolean().optional(),
  wallet: platformWalletPublicSchema.optional(),
  wallets: z.array(platformWalletPublicSchema).optional(),
});

export const operatorSignerErrorResponseSchema = z.object({
  ok: z.literal(false),
  version: z.literal(OPERATOR_SIGNER_PROTOCOL_VERSION).optional(),
  requestId: z.string().optional(),
  error: z.string(),
  code: z.string(),
});

export const operatorSignerResponseSchema = z.union([
  operatorSignerSuccessResponseSchema,
  operatorSignerErrorResponseSchema,
]);

export type OperatorSignerResponse = z.infer<
  typeof operatorSignerResponseSchema
>;

export const OPERATOR_BUYBACK_ENTRYPOINT_BY_INTENT = {
  fund_buyback: "fund_xtz",
  withdraw_buyback_xtz: "withdraw_leftover_xtz",
  withdraw_buyback_wtf: "withdraw_accumulated_wtf",
  pause_buyback: "pause",
  unpause_buyback: "unpause",
} as const;

export function isOperatorSignerContractCallIntent(
  intent: OperatorSignerIntent
): intent is keyof typeof OPERATOR_BUYBACK_ENTRYPOINT_BY_INTENT | "custom" {
  return (
    intent === "fund_buyback" ||
    intent === "withdraw_buyback_xtz" ||
    intent === "withdraw_buyback_wtf" ||
    intent === "pause_buyback" ||
    intent === "unpause_buyback" ||
    intent === "custom"
  );
}
