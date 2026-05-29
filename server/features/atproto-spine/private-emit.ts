import { getSpineConfig, isSpineEnabled } from "./config";
import { PRIVATE_MESSAGE_COLLECTION, publishPrivateRecord } from "./private-pds";

/**
 * DM / private-room → private PDS emission (S4.4). Additively mirrors direct messages into
 * the dedicated, non-federated private PDS (private.wtfos.me) as CLIENT-ENCRYPTED envelopes,
 * WITHOUT changing the DM feature's behavior. Best-effort + flag-gated, and a no-op unless a
 * private repo + credentials are configured (so it stays dormant until private PDS is wired).
 *
 * The rkey/roomRef/payload builders are pure and unit-tested; publish is the side-effecting
 * wrapper around the S2.7 encrypted path.
 */

export function dmRoomRef(conversationId: number | string): string {
  return `room-${conversationId}`;
}

export function dmRkey(conversationId: number | string, messageId: number | string): string {
  return `dm-${conversationId}-${messageId}`;
}

export interface DmPayload {
  messageId: number;
  conversationId: number;
  senderUserId: number;
  content: string;
  messageType?: string;
  createdAt: string;
}

export function buildDmPayload(input: {
  messageId: number;
  conversationId: number;
  senderUserId: number;
  content: string;
  messageType?: string | null;
  createdAt?: Date | string | null;
}): DmPayload {
  const createdAt = input.createdAt
    ? input.createdAt instanceof Date
      ? input.createdAt.toISOString()
      : new Date(input.createdAt).toISOString()
    : new Date().toISOString();
  return {
    messageId: input.messageId,
    conversationId: input.conversationId,
    senderUserId: input.senderUserId,
    content: input.content,
    messageType: input.messageType ?? "text",
    createdAt,
  };
}

interface PrivateRepoTarget {
  repoDid: string;
  identifier: string;
  password: string;
}

/** Resolve the shared private repo target from env; null when private PDS is not configured. */
export function privateRepoTarget(env: NodeJS.ProcessEnv = process.env): PrivateRepoTarget | null {
  const repoDid = env.WTFOS_PRIVATE_REPO_DID?.trim();
  const identifier = env.WTFOS_PRIVATE_REPO_IDENTIFIER?.trim();
  const password = env.WTFOS_PRIVATE_REPO_PASSWORD?.trim();
  if (!repoDid || !identifier || !password) return null;
  return { repoDid, identifier, password };
}

/** Mirror a DM into the private PDS as an encrypted envelope. No-op when unconfigured. */
export async function emitPrivateDmToSpine(input: {
  messageId: number;
  conversationId: number;
  senderUserId: number;
  content: string;
  messageType?: string | null;
  createdAt?: Date | string | null;
}): Promise<void> {
  if (!isSpineEnabled()) return;
  // Private PDS must exist in config and have repo credentials before we publish anything.
  if (!getSpineConfig().privatePds?.url) return;
  const target = privateRepoTarget();
  if (!target) return;

  const payload = buildDmPayload(input);
  await publishPrivateRecord({
    repoDid: target.repoDid,
    identifier: target.identifier,
    password: target.password,
    collection: PRIVATE_MESSAGE_COLLECTION,
    rkey: dmRkey(input.conversationId, input.messageId),
    roomRef: dmRoomRef(input.conversationId),
    payload,
  }).catch(() => undefined);
}
