import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function canonical(value) {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

export function digest(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

const PRIVATE_KEY_PARTS = ["privatecid", "preimage", "secret", "privatekey", "nonce", "artifacturi", "metadatauri", "rawasset", "signerkey", "cid"];

export function assertPublicJournalPayload(value, location = "payload") {
  if (typeof value === "string" && /^ipfs:\/\//i.test(value)) throw new Error(`${location} cannot contain a private IPFS URI`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicJournalPayload(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (PRIVATE_KEY_PARTS.some((part) => normalizedKey.includes(part))) {
      throw new Error(`${location}.${key} is forbidden in the operation journal`);
    }
    assertPublicJournalPayload(child, `${location}.${key}`);
  }
}

function json(value) {
  return JSON.parse(value);
}

function transaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function openJournal(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS companion_projects (
      drop_ref TEXT PRIMARY KEY,
      registration_digest TEXT NOT NULL,
      network TEXT NOT NULL CHECK(network IN ('mainnet','shadownet')),
      creator TEXT NOT NULL,
      creator_public_key TEXT,
      administrator TEXT NOT NULL,
      treasury TEXT NOT NULL,
      physical_supply INTEGER NOT NULL CHECK(physical_supply > 0),
      asset_strategy TEXT NOT NULL CHECK(asset_strategy IN ('pin_on_claim','public_prepin_private_manifest')),
      release_policy_json TEXT NOT NULL,
      claim_interval_seconds INTEGER NOT NULL DEFAULT 0 CHECK(claim_interval_seconds >= 0),
      fulfillment_subsidy_mutez INTEGER NOT NULL CHECK(fulfillment_subsidy_mutez >= 0),
      entropy_head TEXT NOT NULL CHECK(length(entropy_head) = 64),
      entropy_length INTEGER NOT NULL CHECK(entropy_length = physical_supply),
      entropy_keyring_path TEXT NOT NULL,
      signer_address TEXT NOT NULL,
      contract_address TEXT,
      state TEXT NOT NULL DEFAULT 'staging',
      duplicate_check_state TEXT NOT NULL DEFAULT 'pending',
      duplicate_report_json TEXT,
      last_chain_level INTEGER,
      sale_activated INTEGER NOT NULL DEFAULT 0,
      sale_permanently_closed INTEGER NOT NULL DEFAULT 0,
      fulfillment_armed INTEGER NOT NULL DEFAULT 0,
      final_sweep_complete INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(network, contract_address)
    );
    CREATE TABLE IF NOT EXISTS private_uploads (
      upload_id TEXT PRIMARY KEY,
      drop_ref TEXT NOT NULL REFERENCES companion_projects(drop_ref),
      encrypted_path TEXT NOT NULL UNIQUE,
      checksum_sha256 TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'uploaded',
      created_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS custodied_assets (
      id INTEGER PRIMARY KEY,
      drop_ref TEXT NOT NULL REFERENCES companion_projects(drop_ref),
      token_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('artifact','metadata')),
      checksum_sha256 TEXT NOT NULL,
      encrypted_car_path TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'staged',
      published_at INTEGER,
      verified_at INTEGER,
      last_error TEXT,
      UNIQUE(drop_ref, token_id, kind)
    );
    CREATE TABLE IF NOT EXISTS token_inventory (
      drop_ref TEXT NOT NULL REFERENCES companion_projects(drop_ref),
      token_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      metadata_commitment TEXT NOT NULL CHECK(length(metadata_commitment) = 64),
      private_manifest_path TEXT NOT NULL UNIQUE,
      artifact_asset_id INTEGER NOT NULL REFERENCES custodied_assets(id),
      metadata_asset_id INTEGER NOT NULL REFERENCES custodied_assets(id),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(drop_ref, token_id),
      UNIQUE(drop_ref, metadata_commitment)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS custodied_assets_unique_artifact_bytes
      ON custodied_assets(drop_ref, checksum_sha256) WHERE kind='artifact';
    CREATE TABLE IF NOT EXISTS token_aux_assets (
      id INTEGER PRIMARY KEY,
      drop_ref TEXT NOT NULL REFERENCES companion_projects(drop_ref),
      token_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('display','thumbnail')),
      checksum_sha256 TEXT NOT NULL,
      encrypted_car_path TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'staged',
      published_at INTEGER,
      verified_at INTEGER,
      last_error TEXT,
      UNIQUE(drop_ref, token_id, kind),
      FOREIGN KEY(drop_ref, token_id) REFERENCES token_inventory(drop_ref, token_id)
    );
    CREATE TABLE IF NOT EXISTS public_contract_metadata (
      drop_ref TEXT PRIMARY KEY REFERENCES companion_projects(drop_ref),
      request_digest TEXT NOT NULL,
      contract_metadata_uri TEXT NOT NULL,
      public_cover_uri TEXT NOT NULL,
      metadata_checksum_sha256 TEXT NOT NULL,
      cover_checksum_sha256 TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      verified_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS creator_plans (
      drop_ref TEXT PRIMARY KEY REFERENCES companion_projects(drop_ref),
      plan_digest TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS creator_setup_steps (
      id INTEGER PRIMARY KEY,
      drop_ref TEXT NOT NULL REFERENCES companion_projects(drop_ref),
      step_key TEXT NOT NULL,
      logical_step TEXT NOT NULL,
      batch_index INTEGER,
      final_batch INTEGER,
      intent_digest TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      expected_postcondition_json TEXT NOT NULL,
      network TEXT NOT NULL,
      signer TEXT NOT NULL,
      target TEXT,
      entrypoint TEXT NOT NULL,
      amount_mutez INTEGER NOT NULL CHECK(amount_mutez >= 0),
      live_estimate_json TEXT,
      chunk_json TEXT,
      state TEXT NOT NULL DEFAULT 'pending',
      operation_hash TEXT,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(drop_ref, step_key)
    );
    CREATE TABLE IF NOT EXISTS creator_operation_attempts (
      id INTEGER PRIMARY KEY,
      drop_ref TEXT NOT NULL REFERENCES companion_projects(drop_ref),
      setup_step_id INTEGER NOT NULL REFERENCES creator_setup_steps(id),
      retry_of_attempt_id INTEGER REFERENCES creator_operation_attempts(id),
      request_id TEXT NOT NULL UNIQUE,
      intent_digest TEXT NOT NULL,
      network TEXT NOT NULL,
      signer TEXT NOT NULL,
      target TEXT,
      entrypoint TEXT NOT NULL,
      amount_mutez INTEGER NOT NULL CHECK(amount_mutez >= 0),
      parameters_json TEXT NOT NULL,
      expected_postcondition_json TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'awaiting_signature',
      operation_hash TEXT UNIQUE,
      issued_head_level INTEGER NOT NULL,
      prompt_started_head_level INTEGER,
      submitted_head_level INTEGER,
      originated_contract TEXT,
      reconciliation_json TEXT,
      error TEXT,
      submitted_at INTEGER,
      prompt_started_at INTEGER,
      reconciled_at INTEGER,
      applied_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    DROP INDEX IF EXISTS creator_one_active_attempt_per_project_v35;
    CREATE UNIQUE INDEX creator_one_active_attempt_per_project_v35
      ON creator_operation_attempts(drop_ref)
      WHERE state IN ('awaiting_signature','wallet_prompt_started','submitted','confirming','needs_reconciliation');
    CREATE TABLE IF NOT EXISTS purchase_claims (
      drop_ref TEXT NOT NULL REFERENCES companion_projects(drop_ref),
      claim_id INTEGER NOT NULL,
      buyer TEXT NOT NULL,
      recipient TEXT NOT NULL,
      unit INTEGER NOT NULL,
      purchase_level INTEGER NOT NULL,
      purchase_time INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      token_id INTEGER,
      allocation_digest TEXT,
      settlement_operation_hash TEXT,
      settled_at INTEGER,
      state TEXT NOT NULL DEFAULT 'purchase_confirmed',
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(drop_ref, claim_id)
    );
    CREATE TABLE IF NOT EXISTS work_items (
      id INTEGER PRIMARY KEY,
      drop_ref TEXT NOT NULL REFERENCES companion_projects(drop_ref),
      claim_ref TEXT,
      work_type TEXT NOT NULL,
      semantic_key TEXT NOT NULL,
      payload_digest TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      depends_on_id INTEGER REFERENCES work_items(id),
      state TEXT NOT NULL DEFAULT 'queued',
      eligible_at INTEGER NOT NULL,
      next_attempt_at INTEGER NOT NULL,
      lease_owner TEXT,
      lease_expires_at INTEGER,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      operation_hash TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(drop_ref, work_type, semantic_key)
    );
    CREATE TABLE IF NOT EXISTS operation_journal (
      id INTEGER PRIMARY KEY,
      work_item_id INTEGER NOT NULL UNIQUE REFERENCES work_items(id),
      request_id TEXT NOT NULL UNIQUE,
      intent_digest TEXT NOT NULL,
      expected_postcondition_json TEXT NOT NULL,
      network TEXT NOT NULL,
      signer TEXT NOT NULL,
      target TEXT NOT NULL,
      entrypoint TEXT NOT NULL,
      amount_mutez INTEGER NOT NULL,
      state TEXT NOT NULL,
      operation_hash TEXT UNIQUE,
      signed_bytes_path TEXT UNIQUE,
      signed_bytes_sha256 TEXT,
      branch TEXT,
      manager_counter TEXT,
      injected_at INTEGER,
      reconciliation_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signed_operation_attempts (
      id INTEGER PRIMARY KEY,
      operation_journal_id INTEGER NOT NULL REFERENCES operation_journal(id),
      attempt_number INTEGER NOT NULL CHECK(attempt_number >= 1),
      operation_hash TEXT NOT NULL UNIQUE,
      signed_bytes_path TEXT NOT NULL UNIQUE,
      signed_bytes_sha256 TEXT NOT NULL,
      branch TEXT NOT NULL,
      branch_level INTEGER NOT NULL CHECK(branch_level >= 0),
      manager_counter TEXT NOT NULL,
      state TEXT NOT NULL,
      injected_at INTEGER,
      reconciliation_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(operation_journal_id, attempt_number)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS operation_finalizer_single_flight_v35
      ON operation_journal(network, signer)
      WHERE state IN ('ready','signed','submitted','confirming');
    CREATE TRIGGER IF NOT EXISTS companion_project_identity_immutable
      BEFORE UPDATE ON companion_projects
      WHEN NEW.registration_digest IS NOT OLD.registration_digest
        OR NEW.network IS NOT OLD.network
        OR NEW.creator IS NOT OLD.creator
        OR NEW.administrator IS NOT OLD.administrator
        OR NEW.treasury IS NOT OLD.treasury
        OR NEW.physical_supply IS NOT OLD.physical_supply
        OR NEW.asset_strategy IS NOT OLD.asset_strategy
        OR NEW.release_policy_json IS NOT OLD.release_policy_json
        OR NEW.fulfillment_subsidy_mutez IS NOT OLD.fulfillment_subsidy_mutez
        OR NEW.entropy_head IS NOT OLD.entropy_head
        OR NEW.entropy_length IS NOT OLD.entropy_length
        OR NEW.entropy_keyring_path IS NOT OLD.entropy_keyring_path
        OR NEW.signer_address IS NOT OLD.signer_address
      BEGIN SELECT RAISE(ABORT, 'project identity cannot be changed'); END;
    CREATE TRIGGER IF NOT EXISTS project_contract_immutable
      BEFORE UPDATE OF contract_address ON companion_projects
      WHEN OLD.contract_address IS NOT NULL AND NEW.contract_address IS NOT OLD.contract_address
      BEGIN SELECT RAISE(ABORT, 'contract address cannot be replaced'); END;
    CREATE TRIGGER IF NOT EXISTS operation_hash_immutable_v35
      BEFORE UPDATE OF operation_hash ON operation_journal
      WHEN OLD.operation_hash IS NOT NULL AND NEW.operation_hash IS NOT OLD.operation_hash
      BEGIN SELECT RAISE(ABORT, 'operation hash cannot be replaced'); END;
    CREATE TRIGGER IF NOT EXISTS claim_settlement_hash_immutable_v35
      BEFORE UPDATE OF settlement_operation_hash ON purchase_claims
      WHEN OLD.settlement_operation_hash IS NOT NULL AND NEW.settlement_operation_hash IS NOT OLD.settlement_operation_hash
      BEGIN SELECT RAISE(ABORT, 'claim settlement operation hash cannot be replaced'); END;
    CREATE TRIGGER IF NOT EXISTS operation_journal_no_delete
      BEFORE DELETE ON operation_journal
      BEGIN SELECT RAISE(ABORT, 'operation journal is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS signed_operation_attempt_no_delete_v35
      BEFORE DELETE ON signed_operation_attempts
      BEGIN SELECT RAISE(ABORT, 'signed operation attempts are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS signed_operation_attempt_identity_immutable_v35
      BEFORE UPDATE ON signed_operation_attempts
      WHEN NEW.operation_journal_id IS NOT OLD.operation_journal_id
        OR NEW.attempt_number IS NOT OLD.attempt_number
        OR NEW.operation_hash IS NOT OLD.operation_hash
        OR NEW.signed_bytes_path IS NOT OLD.signed_bytes_path
        OR NEW.signed_bytes_sha256 IS NOT OLD.signed_bytes_sha256
        OR NEW.branch IS NOT OLD.branch
        OR NEW.branch_level IS NOT OLD.branch_level
        OR NEW.manager_counter IS NOT OLD.manager_counter
      BEGIN SELECT RAISE(ABORT, 'signed operation attempt identity cannot be changed'); END;
    CREATE TRIGGER IF NOT EXISTS creator_plan_no_update_v35
      BEFORE UPDATE ON creator_plans
      BEGIN SELECT RAISE(ABORT, 'creator plan cannot be changed'); END;
    CREATE TRIGGER IF NOT EXISTS creator_plan_no_delete_v35
      BEFORE DELETE ON creator_plans
      BEGIN SELECT RAISE(ABORT, 'creator plan cannot be deleted'); END;
    CREATE TRIGGER IF NOT EXISTS creator_attempt_identity_immutable_v35
      BEFORE UPDATE ON creator_operation_attempts
      WHEN NEW.drop_ref IS NOT OLD.drop_ref
        OR NEW.setup_step_id IS NOT OLD.setup_step_id
        OR NEW.retry_of_attempt_id IS NOT OLD.retry_of_attempt_id
        OR NEW.request_id IS NOT OLD.request_id
        OR NEW.intent_digest IS NOT OLD.intent_digest
        OR NEW.network IS NOT OLD.network
        OR NEW.signer IS NOT OLD.signer
        OR NEW.target IS NOT OLD.target
        OR NEW.entrypoint IS NOT OLD.entrypoint
        OR NEW.amount_mutez IS NOT OLD.amount_mutez
        OR NEW.parameters_json IS NOT OLD.parameters_json
        OR NEW.expected_postcondition_json IS NOT OLD.expected_postcondition_json
        OR NEW.issued_head_level IS NOT OLD.issued_head_level
      BEGIN SELECT RAISE(ABORT, 'creator wallet intent cannot be changed'); END;
    CREATE TRIGGER IF NOT EXISTS creator_attempt_hash_immutable_v35
      BEFORE UPDATE OF operation_hash ON creator_operation_attempts
      WHEN OLD.operation_hash IS NOT NULL AND NEW.operation_hash IS NOT OLD.operation_hash
      BEGIN SELECT RAISE(ABORT, 'creator operation hash cannot be replaced'); END;
    CREATE TRIGGER IF NOT EXISTS creator_attempt_no_delete_v35
      BEFORE DELETE ON creator_operation_attempts
      BEGIN SELECT RAISE(ABORT, 'creator attempts are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS creator_wallet_abort_evidence_immutable_v35
      BEFORE UPDATE ON creator_operation_attempts
      WHEN OLD.state='wallet_rejected' AND OLD.reconciliation_json IS NOT NULL AND (
        NEW.state IS NOT OLD.state
        OR NEW.reconciliation_json IS NOT OLD.reconciliation_json
        OR NEW.error IS NOT OLD.error
        OR NEW.reconciled_at IS NOT OLD.reconciled_at
      )
      BEGIN SELECT RAISE(ABORT, 'creator wallet abort evidence cannot be changed'); END;
    CREATE TRIGGER IF NOT EXISTS operation_intent_immutable_v35
      BEFORE UPDATE ON operation_journal
      WHEN NEW.intent_digest IS NOT OLD.intent_digest
        OR NEW.expected_postcondition_json IS NOT OLD.expected_postcondition_json
        OR NEW.network IS NOT OLD.network
        OR NEW.signer IS NOT OLD.signer
        OR NEW.target IS NOT OLD.target
        OR NEW.entrypoint IS NOT OLD.entrypoint
        OR NEW.amount_mutez IS NOT OLD.amount_mutez
      BEGIN SELECT RAISE(ABORT, 'operation intent cannot be changed'); END;
  `);

  // The fail-closed foundation build created work_items before it recorded a
  // durable error column. Preserve those journals while upgrading them in
  // place; no rows are discarded or rewritten.
  const workColumns = new Set(db.prepare("PRAGMA table_info(work_items)").all().map((column) => column.name));
  if (!workColumns.has("last_error")) db.exec("ALTER TABLE work_items ADD COLUMN last_error TEXT");
  const projectColumns = new Set(db.prepare("PRAGMA table_info(companion_projects)").all().map((column) => column.name));
  if (!projectColumns.has("claim_interval_seconds")) {
    db.exec("ALTER TABLE companion_projects ADD COLUMN claim_interval_seconds INTEGER NOT NULL DEFAULT 0 CHECK(claim_interval_seconds >= 0)");
  }
  if (!projectColumns.has("creator_public_key")) db.exec("ALTER TABLE companion_projects ADD COLUMN creator_public_key TEXT");
  for (const name of ["sale_activated", "sale_permanently_closed", "fulfillment_armed", "final_sweep_complete"]) {
    if (!projectColumns.has(name)) db.exec(`ALTER TABLE companion_projects ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`);
  }
  const claimColumns = new Set(db.prepare("PRAGMA table_info(purchase_claims)").all().map((column) => column.name));
  if (!claimColumns.has("settled_at")) db.exec("ALTER TABLE purchase_claims ADD COLUMN settled_at INTEGER");
  const creatorAttemptColumns = new Set(db.prepare("PRAGMA table_info(creator_operation_attempts)").all().map((column) => column.name));
  if (!creatorAttemptColumns.has("issued_head_level")) db.exec("ALTER TABLE creator_operation_attempts ADD COLUMN issued_head_level INTEGER");
  if (!creatorAttemptColumns.has("prompt_started_head_level")) db.exec("ALTER TABLE creator_operation_attempts ADD COLUMN prompt_started_head_level INTEGER");
  if (!creatorAttemptColumns.has("prompt_started_at")) db.exec("ALTER TABLE creator_operation_attempts ADD COLUMN prompt_started_at INTEGER");
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS creator_attempt_prompt_horizon_immutable_v35
      BEFORE UPDATE ON creator_operation_attempts
      WHEN OLD.prompt_started_head_level IS NOT NULL AND (
        NEW.prompt_started_head_level IS NOT OLD.prompt_started_head_level
        OR NEW.prompt_started_at IS NOT OLD.prompt_started_at
      )
      BEGIN SELECT RAISE(ABORT, 'creator wallet-prompt horizon cannot be replaced'); END;
  `);
  const operationColumns = new Set(db.prepare("PRAGMA table_info(operation_journal)").all().map((column) => column.name));
  for (const [name, type] of [
    ["signed_bytes_path", "TEXT"],
    ["signed_bytes_sha256", "TEXT"],
    ["branch", "TEXT"],
    ["manager_counter", "TEXT"],
    ["injected_at", "INTEGER"],
  ]) {
    if (!operationColumns.has(name)) db.exec(`ALTER TABLE operation_journal ADD COLUMN ${name} ${type}`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS operation_signed_bytes_path_unique_v35
      ON operation_journal(signed_bytes_path) WHERE signed_bytes_path IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS operation_signed_identity_immutable_v35
      BEFORE UPDATE ON operation_journal
      WHEN OLD.signed_bytes_path IS NOT NULL AND (
        NEW.signed_bytes_path IS NOT OLD.signed_bytes_path
        OR NEW.signed_bytes_sha256 IS NOT OLD.signed_bytes_sha256
        OR NEW.branch IS NOT OLD.branch
        OR NEW.manager_counter IS NOT OLD.manager_counter
      )
      BEGIN SELECT RAISE(ABORT, 'signed operation identity cannot be changed'); END;
  `);
  db.exec(`
    DROP TRIGGER IF EXISTS companion_project_identity_immutable;
    CREATE TRIGGER companion_project_identity_immutable
      BEFORE UPDATE ON companion_projects
      WHEN NEW.registration_digest IS NOT OLD.registration_digest
        OR NEW.network IS NOT OLD.network
        OR NEW.creator IS NOT OLD.creator
        OR NEW.creator_public_key IS NOT OLD.creator_public_key
        OR NEW.administrator IS NOT OLD.administrator
        OR NEW.treasury IS NOT OLD.treasury
        OR NEW.physical_supply IS NOT OLD.physical_supply
        OR NEW.asset_strategy IS NOT OLD.asset_strategy
        OR NEW.release_policy_json IS NOT OLD.release_policy_json
        OR NEW.claim_interval_seconds IS NOT OLD.claim_interval_seconds
        OR NEW.fulfillment_subsidy_mutez IS NOT OLD.fulfillment_subsidy_mutez
        OR NEW.entropy_head IS NOT OLD.entropy_head
        OR NEW.entropy_length IS NOT OLD.entropy_length
        OR NEW.entropy_keyring_path IS NOT OLD.entropy_keyring_path
        OR NEW.signer_address IS NOT OLD.signer_address
      BEGIN SELECT RAISE(ABORT, 'project identity cannot be changed'); END;
  `);

  // Preserve any signed operations created by the earlier single-attempt
  // scaffold. Every future signature is appended to the attempt ledger; an
  // expired or definitively rejected branch is evidence, never overwritten.
  db.exec(`INSERT OR IGNORE INTO signed_operation_attempts
    (operation_journal_id, attempt_number, operation_hash, signed_bytes_path,
     signed_bytes_sha256, branch, branch_level, manager_counter, state,
     injected_at, reconciliation_json, created_at, updated_at)
    SELECT id, 1, operation_hash, signed_bytes_path, signed_bytes_sha256, branch,
      0, manager_counter, state, injected_at, reconciliation_json, created_at, updated_at
    FROM operation_journal
    WHERE operation_hash IS NOT NULL AND signed_bytes_path IS NOT NULL
      AND signed_bytes_sha256 IS NOT NULL AND branch IS NOT NULL AND manager_counter IS NOT NULL`);

  function createProject(input) {
    const now = Date.now();
    const immutable = {
      dropRef: input.dropRef,
      network: input.network,
      creator: input.creator,
      creatorPublicKey: input.creatorPublicKey ?? null,
      administrator: input.administrator,
      treasury: input.treasury,
      physicalSupply: input.physicalSupply,
      assetStrategy: input.assetStrategy,
      releasePolicy: input.releasePolicy,
      claimIntervalSeconds: input.claimIntervalSeconds ?? 0,
      fulfillmentSubsidyMutez: input.fulfillmentSubsidyMutez,
      entropyHead: input.entropyHead,
      entropyLength: input.entropyLength,
      signerAddress: input.signerAddress,
    };
    const registrationDigest = digest(immutable);
    db.prepare(`INSERT OR IGNORE INTO companion_projects
      (drop_ref, registration_digest, network, creator, creator_public_key, administrator, treasury, physical_supply, asset_strategy,
       release_policy_json, claim_interval_seconds, fulfillment_subsidy_mutez, entropy_head, entropy_length, entropy_keyring_path,
       signer_address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.dropRef, registrationDigest, input.network, input.creator, input.creatorPublicKey ?? null, input.administrator, input.treasury,
        input.physicalSupply, input.assetStrategy, canonical(input.releasePolicy), input.claimIntervalSeconds ?? 0, input.fulfillmentSubsidyMutez,
        input.entropyHead, input.entropyLength, input.entropyKeyringPath, input.signerAddress, now, now);
    const row = getProject(input.dropRef);
    if (!row || row.registration_digest !== registrationDigest) throw new Error("Drop reference is already bound to another immutable project");
    return row;
  }

  function getProject(dropRef) {
    return db.prepare("SELECT * FROM companion_projects WHERE drop_ref=?").get(dropRef) || null;
  }

  function listRunnableProjects() {
    return db.prepare("SELECT * FROM companion_projects WHERE state IN ('armed','active','finishing') AND contract_address IS NOT NULL ORDER BY created_at").all();
  }

  function attachContract(dropRef, contractAddress) {
    db.prepare("UPDATE companion_projects SET contract_address=?, state='attached', updated_at=? WHERE drop_ref=? AND (contract_address IS NULL OR contract_address=?)")
      .run(contractAddress, Date.now(), dropRef, contractAddress);
    const row = getProject(dropRef);
    if (!row || row.contract_address !== contractAddress) throw new Error("Project is already attached to another contract");
    return row;
  }

  function setProjectState(dropRef, state, error = null) {
    db.prepare("UPDATE companion_projects SET state=?, last_error=?, updated_at=? WHERE drop_ref=?").run(state, error, Date.now(), dropRef);
    return getProject(dropRef);
  }

  function setProjectError(dropRef, error) {
    db.prepare("UPDATE companion_projects SET last_error=?, updated_at=? WHERE drop_ref=?")
      .run(error == null ? null : String(error), Date.now(), dropRef);
  }

  function setDuplicateCheck(dropRef, state, report) {
    db.prepare("UPDATE companion_projects SET duplicate_check_state=?, duplicate_report_json=?, updated_at=? WHERE drop_ref=?")
      .run(state, canonical(report), Date.now(), dropRef);
  }

  function updateScanLevel(dropRef, level) {
    db.prepare("UPDATE companion_projects SET last_chain_level=?, last_error=NULL, updated_at=? WHERE drop_ref=?").run(level, Date.now(), dropRef);
  }

  function updateLifecycle(dropRef, input) {
    db.prepare(`UPDATE companion_projects SET sale_activated=?, sale_permanently_closed=?, fulfillment_armed=?,
      final_sweep_complete=?, updated_at=? WHERE drop_ref=?`)
      .run(input.saleActivated ? 1 : 0, input.salePermanentlyClosed ? 1 : 0,
        input.fulfillmentArmed ? 1 : 0, input.finalSweepComplete ? 1 : 0, Date.now(), dropRef);
  }

  function createUpload(input) {
    const now = Date.now();
    db.prepare(`INSERT INTO private_uploads
      (upload_id, drop_ref, encrypted_path, checksum_sha256, state, created_at)
      VALUES (?, ?, ?, ?, 'uploaded', ?)`)
      .run(input.uploadId, input.dropRef, input.encryptedPath, input.checksumSha256, now);
    return getUpload(input.uploadId);
  }

  function getUpload(uploadId) {
    return db.prepare("SELECT * FROM private_uploads WHERE upload_id=?").get(uploadId) || null;
  }

  function saveStagedToken(input) {
    return transaction(db, () => {
      const now = Date.now();
      const artifact = db.prepare(`INSERT INTO custodied_assets
        (drop_ref, token_id, kind, checksum_sha256, encrypted_car_path)
        VALUES (?, ?, 'artifact', ?, ?)`)
        .run(input.dropRef, input.tokenId, input.artifactChecksum, input.artifactEncryptedPath);
      const metadata = db.prepare(`INSERT INTO custodied_assets
        (drop_ref, token_id, kind, checksum_sha256, encrypted_car_path)
        VALUES (?, ?, 'metadata', ?, ?)`)
        .run(input.dropRef, input.tokenId, input.metadataChecksum, input.metadataEncryptedPath);
      db.prepare(`INSERT INTO token_inventory
        (drop_ref, token_id, quantity, metadata_commitment, private_manifest_path, artifact_asset_id, metadata_asset_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(input.dropRef, input.tokenId, input.quantity, input.metadataCommitment, input.privateManifestPath,
          Number(artifact.lastInsertRowid), Number(metadata.lastInsertRowid), now);
      for (const auxiliary of input.auxiliaryAssets || []) {
        db.prepare(`INSERT INTO token_aux_assets
          (drop_ref, token_id, kind, checksum_sha256, encrypted_car_path)
          VALUES (?, ?, ?, ?, ?)`).run(
          input.dropRef,
          input.tokenId,
          auxiliary.kind,
          auxiliary.checksumSha256,
          auxiliary.encryptedCarPath,
        );
      }
      for (const uploadId of input.uploadIds || [input.uploadId]) {
        db.prepare("UPDATE private_uploads SET state='consumed', consumed_at=? WHERE upload_id=? AND drop_ref=? AND state='uploaded'")
          .run(now, uploadId, input.dropRef);
      }
      return getToken(input.dropRef, input.tokenId);
    });
  }

  function getToken(dropRef, tokenId) {
    return db.prepare(`SELECT token.*, artifact.state AS artifact_state, metadata.state AS metadata_state,
      artifact.verified_at AS artifact_verified_at, metadata.verified_at AS metadata_verified_at,
      (SELECT state FROM token_aux_assets WHERE drop_ref=token.drop_ref AND token_id=token.token_id AND kind='display') AS display_state,
      (SELECT state FROM token_aux_assets WHERE drop_ref=token.drop_ref AND token_id=token.token_id AND kind='thumbnail') AS thumbnail_state
      FROM token_inventory token
      JOIN custodied_assets artifact ON artifact.id=token.artifact_asset_id
      JOIN custodied_assets metadata ON metadata.id=token.metadata_asset_id
      WHERE token.drop_ref=? AND token.token_id=?`).get(dropRef, tokenId) || null;
  }

  function listTokens(dropRef) {
    return db.prepare(`SELECT token.*, artifact.state AS artifact_state, metadata.state AS metadata_state,
      artifact.verified_at AS artifact_verified_at, metadata.verified_at AS metadata_verified_at,
      (SELECT state FROM token_aux_assets WHERE drop_ref=token.drop_ref AND token_id=token.token_id AND kind='display') AS display_state,
      (SELECT state FROM token_aux_assets WHERE drop_ref=token.drop_ref AND token_id=token.token_id AND kind='thumbnail') AS thumbnail_state
      FROM token_inventory token
      JOIN custodied_assets artifact ON artifact.id=token.artifact_asset_id
      JOIN custodied_assets metadata ON metadata.id=token.metadata_asset_id
      WHERE token.drop_ref=? ORDER BY token.token_id`).all(dropRef);
  }

  function duplicateArtifactRows(dropRef) {
    return db.prepare(`SELECT checksum_sha256, COUNT(*) AS row_count, GROUP_CONCAT(token_id) AS token_ids
      FROM custodied_assets WHERE drop_ref=? AND kind='artifact'
      GROUP BY checksum_sha256 HAVING COUNT(*) > 1`).all(dropRef);
  }

  function findArtifactChecksum(dropRef, checksum) {
    return db.prepare("SELECT token_id FROM custodied_assets WHERE drop_ref=? AND kind='artifact' AND checksum_sha256=?")
      .get(dropRef, checksum) || null;
  }

  function getAsset(assetId) {
    return db.prepare("SELECT * FROM custodied_assets WHERE id=?").get(assetId) || null;
  }

  function getAuxAsset(dropRef, tokenId, kind) {
    return db.prepare("SELECT * FROM token_aux_assets WHERE drop_ref=? AND token_id=? AND kind=?")
      .get(dropRef, tokenId, kind) || null;
  }

  function listAuxAssets(dropRef, tokenId = null) {
    return tokenId == null
      ? db.prepare("SELECT * FROM token_aux_assets WHERE drop_ref=? ORDER BY token_id, kind").all(dropRef)
      : db.prepare("SELECT * FROM token_aux_assets WHERE drop_ref=? AND token_id=? ORDER BY kind").all(dropRef, tokenId);
  }

  function markAuxAsset(assetId, state, error = null) {
    const now = Date.now();
    db.prepare(`UPDATE token_aux_assets SET state=?, last_error=?,
      published_at=CASE WHEN ? IN ('published','verified') THEN COALESCE(published_at, ?) ELSE published_at END,
      verified_at=CASE WHEN ?='verified' THEN COALESCE(verified_at, ?) ELSE verified_at END
      WHERE id=?`).run(state, error, state, now, state, now, assetId);
    return db.prepare("SELECT * FROM token_aux_assets WHERE id=?").get(assetId) || null;
  }

  function savePublicContractMetadata(input) {
    const now = Date.now();
    db.prepare(`INSERT OR IGNORE INTO public_contract_metadata
      (drop_ref, request_digest, contract_metadata_uri, public_cover_uri, metadata_checksum_sha256,
       cover_checksum_sha256, created_at, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.dropRef,
      input.requestDigest,
      input.contractMetadataUri,
      input.publicCoverUri,
      input.metadataChecksumSha256,
      input.coverChecksumSha256,
      now,
      now,
    );
    const row = getPublicContractMetadata(input.dropRef);
    if (!row || row.request_digest !== input.requestDigest
      || row.contract_metadata_uri !== input.contractMetadataUri
      || row.public_cover_uri !== input.publicCoverUri) {
      throw new Error("Public collection metadata is already bound to different immutable content");
    }
    return row;
  }

  function getPublicContractMetadata(dropRef) {
    return db.prepare("SELECT * FROM public_contract_metadata WHERE drop_ref=?").get(dropRef) || null;
  }

  function saveCreatorPlan(dropRef, plan) {
    const planDigest = digest(plan);
    db.prepare("INSERT OR IGNORE INTO creator_plans (drop_ref, plan_digest, plan_json, created_at) VALUES (?, ?, ?, ?)")
      .run(dropRef, planDigest, canonical(plan), Date.now());
    const row = getCreatorPlan(dropRef);
    if (!row || row.plan_digest !== planDigest) throw new Error("Creator plan is already bound to different immutable settings");
    return row;
  }

  function getCreatorPlan(dropRef) {
    const row = db.prepare("SELECT * FROM creator_plans WHERE drop_ref=?").get(dropRef);
    return row ? { ...row, plan: json(row.plan_json) } : null;
  }

  function creatorStep(dropRef, stepKey) {
    const row = db.prepare("SELECT * FROM creator_setup_steps WHERE drop_ref=? AND step_key=?").get(dropRef, stepKey);
    return row ? {
      ...row,
      parameters: json(row.parameters_json),
      expectedPostcondition: json(row.expected_postcondition_json),
      liveEstimate: row.live_estimate_json ? json(row.live_estimate_json) : null,
      chunk: row.chunk_json ? json(row.chunk_json) : null,
    } : null;
  }

  function listCreatorSteps(dropRef) {
    return db.prepare("SELECT step_key FROM creator_setup_steps WHERE drop_ref=? ORDER BY id").all(dropRef)
      .map((row) => creatorStep(dropRef, row.step_key));
  }

  function creatorAttempt(id) {
    const row = db.prepare("SELECT * FROM creator_operation_attempts WHERE id=?").get(id);
    return row ? {
      ...row,
      parameters: json(row.parameters_json),
      expectedPostcondition: json(row.expected_postcondition_json),
      reconciliation: row.reconciliation_json ? json(row.reconciliation_json) : null,
    } : null;
  }

  function activeCreatorAttempt(dropRef) {
    const row = db.prepare(`SELECT id FROM creator_operation_attempts WHERE drop_ref=?
      AND state IN ('awaiting_signature','wallet_prompt_started','submitted','confirming','needs_reconciliation') ORDER BY id DESC LIMIT 1`).get(dropRef);
    return row ? creatorAttempt(row.id) : null;
  }

  function latestCreatorAttemptForStep(stepId) {
    const row = db.prepare("SELECT id FROM creator_operation_attempts WHERE setup_step_id=? ORDER BY id DESC LIMIT 1").get(stepId);
    return row ? creatorAttempt(row.id) : null;
  }

  function createCreatorAttempt(input) {
    return transaction(db, () => {
      const now = Date.now();
      const intentIdentity = {
        network: input.network,
        signer: input.signer,
        target: input.target ?? null,
        entrypoint: input.entrypoint,
        amountMutez: input.amountMutez,
        parameters: input.parameters,
        expectedPostcondition: input.expectedPostcondition,
        batchIndex: input.batchIndex ?? null,
        finalBatch: input.finalBatch ?? null,
      };
      const intentDigest = digest(intentIdentity);
      db.prepare(`INSERT OR IGNORE INTO creator_setup_steps
        (drop_ref, step_key, logical_step, batch_index, final_batch, intent_digest, parameters_json,
         expected_postcondition_json, network, signer, target, entrypoint, amount_mutez,
         live_estimate_json, chunk_json, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)`).run(
        input.dropRef,
        input.stepKey,
        input.logicalStep,
        input.batchIndex ?? null,
        input.finalBatch == null ? null : input.finalBatch ? 1 : 0,
        intentDigest,
        canonical(input.parameters),
        canonical(input.expectedPostcondition),
        input.network,
        input.signer,
        input.target ?? null,
        input.entrypoint,
        input.amountMutez,
        input.liveEstimate ? canonical(input.liveEstimate) : null,
        input.chunk ? canonical(input.chunk) : null,
        now,
        now,
      );
      const step = creatorStep(input.dropRef, input.stepKey);
      if (!step || step.intent_digest !== intentDigest) throw new Error("Creator setup step is already bound to another immutable intent");
      const existingActive = activeCreatorAttempt(input.dropRef);
      if (existingActive) throw new Error("This project already has an unresolved creator wallet action");
      if (input.retryOfAttemptId != null) {
        const prior = creatorAttempt(input.retryOfAttemptId);
        if (!prior || prior.drop_ref !== input.dropRef || prior.setup_step_id !== step.id
          || prior.intent_digest !== intentDigest || !['wallet_rejected','failed','expired'].includes(prior.state)) {
          throw new Error("Creator retry must follow a safely resolved attempt for the identical intent");
        }
      }
      const created = db.prepare(`INSERT INTO creator_operation_attempts
        (drop_ref, setup_step_id, retry_of_attempt_id, request_id, intent_digest, network, signer, target,
         entrypoint, amount_mutez, parameters_json, expected_postcondition_json, state, issued_head_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_signature', ?, ?, ?)`).run(
        input.dropRef, step.id, input.retryOfAttemptId ?? null, input.requestId, intentDigest,
        input.network, input.signer, input.target ?? null, input.entrypoint, input.amountMutez,
        canonical(input.parameters), canonical(input.expectedPostcondition), input.issuedHeadLevel, now, now,
      );
      return creatorAttempt(Number(created.lastInsertRowid));
    });
  }

  function rejectCreatorAttempt(dropRef, attemptId, reason) {
    const now = Date.now();
    const changed = db.prepare(`UPDATE creator_operation_attempts SET state='wallet_rejected', error=?, updated_at=?
      WHERE id=? AND drop_ref=? AND state='awaiting_signature'`).run(String(reason || "Creator declined or closed the wallet request"), now, attemptId, dropRef);
    if (Number(changed.changes) !== 1) throw new Error("Only an awaiting-signature action can be marked rejected");
    const attempt = creatorAttempt(attemptId);
    db.prepare("UPDATE creator_setup_steps SET state='pending', updated_at=? WHERE id=?").run(now, attempt.setup_step_id);
    return attempt;
  }

  function startCreatorWalletPrompt(dropRef, attemptId, requestId, headLevel) {
    return transaction(db, () => {
      const current = creatorAttempt(attemptId);
      if (!current || current.drop_ref !== dropRef || current.request_id !== requestId) {
        throw new Error("Wallet prompt attempt was not found for this exact request");
      }
      if (current.state === "wallet_prompt_started") return current;
      if (current.state !== "awaiting_signature" || current.operation_hash) {
        throw new Error("Wallet prompt can start only once for the exact pre-send creator action");
      }
      if (!Number.isSafeInteger(headLevel) || headLevel < current.issued_head_level) {
        throw new Error("Wallet prompt is missing a valid chain horizon");
      }
      const now = Date.now();
      const changed = db.prepare(`UPDATE creator_operation_attempts
        SET state='wallet_prompt_started', prompt_started_head_level=?, prompt_started_at=?, updated_at=?
        WHERE id=? AND drop_ref=? AND request_id=? AND state='awaiting_signature' AND operation_hash IS NULL`)
        .run(headLevel, now, now, attemptId, dropRef, requestId);
      if (Number(changed.changes) !== 1) throw new Error("Creator attempt changed before its wallet prompt horizon was saved");
      return creatorAttempt(attemptId);
    });
  }

  function abortCreatorWalletPrompt(dropRef, attemptId, requestId, walletAbort) {
    return transaction(db, () => {
      const current = creatorAttempt(attemptId);
      if (!current || current.drop_ref !== dropRef || current.request_id !== requestId) {
        throw new Error("Wallet abort was not bound to this exact creator request");
      }
      const evidence = {
        kind: "beacon_wallet_prompt_abort_v1",
        beaconEvent: walletAbort.beaconEvent,
        beaconMessageType: walletAbort.beaconMessageType,
        walletErrorType: walletAbort.walletErrorType,
        walletSenderId: walletAbort.walletSenderId,
        walletRequestId: walletAbort.walletRequestId,
        beaconVersion: walletAbort.beaconVersion,
      };
      evidence.responseIdentityDigest = digest(evidence);
      if (current.state === "wallet_rejected") {
        if (current.reconciliation?.kind === evidence.kind
          && current.reconciliation?.responseIdentityDigest === evidence.responseIdentityDigest) return current;
        throw new Error("Creator attempt was already resolved by different wallet evidence");
      }
      if (current.state !== "wallet_prompt_started" || current.operation_hash) {
        throw new Error("Only the unresolved exact wallet prompt can accept terminal abort evidence");
      }
      const now = Date.now();
      const changed = db.prepare(`UPDATE creator_operation_attempts
        SET state='wallet_rejected', reconciliation_json=?, error=?, reconciled_at=?, updated_at=?
        WHERE id=? AND drop_ref=? AND request_id=? AND state='wallet_prompt_started' AND operation_hash IS NULL`)
        .run(canonical(evidence), "Beacon wallet returned an authenticated ABORTED_ERROR before broadcast", now, now, attemptId, dropRef, requestId);
      if (Number(changed.changes) !== 1) throw new Error("Creator wallet prompt changed before abort evidence was saved");
      const attempt = creatorAttempt(attemptId);
      db.prepare("UPDATE creator_setup_steps SET state='pending', updated_at=? WHERE id=?").run(now, attempt.setup_step_id);
      return attempt;
    });
  }

  function submitCreatorAttempt(dropRef, attemptId, operationHash, submittedHeadLevel) {
    return transaction(db, () => {
      const current = creatorAttempt(attemptId);
      if (!current || current.drop_ref !== dropRef) throw new Error("Creator action was not found");
      if (current.operation_hash) {
        if (current.operation_hash !== operationHash) throw new Error("Submitted creator operation hash cannot be replaced");
        return current;
      }
      if (current.state !== "wallet_prompt_started") throw new Error("Persist the wallet-prompt-started boundary before submitting this operation hash");
      const now = Date.now();
      db.prepare(`UPDATE creator_operation_attempts SET state='submitted', operation_hash=?, submitted_head_level=?,
        submitted_at=?, updated_at=? WHERE id=?`).run(operationHash, submittedHeadLevel, now, now, attemptId);
      db.prepare("UPDATE creator_setup_steps SET state='submitted', operation_hash=?, updated_at=? WHERE id=?")
        .run(operationHash, now, current.setup_step_id);
      return creatorAttempt(attemptId);
    });
  }

  function reconcileCreatorAttempt(dropRef, attemptId, state, evidence, error = null, originatedContract = null) {
    return transaction(db, () => {
      const attempt = creatorAttempt(attemptId);
      if (!attempt || attempt.drop_ref !== dropRef) throw new Error("Creator action was not found");
      const now = Date.now();
      db.prepare(`UPDATE creator_operation_attempts SET state=?, reconciliation_json=?, error=?,
        originated_contract=COALESCE(originated_contract, ?), reconciled_at=?,
        applied_at=CASE WHEN ?='applied' THEN COALESCE(applied_at, ?) ELSE applied_at END, updated_at=? WHERE id=?`)
        .run(state, canonical(evidence), error, originatedContract, now, state, now, now, attemptId);
      if (state === "applied") {
        db.prepare("UPDATE creator_setup_steps SET state='complete', completed_at=?, updated_at=? WHERE id=?")
          .run(now, now, attempt.setup_step_id);
      } else if (["failed", "expired"].includes(state)) {
        db.prepare("UPDATE creator_setup_steps SET state='pending', updated_at=? WHERE id=?").run(now, attempt.setup_step_id);
      }
      return creatorAttempt(attemptId);
    });
  }

  function completeCreatorStep(input) {
    const now = Date.now();
    const intentDigest = digest(input.expectedPostcondition);
    db.prepare(`INSERT OR IGNORE INTO creator_setup_steps
      (drop_ref, step_key, logical_step, intent_digest, parameters_json, expected_postcondition_json,
       network, signer, target, entrypoint, amount_mutez, state, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'null', ?, ?, ?, NULL, ?, 0, 'complete', ?, ?, ?)`).run(
      input.dropRef, input.stepKey, input.logicalStep || input.stepKey, intentDigest,
      canonical(input.expectedPostcondition), input.network, input.signer, input.entrypoint || `offchain:${input.stepKey}`,
      now, now, now,
    );
    const row = creatorStep(input.dropRef, input.stepKey);
    if (!row || row.intent_digest !== intentDigest || row.state !== "complete") throw new Error("Logical creator step conflicts with existing state");
    return row;
  }

  function markAsset(assetId, state, error = null) {
    const now = Date.now();
    db.prepare(`UPDATE custodied_assets SET state=?, last_error=?,
      published_at=CASE WHEN ? IN ('published','verified') THEN COALESCE(published_at, ?) ELSE published_at END,
      verified_at=CASE WHEN ?='verified' THEN COALESCE(verified_at, ?) ELSE verified_at END
      WHERE id=?`).run(state, error, state, now, state, now, assetId);
    return getAsset(assetId);
  }

  function upsertClaim(input) {
    const now = Date.now();
    db.prepare(`INSERT OR IGNORE INTO purchase_claims
      (drop_ref, claim_id, buyer, recipient, unit, purchase_level, purchase_time, stage_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.dropRef, input.claimId, input.buyer, input.recipient, input.unit, input.purchaseLevel, input.purchaseTime,
        input.stageId, now, now);
    const row = getClaim(input.dropRef, input.claimId);
    if (!row || row.buyer !== input.buyer || row.recipient !== input.recipient || row.unit !== input.unit
      || row.purchase_level !== input.purchaseLevel || row.purchase_time !== input.purchaseTime || row.stage_id !== input.stageId) {
      throw new Error(`Claim ${input.claimId} changed after observation`);
    }
    return row;
  }

  function getClaim(dropRef, claimId) {
    return db.prepare("SELECT * FROM purchase_claims WHERE drop_ref=? AND claim_id=?").get(dropRef, claimId) || null;
  }

  function listClaims(dropRef) {
    return db.prepare("SELECT * FROM purchase_claims WHERE drop_ref=? ORDER BY claim_id").all(dropRef);
  }

  function nextUnobservedClaimId(dropRef) {
    const row = db.prepare("SELECT MAX(claim_id) AS latest FROM purchase_claims WHERE drop_ref=?").get(dropRef);
    return row?.latest == null ? 0 : Number(row.latest) + 1;
  }

  function setClaimAllocation(dropRef, claimId, tokenId, allocationDigest) {
    db.prepare(`UPDATE purchase_claims SET token_id=?, allocation_digest=?, state='allocation_simulated', last_error=NULL, updated_at=?
      WHERE drop_ref=? AND claim_id=? AND (token_id IS NULL OR (token_id=? AND allocation_digest=?))`)
      .run(tokenId, allocationDigest, Date.now(), dropRef, claimId, tokenId, allocationDigest);
    const row = getClaim(dropRef, claimId);
    if (!row || row.token_id !== tokenId || row.allocation_digest !== allocationDigest) throw new Error("Claim allocation is already bound to another result");
    return row;
  }

  function setClaimState(dropRef, claimId, state, options = {}) {
    const current = getClaim(dropRef, claimId);
    if (!current) throw new Error("Claim does not exist");
    if (current.settlement_operation_hash && options.operationHash
      && current.settlement_operation_hash !== options.operationHash) {
      throw new Error("Claim settlement operation hash cannot be replaced");
    }
    const now = Date.now();
    db.prepare(`UPDATE purchase_claims SET state=?, settlement_operation_hash=COALESCE(settlement_operation_hash, ?),
      settled_at=CASE WHEN ?='artwork_secured' THEN COALESCE(settled_at, ?) ELSE settled_at END,
      last_error=?, updated_at=? WHERE drop_ref=? AND claim_id=?`)
      .run(state, options.operationHash || null, state, now, options.error || null, now, dropRef, claimId);
    return getClaim(dropRef, claimId);
  }

  function enqueue(input) {
    assertPublicJournalPayload(input.payload);
    const now = Date.now();
    const payloadDigest = digest(input.payload);
    db.prepare(`INSERT OR IGNORE INTO work_items
      (drop_ref, claim_ref, work_type, semantic_key, payload_digest, payload_json, depends_on_id,
       eligible_at, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.dropRef, input.claimRef ?? null, input.workType, input.semanticKey, payloadDigest, canonical(input.payload),
        input.dependsOnId ?? null, input.eligibleAt ?? now, input.eligibleAt ?? now, now, now);
    const row = db.prepare("SELECT * FROM work_items WHERE drop_ref=? AND work_type=? AND semantic_key=?")
      .get(input.dropRef, input.workType, input.semanticKey);
    if (row.payload_digest !== payloadDigest || row.depends_on_id !== (input.dependsOnId ?? null)) {
      throw new Error("Semantic work key is already bound to another immutable intent");
    }
    if (["queued", "retry_wait"].includes(row.state) && input.eligibleAt != null && input.eligibleAt < row.next_attempt_at) {
      db.prepare("UPDATE work_items SET eligible_at=?, next_attempt_at=?, updated_at=? WHERE id=?")
        .run(input.eligibleAt, input.eligibleAt, now, row.id);
      return db.prepare("SELECT * FROM work_items WHERE id=?").get(row.id);
    }
    return row;
  }

  function leaseNext({ owner, durationMs, now = Date.now() }) {
    if (!owner || !Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error("Valid lease owner and duration are required");
    return transaction(db, () => {
      const selected = db.prepare(`SELECT work.id FROM work_items work
        LEFT JOIN work_items dependency ON dependency.id=work.depends_on_id
        JOIN companion_projects project ON project.drop_ref=work.drop_ref
        WHERE (project.state IN ('active','finishing')
          OR (project.state='armed' AND work.work_type='arm_fulfillment'))
          AND work.eligible_at<=? AND work.next_attempt_at<=?
          AND (work.state IN ('queued','retry_wait','signed','submitted','ready_to_submit') OR (work.state='leased' AND work.lease_expires_at<=?))
          AND (work.depends_on_id IS NULL OR dependency.state='completed')
        ORDER BY work.next_attempt_at, work.id LIMIT 1`).get(now, now, now);
      if (!selected) return null;
      db.prepare(`UPDATE work_items SET state='leased', lease_owner=?, lease_expires_at=?,
        attempt_count=attempt_count+1, updated_at=? WHERE id=?`)
        .run(owner, now + durationMs, now, selected.id);
      const row = db.prepare("SELECT * FROM work_items WHERE id=?").get(selected.id);
      return { ...row, payload: json(row.payload_json) };
    });
  }

  function getWork(id) {
    const row = db.prepare("SELECT * FROM work_items WHERE id=?").get(id);
    return row ? { ...row, payload: json(row.payload_json) } : null;
  }

  function getWorkByKey(dropRef, workType, semanticKey) {
    const row = db.prepare("SELECT * FROM work_items WHERE drop_ref=? AND work_type=? AND semantic_key=?")
      .get(dropRef, workType, semanticKey);
    return row ? { ...row, payload: json(row.payload_json) } : null;
  }

  function completeWork(id) {
    db.prepare("UPDATE work_items SET state='completed', lease_owner=NULL, lease_expires_at=NULL, last_error=NULL, updated_at=? WHERE id=?")
      .run(Date.now(), id);
    return getWork(id);
  }

  function retryWork(id, nextAttemptAt, error) {
    db.prepare("UPDATE work_items SET state='retry_wait', next_attempt_at=?, lease_owner=NULL, lease_expires_at=NULL, last_error=?, updated_at=? WHERE id=?")
      .run(nextAttemptAt, String(error || "retry required"), Date.now(), id);
  }

  function manualReviewWork(id, error) {
    db.prepare("UPDATE work_items SET state='manual_review', lease_owner=NULL, lease_expires_at=NULL, last_error=?, updated_at=? WHERE id=?")
      .run(String(error || "manual review required"), Date.now(), id);
  }

  function retireObsoleteOperationWork(id, evidence) {
    assertPublicJournalPayload(evidence, "obsoleteEvidence");
    return transaction(db, () => {
      const now = Date.now();
      const intent = db.prepare("SELECT id FROM operation_journal WHERE work_item_id=?").get(id);
      if (intent) {
        const unresolved = db.prepare(`SELECT id FROM signed_operation_attempts
          WHERE operation_journal_id=? AND state NOT IN ('expired','failed') LIMIT 1`).get(intent.id);
        if (unresolved) throw new Error("A signed operation must reach definitive resolution before its work can become obsolete");
        db.prepare("UPDATE operation_journal SET state='obsolete', reconciliation_json=?, updated_at=? WHERE id=?")
          .run(canonical(evidence), now, intent.id);
      }
      db.prepare(`UPDATE work_items SET state='completed', lease_owner=NULL, lease_expires_at=NULL,
        last_error=NULL, updated_at=? WHERE id=?`).run(now, id);
      return getWork(id);
    });
  }

  function createReadyAttempt(input) {
    assertPublicJournalPayload(input.expectedPostcondition, "expectedPostcondition");
    const now = Date.now();
    const intentDigest = digest(input.intentIdentity);
    return transaction(db, () => {
      db.prepare(`INSERT OR IGNORE INTO operation_journal
        (work_item_id, request_id, intent_digest, expected_postcondition_json, network, signer, target,
         entrypoint, amount_mutez, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`)
        .run(input.workItemId, input.requestId, intentDigest, canonical(input.expectedPostcondition), input.network,
          input.signer, input.target, input.entrypoint, input.amountMutez, now, now);
      const attempt = getOperationForWork(input.workItemId);
      if (!attempt) {
        const blocking = db.prepare(`SELECT work_item_id FROM operation_journal
          WHERE network=? AND signer=? AND state IN ('ready','signed','submitted','confirming')
          ORDER BY id LIMIT 1`).get(input.network, input.signer);
        if (blocking) throw new Error(`Finalizer has unresolved settlement work ${blocking.work_item_id}; signing is serialized across projects`);
        throw new Error("Settlement operation intent could not be persisted");
      }
      if (attempt.intent_digest !== intentDigest || attempt.request_id !== input.requestId) {
        throw new Error("Operation work item is already bound to another immutable intent");
      }
      db.prepare("UPDATE work_items SET state='ready_to_submit', updated_at=? WHERE id=?").run(now, input.workItemId);
      return attempt;
    });
  }

  function getOperationForWork(workItemId) {
    const intent = db.prepare("SELECT * FROM operation_journal WHERE work_item_id=?").get(workItemId);
    if (!intent) return null;
    const attempt = db.prepare(`SELECT * FROM signed_operation_attempts
      WHERE operation_journal_id=? ORDER BY attempt_number DESC LIMIT 1`).get(intent.id);
    if (!attempt) return { ...intent, operation_intent_state: intent.state, signed_attempt_id: null, attempt_number: 0 };
    return {
      ...intent,
      operation_intent_state: intent.state,
      signed_attempt_id: attempt.id,
      attempt_number: attempt.attempt_number,
      operation_hash: attempt.operation_hash,
      signed_bytes_path: attempt.signed_bytes_path,
      signed_bytes_sha256: attempt.signed_bytes_sha256,
      branch: attempt.branch,
      branch_level: attempt.branch_level,
      manager_counter: attempt.manager_counter,
      injected_at: attempt.injected_at,
      reconciliation_json: attempt.reconciliation_json,
      signed_attempt_state: attempt.state,
    };
  }

  function persistSigned(input) {
    const now = Date.now();
    return transaction(db, () => {
      const attempt = getOperationForWork(input.workItemId);
      if (!attempt) throw new Error("Ready operation intent was not persisted");
      if (attempt.signed_attempt_id && attempt.signed_attempt_state !== "expired") {
        if (attempt.operation_hash === input.operationHash
          && attempt.signed_bytes_path === input.signedBytesPath
          && attempt.signed_bytes_sha256 === input.signedBytesSha256
          && attempt.branch === input.branch
          && attempt.branch_level === input.branchLevel
          && attempt.manager_counter === String(input.managerCounter)) return attempt;
        throw new Error("A signed attempt may be followed only after it has definitive expiry evidence");
      }
      if (!Number.isSafeInteger(input.branchLevel) || input.branchLevel < 0) throw new Error("Signed operation branch level is required");
      const nextAttempt = Number(attempt.attempt_number || 0) + 1;
      db.prepare(`INSERT INTO signed_operation_attempts
        (operation_journal_id, attempt_number, operation_hash, signed_bytes_path,
         signed_bytes_sha256, branch, branch_level, manager_counter, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'signed', ?, ?)`).run(
        attempt.id,
        nextAttempt,
        input.operationHash,
        input.signedBytesPath,
        input.signedBytesSha256,
        input.branch,
        input.branchLevel,
        String(input.managerCounter),
        now,
        now,
      );
      db.prepare(`UPDATE operation_journal SET state='signed', updated_at=? WHERE work_item_id=?`)
        .run(now, input.workItemId);
      db.prepare("UPDATE work_items SET operation_hash=?, state='signed', updated_at=? WHERE id=?")
        .run(input.operationHash, now, input.workItemId);
      return getOperationForWork(input.workItemId);
    });
  }

  function expireSignedAttempt(workItemId, evidence) {
    assertPublicJournalPayload(evidence, "expiryEvidence");
    const now = Date.now();
    return transaction(db, () => {
      const operation = getOperationForWork(workItemId);
      if (!operation?.signed_attempt_id) throw new Error("Signed operation attempt is missing");
      if (operation.signed_attempt_state !== "expired") {
        db.prepare(`UPDATE signed_operation_attempts SET state='expired', reconciliation_json=?, updated_at=?
          WHERE id=? AND state IN ('signed','submitted','confirming')`)
          .run(canonical(evidence), now, operation.signed_attempt_id);
      }
      const expired = db.prepare("SELECT state FROM signed_operation_attempts WHERE id=?").get(operation.signed_attempt_id);
      if (expired?.state !== "expired") throw new Error("Signed attempt cannot be replaced without definitive expiry evidence");
      db.prepare("UPDATE operation_journal SET state='ready', updated_at=? WHERE work_item_id=?")
        .run(now, workItemId);
      db.prepare("UPDATE work_items SET operation_hash=NULL, state='ready_to_submit', updated_at=? WHERE id=?")
        .run(now, workItemId);
      return getOperationForWork(workItemId);
    });
  }

  function markInjected(workItemId) {
    const now = Date.now();
    const operation = getOperationForWork(workItemId);
    if (!operation?.signed_attempt_id) throw new Error("Signed operation attempt is missing");
    db.prepare("UPDATE signed_operation_attempts SET state='submitted', injected_at=COALESCE(injected_at, ?), updated_at=? WHERE id=?")
      .run(now, now, operation.signed_attempt_id);
    db.prepare("UPDATE operation_journal SET state='submitted', updated_at=? WHERE work_item_id=?")
      .run(now, workItemId);
    db.prepare("UPDATE work_items SET state='submitted', updated_at=? WHERE id=? AND operation_hash IS NOT NULL")
      .run(now, workItemId);
    return getOperationForWork(workItemId);
  }

  function reconcileOperation(workItemId, state, evidence) {
    assertPublicJournalPayload(evidence, "reconciliation");
    const now = Date.now();
    const operation = getOperationForWork(workItemId);
    if (!operation?.signed_attempt_id) throw new Error("Signed operation attempt is missing");
    db.prepare("UPDATE signed_operation_attempts SET state=?, reconciliation_json=?, updated_at=? WHERE id=?")
      .run(state, canonical(evidence), now, operation.signed_attempt_id);
    db.prepare("UPDATE operation_journal SET state=?, reconciliation_json=?, updated_at=? WHERE work_item_id=?")
      .run(state, canonical(evidence), now, workItemId);
  }

  function publicStats(dropRef) {
    const project = getProject(dropRef);
    if (!project) return null;
    const counts = db.prepare(`SELECT
      COUNT(*) AS confirmed,
      SUM(CASE WHEN state IN ('artwork_secured','publishing_to_ipfs','nft_ready') THEN 1 ELSE 0 END) AS secured,
      SUM(CASE WHEN state='nft_ready' THEN 1 ELSE 0 END) AS ready
      FROM purchase_claims WHERE drop_ref=?`).get(dropRef);
    const work = db.prepare(`SELECT COUNT(*) AS attention FROM work_items
      WHERE drop_ref=? AND state='manual_review'`).get(dropRef);
    return { project, confirmed: Number(counts.confirmed), secured: Number(counts.secured || 0), ready: Number(counts.ready || 0), attention: Number(work.attention) };
  }

  function listManualReviewWork(dropRef) {
    const rows = db.prepare(`SELECT id, drop_ref, work_type, state, last_error, payload_json, created_at, updated_at
      FROM work_items WHERE drop_ref=? AND state='manual_review' ORDER BY id ASC`).all(dropRef);
    return rows.map((r) => ({
      id: r.id,
      dropRef: r.drop_ref,
      workType: r.work_type,
      state: r.state,
      lastError: r.last_error,
      payload: JSON.parse(r.payload_json || "{}"),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  return {
    db,
    listManualReviewWork,
    createProject,
    getProject,
    listRunnableProjects,
    attachContract,
    setProjectState,
    setProjectError,
    setDuplicateCheck,
    updateScanLevel,
    updateLifecycle,
    createUpload,
    getUpload,
    saveStagedToken,
    getToken,
    listTokens,
    duplicateArtifactRows,
    findArtifactChecksum,
    getAsset,
    markAsset,
    getAuxAsset,
    listAuxAssets,
    markAuxAsset,
    savePublicContractMetadata,
    getPublicContractMetadata,
    saveCreatorPlan,
    getCreatorPlan,
    creatorStep,
    listCreatorSteps,
    creatorAttempt,
    activeCreatorAttempt,
    latestCreatorAttemptForStep,
    createCreatorAttempt,
    rejectCreatorAttempt,
    startCreatorWalletPrompt,
    abortCreatorWalletPrompt,
    submitCreatorAttempt,
    reconcileCreatorAttempt,
    completeCreatorStep,
    upsertClaim,
    getClaim,
    listClaims,
    nextUnobservedClaimId,
    setClaimAllocation,
    setClaimState,
    enqueue,
    leaseNext,
    getWork,
    getWorkByKey,
    completeWork,
    retryWork,
    manualReviewWork,
    retireObsoleteOperationWork,
    createReadyAttempt,
    getOperationForWork,
    persistSigned,
    expireSignedAttempt,
    markInjected,
    reconcileOperation,
    publicStats,
    close: () => db.close(),
  };
}
