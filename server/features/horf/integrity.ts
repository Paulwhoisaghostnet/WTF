/**
 * Transaction-level corrections from a documented, exact-chain audit.
 * These do not block wallets or alter source history; they only remove the
 * listed recipient legs from Horf's race, obligation, and reward calculations.
 */
const AUDITED_NEIGHWATCH_DROP_OPERATIONS = new Set([
  "onygheNzGzMVoPCJ5CT3MYMDX7V4hPKXgiw39zUD1LpG8LbdWgT", // 30 recipients
  "onpeyzWvKBXjaE5CHHmnnfts1WNyC7GyE1k8fi4fYEHCLhSMz9j", // 180 recipients
  "ooLFLfj1hRZsrQrQxXTVXPuFGRfNGn1TPF9XXXRY37frh4emkSF", // 90 recipients
]);
const AUDITED_NEIGHWATCH_TOKEN = {
  contract: "KT1Wnvs5gHZZrgBPDBTcdFHYVfnd1xdupxE2",
  tokenId: "7",
};

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
