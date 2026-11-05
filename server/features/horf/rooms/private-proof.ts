import { horfMainnetIndex } from "../mainnet-index";
import { isTezosWallet } from "../model";
import { type HorfPrivateOfferProof } from "../trade-offers";
import { UpstreamError } from "../../../lib/upstream";
import { assertHorfRoomsMainnet, type RoomChainReader } from "./chain";
import { requireHorfRoomsContractAddress } from "./config";

const OP_HASH_RE = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
export class HorfPrivateProofPendingError extends Error {}

interface TzktTransaction {
  id?: number;
  hash?: string;
  counter?: number;
  nonce?: number | null;
  status?: string;
  sender?: { address?: string };
  target?: { address?: string };
  parameter?: { entrypoint?: string; value?: unknown } | null;
}
interface TzktEvent {
  id?: number;
  transactionId?: number;
  contract?: { address?: string };
  tag?: string | null;
  payload?: unknown;
}

function nat(value: unknown): string | null {
  const raw = typeof value === "number" && Number.isSafeInteger(value) ? String(value)
    : typeof value === "string" ? value.trim() : "";
  return /^\d+$/.test(raw) ? BigInt(raw).toString() : null;
}

function parseEvent(
  event: TzktEvent, kind: HorfPrivateOfferProof["kind"],
  contractAddress: string, operationHash: string, rootSender: string,
): HorfPrivateOfferProof | null {
  if (!Number.isSafeInteger(event.id) || !Number.isSafeInteger(event.transactionId) ||
      event.contract?.address !== contractAddress || event.tag !== kind ||
      !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return null;
  const value = event.payload as Record<string, unknown>;
  const listingId = nat(value.listing_id);
  const ownerAddress = String(value.owner || "");
  if (listingId === null || !isTezosWallet(ownerAddress)) return null;
  const base = { kind, chainId: "NetXdQprcVkpaWU", contractAddress,
    operationHash, listingId, ownerAddress } as const;
  if (kind === "horse_cancelled") {
    if (ownerAddress !== rootSender) return null;
    return { ...base, mode: Number(nat(value.mode)), amount: nat(value.amount) ?? undefined };
  }
  const offererAddress = String(kind === "private_offer_escrowed" ? value.offerer : value.claimant || "");
  const outputTokenContract = String(value.output_contract || "");
  const inputTokenContract = String(value.input_contract || "");
  const outputTokenId = nat(value.output_id);
  const inputTokenId = nat(value.input_id);
  if (!isTezosWallet(offererAddress) || !KT1_RE.test(outputTokenContract) ||
      !KT1_RE.test(inputTokenContract) || outputTokenId === null || inputTokenId === null ||
      (kind === "private_offer_escrowed" ? ownerAddress : offererAddress) !== rootSender) return null;
  return { ...base, offererAddress, outputTokenContract, outputTokenId,
    inputTokenContract, inputTokenId };
}

/** A wallet op hash is accepted only when its applied V3 transaction emitted the matching event. */
export async function verifyHorfPrivateOfferEvent(
  operationHash: string, kind: HorfPrivateOfferProof["kind"],
  reader: RoomChainReader = horfMainnetIndex,
): Promise<HorfPrivateOfferProof | null> {
  if (!OP_HASH_RE.test(operationHash)) return null;
  const contractAddress = requireHorfRoomsContractAddress();
  await assertHorfRoomsMainnet(reader);
  let rows: TzktTransaction[];
  try { rows = await reader.getJson<TzktTransaction[]>(`/operations/transactions/${operationHash}`); }
  catch (error) {
    if (error instanceof UpstreamError && error.status === 404) {
      throw new HorfPrivateProofPendingError("The Mainnet operation has not indexed yet");
    }
    throw error;
  }
  if (!Array.isArray(rows) || !rows.length) throw new HorfPrivateProofPendingError("The Mainnet operation has not indexed yet");
  const entrypoint = kind === "private_offer_escrowed" ? "create_private_offer"
    : kind === "private_offer_fulfilled" ? "fulfill_private_offer" : "cancel";
  const roots = rows.filter((row) => row.hash === operationHash && row.status === "applied" &&
    row.nonce == null && row.target?.address === contractAddress &&
    row.parameter?.entrypoint === entrypoint && isTezosWallet(row.sender?.address) &&
    Number.isSafeInteger(row.counter));
  const proofs: HorfPrivateOfferProof[] = [];
  let indexedEvents = 0;
  for (const root of roots) {
    const candidates = rows.filter((row) => row.hash === operationHash && row.status === "applied" &&
      row.counter === root.counter && row.target?.address === contractAddress &&
      Number.isSafeInteger(row.id));
    for (const candidate of candidates) {
      const events = await reader.getJson<TzktEvent[]>("/contracts/events", {
        contract: contractAddress, tag: kind, transactionId: candidate.id, limit: 2,
      });
      if (!Array.isArray(events)) throw new Error("Horf private escrow events are unavailable");
      for (const event of events) {
        if (event.transactionId !== candidate.id) continue;
        indexedEvents++;
        const proof = parseEvent(event, kind, contractAddress, operationHash, root.sender!.address!);
        if (proof) proofs.push(proof);
      }
    }
  }
  if (roots.length && !indexedEvents) throw new HorfPrivateProofPendingError("The horse escrow event has not indexed yet");
  return proofs.length === 1 ? proofs[0]! : null;
}
