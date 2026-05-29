/**
 * @wtfos/atproto-spine — app-agnostic AT Protocol spine primitives for wtfOS.
 *
 * Extracted and generalized from the TZAT (tz2at) relay. Contains NO wtfOS or Tezos
 * domain knowledge: callers supply a {@link SpineConfig} and routing rules. The kernel
 * spine service (server/features/atproto-spine, S2.1) wires these into wtfOS.
 */
export type {
  AtprotoRecordWrite,
  PdsServiceConfig,
  SpineRoutingRule,
  SpineConfig,
} from "./types";

export { AtprotoClient, type AtprotoClientOptions } from "./atproto-client";

export {
  PdsAdminClient,
  type PdsCreateAccountInput,
  type PdsCreateAccountResult,
  type PdsResolveHandleResult,
  type PdsDescribeServerResult,
} from "./pds-admin-client";

export {
  mapToRecord,
  deterministicRkey,
  normalizeRkey,
  prepareRecord,
  defaultShrink,
  DEFAULT_MAX_RECORD_BYTES,
  type RecordMapOptions,
} from "./record-mapper";

export {
  routeRecordToDomains,
  primaryDomainFor,
  groupWritesByDomain,
} from "./record-router";

export {
  FirehoseConsumer,
  type FirehoseConsumerOptions,
  type FirehoseFrame,
} from "./firehose-consumer";

export {
  evaluateTlsRequest,
  createTlsAllowHandler,
  type TlsGateOptions,
  type TlsDecision,
} from "./tls-gate";
