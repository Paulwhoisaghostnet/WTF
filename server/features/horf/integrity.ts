/** Horf-wide community exclusions, kept separate from immutable source history. */
const AUDITED_NEIGHWATCH_DROP_OPERATIONS = new Set([
  "onygheNzGzMVoPCJ5CT3MYMDX7V4hPKXgiw39zUD1LpG8LbdWgT", // 30 recipients
  "onpeyzWvKBXjaE5CHHmnnfts1WNyC7GyE1k8fi4fYEHCLhSMz9j", // 180 recipients
  "ooLFLfj1hRZsrQrQxXTVXPuFGRfNGn1TPF9XXXRY37frh4emkSF", // 90 recipients
]);
const AUDITED_NEIGHWATCH_TOKEN = {
  contract: "KT1Wnvs5gHZZrgBPDBTcdFHYVfnd1xdupxE2",
  tokenId: "7",
};

/** Community-confirmed FA2 contracts that Horf excludes from discovery and all scoring. */
export const HORF_BLOCKED_FA2_CONTRACTS: ReadonlySet<string> = new Set([
  "KT197dhTw8LfwtfpVnBYyES24xf2rZAazSuh",
]);

export function isHorfBlockedContract(contract: unknown): contract is string {
  return typeof contract === "string" && HORF_BLOCKED_FA2_CONTRACTS.has(contract);
}

// This recipient had originated Tezos transactions years before the drop.
// Their leg remains countable under the community's active-wallet rule.
const PRIOR_ACTIVE_RECIPIENTS = new Set([
  "tz1a15Ur2y3fkKzM6yPnVgWx2yd57D4QM61J",
]);

export const HORF_AUDITED_DROP_EXCLUSION_REASON =
  "Excluded from HORF scoring: this batch went to wallets with no prior originated Tezos transactions.";

export function horfExcludedTransferReason(
  operationHash: string | null | undefined,
  recipientAddress: string,
  tokenContract: string,
  tokenId: string,
): string | null {
  if (!operationHash || !AUDITED_NEIGHWATCH_DROP_OPERATIONS.has(operationHash) ||
      tokenContract !== AUDITED_NEIGHWATCH_TOKEN.contract || tokenId !== AUDITED_NEIGHWATCH_TOKEN.tokenId ||
      PRIOR_ACTIVE_RECIPIENTS.has(recipientAddress)) return null;
  return HORF_AUDITED_DROP_EXCLUSION_REASON;
}
