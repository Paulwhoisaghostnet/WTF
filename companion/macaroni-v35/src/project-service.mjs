import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createPinningAdapter } from "./adapters/pinning.mjs";
import { collectorPublishingConfig } from "./config.mjs";
import {
  decryptJsonFile,
  decryptPrivateFile,
  decryptPrivateFileToPath,
  encryptEntropyForKeyring,
  encryptJsonFile,
  encryptPrivateBytes,
  encryptPrivateFile,
  encryptPrivateStream,
  generateEntropyChain,
  removePrivateFile,
} from "./crypto-store.mjs";
import { asSafeNat, metadataCommitment } from "./protocol.mjs";
import { canonicalMetadataBytes, stageToCar, stageToken, verifyCar } from "./private-staging.mjs";

const DROP_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPLOAD_REF = DROP_REF;
const IMPLICIT_ADDRESS = /^(tz1|tz2|tz3|tz4)[1-9A-HJ-NP-Za-km-z]{33}$/;
const CONTRACT_ADDRESS = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const PUBLIC_KEY = /^(edpk|sppk|p2pk|BLpk)[1-9A-HJ-NP-Za-km-z]+$/;

function releasePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CompanionServiceError("invalid_release_policy", "Release policy is required");
  if (value.kind === "immediate" || value.kind === "sellout") return { kind: value.kind };
  if (value.kind === "rolling_delay" && Number.isSafeInteger(value.seconds) && value.seconds >= 0) return { kind: value.kind, seconds: value.seconds };
  if (value.kind === "scheduled" && Number.isFinite(Date.parse(value.at))) return { kind: value.kind, at: new Date(value.at).toISOString() };
  throw new CompanionServiceError("invalid_release_policy", "Release policy must be immediate, rolling_delay, scheduled, or sellout");
}

export class CompanionServiceError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function requireProject(journal, dropRef) {
  if (!DROP_REF.test(dropRef)) throw new CompanionServiceError("invalid_drop_ref", "Drop reference must be a UUID");
  const project = journal.getProject(dropRef);
  if (!project) throw new CompanionServiceError("project_not_found", "Macaroni project was not found", 404);
  return project;
}

function publicSetupToken(row) {
  return {
    tokenId: row.token_id,
    quantity: row.quantity,
    metadataCommitment: row.metadata_commitment,
    artifactState: row.artifact_state,
    metadataState: row.metadata_state,
    displayState: row.display_state || null,
    thumbnailState: row.thumbnail_state || null,
  };
}

export class CompanionProjectService {
  constructor({ config, journal, watcher, pinningAdapter = null, fetchImpl = null }) {
    this.config = config;
    this.journal = journal;
    this.watcher = watcher;
    this.pinning = pinningAdapter || createPinningAdapter(config.pinning);
    this.fetch = fetchImpl || fetch;
    this.fundingPolicyPromise = null;
  }

  collectorConfiguration() {
    return collectorPublishingConfig(this.config);
  }

  async verifyPublicCollectorReachability(dropRef) {
    const project = requireProject(this.journal, dropRef);
    const publishing = this.collectorConfiguration();
    if (!publishing.ready) {
      throw new CompanionServiceError(publishing.code, publishing.reason, 409);
    }
    if (!project.contract_address) {
      throw new CompanionServiceError("contract_not_attached", "Attach the originated V3.5 contract before proving the public buyer endpoint", 409);
    }
    const statusUrl = `${publishing.publicBaseUrl}/v1/public/projects/${encodeURIComponent(project.drop_ref)}/status`;
    let response;
    try {
      response = await this.fetch(statusUrl, {
        method: "GET",
        headers: { Origin: publishing.collectorOrigin },
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      throw new CompanionServiceError(
        "collector_public_endpoint_unreachable",
        "The configured public Companion endpoint could not be reached from this service. Keep the sale closed until its HTTPS reverse proxy is online.",
        503,
      );
    }
    if (!response.ok) {
      throw new CompanionServiceError(
        "collector_public_endpoint_unreachable",
        `The configured public Companion status endpoint returned HTTP ${response.status}. Keep the sale closed until it returns the exact drop status.`,
        503,
      );
    }
    if (response.headers.get("access-control-allow-origin") !== publishing.collectorOrigin) {
      throw new CompanionServiceError(
        "collector_cors_identity_mismatch",
        "The public Companion endpoint did not authorize the exact collector page origin. Correct the reverse proxy and CORS configuration before launch.",
        409,
      );
    }
    let status;
    try {
      status = await response.json();
    } catch {
      throw new CompanionServiceError("collector_status_malformed", "The public Companion endpoint returned malformed status data", 503);
    }
    if (status?.schema !== "pasta.macaroni-companion-public-status.v1"
      || status.network !== project.network
      || status.contract !== project.contract_address) {
      throw new CompanionServiceError(
        "collector_status_identity_mismatch",
        "The public endpoint answered for a different network, contract, or service schema. Keep the sale closed.",
        409,
      );
    }
    return {
      ...publishing,
      identityVerified: true,
      publicStatusUrl: statusUrl,
      verifiedNetwork: status.network,
      verifiedContract: status.contract,
    };
  }

  async fundingPolicy() {
    this.fundingPolicyPromise ||= readFile(this.config.templatePath, "utf8").then(JSON.parse).then((template) => {
      const policy = template?.measuredFundingPolicy;
      if (!policy
        || !Number.isSafeInteger(policy.minimumFulfillmentSubsidyMutez) || policy.minimumFulfillmentSubsidyMutez <= 0
        || !Number.isSafeInteger(policy.fiveSettlementStartupMutez) || policy.fiveSettlementStartupMutez <= 0) {
        throw new Error("Reviewed V3.5 template has no valid measured funding policy");
      }
      return policy;
    });
    return this.fundingPolicyPromise;
  }

  async initializeDirectories() {
    await Promise.all([
      mkdir(this.config.privateAssetDir, { recursive: true, mode: 0o700 }),
      mkdir(this.config.uploadDir, { recursive: true, mode: 0o700 }),
      mkdir(this.config.tempDir, { recursive: true, mode: 0o700 }),
      mkdir(path.join(this.config.privateAssetDir, "signed-operations"), { recursive: true, mode: 0o700 }),
    ]);
  }

  async registerProject(input) {
    if (!DROP_REF.test(input.dropRef || "")) throw new CompanionServiceError("invalid_drop_ref", "dropRef must be a UUID");
    if (input.network !== this.config.network) throw new CompanionServiceError("network_mismatch", "Project network must match the Companion network");
    if (!IMPLICIT_ADDRESS.test(input.creator || "")) throw new CompanionServiceError("invalid_creator", "Creator must be a Tezos implicit address");
    if (input.creatorPublicKey != null && !PUBLIC_KEY.test(input.creatorPublicKey)) {
      throw new CompanionServiceError("invalid_creator_public_key", "Creator public key is not a canonical Tezos public key");
    }
    if (!IMPLICIT_ADDRESS.test(input.administrator || "")) throw new CompanionServiceError("invalid_administrator", "Administrator must be a Tezos implicit address");
    if (!IMPLICIT_ADDRESS.test(input.treasury || "")) {
      throw new CompanionServiceError("invalid_treasury", "Treasury must be a Tezos implicit wallet; a KT1 contract can reject pushed proceeds and brick purchases or the final sweep");
    }
    if (!Number.isSafeInteger(input.physicalSupply) || input.physicalSupply < 1) throw new CompanionServiceError("invalid_supply", "Physical supply must be fixed and positive");
    const claimIntervalSeconds = input.claimIntervalSeconds ?? 0;
    if (!Number.isSafeInteger(claimIntervalSeconds) || claimIntervalSeconds < 0
      || !Number.isSafeInteger(claimIntervalSeconds * 1000)) {
      throw new CompanionServiceError("invalid_claim_interval", "Claim interval must be a non-negative whole number of seconds");
    }
    if (!Number.isSafeInteger(input.fulfillmentSubsidyMutez) || input.fulfillmentSubsidyMutez <= 0) {
      throw new CompanionServiceError("invalid_subsidy", "Fulfillment subsidy must be a positive measured mutez amount");
    }
    const measuredFunding = await this.fundingPolicy();
    if (input.fulfillmentSubsidyMutez < measuredFunding.minimumFulfillmentSubsidyMutez) {
      throw new CompanionServiceError(
        "subsidy_below_measured_cost",
        `Fulfillment subsidy must be at least the measured ${measuredFunding.minimumFulfillmentSubsidyMutez} mutez policy`,
      );
    }
    input = { ...input, claimIntervalSeconds, releasePolicy: releasePolicy(input.releasePolicy) };
    if (claimIntervalSeconds > 0 && input.releasePolicy.kind !== "rolling_delay") {
      throw new CompanionServiceError(
        "claim_interval_not_applicable",
        "FIFO claim pacing is available only with the rolling-delay release option; use zero for this release policy",
      );
    }
    if (!new Set(["pin_on_claim", "public_prepin_private_manifest"]).has(input.assetStrategy)) {
      throw new CompanionServiceError("invalid_asset_strategy", "Asset strategy must be pin_on_claim or public_prepin_private_manifest");
    }
    const existing = this.journal.getProject(input.dropRef);
    if (existing) {
      const same = existing.network === input.network
        && existing.creator === input.creator
        && existing.creator_public_key === (input.creatorPublicKey ?? null)
        && existing.administrator === input.administrator
        && existing.treasury === input.treasury
        && existing.physical_supply === input.physicalSupply
        && existing.asset_strategy === input.assetStrategy
        && existing.claim_interval_seconds === input.claimIntervalSeconds
        && existing.fulfillment_subsidy_mutez === input.fulfillmentSubsidyMutez
        && JSON.stringify(JSON.parse(existing.release_policy_json)) === JSON.stringify(input.releasePolicy);
      if (!same) throw new CompanionServiceError("project_identity_conflict", "This drop reference is already bound to another immutable project", 409);
      return this.adminProject(input.dropRef);
    }
    const chain = generateEntropyChain(input.physicalSupply);
    const entropy = await encryptEntropyForKeyring({
      chain,
      dropRef: input.dropRef,
      privateAssetDir: this.config.privateAssetDir,
      masterKeyFile: this.config.masterKeyFile,
      keyVersion: "master-key-v1",
    });
    try {
      this.journal.createProject({
        ...input,
        entropyHead: chain.publicHead,
        entropyLength: chain.chainLength,
        entropyKeyringPath: entropy.encryptedPath,
        signerAddress: this.watcher.signerAddress,
      });
    } catch (error) {
      await removePrivateFile(entropy.encryptedPath);
      throw error;
    }
    return this.adminProject(input.dropRef);
  }

  async uploadArtifact({ dropRef, uploadId, source }) {
    const project = requireProject(this.journal, dropRef);
    if (!["staging", "attached"].includes(project.state)) {
      throw new CompanionServiceError("project_setup_locked", "Private uploads are locked after the Companion is armed", 409);
    }
    if (!UPLOAD_REF.test(uploadId || "")) throw new CompanionServiceError("invalid_upload_ref", "Upload reference must be a UUID");
    if (this.journal.getUpload(uploadId)) throw new CompanionServiceError("upload_exists", "Upload reference is already used", 409);
    const destinationPath = path.join(this.config.uploadDir, `${dropRef}-${uploadId}.upload.enc`);
    const encrypted = await encryptPrivateStream({
      source,
      destinationPath,
      masterKeyFile: this.config.masterKeyFile,
      keyVersion: "master-key-v1",
    });
    try {
      this.journal.createUpload({
        uploadId,
        dropRef,
        encryptedPath: destinationPath,
        checksumSha256: encrypted.plaintextSha256,
      });
    } catch (error) {
      await removePrivateFile(destinationPath);
      throw error;
    }
    return { schema: "pasta.macaroni-companion-upload.v1", uploadId, state: "encrypted_private" };
  }

  async stageToken(input) {
    const project = requireProject(this.journal, input.dropRef);
    if (!["staging", "attached"].includes(project.state)) {
      throw new CompanionServiceError("project_setup_locked", "Token staging is locked after the Companion is armed", 409);
    }
    if (!Number.isSafeInteger(input.tokenId) || input.tokenId < 0) throw new CompanionServiceError("invalid_token_id", "Token id must be a natural number");
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new CompanionServiceError("invalid_quantity", "Quantity must be positive");
    if (!input.metadata || typeof input.metadata !== "object" || Array.isArray(input.metadata)) {
      throw new CompanionServiceError("invalid_metadata", "Token metadata must be a JSON object");
    }
    const existing = this.journal.getToken(input.dropRef, input.tokenId);
    if (existing) return publicSetupToken(existing);
    const tokens = this.journal.listTokens(input.dropRef);
    if (input.tokenId !== tokens.length) throw new CompanionServiceError("non_sequential_token", `Next token id must be ${tokens.length}`);
    const upload = this.journal.getUpload(input.uploadId);
    if (!upload || upload.drop_ref !== input.dropRef || upload.state !== "uploaded") {
      throw new CompanionServiceError("upload_unavailable", "Encrypted private artifact upload is missing or already consumed");
    }
    const optionalUploads = [];
    for (const [kind, uploadId] of [["display", input.displayUploadId], ["thumbnail", input.thumbnailUploadId]]) {
      if (uploadId == null) continue;
      const auxiliary = this.journal.getUpload(uploadId);
      if (!auxiliary || auxiliary.drop_ref !== input.dropRef || auxiliary.state !== "uploaded") {
        throw new CompanionServiceError("upload_unavailable", `Encrypted private ${kind} upload is missing or already consumed`);
      }
      optionalUploads.push({ kind, uploadId, upload: auxiliary });
    }
    const stagedSupply = tokens.reduce((sum, token) => sum + token.quantity, 0);
    if (stagedSupply + input.quantity > project.physical_supply) {
      throw new CompanionServiceError("supply_exceeded", "Token quantities exceed the fixed physical supply");
    }

    const tempRoot = path.join(this.config.tempDir, randomUUID());
    await mkdir(tempRoot, { recursive: true, mode: 0o700 });
    const rawArtifactPath = path.join(tempRoot, "artifact.raw");
    const artifactCarPath = path.join(tempRoot, "artifact.car");
    const metadataCarPath = path.join(tempRoot, "metadata.car");
    const auxiliaryTemp = Object.fromEntries(optionalUploads.map(({ kind }) => [kind, {
      rawPath: path.join(tempRoot, `${kind}.raw`),
      carPath: path.join(tempRoot, `${kind}.car`),
    }]));
    const suffix = randomUUID();
    const artifactEncryptedPath = path.join(this.config.privateAssetDir, `${input.dropRef}-${input.tokenId}-${suffix}.artifact.car.enc`);
    const metadataEncryptedPath = path.join(this.config.privateAssetDir, `${input.dropRef}-${input.tokenId}-${suffix}.metadata.car.enc`);
    const privateManifestPath = path.join(this.config.privateAssetDir, `${input.dropRef}-${input.tokenId}-${suffix}.manifest.enc`);
    const auxiliaryEncryptedPaths = Object.fromEntries(optionalUploads.map(({ kind }) => [kind,
      path.join(this.config.privateAssetDir, `${input.dropRef}-${input.tokenId}-${suffix}.${kind}.car.enc`),
    ]));
    try {
      await decryptPrivateFileToPath({ encryptedPath: upload.encrypted_path, destinationPath: rawArtifactPath, masterKeyFile: this.config.masterKeyFile });
      await Promise.all(optionalUploads.map(({ kind, upload: auxiliary }) => decryptPrivateFileToPath({
        encryptedPath: auxiliary.encrypted_path,
        destinationPath: auxiliaryTemp[kind].rawPath,
        masterKeyFile: this.config.masterKeyFile,
      })));
      const staged = await stageToken({
        artifactPath: rawArtifactPath,
        artifactCarPath,
        displayPath: auxiliaryTemp.display?.rawPath,
        displayCarPath: auxiliaryTemp.display?.carPath,
        thumbnailPath: auxiliaryTemp.thumbnail?.rawPath,
        thumbnailCarPath: auxiliaryTemp.thumbnail?.carPath,
        metadataCarPath,
        metadata: input.metadata,
      });
      const metadataNonce = randomBytes(32).toString("hex");
      const metadataUri = `ipfs://${staged.metadata.cid}`;
      const commitment = metadataCommitment({ tokenId: input.tokenId, metadataUri, metadataNonce });
      const [artifactEncrypted, metadataEncrypted, ...auxiliaryEncrypted] = await Promise.all([
        encryptPrivateFile({ sourcePath: artifactCarPath, destinationPath: artifactEncryptedPath, masterKeyFile: this.config.masterKeyFile, keyVersion: "master-key-v1" }),
        encryptPrivateFile({ sourcePath: metadataCarPath, destinationPath: metadataEncryptedPath, masterKeyFile: this.config.masterKeyFile, keyVersion: "master-key-v1" }),
        ...optionalUploads.map(({ kind }) => encryptPrivateFile({
          sourcePath: auxiliaryTemp[kind].carPath,
          destinationPath: auxiliaryEncryptedPaths[kind],
          masterKeyFile: this.config.masterKeyFile,
          keyVersion: "master-key-v1",
        })),
      ]);
      const duplicateArtifact = this.journal.findArtifactChecksum(input.dropRef, artifactEncrypted.plaintextSha256);
      if (duplicateArtifact) {
        throw new CompanionServiceError(
          "duplicate_artifact_in_drop",
          `This exact artifact is already staged as token ${duplicateArtifact.token_id}. Increase that token's edition quantity instead of creating a duplicate row.`,
          409
        );
      }
      await encryptJsonFile({
        value: {
          schema: "pasta.macaroni-companion-private-token.v1",
          tokenId: input.tokenId,
          artifactCid: staged.artifact.cid,
          metadataCid: staged.metadata.cid,
          metadataUri,
          metadataNonce,
          ...(staged.display ? { displayCid: staged.display.cid } : {}),
          ...(staged.thumbnail ? { thumbnailCid: staged.thumbnail.cid } : {}),
        },
        destinationPath: privateManifestPath,
        masterKeyFile: this.config.masterKeyFile,
        keyVersion: "master-key-v1",
      });
      const token = this.journal.saveStagedToken({
        dropRef: input.dropRef,
        tokenId: input.tokenId,
        quantity: input.quantity,
        metadataCommitment: commitment,
        privateManifestPath,
        artifactChecksum: artifactEncrypted.plaintextSha256,
        artifactEncryptedPath,
        metadataChecksum: metadataEncrypted.plaintextSha256,
        metadataEncryptedPath,
        uploadId: input.uploadId,
        uploadIds: [...new Set([input.uploadId, ...optionalUploads.map((item) => item.uploadId)])],
        auxiliaryAssets: optionalUploads.map(({ kind }, index) => ({
          kind,
          checksumSha256: auxiliaryEncrypted[index].plaintextSha256,
          encryptedCarPath: auxiliaryEncryptedPaths[kind],
        })),
      });
      // The database transaction above is now the source of truth. Failure to
      // remove the already-consumed upload must leave the committed CARs and
      // private manifest intact; the stale ciphertext is safe to clean later.
      await Promise.all([...new Set([upload.encrypted_path, ...optionalUploads.map((item) => item.upload.encrypted_path)])]
        .map((encryptedPath) => removePrivateFile(encryptedPath).catch(() => undefined)));
      return publicSetupToken(token);
    } catch (error) {
      await Promise.all([
        removePrivateFile(artifactEncryptedPath),
        removePrivateFile(metadataEncryptedPath),
        removePrivateFile(privateManifestPath),
        ...Object.values(auxiliaryEncryptedPaths).map((encryptedPath) => removePrivateFile(encryptedPath)),
      ]);
      throw error;
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  async attachContract(dropRef, contractAddress) {
    const project = requireProject(this.journal, dropRef);
    if (!CONTRACT_ADDRESS.test(contractAddress || "")) throw new CompanionServiceError("invalid_contract", "Contract must be a KT1 address");
    if (project.contract_address) {
      if (project.contract_address !== contractAddress) throw new CompanionServiceError("contract_conflict", "Project is already attached to another contract", 409);
      return this.adminProject(dropRef);
    }
    const candidate = { ...project, contract_address: contractAddress };
    // Contract attachment is irreversible locally, so never bind from the
    // mutable head. Reading head-2 by canonical hash places two blocks on top
    // and rejects a KT1 that exists only in either still-reorganizable block.
    const finalized = await this.watcher.finalizedHeadSnapshot();
    await this.watcher.verifyContractBinding(candidate, [], {
      requirePristine: true,
      atBlock: finalized.blockHash,
    });
    this.journal.attachContract(dropRef, contractAddress);
    return this.adminProject(dropRef);
  }

  async privateTokenMaterial(dropRef, tokenId) {
    const token = this.journal.getToken(dropRef, tokenId);
    if (!token) throw new Error(`Private token ${tokenId} is not staged`);
    const material = await decryptJsonFile({ encryptedPath: token.private_manifest_path, masterKeyFile: this.config.masterKeyFile });
    const commitment = metadataCommitment({ tokenId, metadataUri: material.metadataUri, metadataNonce: material.metadataNonce });
    if (commitment !== token.metadata_commitment || material.tokenId !== tokenId) throw new Error("Private token manifest does not open the committed metadata row");
    return { token, material };
  }

  async publishAsset(dropRef, tokenId, kind) {
    const { token, material } = await this.privateTokenMaterial(dropRef, tokenId);
    const auxiliary = kind === "display" || kind === "thumbnail";
    const assetId = auxiliary ? null : kind === "artifact" ? token.artifact_asset_id : token.metadata_asset_id;
    const expectedCid = kind === "artifact" ? material.artifactCid
      : kind === "metadata" ? material.metadataCid
        : kind === "display" ? material.displayCid
          : material.thumbnailCid;
    const asset = auxiliary ? this.journal.getAuxAsset(dropRef, tokenId, kind) : this.journal.getAsset(assetId);
    if (!asset && !expectedCid) return { state: "not_configured" };
    if (!asset || !expectedCid) throw new Error(`Private ${kind} custody is incomplete`);
    if (asset.state === "verified") return { state: "verified" };
    const tempRoot = path.join(this.config.tempDir, randomUUID());
    await mkdir(tempRoot, { recursive: true, mode: 0o700 });
    const carPath = path.join(tempRoot, `${kind}.car`);
    try {
      await decryptPrivateFileToPath({ encryptedPath: asset.encrypted_car_path, destinationPath: carPath, masterKeyFile: this.config.masterKeyFile });
      const local = await verifyCar(carPath, expectedCid);
      if (!local.valid) throw new Error(`Encrypted ${kind} CAR no longer matches its committed root`);
      const mark = (state, error = null) => auxiliary
        ? this.journal.markAuxAsset(asset.id, state, error)
        : this.journal.markAsset(assetId, state, error);
      mark("publishing");
      await this.pinning.publishCommittedCar({ carPath, expectedCid });
      mark("published");
      await this.pinning.verifyPublishedCid(expectedCid);
      mark("verified");
      return { state: "verified" };
    } catch (error) {
      if (auxiliary) this.journal.markAuxAsset(asset.id, "error", error instanceof Error ? error.message : String(error));
      else this.journal.markAsset(assetId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  async pinPublicContractMetadata(dropRef, input) {
    const project = requireProject(this.journal, dropRef);
    if (project.contract_address) throw new CompanionServiceError("public_metadata_locked", "Public collection metadata must be pinned before origination", 409);
    const upload = this.journal.getUpload(input.uploadId);
    if (!upload || upload.drop_ref !== dropRef || upload.state !== "uploaded") {
      throw new CompanionServiceError("upload_unavailable", "Encrypted collection-cover upload is missing or already consumed");
    }
    const name = String(input.name || "").trim();
    const description = String(input.description || "").trim();
    const homepage = input.homepage == null ? "" : String(input.homepage).trim();
    if (!name || !description) throw new CompanionServiceError("invalid_public_metadata", "Collection name and description are required");
    if (homepage && !/^https:\/\/[^\s]+$/i.test(homepage)) throw new CompanionServiceError("invalid_homepage", "Homepage must be an https URL");
    const requestDigest = createHash("sha256").update(JSON.stringify({
      registrationDigest: project.registration_digest,
      name,
      description,
      homepage,
      coverChecksumSha256: upload.checksum_sha256,
    })).digest("hex");
    const existing = this.journal.getPublicContractMetadata(dropRef);
    if (existing) {
      if (existing.request_digest !== requestDigest) throw new CompanionServiceError("public_metadata_conflict", "Public collection metadata is already bound to different immutable input", 409);
      return {
        schema: "pasta.macaroni-companion-public-contract-metadata.v1",
        contractMetadataUri: existing.contract_metadata_uri,
        publicCoverUri: existing.public_cover_uri,
        state: "pinned_verified",
      };
    }
    const tempRoot = path.join(this.config.tempDir, randomUUID());
    await mkdir(tempRoot, { recursive: true, mode: 0o700 });
    const rawCoverPath = path.join(tempRoot, "cover.raw");
    const coverCarPath = path.join(tempRoot, "cover.car");
    const metadataCarPath = path.join(tempRoot, "contract-metadata.car");
    try {
      await decryptPrivateFileToPath({ encryptedPath: upload.encrypted_path, destinationPath: rawCoverPath, masterKeyFile: this.config.masterKeyFile });
      const cover = await stageToCar({ source: createReadStream(rawCoverPath), carPath: coverCarPath });
      const publicCoverUri = `ipfs://${cover.cid}`;
      const publicMetadata = {
        name,
        description,
        version: "1.0.0",
        authors: [project.creator],
        ...(homepage ? { homepage } : {}),
        interfaces: ["TZIP-012", "TZIP-016", "TZIP-021"],
        imageUri: publicCoverUri,
      };
      const metadata = await stageToCar({ source: canonicalMetadataBytes(publicMetadata), carPath: metadataCarPath });
      await this.pinning.publishCommittedCar({ carPath: coverCarPath, expectedCid: cover.cid });
      await this.pinning.verifyPublishedCid(cover.cid);
      await this.pinning.publishCommittedCar({ carPath: metadataCarPath, expectedCid: metadata.cid });
      await this.pinning.verifyPublishedCid(metadata.cid);
      const contractMetadataUri = `ipfs://${metadata.cid}`;
      this.journal.savePublicContractMetadata({
        dropRef,
        requestDigest,
        contractMetadataUri,
        publicCoverUri,
        metadataChecksumSha256: metadata.carSha256,
        coverChecksumSha256: cover.carSha256,
      });
      this.journal.db.prepare("UPDATE private_uploads SET state='consumed', consumed_at=? WHERE upload_id=? AND drop_ref=? AND state='uploaded'")
        .run(Date.now(), input.uploadId, dropRef);
      await removePrivateFile(upload.encrypted_path).catch(() => undefined);
      return { schema: "pasta.macaroni-companion-public-contract-metadata.v1", contractMetadataUri, publicCoverUri, state: "pinned_verified" };
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  async storeSignedOperation({ dropRef, operationRef, signedBytes, expectedSha256 }) {
    requireProject(this.journal, dropRef);
    if (!/^[a-z0-9-]+$/i.test(String(operationRef || ""))) throw new Error("Signed operation reference is invalid");
    await mkdir(path.join(this.config.privateAssetDir, "signed-operations"), { recursive: true, mode: 0o700 });
    const destinationPath = path.join(
      this.config.privateAssetDir,
      "signed-operations",
      `${dropRef}-${operationRef}-${randomUUID()}.signed.enc`
    );
    const stored = await encryptPrivateBytes({
      plaintext: Buffer.from(signedBytes, "hex"),
      destinationPath,
      masterKeyFile: this.config.masterKeyFile,
      keyVersion: "master-key-v1",
    });
    if (stored.plaintextSha256 !== expectedSha256) {
      await removePrivateFile(destinationPath);
      throw new Error("Signed settlement changed before durable custody");
    }
    return { signedBytesPath: destinationPath, signedBytesSha256: stored.plaintextSha256 };
  }

  async loadSignedOperation({ signedBytesPath, expectedSha256 }) {
    const bytes = await decryptPrivateFile({
      encryptedPath: signedBytesPath,
      masterKeyFile: this.config.masterKeyFile,
    });
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== expectedSha256) throw new Error("Persisted signed settlement failed integrity verification");
    return bytes.toString("hex");
  }

  async duplicateCidPreflight(dropRef) {
    requireProject(this.journal, dropRef);
    const tokens = this.journal.listTokens(dropRef);
    const internalDuplicates = this.journal.duplicateArtifactRows(dropRef);
    if (internalDuplicates.length > 0) {
      throw new CompanionServiceError("duplicate_artifact_in_drop", "Two token rows use the exact same artifact bytes. Use one token row with a larger edition quantity instead.", 409);
    }
    const privateRows = [];
    for (const token of tokens) {
      const { material } = await this.privateTokenMaterial(dropRef, token.token_id);
      privateRows.push({ tokenId: token.token_id, artifactUri: `ipfs://${material.artifactCid}`, metadataUri: material.metadataUri });
    }
    try {
      const result = await this.watcher.duplicateCidCheck(privateRows);
      const report = {
        checkedAt: new Date().toISOString(),
        checkedTokenRows: result.checked,
        matches: result.matches,
        privacyMode: result.mode || this.config.duplicateCheckMode,
        cidValuesOmitted: true,
      };
      this.journal.setDuplicateCheck(dropRef, result.matches.length === 0 ? "clear" : "blocked", report);
      if (result.matches.length > 0) {
        throw new CompanionServiceError(
          "duplicate_cid_detected",
          "Launch is blocked because Objkt already indexes one or more matching artifact or metadata CIDs. Replace or investigate those rows before finalizing the drop.",
          409
        );
      }
      return report;
    } catch (error) {
      if (error instanceof CompanionServiceError) throw error;
      this.journal.setDuplicateCheck(dropRef, "unavailable", { checkedAt: new Date().toISOString(), error: "indexer_unavailable", cidValuesOmitted: true });
      throw new CompanionServiceError("duplicate_check_unavailable", "Launch remains blocked because the configured duplicate-CID indexer check could not complete", 503);
    }
  }

  async preflight(dropRef) {
    const project = requireProject(this.journal, dropRef);
    if (!project.contract_address) throw new CompanionServiceError("contract_not_attached", "Attach the originated V3.5 contract first", 409);
    const tokens = this.journal.listTokens(dropRef);
    if (tokens.reduce((sum, token) => sum + token.quantity, 0) !== project.physical_supply) {
      throw new CompanionServiceError("inventory_incomplete", "Private token quantities must exactly equal physical supply", 409);
    }
    const { storage } = await this.watcher.verifyContractBinding(project, tokens);
    if (storage.setup_finalized !== true || storage.sale_activated !== false || storage.sale_active !== false
      || storage.sale_permanently_closed !== false || storage.fulfillment_armed !== false) {
      throw new CompanionServiceError(
        "contract_not_closed_and_finalized",
        "Finish contract setup while the sale is still closed, then run Companion preflight immediately before the activation transaction",
        409
      );
    }
    const funding = await this.watcher.activationFunding(project, storage);
    if (!funding.sufficient) {
      throw new CompanionServiceError(
        "fulfillment_reserve_underfunded",
        funding.hasFreeStage
          ? `A drop with a free stage must fund its full fulfillment lifecycle before activation (${funding.requiredMutez} mutez required; ${funding.balanceMutez} present)`
          : `The five-settlement starting reserve is not funded (${funding.requiredMutez} mutez required; ${funding.balanceMutez} present)`,
        409
      );
    }
    const measuredFunding = await this.fundingPolicy();
    const armCostMutez = await this.watcher.estimateArmFulfillmentCost(project.contract_address);
    const finalizerRequiredMutez = measuredFunding.fiveSettlementStartupMutez + armCostMutez;
    const finalizerFunding = await this.watcher.finalizerFunding(finalizerRequiredMutez);
    if (!finalizerFunding.revealed) {
      throw new CompanionServiceError(
        "finalizer_not_revealed",
        "Reveal the dedicated finalizer account on Tezos before arming this drop",
        409,
      );
    }
    if (!finalizerFunding.sufficient) {
      throw new CompanionServiceError(
        "finalizer_underfunded",
        `Finalizer wallet needs ${finalizerFunding.requiredMutez} mutez for the measured five-settlement startup amount plus this arm operation; ${finalizerFunding.balanceMutez} mutez is present`,
        409,
      );
    }
    // Prove the exact remote buyer path before any private-CID audit, public
    // pre-pin, or finalizer arm operation can begin. A desktop loopback service
    // is sufficient for setup, but never for a remotely hosted drop page.
    const collectorPublishing = await this.verifyPublicCollectorReachability(dropRef);
    const duplicateReport = await this.duplicateCidPreflight(dropRef);
    if (project.asset_strategy === "public_prepin_private_manifest") {
      for (const token of tokens) {
        await this.publishAsset(dropRef, token.token_id, "artifact");
        await this.publishAsset(dropRef, token.token_id, "display");
        await this.publishAsset(dropRef, token.token_id, "thumbnail");
        await this.publishAsset(dropRef, token.token_id, "metadata");
      }
    }
    // Armed is deliberately runnable before the public sale opens. The worker
    // observes the closed contract first, then notices the creator's final
    // activation transaction without leaving a fulfillment startup gap.
    this.journal.setProjectState(dropRef, "armed");
    this.journal.enqueue({
      dropRef,
      workType: "arm_fulfillment",
      semanticKey: "arm_fulfillment:v1",
      payload: {},
      eligibleAt: Date.now(),
    });
    return {
      schema: "pasta.macaroni-companion-preflight.v1",
      readyForCreatorActivation: false,
      companionArmed: true,
      onChainFulfillmentArmed: false,
      nextStep: "Wait until lifecycle.fulfillmentArmed is true, then sign activate_sale as the final creator transaction.",
      fulfillmentReserve: {
        balanceMutez: funding.balanceMutez.toString(),
        requiredMutez: funding.requiredMutez.toString(),
        coversFullSupplyBecauseFreeStageExists: funding.hasFreeStage,
      },
      finalizerFunding: {
        balanceMutez: finalizerFunding.balanceMutez.toString(),
        requiredMutez: finalizerFunding.requiredMutez.toString(),
        accountRevealed: finalizerFunding.revealed,
        measuredFiveSettlementStartupMutez: measuredFunding.fiveSettlementStartupMutez,
        estimatedArmCostMutez: armCostMutez,
      },
      collectorPublishing,
      duplicateReport,
      assetStrategy: project.asset_strategy,
      warnings: [
        project.asset_strategy === "public_prepin_private_manifest"
          ? "Final plaintext artifact and metadata CARs are already public on IPFS. Only their CID/nonce mapping remains private, so this faster option carries pre-mint discoverability and copy-mint risk."
          : null,
        this.config.duplicateCheckMode === "external_direct_lookup"
          ? "The advanced direct duplicate lookup sent every private artifact and metadata CID to the configured index service before sale."
          : null,
      ].filter(Boolean),
    };
  }

  async activate(dropRef) {
    let project = requireProject(this.journal, dropRef);
    const tokens = this.journal.listTokens(dropRef);
    let { storage } = await this.watcher.verifyContractBinding(project);
    const soldOut = asSafeNat(storage.claims_created, "claims_created") === project.physical_supply;
    const permanentlyClosed = storage.sale_permanently_closed === true;
    if (permanentlyClosed && storage.sale_activated !== true) {
      this.journal.updateLifecycle(dropRef, {
        saleActivated: false,
        salePermanentlyClosed: true,
        fulfillmentArmed: storage.fulfillment_armed === true,
        finalSweepComplete: storage.final_sweep_complete === true,
      });
      this.journal.setProjectState(dropRef, storage.final_sweep_complete === true ? "complete" : "finishing");
      return this.adminProject(dropRef);
    }
    await this.verifyPublicCollectorReachability(dropRef);
    if (project.duplicate_check_state !== "clear") throw new CompanionServiceError("duplicate_check_required", "A successful duplicate-CID check is required before activation", 409);
    ({ storage } = await this.watcher.verifyContractBinding(project, tokens));
    if (storage.setup_finalized !== true || storage.sale_activated !== true
      || storage.fulfillment_armed !== true
      || (storage.sale_active !== true && !soldOut && !permanentlyClosed)) {
      throw new CompanionServiceError(
        "contract_not_active",
        storage.fulfillment_armed === true
          ? "The creator's on-chain activation transaction has not been observed yet"
          : "The finalizer's on-chain fulfillment handshake is not final yet; do not sign activate_sale",
        409
      );
    }
    if (project.asset_strategy === "public_prepin_private_manifest"
      && tokens.some((token) => token.artifact_state !== "verified" || token.metadata_state !== "verified"
        || (token.display_state && token.display_state !== "verified")
        || (token.thumbnail_state && token.thumbnail_state !== "verified"))) {
      throw new CompanionServiceError("prepin_incomplete", "Every plaintext CAR must be publicly verified before this pre-pin drop can activate", 409);
    }
    this.journal.updateLifecycle(dropRef, {
      saleActivated: true,
      salePermanentlyClosed: permanentlyClosed,
      fulfillmentArmed: true,
      finalSweepComplete: storage.final_sweep_complete === true,
    });
    this.journal.setProjectState(dropRef, soldOut || permanentlyClosed ? "finishing" : "active");
    return this.adminProject(dropRef);
  }

  adminProject(dropRef) {
    const project = requireProject(this.journal, dropRef);
    const tokens = this.journal.listTokens(dropRef).map(publicSetupToken);
    const duplicateReport = project.duplicate_report_json ? JSON.parse(project.duplicate_report_json) : null;
    const publicMetadata = this.journal.getPublicContractMetadata(dropRef);
    const activeCreatorAction = this.journal.activeCreatorAttempt(dropRef);
    const creatorSteps = this.journal.listCreatorSteps(dropRef);
    const collectorPublishing = this.collectorConfiguration();
    const publishable = collectorPublishing.ready
      && ["armed", "active", "finishing", "complete"].includes(project.state);
    const publicBase = publishable
      ? `${collectorPublishing.publicBaseUrl}/v1/public/projects/${encodeURIComponent(project.drop_ref)}`
      : null;
    return {
      schema: "pasta.macaroni-companion-project.v1",
      dropRef: project.drop_ref,
      registrationDigest: project.registration_digest,
      network: project.network,
      creator: project.creator,
      administrator: project.administrator,
      treasury: project.treasury,
      physicalSupply: project.physical_supply,
      assetStrategy: project.asset_strategy,
      releasePolicy: JSON.parse(project.release_policy_json),
      claimIntervalSeconds: project.claim_interval_seconds,
      fulfillmentSubsidyMutez: project.fulfillment_subsidy_mutez,
      entropyHead: project.entropy_head,
      entropyLength: project.entropy_length,
      finalizer: project.signer_address,
      contract: project.contract_address,
      state: project.state,
      lifecycle: {
        saleActivated: Boolean(project.sale_activated),
        salePermanentlyClosed: Boolean(project.sale_permanently_closed),
        fulfillmentArmed: Boolean(project.fulfillment_armed),
        finalSweepComplete: Boolean(project.final_sweep_complete),
      },
      duplicateCheck: { state: project.duplicate_check_state, report: duplicateReport },
      publicContractMetadata: publicMetadata ? {
        state: "pinned_verified",
        contractMetadataUri: publicMetadata.contract_metadata_uri,
        publicCoverUri: publicMetadata.public_cover_uri,
      } : { state: "required", contractMetadataUri: null, publicCoverUri: null },
      creatorSetup: {
        planRegistered: Boolean(this.journal.getCreatorPlan(dropRef)),
        activeAttempt: activeCreatorAction ? {
          attemptId: activeCreatorAction.id,
          state: activeCreatorAction.state,
          operationHash: activeCreatorAction.operation_hash,
        } : null,
        completedSteps: creatorSteps.filter((step) => step.state === "complete").map((step) => step.step_key),
      },
      tokens,
      collectorPublishing,
      publicStatusUrl: publicBase ? `${publicBase}/status` : null,
      publicStaticManifestUrl: publicBase ? `${publicBase}/static-manifest` : null,
      claimStatusUrlTemplate: publicBase ? `${publicBase}/claims/{claimId}` : null,
      purchaseStatusUrlTemplate: publicBase ? `${publicBase}/purchases/{operationHash}` : null,
      wakeUrl: publicBase ? `${publicBase}/wake` : null,
    };
  }

  publicProjectStatus(dropRef) {
    const stats = this.journal.publicStats(dropRef);
    if (!stats) throw new CompanionServiceError("project_not_found", "Macaroni project was not found", 404);
    const project = stats.project;
    return {
      schema: "pasta.macaroni-companion-public-status.v1",
      network: project.network,
      contract: project.contract_address,
      serviceReady: project.state === "armed" || project.state === "active" || project.state === "finishing" || project.state === "complete",
      state: project.state,
      salePermanentlyClosed: Boolean(project.sale_permanently_closed),
      fulfillmentArmed: Boolean(project.fulfillment_armed),
      readyForCreatorActivation: project.state === "armed" && Boolean(project.fulfillment_armed),
      saleCanceledBeforeActivation: !project.sale_activated && Boolean(project.sale_permanently_closed),
      finalSweepComplete: Boolean(project.final_sweep_complete),
      assetStrategy: project.asset_strategy,
      assetStrategyDisclosure: project.asset_strategy === "public_prepin_private_manifest"
        ? "Final plaintext CARs were pinned publicly before sale; the CID/nonce mapping remained private until allocation."
        : "Final artifact and metadata CARs remain private until the corresponding NFT settlement is final.",
      progress: {
        physicalSupply: project.physical_supply,
        purchasesConfirmed: stats.confirmed,
        artworkSecured: stats.secured,
        nftReady: stats.ready,
        needsOperatorAttention: stats.attention,
      },
      lifecycle: ["Purchase confirmed", "Artwork secured", "Publishing to IPFS", "NFT ready"],
      attribution: { indexer: "Data provided by TzKT API", href: "https://tzkt.io" },
    };
  }

  async publicStaticManifest(dropRef) {
    const project = requireProject(this.journal, dropRef);
    if (!project.contract_address) throw new CompanionServiceError("contract_not_attached", "Drop contract is not attached", 409);
    const publicMetadata = this.journal.getPublicContractMetadata(dropRef);
    if (!publicMetadata) throw new CompanionServiceError("public_metadata_missing", "Public contract metadata is not bound", 409);
    const publishing = await this.verifyPublicCollectorReachability(dropRef);
    if (!["armed", "active", "finishing", "complete"].includes(project.state)) {
      throw new CompanionServiceError("collector_export_not_armed", "Run the complete Companion preflight before exporting this drop page", 409);
    }
    const base = `${publishing.publicBaseUrl}/v1/public/projects/${encodeURIComponent(project.drop_ref)}`;
    return {
      schema: "pasta.macaroni-service.v1",
      mode: "creator_companion",
      network: project.network,
      contract: project.contract_address,
      contractMetadataUri: publicMetadata.contract_metadata_uri,
      publicCoverUri: publicMetadata.public_cover_uri,
      status: project.state,
      statusSource: "tezos_chain_and_companion",
      statusUrl: `${base}/status`,
      claimStatusUrlTemplate: `${base}/claims/{claimId}`,
      purchaseStatusUrlTemplate: `${base}/purchases/{operationHash}`,
      wakeUrl: `${base}/wake`,
      containsSecrets: false,
    };
  }

  publicClaimStatus(dropRef, claimId) {
    requireProject(this.journal, dropRef);
    if (!Number.isSafeInteger(claimId) || claimId < 0) throw new CompanionServiceError("invalid_claim", "Claim id must be a natural number");
    const claim = this.journal.getClaim(dropRef, claimId);
    if (!claim) throw new CompanionServiceError("claim_not_found", "Claim has not been observed on-chain", 404);
    const secured = ["artwork_secured", "publishing_to_ipfs", "nft_ready"].includes(claim.state);
    return {
      schema: "pasta.macaroni-companion-public-claim.v1",
      claimId,
      buyer: claim.buyer,
      recipient: claim.recipient,
      state: claim.state,
      tokenId: secured ? claim.token_id : null,
      settlementOperationHash: secured ? claim.settlement_operation_hash : null,
      message: {
        purchase_confirmed: "Your paid claim is confirmed and its FIFO allocation cannot be rerolled.",
        allocation_simulated: "Your paid claim is confirmed and waiting for final settlement.",
        artwork_secured: "Your final NFT was minted to the purchasing wallet after finalized settlement.",
        publishing_to_ipfs: "The committed artwork is being published to IPFS; this continues if the tab closes.",
        nft_ready: "The committed artifact and metadata are publicly retrievable.",
        attention_required: "Automatic fulfillment stopped safely and needs the creator's attention.",
      }[claim.state] || "Fulfillment is continuing.",
    };
  }
}
