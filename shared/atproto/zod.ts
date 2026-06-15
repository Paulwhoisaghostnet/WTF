import { z } from "zod";

/**
 * Runtime Zod validators for the app.wtfos.* lexicons. These are the source of truth for
 * TypeScript types (via z.infer) AND runtime validation before publishing to a PDS. The
 * lexicon JSON files under ./lexicons are the publishable schema; lexicon-parity.test.ts
 * proves the two agree (same properties, same required set). Keep the two in lockstep:
 * when you change a lexicon JSON, change the matching schema here (the parity test enforces it).
 */

const $version = z.number().int();
const datetime = z.string();

export const indexRefSchema = z.object({
  $type: z.literal("app.wtfos.index.ref"),
  schemaVersion: $version,
  domain: z.string(),
  subdomain: z.string().optional(),
  refKind: z.string(),
  factType: z.string().optional(),
  factRepo: z.string(),
  factCollection: z.string(),
  factRkey: z.string(),
  summary: z.unknown().optional(),
  createdAt: datetime,
});

export const mediaStorageSchema = z.object({
  provider: z.string(),
  bucket: z.string(),
  key: z.string(),
  endpoint: z.string().optional(),
  region: z.string().optional(),
});

export const mediaEchoSchema = z.object({
  $type: z.literal("app.wtfos.media.echo"),
  schemaVersion: $version,
  cid: z.string(),
  mimeType: z.string(),
  size: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  alt: z.string().optional(),
  license: z.string().optional(),
  attribution: z.string().optional(),
  blobRef: z.unknown().optional(),
  storage: mediaStorageSchema,
  createdAt: datetime,
});

export const mediaPinStorageRefSchema = z.object({
  s3Bucket: z.string().optional(),
  s3Key: z.string().optional(),
  s3Region: z.string().optional(),
  s3Endpoint: z.string().optional(),
  porcupinProviderKey: z.string().optional(),
  providerPinId: z.string().optional(),
  manifestKey: z.string().optional(),
  byteSize: z.number().int().optional(),
  mimeType: z.string().optional(),
  checksumSha256: z.string().optional(),
});

export const mediaPinSubdomainRefSchema = z.object({
  kind: z.enum(["wtfos.me", "wtf.tez"]),
  host: z.string(),
  grantId: z.number().int().optional(),
});

export const mediaPinPolicySchema = z.object({
  $type: z.literal("app.wtfos.media.pinPolicy"),
  schemaVersion: $version,
  scopeType: z.string(),
  scopeRef: z.string(),
  walletAddress: z.string().optional(),
  sourceChain: z.string(),
  includeExisting: z.boolean(),
  includeFuture: z.boolean(),
  provider: z.string(),
  publicDiscovery: z.boolean(),
  exclusions: z.unknown().optional(),
  subdomainRefs: z.array(mediaPinSubdomainRefSchema).optional(),
  sourceEventId: z.string().optional(),
  createdAt: datetime,
  updatedAt: datetime,
});

export const mediaPinManifestSchema = z.object({
  $type: z.literal("app.wtfos.media.pinManifest"),
  schemaVersion: $version,
  scopeType: z.string(),
  scopeRef: z.string(),
  walletAddress: z.string().optional(),
  sourceChain: z.string(),
  itemCount: z.number().int(),
  totalBytes: z.number().int(),
  provider: z.string(),
  storageRef: mediaPinStorageRefSchema,
  subdomainRefs: z.array(mediaPinSubdomainRefSchema).optional(),
  sourceEventId: z.string().optional(),
  createdAt: datetime,
  updatedAt: datetime,
});

export const mediaPinItemSchema = z.object({
  $type: z.literal("app.wtfos.media.pinItem"),
  schemaVersion: $version,
  scopeType: z.string(),
  scopeRef: z.string(),
  walletAddress: z.string().optional(),
  sourceChain: z.string(),
  cid: z.string(),
  provider: z.string(),
  storageRef: mediaPinStorageRefSchema,
  subdomainRefs: z.array(mediaPinSubdomainRefSchema).optional(),
  sourceEventId: z.string().optional(),
  mimeType: z.string().optional(),
  byteSize: z.number().int().optional(),
  checksumSha256: z.string().optional(),
  createdAt: datetime,
  updatedAt: datetime,
});

export const identityProfileSchema = z.object({
  $type: z.literal("app.wtfos.identity.profile"),
  schemaVersion: $version,
  did: z.string(),
  handle: z.string().optional(),
  displayName: z.string().max(640).optional(),
  description: z.string().max(2560).optional(),
  avatarMediaRef: z.string().optional(),
  wtfUserRef: z.string().optional(),
  createdAt: datetime,
  updatedAt: datetime.optional(),
});

export const identityWalletLinkSchema = z.object({
  $type: z.literal("app.wtfos.identity.walletLink"),
  schemaVersion: $version,
  did: z.string(),
  walletAddress: z.string(),
  chain: z.string(),
  role: z.enum(["primary", "additional"]),
  source: z.string().optional(),
  proofRef: z.string().optional(),
  createdAt: datetime,
});

export const identitySiteSchema = z.object({
  $type: z.literal("app.wtfos.identity.site"),
  schemaVersion: $version,
  host: z.string(),
  url: z.string(),
  versionDigest: z.string(),
  pageSlugs: z.array(z.string()).max(6),
  assetMediaIds: z.array(z.number().int()).max(200).optional(),
  didTarget: z.object({
    did: z.string(),
    source: z.enum(["wtf", "bsky"]),
    handle: z.string().optional(),
  }),
  publishedAt: datetime,
});

export const identitySiteSnapshotPageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  html: z.string(),
});

export const identitySiteSnapshotPayloadSchema = z.object({
  pages: z.array(identitySiteSnapshotPageSchema).max(26),
  assetMediaIds: z.array(z.number().int()).max(200),
});

export const identitySiteSnapshotSchema = z.object({
  $type: z.literal("app.wtfos.identity.siteSnapshot"),
  schemaVersion: $version,
  host: z.string(),
  url: z.string(),
  versionDigest: z.string(),
  versionNumber: z.number().int(),
  payload: identitySiteSnapshotPayloadSchema,
  didTarget: z.object({
    did: z.string(),
    source: z.enum(["wtf", "bsky"]),
    handle: z.string().optional(),
  }),
  publishedAt: datetime,
});

export const identitySiteIndexSchema = z.object({
  $type: z.literal("app.wtfos.identity.siteIndex"),
  schemaVersion: $version,
  host: z.string(),
  url: z.string(),
  repoDid: z.string(),
  repoHandle: z.string().optional(),
  snapshotCollection: z.string(),
  snapshotRkey: z.string(),
  versionDigest: z.string(),
  versionNumber: z.number().int(),
  pageSlugs: z.array(z.string()).max(26),
  publishedAt: datetime,
});

export const boardChannelSchema = z.object({
  $type: z.literal("app.wtfos.social.board.channel"),
  schemaVersion: $version,
  channelId: z.string(),
  title: z.string().max(880),
  topic: z.string().optional(),
  categoryId: z.string().optional(),
  channelType: z.string().optional(),
  pinned: z.boolean().optional(),
  locked: z.boolean().optional(),
  createdAt: datetime,
  updatedAt: datetime.optional(),
});

export const boardPostSchema = z.object({
  $type: z.literal("app.wtfos.social.board.post"),
  schemaVersion: $version,
  postId: z.string(),
  channelRef: z.string(),
  parentRef: z.string().optional(),
  text: z.string().max(25600),
  mediaRefs: z.array(z.string()).optional(),
  createdAt: datetime,
  editedAt: datetime.optional(),
});

export const boardReactionSchema = z.object({
  $type: z.literal("app.wtfos.social.board.reaction"),
  schemaVersion: $version,
  subjectRef: z.string(),
  emoji: z.string().max(128),
  createdAt: datetime,
});

export const roomInviteSchema = z.object({
  $type: z.literal("app.wtfos.room.invite"),
  schemaVersion: $version,
  roomId: z.string(),
  roomName: z.string().optional(),
  inviterDid: z.string(),
  inviteeDid: z.string().optional(),
  inviteeHandle: z.string().optional(),
  externalBskyHandle: z.string().optional(),
  expiresAt: datetime.optional(),
  createdAt: datetime,
});

export const crpNomineeSchema = z.object({
  tezosAddress: z.string().max(64),
  tezosDomain: z.string().max(120).optional(),
  displayName: z.string().max(320).optional(),
  xHandle: z.string().max(64).optional(),
  bskyHandle: z.string().max(320).optional(),
  identitySources: z.array(z.string().max(64)).max(32).optional(),
});

export const crpJustificationSchema = z.object({
  summary: z.string().max(2000).optional(),
  links: z.array(z.string().max(2048)).max(12).optional(),
});

export const crpShareRefsSchema = z.object({
  nominationUri: z.string().max(512).optional(),
  bskyPostUri: z.string().max(512).optional(),
  bskyPostUrl: z.string().max(512).optional(),
});

export const crpNominationSchema = z.object({
  $type: z.literal("app.wtfos.liveops.crpNomination"),
  schemaVersion: $version,
  nominationId: z.string().max(120),
  anonymous: z.boolean().optional(),
  nominatorUserId: z.number().int().optional(),
  nominatorDid: z.string().max(256).optional(),
  nominatorHandle: z.string().max(320).optional(),
  nominee: crpNomineeSchema,
  categoryId: z.string().max(64),
  categoryLabel: z.string().max(120),
  justification: crpJustificationSchema.optional(),
  campaignMonth: z.string().max(7),
  shareRefs: crpShareRefsSchema.optional(),
  createdAt: datetime,
});

/** Registry keyed by lexicon NSID. The kernel spine service validates against this before publish. */
export const lexiconSchemas = {
  "app.wtfos.index.ref": indexRefSchema,
  "app.wtfos.media.echo": mediaEchoSchema,
  "app.wtfos.media.pinPolicy": mediaPinPolicySchema,
  "app.wtfos.media.pinManifest": mediaPinManifestSchema,
  "app.wtfos.media.pinItem": mediaPinItemSchema,
  "app.wtfos.identity.profile": identityProfileSchema,
  "app.wtfos.identity.walletLink": identityWalletLinkSchema,
  "app.wtfos.identity.site": identitySiteSchema,
  "app.wtfos.identity.siteSnapshot": identitySiteSnapshotSchema,
  "app.wtfos.identity.siteIndex": identitySiteIndexSchema,
  "app.wtfos.social.board.channel": boardChannelSchema,
  "app.wtfos.social.board.post": boardPostSchema,
  "app.wtfos.social.board.reaction": boardReactionSchema,
  "app.wtfos.room.invite": roomInviteSchema,
  "app.wtfos.liveops.crpNomination": crpNominationSchema,
} as const;

export type LexiconId = keyof typeof lexiconSchemas;
export const LEXICON_IDS = Object.keys(lexiconSchemas) as LexiconId[];

export type IndexRef = z.infer<typeof indexRefSchema>;
export type MediaEcho = z.infer<typeof mediaEchoSchema>;
export type MediaPinPolicy = z.infer<typeof mediaPinPolicySchema>;
export type MediaPinManifest = z.infer<typeof mediaPinManifestSchema>;
export type MediaPinItem = z.infer<typeof mediaPinItemSchema>;
export type IdentityProfile = z.infer<typeof identityProfileSchema>;
export type IdentityWalletLink = z.infer<typeof identityWalletLinkSchema>;
export type IdentitySite = z.infer<typeof identitySiteSchema>;
export type IdentitySiteSnapshot = z.infer<typeof identitySiteSnapshotSchema>;
export type IdentitySiteIndex = z.infer<typeof identitySiteIndexSchema>;
export type BoardChannel = z.infer<typeof boardChannelSchema>;
export type BoardPost = z.infer<typeof boardPostSchema>;
export type BoardReaction = z.infer<typeof boardReactionSchema>;
export type RoomInvite = z.infer<typeof roomInviteSchema>;
export type CrpNomination = z.infer<typeof crpNominationSchema>;
export type CrpNominee = z.infer<typeof crpNomineeSchema>;

export class LexiconValidationError extends Error {
  constructor(
    public readonly type: string,
    public readonly issues: unknown,
  ) {
    super(`Record failed app.wtfos lexicon validation for ${type}`);
    this.name = "LexiconValidationError";
  }
}

/** Validate a record against its lexicon schema by $type. Throws on unknown type or invalid data. */
export function validateLexiconRecord<T = unknown>(type: string, data: unknown): T {
  const schema = lexiconSchemas[type as LexiconId];
  if (!schema) {
    throw new LexiconValidationError(type, `unknown lexicon $type: ${type}`);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new LexiconValidationError(type, result.error.issues);
  }
  return result.data as T;
}
