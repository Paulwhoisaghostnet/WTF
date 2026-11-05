import { and, desc, eq } from "drizzle-orm";
import { db, pool } from "../../db";
import { horfInspectionApprovals, horfOpenRangeOffers, horfTradeOfferMessages } from "@shared/schema";
import { isTezosWallet } from "./model";
import { assertCurrentOwner } from "./inspections";
import { inspectHorseToken } from "./stables/eligibility";
import { HORF_MAINNET_CHAIN_ID } from "./stables/config";
import { requireHorfRoomsContractAddress } from "./rooms/config";

const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const OP_HASH_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const NAT_RE = /^\d+$/;

export class HorfTradeOfferError extends Error {
  constructor(public statusCode: 400 | 404 | 409 | 422, message: string) { super(message); }
}

export interface HorfTradeOfferProposal {
  offererAddress: string;
  signId: number;
  offeredTokenContract: string;
  offeredTokenId: string;
  message: string | null;
}

type OfferRow = typeof horfTradeOfferMessages.$inferSelect;
type SignRow = typeof horfOpenRangeOffers.$inferSelect;

function positiveId(value: unknown): number | null {
  const number = typeof value === "number" ? value :
    typeof value === "string" && NAT_RE.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function parseHorfTradeOfferProposal(value: unknown): HorfTradeOfferProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const signId = positiveId(input.signId);
  if (!isTezosWallet(input.offererAddress) || signId === null ||
      typeof input.offeredTokenContract !== "string" || !KT1_RE.test(input.offeredTokenContract) ||
      typeof input.offeredTokenId !== "string" || !NAT_RE.test(input.offeredTokenId) ||
      (input.amount !== undefined && input.amount !== 1 && input.amount !== "1") ||
      (input.quantity !== undefined && input.quantity !== 1 && input.quantity !== "1") ||
      (input.message !== undefined && input.message !== null && typeof input.message !== "string")) return null;
  return {
    offererAddress: input.offererAddress,
    signId,
    offeredTokenContract: input.offeredTokenContract,
    offeredTokenId: BigInt(input.offeredTokenId).toString(),
    message: typeof input.message === "string" ? input.message.trim() || null : null,
  };
}

export function validateHorfTradeOfferProposal(proposal: HorfTradeOfferProposal, sign: SignRow): void {
  if (!sign.active || sign.id !== proposal.signId || !NAT_RE.test(sign.amount) || BigInt(sign.amount) === 0n) {
    throw new HorfTradeOfferError(409, "This horse is no longer available for trade");
  }
  if (sign.ownerWalletAddress === proposal.offererAddress) {
    throw new HorfTradeOfferError(422, "Choose another trader's horse");
  }
  if (sign.tokenContract === proposal.offeredTokenContract && sign.tokenId === proposal.offeredTokenId) {
    throw new HorfTradeOfferError(422, "Offer a different horse from the one you want");
  }
}

function offerDto(row: OfferRow, signActive: boolean) {
  return {
    id: row.id,
    signId: row.signId,
    offererAddress: row.offererWalletAddress,
    ownerAddress: row.ownerWalletAddress,
    requestedTokenContract: row.requestedTokenContract,
    requestedTokenId: row.requestedTokenId,
    offeredTokenContract: row.offeredTokenContract,
    offeredTokenId: row.offeredTokenId,
    message: row.message,
    status: row.status,
    declineReason: row.declineReason,
    cancelledByWalletAddress: row.cancelledByWalletAddress,
    privateListingId: row.privateListingId,
    acceptOperationHash: row.acceptOperationHash,
    fulfillOperationHash: row.fulfillOperationHash,
    cancelOperationHash: row.cancelOperationHash,
    signActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getHorfTradeOffer(id: number) {
  const [row] = await db.select({ offer: horfTradeOfferMessages, sign: horfOpenRangeOffers })
    .from(horfTradeOfferMessages)
    .innerJoin(horfOpenRangeOffers, eq(horfTradeOfferMessages.signId, horfOpenRangeOffers.id))
    .where(eq(horfTradeOfferMessages.id, id)).limit(1);
  return row ? offerDto(row.offer, row.sign.active) : null;
}

export async function listHorfTradeOffers(address: string, box: "incoming" | "outgoing") {
  const rows = await db.select({ offer: horfTradeOfferMessages, sign: horfOpenRangeOffers })
    .from(horfTradeOfferMessages)
    .innerJoin(horfOpenRangeOffers, eq(horfTradeOfferMessages.signId, horfOpenRangeOffers.id))
    .where(box === "incoming" ? eq(horfTradeOfferMessages.ownerWalletAddress, address)
      : eq(horfTradeOfferMessages.offererWalletAddress, address))
    .orderBy(desc(horfTradeOfferMessages.createdAt), desc(horfTradeOfferMessages.id));
  return rows.map((row) => offerDto(row.offer, row.sign.active));
}

/** One-edition proposal: the token remains in the offerer's wallet until V3 escrow is confirmed. */
export async function createHorfTradeOffer(proposal: HorfTradeOfferProposal) {
  const [sign] = await db.select().from(horfOpenRangeOffers)
    .where(eq(horfOpenRangeOffers.id, proposal.signId)).limit(1);
  if (!sign) throw new HorfTradeOfferError(404, "Horse availability sign not found");
  validateHorfTradeOfferProposal(proposal, sign);

  await Promise.all([
    assertCurrentOwner(proposal.offererAddress, proposal.offeredTokenContract, proposal.offeredTokenId),
    assertCurrentOwner(sign.ownerWalletAddress, sign.tokenContract, sign.tokenId),
    inspectHorseToken(proposal.offeredTokenContract, proposal.offeredTokenId),
    inspectHorseToken(sign.tokenContract, sign.tokenId),
  ]);
  if (sign.acceptedTokenPolicy === "marshal_only") {
    const [approval] = await db.select({ tokenId: horfInspectionApprovals.tokenId })
      .from(horfInspectionApprovals).where(and(
        eq(horfInspectionApprovals.tokenContract, proposal.offeredTokenContract),
        eq(horfInspectionApprovals.tokenId, proposal.offeredTokenId),
        eq(horfInspectionApprovals.active, true))).limit(1);
    if (!approval) throw new HorfTradeOfferError(422, "This rider accepts Marshal approved horses only");
  }

  // Recheck the sign and its policy in the INSERT to prevent a stale browser
  // from creating a proposal after the owner removes or changes it.
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.horf_trade_offer_messages (
       sign_id, offerer_wallet_address, owner_wallet_address,
       requested_token_contract, requested_token_id,
       offered_token_contract, offered_token_id, message
     )
     SELECT id, $2, owner_wallet_address, token_contract, token_id, $3, $4, $5
       FROM public.horf_open_range_offers
      WHERE id = $1 AND active = true AND accepted_token_policy = $6
        AND owner_wallet_address = $7 AND token_contract = $8 AND token_id = $9
     ON CONFLICT DO NOTHING RETURNING id`,
    [proposal.signId, proposal.offererAddress, proposal.offeredTokenContract,
      proposal.offeredTokenId, proposal.message, sign.acceptedTokenPolicy,
      sign.ownerWalletAddress, sign.tokenContract, sign.tokenId],
  );
  const id = Number(result.rows[0]?.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HorfTradeOfferError(409, "This horse changed or you already sent this offer");
  }
  const offer = await getHorfTradeOffer(id);
  if (!offer) throw new Error("Saved horse offer could not be read");
  return offer;
}

export async function respondToHorfTradeOffer(
  id: number, actor: string, action: "decline" | "cancel", reason: string | null = null,
) {
  const field = action === "decline" ? "owner_wallet_address" : "offerer_wallet_address";
  const status = action === "decline" ? "declined" : "cancelled";
  const result = await pool.query<{ id: string }>(
    `UPDATE public.horf_trade_offer_messages
        SET status = $3, decline_reason = CASE WHEN $3 = 'declined' THEN $4 ELSE decline_reason END,
            cancelled_by_wallet_address = CASE WHEN $3 = 'cancelled' THEN $2 ELSE cancelled_by_wallet_address END,
            updated_at = now()
      WHERE id = $1 AND ${field} = $2 AND status = 'proposed' AND private_listing_id IS NULL
      RETURNING id`, [id, actor, status, reason],
  );
  if (!result.rows.length) throw new HorfTradeOfferError(409, "This offer can no longer be changed here");
  const offer = await getHorfTradeOffer(id);
  if (!offer) throw new Error("Updated horse offer could not be read");
  return offer;
}

export interface HorfPrivateOfferProof {
  kind: "private_offer_escrowed" | "private_offer_fulfilled" | "horse_cancelled";
  chainId: string;
  contractAddress: string;
  operationHash: string;
  listingId: string;
  ownerAddress: string;
  offererAddress?: string;
  outputTokenContract?: string;
  outputTokenId?: string;
  inputTokenContract?: string;
  inputTokenId?: string;
  mode?: number;
  amount?: string;
}

export type HorfPrivateOfferProofVerifier = (
  operationHash: string, kind: HorfPrivateOfferProof["kind"],
) => Promise<HorfPrivateOfferProof | null>;

/** The caller must fetch a confirmed Mainnet operation/event; a hash alone proves nothing. */
export function privateOfferProofMatches(
  offer: Pick<OfferRow, "ownerWalletAddress" | "offererWalletAddress" | "requestedTokenContract" |
    "requestedTokenId" | "offeredTokenContract" | "offeredTokenId" | "privateListingId">,
  proof: HorfPrivateOfferProof,
  expectedKind: HorfPrivateOfferProof["kind"],
  expectedHash: string,
  roomsContract: string,
): boolean {
  if (!OP_HASH_RE.test(expectedHash) || proof.operationHash !== expectedHash || proof.kind !== expectedKind ||
      proof.chainId !== HORF_MAINNET_CHAIN_ID || proof.contractAddress !== roomsContract ||
      !NAT_RE.test(proof.listingId) ||
      proof.ownerAddress !== offer.ownerWalletAddress) return false;
  if (offer.privateListingId !== null && proof.listingId !== offer.privateListingId) return false;
  if (expectedKind === "horse_cancelled") {
    return proof.mode === 3 && proof.amount === "1" && offer.privateListingId !== null;
  }
  return proof.offererAddress === offer.offererWalletAddress &&
    proof.outputTokenContract === offer.requestedTokenContract &&
    proof.outputTokenId === offer.requestedTokenId &&
    proof.inputTokenContract === offer.offeredTokenContract &&
    proof.inputTokenId === offer.offeredTokenId;
}

/** Server-only hook: never expose a route that accepts client-supplied proof fields. */
export async function confirmHorfPrivateOfferEvent(
  id: number, operationHash: string, kind: HorfPrivateOfferProof["kind"],
  verify: HorfPrivateOfferProofVerifier,
) {
  if (!Number.isSafeInteger(id) || id <= 0 || !OP_HASH_RE.test(operationHash)) {
    throw new HorfTradeOfferError(400, "Choose a valid horse offer and operation");
  }
  const [row] = await db.select().from(horfTradeOfferMessages)
    .where(eq(horfTradeOfferMessages.id, id)).limit(1);
  if (!row) throw new HorfTradeOfferError(404, "Horse offer not found");
  const proof = await verify(operationHash, kind);
  if (!proof || !privateOfferProofMatches(row, proof, kind, operationHash, requireHorfRoomsContractAddress())) {
    throw new HorfTradeOfferError(422, "Confirmed Mainnet escrow evidence does not match this exact horse offer");
  }
  if (kind === "private_offer_escrowed") {
    if (row.acceptOperationHash === operationHash && row.privateListingId === proof.listingId) {
      return getHorfTradeOffer(id);
    }
    // A confirmed escrow can race a local decline/cancellation. Chain custody
    // wins so the rider still sees and can recover the locked edition.
    const updated = await pool.query(
      `UPDATE public.horf_trade_offer_messages
          SET status = 'accepted', private_listing_id = $2, accept_operation_hash = $3, updated_at = now()
        WHERE id = $1 AND private_listing_id IS NULL AND status IN ('proposed', 'declined', 'cancelled')
        RETURNING id`, [id, proof.listingId, operationHash],
    );
    if (!updated.rows.length) throw new HorfTradeOfferError(409, "This offer already has different escrow evidence");
  } else if (kind === "private_offer_fulfilled") {
    if (row.fulfillOperationHash === operationHash && row.status === "fulfilled") return getHorfTradeOffer(id);
    const updated = await pool.query(
      `UPDATE public.horf_trade_offer_messages
          SET status = 'fulfilled', fulfill_operation_hash = $3, updated_at = now()
        WHERE id = $1 AND private_listing_id = $2 AND accept_operation_hash IS NOT NULL
          AND status = 'accepted' RETURNING id`, [id, proof.listingId, operationHash],
    );
    if (!updated.rows.length) throw new HorfTradeOfferError(409, "This offer has no matching open private escrow");
  } else {
    if (row.cancelOperationHash === operationHash && row.status === "cancelled") return getHorfTradeOffer(id);
    const updated = await pool.query(
      `UPDATE public.horf_trade_offer_messages
          SET status = 'cancelled', cancel_operation_hash = $3,
              cancelled_by_wallet_address = owner_wallet_address, updated_at = now()
        WHERE id = $1 AND private_listing_id = $2 AND accept_operation_hash IS NOT NULL
          AND status = 'accepted' RETURNING id`, [id, proof.listingId, operationHash],
    );
    if (!updated.rows.length) throw new HorfTradeOfferError(409, "This offer has no matching open private escrow");
  }
  const offer = await getHorfTradeOffer(id);
  if (!offer) throw new Error("Updated horse offer could not be read");
  return offer;
}
