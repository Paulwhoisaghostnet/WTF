import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  validateAddress,
  validateContractAddress,
  validateOperation,
  ValidationResult,
} from "@taquito/utils";

import {
  canonicalMichelsonSemanticScriptCode,
} from "./pasta-michelson-script-identity";
import {
  createHttpGetReader,
  readWithBoundedRetry,
  type ReadOnlyFetch,
  type ReadOnlyRetryOptions,
} from "./pasta-readonly-retry";
import {
  readPastaProofRestartActorLane,
} from "./pasta-proof-restart-chain";
import type {
  RavioliCurrentResumeLiveVerifier,
  RavioliCurrentResumeOperation,
  RavioliCurrentResumePin,
} from "./shadownet-ravioli-current-resume";
import type {
  RavioliUiLiveJournalTargetRole,
} from "./shadownet-ravioli-ui-live-journal";
import {
  ipfsGatewayUrl,
  normalizeBase,
  SHADOWNET_CHAIN_ID,
  SHADOWNET_RPC_FALLBACK,
  SHADOWNET_RPC_PRIMARY,
  SHADOWNET_TZKT_API,
  type IpfsProofConfig,
} from "./shadownet-proof-kit";

const TARGET_ROLES = Object.freeze([
  "blindController",
  "router",
  "gnocchi",
  "gnocchiAdapter",
  "rotini",
  "rotiniAdapter",
] as const satisfies readonly RavioliUiLiveJournalTargetRole[]);

const APPLIED_EVIDENCE_KEYS = Object.freeze([
  "contractAddress",
  "counter",
  "entrypoints",
  "explorerUrl",
  "level",
  "operationHash",
  "signerAddress",
  "status",
  "timestamp",
] as const);

const EXPLORER_BASE = "https://shadownet.tzkt.io";

type JsonRecord = Record<string, any>;

export type RavioliCurrentResumeRoleArtifacts = Readonly<Record<
  RavioliUiLiveJournalTargetRole,
  readonly unknown[]
>>;

export type CreateRavioliCurrentResumeLiveVerifierInput = Readonly<{
  ipfs: Pick<IpfsProofConfig, "localGatewayUrl" | "publicGatewayUrl">;
  roleArtifacts: RavioliCurrentResumeRoleArtifacts;
  fetchImpl?: ReadOnlyFetch;
  primaryRpcUrl?: string;
  fallbackRpcUrl?: string;
  tzktApiUrl?: string;
  readRetryOptions?: ReadOnlyRetryOptions;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value: unknown, label: string): JsonRecord {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function endpoint(value: string, label: string): string {
  const parsed = new URL(value);
  assert.ok(parsed.protocol === "http:" || parsed.protocol === "https:", `${label} must use HTTP or HTTPS`);
  assert.equal(parsed.username, "", `${label} must not contain credentials`);
  assert.equal(parsed.password, "", `${label} must not contain credentials`);
  assert.equal(parsed.search, "", `${label} must not contain a query`);
  parsed.hash = "";
  return normalizeBase(parsed.toString());
}

function nestedAddress(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return String((value as JsonRecord).address || "");
  }
  return "";
}

function canonicalInteger(value: unknown, label: string, minimum = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  assert.ok(Number.isSafeInteger(parsed) && parsed >= minimum, `${label} is invalid`);
  return parsed;
}

function assertSignerAddress(value: string, label: string): void {
  assert.equal(validateAddress(value), ValidationResult.VALID, `${label} is invalid`);
  assert.match(value, /^tz[1-4]/, `${label} must be an implicit Tezos account`);
}

function assertContract(value: string, label: string): void {
  assert.equal(validateContractAddress(value), ValidationResult.VALID, `${label} is invalid`);
}

function exactEvidence(operation: RavioliCurrentResumeOperation): JsonRecord {
  const evidence = record(operation.evidence, `operation ${operation.expected.globalOrdinal} journal evidence`);
  assert.deepEqual(
    Object.keys(evidence).sort(),
    [...APPLIED_EVIDENCE_KEYS].sort(),
    `operation ${operation.expected.globalOrdinal} journal evidence fields differ`,
  );
  assert.equal(operation.kind, "operation");
  assert.equal(operation.action, operation.expected.action, "operation action differs from the authenticated plan");
  assert.equal(evidence.status, "applied", "journal operation status is not applied");
  assert.equal(evidence.operationHash, operation.operationHash, "journal operation hash differs from the replay step");
  assert.equal(evidence.contractAddress, operation.contractAddress, "journal contract differs from the replay step");
  assert.equal(validateOperation(operation.operationHash), ValidationResult.VALID, "journal operation hash is invalid");
  assertContract(operation.contractAddress, "journal operation contract");
  assertSignerAddress(String(evidence.signerAddress || ""), "journal operation signer");
  canonicalInteger(evidence.counter, "journal operation counter", 1);
  canonicalInteger(evidence.level, "journal operation level", 1);
  assert.ok(
    typeof evidence.timestamp === "string" && Number.isFinite(Date.parse(evidence.timestamp)),
    "journal operation timestamp is invalid",
  );
  const expectedEntrypoints = operation.expected.entrypoint ? [operation.expected.entrypoint] : [];
  assert.deepEqual(evidence.entrypoints, expectedEntrypoints, "journal operation entrypoints differ from the plan");
  assert.equal(
    evidence.explorerUrl,
    `${EXPLORER_BASE}/${operation.operationHash}`,
    "journal operation explorer URL differs",
  );
  return evidence;
}

function operationRows(value: unknown, label: string): JsonRecord[] {
  const rows = Array.isArray(value) ? value : [value];
  assert.ok(rows.length > 0, `${label} returned no operation rows`);
  return rows.map((row, index) => record(row, `${label} row ${index + 1}`));
}

function expectedOperationTarget(operation: RavioliCurrentResumeOperation): {
  contractAddress: string;
  entrypoints: string[];
} {
  const descriptor = record(operation.descriptor, "authenticated operation descriptor");
  if (operation.action === "originate") {
    assert.equal(descriptor.kind, "originate", "origination descriptor kind differs");
    assert.equal(operation.expected.originRole, operation.expected.targetRole, "origination role differs from its target role");
    assert.equal(operation.expected.entrypoint, undefined, "origination plan cannot declare an entrypoint");
    return { contractAddress: operation.contractAddress, entrypoints: [] };
  }
  assert.equal(descriptor.kind, "call", "call descriptor kind differs");
  const call = record(descriptor.call, "authenticated call descriptor");
  assert.equal(call.contractAddress, operation.contractAddress, "call descriptor target differs from the replay step");
  assert.equal(call.entrypoint, operation.expected.entrypoint, "call descriptor entrypoint differs from the plan");
  assert.equal(typeof call.entrypoint, "string", "call descriptor entrypoint is invalid");
  return { contractAddress: operation.contractAddress, entrypoints: [call.entrypoint as string] };
}

function normalizeRoleArtifacts(input: RavioliCurrentResumeRoleArtifacts): ReadonlyMap<
  RavioliUiLiveJournalTargetRole,
  unknown
> {
  assert.ok(input && typeof input === "object" && !Array.isArray(input), "roleArtifacts must be an object");
  assert.deepEqual(
    Object.keys(input).sort(),
    [...TARGET_ROLES].sort(),
    "roleArtifacts must contain exactly the six Ravioli target roles",
  );
  const normalized = new Map<RavioliUiLiveJournalTargetRole, unknown>();
  for (const role of TARGET_ROLES) {
    const code = input[role];
    assert.ok(Array.isArray(code), `${role} caller artifact must be a complete Michelson code array`);
    try {
      normalized.set(role, canonicalMichelsonSemanticScriptCode(code));
    } catch (cause) {
      throw new Error(`${role} caller artifact must be a complete Michelson code array`, { cause });
    }
  }
  return normalized;
}

/**
 * Build the production, read-only verifier used before replaying an authenticated
 * Ravioli journal prefix. Every external transport reachable from this factory
 * is an HTTP GET under the shared bounded-read policy; it has no signer, Kubo
 * pinning, filesystem-write, or operation-injection capability.
 */
export function createRavioliCurrentResumeLiveVerifier(
  input: CreateRavioliCurrentResumeLiveVerifierInput,
): RavioliCurrentResumeLiveVerifier {
  const primaryRpcUrl = endpoint(input.primaryRpcUrl ?? SHADOWNET_RPC_PRIMARY, "primary Shadownet RPC");
  const fallbackRpcUrl = endpoint(input.fallbackRpcUrl ?? SHADOWNET_RPC_FALLBACK, "fallback Shadownet RPC");
  const tzktApiUrl = endpoint(input.tzktApiUrl ?? SHADOWNET_TZKT_API, "Shadownet TzKT API");
  assert.notEqual(primaryRpcUrl, fallbackRpcUrl, "primary and fallback Shadownet RPCs must be distinct");
  const localGatewayUrl = endpoint(input.ipfs.localGatewayUrl, "local IPFS gateway");
  const publicGatewayUrl = endpoint(input.ipfs.publicGatewayUrl, "public IPFS gateway");
  assert.notEqual(
    new URL(localGatewayUrl).origin,
    new URL(publicGatewayUrl).origin,
    "local and public IPFS gateways must use independent origins",
  );
  const artifacts = normalizeRoleArtifacts(input.roleArtifacts);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  assert.equal(typeof fetchImpl, "function", "Ravioli live verifier requires fetch");

  const getJson = (label: string, url: string): Promise<unknown> => readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      fetchImpl,
      parse: (response) => response.json(),
    }),
  }, input.readRetryOptions);

  const getBytes = (label: string, url: string): Promise<Uint8Array> => readWithBoundedRetry({
    primary: createHttpGetReader({
      label,
      url,
      fetchImpl,
      parse: async (response) => new Uint8Array(await response.arrayBuffer()),
    }),
  }, input.readRetryOptions);

  const verifyOperation = async (
    operation: RavioliCurrentResumeOperation,
  ): Promise<Readonly<JsonRecord>> => {
    const journalEvidence = exactEvidence(operation);
    const expected = expectedOperationTarget(operation);
    const family = operation.action === "originate" ? "originations" : "transactions";
    const url = `${tzktApiUrl}/operations/${family}/${encodeURIComponent(operation.operationHash)}`;
    const rows = operationRows(
      await getJson(`Ravioli operation ${operation.expected.globalOrdinal} exact-hash TzKT evidence`, url),
      `operation ${operation.expected.globalOrdinal} TzKT evidence`,
    );
    const exact = rows.filter((row) =>
      row.hash === operation.operationHash
      && nestedAddress(row.sender) === journalEvidence.signerAddress
    );
    assert.equal(
      exact.length,
      1,
      `operation ${operation.expected.globalOrdinal} TzKT must expose exactly one row for the exact hash and signer`,
    );
    const row = exact[0]!;
    assert.equal(row.status, "applied", `operation ${operation.expected.globalOrdinal} TzKT status is not applied`);
    assert.equal(
      row.type,
      operation.action === "originate" ? "origination" : "transaction",
      `operation ${operation.expected.globalOrdinal} TzKT action differs`,
    );
    const counter = canonicalInteger(row.counter, `operation ${operation.expected.globalOrdinal} TzKT counter`, 1);
    assert.equal(counter, journalEvidence.counter, `operation ${operation.expected.globalOrdinal} TzKT counter differs`);
    const level = canonicalInteger(row.level, `operation ${operation.expected.globalOrdinal} TzKT level`, 1);
    assert.equal(level, journalEvidence.level, `operation ${operation.expected.globalOrdinal} TzKT level differs`);
    assert.ok(
      typeof row.timestamp === "string" && Number.isFinite(Date.parse(row.timestamp)),
      `operation ${operation.expected.globalOrdinal} TzKT timestamp is invalid`,
    );
    assert.equal(
      row.timestamp,
      journalEvidence.timestamp,
      `operation ${operation.expected.globalOrdinal} TzKT timestamp differs`,
    );
    const liveContract = operation.action === "originate"
      ? nestedAddress(row.originatedContract)
      : nestedAddress(row.target);
    assert.equal(
      liveContract,
      expected.contractAddress,
      `operation ${operation.expected.globalOrdinal} TzKT target differs`,
    );
    if (operation.action === "call") {
      assert.equal(
        row.parameter?.entrypoint,
        expected.entrypoints[0],
        `operation ${operation.expected.globalOrdinal} TzKT entrypoint differs`,
      );
    }
    const liveEvidence = Object.freeze({
      contractAddress: liveContract,
      counter,
      entrypoints: Object.freeze([...expected.entrypoints]),
      explorerUrl: `${EXPLORER_BASE}/${operation.operationHash}`,
      level,
      operationHash: String(row.hash),
      signerAddress: nestedAddress(row.sender),
      status: String(row.status),
      timestamp: String(row.timestamp),
    });
    assert.deepEqual(
      liveEvidence,
      journalEvidence,
      `operation ${operation.expected.globalOrdinal} live evidence differs from the journal`,
    );
    return liveEvidence;
  };

  const verifyPin = async (pin: RavioliCurrentResumePin): Promise<void> => {
    assert.equal(pin.kind, "pin");
    const expectedSha256 = sha256(pin.bytes);
    assert.equal(pin.proof.sha256, expectedSha256, `pin ${pin.pinSequence} journal SHA-256 differs`);
    assert.equal(pin.proof.byteLength, pin.bytes.byteLength, `pin ${pin.pinSequence} journal byte length differs`);
    assert.equal(pin.proof.uri, `ipfs://${pin.proof.cid}`, `pin ${pin.pinSequence} URI differs from its CID`);
    const expectedLocalUrl = ipfsGatewayUrl(localGatewayUrl, pin.proof.cid);
    const expectedPublicUrl = ipfsGatewayUrl(publicGatewayUrl, pin.proof.cid);
    assert.equal(pin.proof.localGatewayUrl, expectedLocalUrl, `pin ${pin.pinSequence} local gateway URL differs`);
    assert.equal(pin.proof.publicGatewayUrl, expectedPublicUrl, `pin ${pin.pinSequence} public gateway URL differs`);
    assert.equal(pin.proof.publicGatewayVerified, true, `pin ${pin.pinSequence} lacks its public verification claim`);
    const [localBytes, publicBytes] = await Promise.all([
      getBytes(`Ravioli pin ${pin.pinSequence} local IPFS bytes`, expectedLocalUrl),
      getBytes(`Ravioli pin ${pin.pinSequence} public IPFS bytes`, expectedPublicUrl),
    ]);
    for (const [lane, bytes] of [["local", localBytes], ["public", publicBytes]] as const) {
      assert.equal(
        bytes.byteLength,
        pin.bytes.byteLength,
        `pin ${pin.pinSequence} ${lane} IPFS byte length differs`,
      );
      assert.equal(sha256(bytes), expectedSha256, `pin ${pin.pinSequence} ${lane} IPFS SHA-256 differs`);
      assert.ok(
        Buffer.from(bytes).equals(Buffer.from(pin.bytes)),
        `pin ${pin.pinSequence} ${lane} IPFS bytes differ`,
      );
    }
  };

  const verifyTarget = async (target: Readonly<{
    role: RavioliUiLiveJournalTargetRole;
    address: string;
  }>): Promise<void> => {
    assert.ok(TARGET_ROLES.includes(target.role), `unsupported Ravioli target role ${String(target.role)}`);
    assertContract(target.address, `${target.role} target address`);
    const expectedCode = artifacts.get(target.role);
    assert.ok(expectedCode, `${target.role} caller artifact is unavailable`);
    await Promise.all(([
      ["primary", primaryRpcUrl],
      ["fallback", fallbackRpcUrl],
    ] as const).map(async ([lane, rpcUrl]) => {
      const [chainId, scriptValue] = await Promise.all([
        getJson(`${lane} RPC chain identity for ${target.role}`, `${rpcUrl}/chains/main/chain_id`),
        getJson(
          `${lane} RPC on-chain ${target.role} script`,
          `${rpcUrl}/chains/main/blocks/head/context/contracts/${encodeURIComponent(target.address)}/script`,
        ),
      ]);
      assert.equal(chainId, SHADOWNET_CHAIN_ID, `${lane} RPC is not Shadownet`);
      const script = record(scriptValue, `${lane} on-chain ${target.role} script`);
      assert.deepEqual(
        canonicalMichelsonSemanticScriptCode(script.code),
        expectedCode,
        `${lane} on-chain ${target.role} script differs from its caller artifact`,
      );
    }));
  };

  return Object.freeze({
    async readActorCounter(counterInput) {
      assertSignerAddress(counterInput.signerAddress, `${counterInput.actor} signer`);
      const configuredUrl = counterInput.lane === "primary" ? primaryRpcUrl : fallbackRpcUrl;
      assert.equal(
        endpoint(counterInput.rpcUrl, `${counterInput.lane} journal RPC`),
        configuredUrl,
        `${counterInput.lane} RPC URL differs from the configured Shadownet lane`,
      );
      const state = await readPastaProofRestartActorLane({
        rpcUrl: configuredUrl,
        signerAddress: counterInput.signerAddress,
        fetchImpl,
      });
      assert.deepEqual(
        [...state.activeOperationHashes, ...state.rejectedOperationHashes],
        [],
        `${counterInput.lane} RPC mempool is not empty for ${counterInput.actor}`,
      );
      return state.counter;
    },
    verifyOperation,
    verifyPin,
    verifyTarget,
  });
}
