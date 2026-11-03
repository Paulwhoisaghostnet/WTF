/** A funded contract flag alone cannot prove that an arbitrary FA2 moved an NFT.
 * Check the finalized funding operation, indexed token transfer, and current
 * escrow balance. Unindexed or nonstandard contracts stay verification-pending.
 * TzKT is an external indexer, so this is a fail-closed operational check,
 * rather than independent consensus verification of an arbitrary token ledger.
 */
import type { SponsorRecord } from "./sponsor-funding";

export type LotEvidence = {
  operationHash: string; operationLevel: number; tokenTransactionId: number;
  escrowBalance: string;
};
const indexer = { mainnet: "https://api.tzkt.io", shadownet: "https://api.shadownet.tzkt.io" } as const;
const addressOf = (value: any) => typeof value?.address === "string" ? value.address : "";
const hex = (value: unknown) => String(value || "").replace(/^0x/, "").toLowerCase();
const nat = (value: unknown) => typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) ? BigInt(value) : null;

export async function verifySponsorLotCustody(record: SponsorRecord, index: number,
  fundedLots: number[], finalizedLevel: number, fetcher: typeof fetch = fetch): Promise<LotEvidence | null> {
  const lot = record.plan.tokens[index];
  if (!lot || !fundedLots.includes(index) || !record.sponsor.walletAddress) return null;
  const observation = [...record.observations].reverse().find(value =>
    value.userId === record.sponsor.userId && value.action === `sponsorToken:${index}` &&
    /^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(value.operationHash));
  if (!observation) return null;
  const base = indexer[record.config.network];
  async function query(path: string, params?: URLSearchParams): Promise<any> {
    const response = await fetcher(base + path + (params ? `?${params}` : ""),
      { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`TzKT custody query failed: ${response.status}`);
    return response.json();
  }
  const operations = await query(`/v1/operations/transactions/${encodeURIComponent(observation.operationHash)}`);
  if (!Array.isArray(operations)) return null;
  const parent = operations.find(op => op.hash === observation.operationHash &&
    op.status === "applied" && Number.isSafeInteger(op.level) && op.level <= finalizedLevel &&
    addressOf(op.sender) === record.sponsor.walletAddress &&
    addressOf(op.target) === record.config.escrowContract &&
    op.parameter?.entrypoint === "fund_sponsor_lot" &&
    hex(op.parameter?.value?.room_id) === record.roomId &&
    Number(op.parameter?.value?.index) === index &&
    hex(op.parameter?.value?.expected_terms_hash) === record.termsHash);
  if (!parent) return null;
  const tokenCall = operations.find(op => op.hash === observation.operationHash &&
    op.status === "applied" && op.level === parent.level &&
    Number.isSafeInteger(op.id) && addressOf(op.sender) === record.config.escrowContract &&
    addressOf(op.target) === lot.contract && op.parameter?.entrypoint === "transfer");
  if (!tokenCall) return null;
  const transfers = await query("/v1/tokens/transfers", new URLSearchParams({
    transactionId: String(tokenCall.id), "token.contract": lot.contract,
    "token.tokenId": lot.tokenId, from: record.sponsor.walletAddress,
    to: record.config.escrowContract,
  }));
  if (!Array.isArray(transfers) || !transfers.some(transfer =>
    transfer.transactionId === tokenCall.id && transfer.level === parent.level &&
    addressOf(transfer.from) === record.sponsor.walletAddress &&
    addressOf(transfer.to) === record.config.escrowContract &&
    addressOf(transfer.token?.contract) === lot.contract &&
    String(transfer.token?.tokenId) === lot.tokenId && transfer.token?.standard === "fa2" &&
    nat(transfer.amount) !== null && nat(transfer.amount)! >= BigInt(lot.amount))) return null;
  const balances = await query("/v1/tokens/balances", new URLSearchParams({
    account: record.config.escrowContract, "token.contract": lot.contract,
    "token.tokenId": lot.tokenId,
  }));
  const required = record.plan.tokens.reduce((sum, candidate, candidateIndex) =>
    fundedLots.includes(candidateIndex) && candidate.contract === lot.contract &&
    candidate.tokenId === lot.tokenId ? sum + BigInt(candidate.amount) : sum, 0n);
  const balance = Array.isArray(balances) ? balances.find(item =>
    addressOf(item.account) === record.config.escrowContract &&
    addressOf(item.token?.contract) === lot.contract &&
    String(item.token?.tokenId) === lot.tokenId && item.token?.standard === "fa2") : null;
  if (!balance || nat(balance.balance) === null || nat(balance.balance)! < required) return null;
  return { operationHash: observation.operationHash, operationLevel: parent.level,
    tokenTransactionId: tokenCall.id, escrowBalance: String(balance.balance) };
}
