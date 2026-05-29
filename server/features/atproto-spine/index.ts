/**
 * Kernel AT Protocol spine (S2.x). App-agnostic primitives live in @wtfos/atproto-spine;
 * this module wires them into the wtfOS kernel: flag-gated config, structured publish via
 * the shared outbox, repo reads, identity/handle/DID register services, and the echo router.
 */
export {
  ATPROTO_SPINE_FLAG,
  WTFOS_DOMAINS,
  RESERVED_HANDLES,
  isSpineEnabled,
  getSpineConfig,
  defaultRoutingRules,
  infraHosts,
  type WtfosDomain,
} from "./config";

export {
  buildSpineWrite,
  isRegistrableHandleLabel,
  handleForLabel,
} from "./records";

export {
  SPINE_DISABLED_REASON,
  SPINE_TARGET_MISSING_REASON,
  enqueueSpineRecord,
  readSpineRecords,
  spineStatus,
  listQueuedSpineRows,
  echoRecordToMaster,
  type SpineRecordInput,
  type SpineReadOptions,
} from "./service";

export {
  domainForType,
  domainsForType,
  buildIndexRef,
  echoRkeyParts,
  buildEchoWrite,
  type FactRef,
} from "./echo-router";

export {
  defaultMediaStorage,
  buildMediaEchoRecord,
  mediaGatewayBaseUrl,
  mediaGatewayUrlForCid,
  isAllowedMediaKey,
  type MediaStorageRef,
  type BuildMediaEchoInput,
} from "./media-echo";

export { mediaGatewayHandler } from "./media-gateway";

export {
  PRIVATE_DISABLED,
  PRIVATE_MESSAGE_COLLECTION,
  PRIVATE_ROOM_COLLECTION,
  derivePrivateKey,
  encryptPrivatePayload,
  decryptPrivatePayload,
  buildPrivateEnvelopeRecord,
  readPrivateEnvelopeRecord,
  publishPrivateRecord,
  type PrivateEnvelopeInput,
} from "./private-pds";

export {
  LABEL_DEFINITIONS,
  knownLabelValues,
  isKnownLabel,
  isBanLabel,
  buildLabel,
  labelerDid,
  type LabelDefinition,
  type LabelInput,
  type AtprotoLabel,
} from "./labeler-policy";

export {
  LABELER_DISABLED,
  applyLabel,
  negateLabel,
  recentModerationActions,
  type ApplyLabelInput,
  type LabelActionResult,
} from "./labeler";

export {
  buildAtUri,
  parseAtUri,
  isWtfosLexicon,
  toAppviewRow,
  type RepoOp,
  type AppviewRow,
} from "./appview/record-shape";

export {
  indexAppviewRow,
  indexRepoOp,
  indexFromOutbox,
  startFirehoseIndexer,
  appviewIndexerStatus,
  type CommitDecoder,
  type DecodedCommit,
  type FirehoseIndexerHandle,
} from "./appview/indexer";

export {
  listAppviewRecords,
  getAppviewRecordByUri,
  type ListResult,
} from "./appview/query";

export {
  parsePagination,
  parseFilters,
  clampLimit,
  decodeCursor,
  encodeCursor,
  type ListFilters,
  type Pagination,
} from "./appview/query-params";

export { createAppViewRouter } from "./appview/router";

export {
  federationConfig,
  shouldIndexCollection,
  requestCrawl,
  announceToRelays,
  createInviteCode,
  type FederationConfig,
  type RelayResult,
} from "./federation";

export { mergeSpineIdentity, type SpineIdentity, type SpineIdentityParts } from "./identity-merge";
export { resolveSpineIdentity } from "./identity-resolve";

export {
  BOARD_CHANNEL_COLLECTION,
  BOARD_POST_COLLECTION,
  BOARD_REACTION_COLLECTION,
  buildBoardChannelRecord,
  buildBoardPostRecord,
  buildBoardReactionRecord,
  channelRef,
  channelRkey,
  postRkey,
  emitBoardChannelToSpine,
  emitBoardPostToSpine,
  emitBoardReactionToSpine,
  type BoardThreadRow,
  type BoardReplyRow,
} from "./social-emit";

export {
  backfillBoardChannels,
  backfillBoardPosts,
  backfillBoardReactions,
  runSocialBackfill,
  type BackfillResult,
  type SocialBackfillSummary,
} from "./backfill/social";

export {
  dmRkey,
  dmRoomRef,
  buildDmPayload,
  privateRepoTarget,
  emitPrivateDmToSpine,
  type DmPayload,
} from "./private-emit";

export {
  summarizeOutbox,
  getOutboxStats,
  getSpineObservability,
  type OutboxSummary,
  type SpineObservability,
} from "./observability";

export { registerSpineAdminRoutes } from "./admin-routes";

export {
  REPO_MODES,
  canTransition,
  trackingHandleLabel,
  planProvision,
  repoAccountIdentity,
  type RepoMode,
  type IdentityStatus,
  type ProvisionPlan,
} from "./provisioning-policy";

export {
  PROVISIONING_DISABLED,
  ensureIdentityRow,
  provisionRepo,
  linkByoIdentity,
  type ProvisionRepoInput,
  type LinkByoInput,
} from "./repo-provisioning";

export {
  toWtfosHandle,
  checkHandleAvailability,
  type HandleAvailability,
  type HandleUnavailableReason,
} from "./handle-policy";

export {
  HANDLE_REGISTER_DISABLED,
  resolveHandleViaPds,
  isHandleAvailable,
  registerWtfosHandle,
  resolveWtfosHandleDid,
  type RegisterHandleInput,
} from "./handle-register";

export {
  parseDid,
  didWebForHost,
  buildDidWebDocument,
  didDocServesHandle,
  resolveDidWeb,
  plcDirectories,
  fetchPlcOpLog,
  mirrorPlcOperation,
  registerPlcIdentity,
  type DidMethod,
  type ParsedDid,
  type DidWebDocumentInput,
  type PlcMirrorResult,
  type RegisterPlcIdentityInput,
} from "./did-register";
