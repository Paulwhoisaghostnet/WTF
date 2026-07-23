import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { and, desc, eq, gt, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import {
  clubDuesContracts,
  clubDuesDeploymentRuns,
  clubDuesMemberLedger,
  clubDuesPaymentIntents,
  userWallets,
} from "@shared/schema";
import { createNotification } from "../../lib/notifications";
import { callSigner, isSignerConfigured } from "../../lib/operator-signer-client";
import {
  extractCallArg,
  fetchTransactionsByHash,
  findAppliedContractCall,
  isValidOpHash,
} from "../../lib/tzkt-ops";
import { assertLinkedWalletForUser } from "../../lib/wallet-preflight";
import { defaultKilnApiUrl, kilnFetch, kilnTimeoutMs } from "../../lib/kiln-client";

const execFileAsync = promisify(execFile);

export const CLUB_DUES_TEMPLATE_VERSION = "wtf-club-dues-v2";
export const CLUB_DUES_MANAGER_WALLET_ID = "club-dues-manager";
export const CLUB_DUES_INTENT_TTL_MS = 30 * 60_000;
export const CLUB_DUES_DEFAULT_PRESERVE_FEE_MUTEZ = 1_000_000;

const NETWORKS = ["shadownet", "ghostnet", "mainnet"] as const;
const ADDRESS_RE = /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const APP_ROOT = process.cwd();

export const clubDuesCustomizationSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
    description: z.string().trim().max(2_000).optional().nullable(),
    network: z.enum(NETWORKS).default("shadownet"),
    treasuryAddress: z.string().trim().regex(ADDRESS_RE),
    adminAddress: z.string().trim().regex(ADDRESS_RE),
    monthlyDuesMutez: z.coerce.number().int().min(1).max(9_000_000_000_000),
    monthSeconds: z.coerce.number().int().min(3_600).max(31_536_000),
    utilityUnitsPerMonth: z.coerce.number().int().min(1).max(1_000_000_000),
    gracePeriodDays: z.coerce.number().int().min(0).max(365),
    arrearsWarningDays: z.coerce.number().int().min(1).max(90),
    membershipSymbol: z
      .string()
      .trim()
      .min(2)
      .max(24)
      .regex(/^[A-Z0-9_-]+$/),
    metadataUri: z.string().trim().max(600).optional().nullable(),
    managerWalletId: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[a-z][a-z0-9_-]*$/)
      .default(CLUB_DUES_MANAGER_WALLET_ID),
  })
  .strict();

export const createPaymentIntentSchema = z
  .object({
    walletAddress: z.string().trim().regex(ADDRESS_RE).optional().nullable(),
    months: z.coerce.number().int().min(1).max(60),
    tierId: z.coerce.number().int().min(0).max(1_000_000).default(0),
    action: z.coerce.number().int().min(0).max(2).default(0),
  })
  .strict();

export type ClubDuesCustomization = z.infer<typeof clubDuesCustomizationSchema>;

function normalizeAddress(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return ADDRESS_RE.test(trimmed) ? trimmed : null;
}

function normalizeKt1(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return KT1_RE.test(trimmed) ? trimmed : null;
}

function formatMutez(mutez: number): string {
  return (mutez / 1_000_000)
    .toFixed(6)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function parseMutez(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function addBigIntStrings(left: string | number | null | undefined, right: string | number) {
  return (BigInt(String(left ?? "0")) + BigInt(String(right))).toString();
}

function addDuesMonths(base: Date, months: number, monthSeconds: number): Date {
  return new Date(base.getTime() + months * monthSeconds * 1_000);
}

function makePaymentRef(userId: number, contractId: number): string {
  return `dues:${contractId}:${userId}:${Date.now().toString(36)}:${randomUUID().slice(0, 10)}`;
}

function storageConfigFor(data: ClubDuesCustomization) {
  return {
    admin: data.adminAddress,
    treasury: data.treasuryAddress,
    clubName: data.name,
    membershipSymbol: data.membershipSymbol,
    metadataUri: data.metadataUri ?? "",
    monthlyDue: data.monthlyDuesMutez,
    monthSeconds: data.monthSeconds,
    utilityUnitsPerMonth: data.utilityUnitsPerMonth,
    gracePeriodSeconds: data.gracePeriodDays * 24 * 60 * 60,
    preserveFeeMutez: CLUB_DUES_DEFAULT_PRESERVE_FEE_MUTEZ,
  };
}

export function serializeClubDuesContract(row: typeof clubDuesContracts.$inferSelect) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    templateVersion: row.templateVersion,
    network: row.network,
    status: row.status,
    contractAddress: row.contractAddress,
    managerWalletId: row.managerWalletId,
    treasuryAddress: row.treasuryAddress,
    adminAddress: row.adminAddress,
    monthlyDuesMutez: row.monthlyDuesMutez,
    monthlyDuesTez: formatMutez(row.monthlyDuesMutez),
    monthSeconds: row.monthSeconds,
    utilityUnitsPerMonth: String(row.utilityUnitsPerMonth),
    gracePeriodDays: row.gracePeriodDays,
    arrearsWarningDays: row.arrearsWarningDays,
    membershipSymbol: row.membershipSymbol,
    metadataUri: row.metadataUri,
    deployedAt: row.deployedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function serializeLedger(
  ledger: typeof clubDuesMemberLedger.$inferSelect,
  contract: typeof clubDuesContracts.$inferSelect
) {
  return {
    id: ledger.id,
    contractId: ledger.contractId,
    walletAddress: ledger.walletAddress,
    membershipTokenId: ledger.membershipTokenId,
    utilityUnits: String(ledger.utilityUnits),
    paidThrough: ledger.paidThrough.toISOString(),
    lastPaymentAt: ledger.lastPaymentAt?.toISOString() ?? null,
    status: ledger.status,
    arrearsSince: ledger.arrearsSince?.toISOString() ?? null,
    warningsSent: ledger.warningsSent,
    contract: serializeClubDuesContract(contract),
  };
}

export async function listClubDuesContracts(opts: { includeDrafts?: boolean } = {}) {
  const filters = opts.includeDrafts ? [] : [eq(clubDuesContracts.status, "live")];
  const rows = await db
    .select()
    .from(clubDuesContracts)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(clubDuesContracts.createdAt))
    .limit(200);
  return rows.map(serializeClubDuesContract);
}

export async function getClubDuesContractBySlug(slug: string, includeDrafts = false) {
  const filters = [eq(clubDuesContracts.slug, slug)];
  if (!includeDrafts) filters.push(eq(clubDuesContracts.status, "live"));
  const [row] = await db
    .select()
    .from(clubDuesContracts)
    .where(and(...filters))
    .limit(1);
  return row ?? null;
}

export async function createClubDuesContract(
  input: ClubDuesCustomization,
  actorUserId: number | null
) {
  const data = clubDuesCustomizationSchema.parse(input);
  const [row] = await db
    .insert(clubDuesContracts)
    .values({
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      templateVersion: CLUB_DUES_TEMPLATE_VERSION,
      network: data.network,
      status: "draft",
      managerWalletId: data.managerWalletId,
      treasuryAddress: data.treasuryAddress,
      adminAddress: data.adminAddress,
      monthlyDuesMutez: data.monthlyDuesMutez,
      monthSeconds: data.monthSeconds,
      utilityUnitsPerMonth: String(data.utilityUnitsPerMonth),
      gracePeriodDays: data.gracePeriodDays,
      arrearsWarningDays: data.arrearsWarningDays,
      membershipSymbol: data.membershipSymbol,
      metadataUri: data.metadataUri?.trim() || null,
      storageConfig: storageConfigFor(data),
      deployedByUserId: actorUserId,
      updatedAt: new Date(),
    })
    .returning();
  return serializeClubDuesContract(row);
}

async function loadClubDuesTemplateSource(): Promise<{ sourcePath: string; source: string }> {
  const sourcePath = path.join(APP_ROOT, "contracts/wtf-club-dues/WtfClubDues.py");
  return { sourcePath, source: await readFile(sourcePath, "utf8") };
}

function renderClubDuesTemplateSource(source: string, data: ClubDuesCustomization): string {
  const config = storageConfigFor(data);
  const scenario = `
@sp.add_test()
def deploy_wtf_club_dues_template():
    scenario = sp.test_scenario("deploy_wtf_club_dues_template", main)
    dues = main.WtfClubDues(
        admin=sp.address(${JSON.stringify(config.admin)}),
        treasury=sp.address(${JSON.stringify(config.treasury)}),
        club_name=${JSON.stringify(config.clubName)},
        membership_symbol=${JSON.stringify(config.membershipSymbol)},
        metadata_uri=${JSON.stringify(config.metadataUri)},
        monthly_due=sp.mutez(${config.monthlyDue}),
        month_seconds=sp.nat(${config.monthSeconds}),
        utility_units_per_month=sp.nat(${config.utilityUnitsPerMonth}),
        grace_period_seconds=sp.nat(${config.gracePeriodSeconds}),
    )
    scenario += dues
`;
  const stripped = source.replace(
    /\n@sp\.add_test\(\)\ndef deploy_wtf_club_dues_template\(\):[\s\S]*$/m,
    ""
  );
  return `${stripped.trimEnd()}\n\n${scenario}`;
}

function compactMichelson(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/[ \t]*#.*$/, "").trim())
    .filter(Boolean)
    .join("\n");
}

async function findArtifactFile(root: string, suffix: string): Promise<string> {
  const found: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(full);
    }
  }
  await walk(root);
  found.sort();
  const latest = found.at(-1);
  if (!latest) throw new Error(`SmartPy artifact missing: *${suffix}`);
  return latest;
}

async function compileSmartPyTemplate(data: ClubDuesCustomization) {
  const { sourcePath, source } = await loadClubDuesTemplateSource();
  const rendered = renderClubDuesTemplateSource(source, data);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "wtf-club-dues-"));
  try {
    const tempSource = path.join(tempRoot, "WtfClubDues.custom.py");
    const outDir = path.join(tempRoot, "out");
    await mkdir(outDir, { recursive: true });
    await writeFile(tempSource, rendered, "utf8");
    await execFileAsync("smartpy", ["compile", tempSource, outDir], {
      timeout: kilnTimeoutMs(),
      maxBuffer: 10 * 1024 * 1024,
    });
    const contractPath = await findArtifactFile(outDir, "_contract.tz");
    const storagePath = await findArtifactFile(outDir, "_storage.tz");
    return {
      sourcePath,
      source: rendered,
      code: compactMichelson(await readFile(contractPath, "utf8")),
      init: compactMichelson(await readFile(storagePath, "utf8")),
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function compileClubDuesContract(input: ClubDuesCustomization) {
  const data = clubDuesCustomizationSchema.parse(input);
  const local = await compileSmartPyTemplate(data);
  let workflow: any;
  try {
    workflow = await kilnFetch<any>("/api/kiln/workflow/run", {
      sourceType: "michelson",
      source: local.code,
      initialStorage: local.init,
      simulationSteps: [],
    });
  } catch (err) {
    workflow = {
      ok: false,
      skipped: true,
      source: "local-smartpy-fallback",
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const artifacts = workflow?.artifacts ?? workflow?.json?.artifacts ?? {};
  const code = typeof artifacts.michelson === "string" ? artifacts.michelson : local.code;
  const init =
    typeof artifacts.initialStorage === "string" ? artifacts.initialStorage : local.init;
  return {
    ok: true,
    sourcePath: local.sourcePath,
    templateVersion: CLUB_DUES_TEMPLATE_VERSION,
    code,
    init,
    initialStorage: init,
    workflow,
    storageConfig: storageConfigFor(data),
  };
}

function rowToCustomization(row: typeof clubDuesContracts.$inferSelect): ClubDuesCustomization {
  return clubDuesCustomizationSchema.parse({
    name: row.name,
    slug: row.slug,
    description: row.description,
    network: row.network,
    treasuryAddress: row.treasuryAddress,
    adminAddress: row.adminAddress,
    monthlyDuesMutez: row.monthlyDuesMutez,
    monthSeconds: row.monthSeconds,
    utilityUnitsPerMonth: Number(row.utilityUnitsPerMonth),
    gracePeriodDays: row.gracePeriodDays,
    arrearsWarningDays: row.arrearsWarningDays,
    membershipSymbol: row.membershipSymbol,
    metadataUri: row.metadataUri,
    managerWalletId: row.managerWalletId,
  });
}

export async function deployClubDuesWithManagerWallet(input: {
  contractId: number;
  actorUserId: number | null;
  confirmMainnet?: boolean;
}) {
  const [contract] = await db
    .select()
    .from(clubDuesContracts)
    .where(eq(clubDuesContracts.id, input.contractId))
    .limit(1);
  if (!contract) throw new Error("Club dues contract draft not found.");
  if (contract.status === "live" && contract.contractAddress) {
    return { contract: serializeClubDuesContract(contract), alreadyLive: true };
  }
  if (contract.network === "mainnet") {
    if (!input.confirmMainnet) throw new Error("Mainnet deployment requires confirmation.");
    if (process.env.WTF_CLUB_DUES_ALLOW_MAINNET !== "1") {
      throw new Error("Mainnet club dues deployment is disabled in server env.");
    }
  }
  if (!isSignerConfigured()) {
    throw new Error("Operator signer is not configured for manager wallet deployment.");
  }

  const [run] = await db
    .insert(clubDuesDeploymentRuns)
    .values({
      contractId: contract.id,
      actorUserId: input.actorUserId,
      network: contract.network,
      status: "compiling",
      walletId: contract.managerWalletId,
      updatedAt: new Date(),
    })
    .returning();

  try {
    const compiled = await compileClubDuesContract(rowToCustomization(contract));
    await db
      .update(clubDuesDeploymentRuns)
      .set({
        status: "originating",
        compileOutput: {
          templateVersion: compiled.templateVersion,
          storageConfig: compiled.storageConfig,
          workflow: compiled.workflow,
        },
        updatedAt: new Date(),
      })
      .where(eq(clubDuesDeploymentRuns.id, run.id));

    const signer = await callSigner({
      intent: "originate_contract",
      walletId: contract.managerWalletId,
      code: compiled.code,
      init: compiled.init,
      balanceMutez: "0",
      label: `club-dues:${contract.slug}`,
      runId: run.id,
    });
    if (!signer.contractAddress) {
      throw new Error("Signer originated the contract but did not return an address.");
    }

    const now = new Date();
    const [updated] = await db
      .update(clubDuesContracts)
      .set({
        status: "live",
        contractAddress: signer.contractAddress,
        deployOpHash: signer.opHash ?? null,
        compileArtifact: {
          templateVersion: compiled.templateVersion,
          workflow: compiled.workflow,
          storageConfig: compiled.storageConfig,
        },
        storageConfig: compiled.storageConfig,
        deployedByUserId: input.actorUserId,
        deployedAt: now,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(clubDuesContracts.id, contract.id))
      .returning();

    await db
      .update(clubDuesDeploymentRuns)
      .set({
        status: "live",
        opHash: signer.opHash ?? null,
        contractAddress: signer.contractAddress,
        signerRequestId: signer.requestId ?? null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(clubDuesDeploymentRuns.id, run.id));

    return {
      contract: serializeClubDuesContract(updated),
      deployment: { id: run.id, opHash: signer.opHash ?? null, contractAddress: signer.contractAddress },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(clubDuesDeploymentRuns)
      .set({
        status: "failed",
        errorMessage: message.slice(0, 1_000),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clubDuesDeploymentRuns.id, run.id));
    await db
      .update(clubDuesContracts)
      .set({ status: "failed", errorMessage: message.slice(0, 1_000), updatedAt: new Date() })
      .where(eq(clubDuesContracts.id, contract.id));
    throw err;
  }
}

async function linkedWalletsForUser(userId: number): Promise<string[]> {
  const rows = await db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));
  return rows.map((row) => row.walletAddress).filter(Boolean);
}

export async function createClubDuesPaymentIntent(input: {
  slug: string;
  userId: number;
  walletAddress?: string | null;
  months: number;
  tierId?: number;
  action?: number;
}) {
  const contract = await getClubDuesContractBySlug(input.slug, false);
  if (!contract || !contract.contractAddress) {
    throw new Error("Club dues contract is not live yet.");
  }
  const parsed = createPaymentIntentSchema.parse({
    walletAddress: input.walletAddress,
    months: input.months,
    tierId: input.tierId,
    action: input.action,
  });
  const preserveFeeMutez = Number(
    (contract.storageConfig as Record<string, unknown> | null | undefined)?.preserveFeeMutez ??
      CLUB_DUES_DEFAULT_PRESERVE_FEE_MUTEZ
  );
  const amountMutez =
    contract.monthlyDuesMutez * parsed.months + (parsed.action === 2 ? preserveFeeMutez : 0);
  const walletAddress = await assertLinkedWalletForUser({
    userId: input.userId,
    walletAddress: parsed.walletAddress,
    purpose: "club-dues-payment",
  });
  const [intent] = await db
    .insert(clubDuesPaymentIntents)
    .values({
      contractId: contract.id,
      userId: input.userId,
      paymentRef: makePaymentRef(input.userId, contract.id),
      walletAddress,
      months: parsed.months,
      amountMutez,
      raw: {
        entrypoint: "pay_membership",
        periods: parsed.months,
        tierId: parsed.tierId,
        action: parsed.action,
        preserveFeeMutez,
      },
      status: "pending",
      expiresAt: new Date(Date.now() + CLUB_DUES_INTENT_TTL_MS),
      updatedAt: new Date(),
    })
    .returning();

  return {
    id: intent.id,
    paymentRef: intent.paymentRef,
    walletAddress,
    months: intent.months,
    periods: intent.months,
    tierId: parsed.tierId,
    action: parsed.action,
    amountMutez: intent.amountMutez,
    amountTez: formatMutez(intent.amountMutez),
    contractAddress: contract.contractAddress,
    contract: serializeClubDuesContract(contract),
    expiresAt: intent.expiresAt.toISOString(),
  };
}

export async function verifyClubDuesPaymentByHash(opHash: string, requesterUserId: number) {
  if (!isValidOpHash(opHash)) return { ok: false, reason: "invalid_hash" as const };
  const linkedWallets = await linkedWalletsForUser(requesterUserId);
  if (linkedWallets.length === 0) return { ok: false, reason: "wallet_not_linked" as const };

  const rows = await fetchTransactionsByHash(opHash, { retries: 4 });
  if (rows.length === 0) return { ok: false, reason: "not_found" as const };

  const contracts = await db
    .select()
    .from(clubDuesContracts)
    .where(and(eq(clubDuesContracts.status, "live"), isNotNull(clubDuesContracts.contractAddress)));

  let contract: typeof clubDuesContracts.$inferSelect | null = null;
  let call = null as ReturnType<typeof findAppliedContractCall> | null;
  for (const candidate of contracts) {
    const match = findAppliedContractCall(rows, {
      contract: candidate.contractAddress!,
      senderOneOf: linkedWallets,
      entrypoint: ["pay_dues", "pay_membership"],
    });
    if (match) {
      contract = candidate;
      call = match;
      break;
    }
  }
  if (!contract || !call) return { ok: false, reason: "mismatch" as const };

  const paymentRef = extractCallArg(call.op, [["payment_ref"], ["paymentRef"]]);
  const isMembershipPayment = call.entrypoint === "pay_membership";
  const monthsArg = extractCallArg(call.op, isMembershipPayment ? [["periods"], ["months"]] : [["months"]]);
  const tierIdArg = isMembershipPayment ? extractCallArg(call.op, [["tier_id"], ["tierId"]]) : 0;
  const actionArg = isMembershipPayment ? extractCallArg(call.op, [["action"]]) : 0;
  if (typeof paymentRef !== "string" || paymentRef.length === 0) {
    return { ok: false, reason: "mismatch" as const };
  }
  const months = Number(monthsArg);
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    return { ok: false, reason: "mismatch" as const };
  }
  const tierId = Number(tierIdArg ?? 0);
  const action = Number(actionArg ?? 0);
  if (!Number.isInteger(tierId) || tierId < 0 || !Number.isInteger(action) || action < 0 || action > 2) {
    return { ok: false, reason: "mismatch" as const };
  }

  const [intent] = await db
    .select()
    .from(clubDuesPaymentIntents)
    .where(eq(clubDuesPaymentIntents.paymentRef, paymentRef))
    .limit(1);
  const now = new Date();
  if (!intent || intent.userId !== requesterUserId || intent.contractId !== contract.id) {
    return { ok: false, reason: "intent_unavailable" as const };
  }
  if (intent.status === "completed" && intent.opHash === opHash) {
    return { ok: true, reason: "already_verified" as const, membershipId: null };
  }
  if (intent.status !== "pending" || intent.expiresAt < now) {
    return { ok: false, reason: "intent_unavailable" as const };
  }
  const rawIntent = (intent.raw ?? {}) as Record<string, unknown>;
  const expectedTierId = Number(rawIntent.tierId ?? 0);
  const expectedAction = Number(rawIntent.action ?? 0);
  if (
    intent.months !== months ||
    intent.amountMutez !== parseMutez(call.op.amount) ||
    expectedTierId !== tierId ||
    expectedAction !== action
  ) {
    return { ok: false, reason: "mismatch" as const };
  }
  const intentWallet = normalizeAddress(intent.walletAddress);
  if (intentWallet && intentWallet.toLowerCase() !== call.sender.toLowerCase()) {
    return { ok: false, reason: "mismatch" as const };
  }

  const paidAt = call.timestamp ? new Date(call.timestamp) : now;
  const [existing] = await db
    .select()
    .from(clubDuesMemberLedger)
    .where(
      and(
        eq(clubDuesMemberLedger.contractId, contract.id),
        eq(clubDuesMemberLedger.walletAddress, call.sender)
      )
    )
    .limit(1);
  const base = existing?.paidThrough && existing.paidThrough > paidAt ? existing.paidThrough : paidAt;
  const paidThrough = addDuesMonths(base, months, contract.monthSeconds);
  const addedUtility = BigInt(months) * BigInt(String(contract.utilityUnitsPerMonth));
  const utilityUnits = addBigIntStrings(existing?.utilityUnits, addedUtility.toString());

  const [ledger] = await db
    .insert(clubDuesMemberLedger)
    .values({
      contractId: contract.id,
      userId: requesterUserId,
      walletAddress: call.sender,
      membershipTokenId: existing?.membershipTokenId ?? null,
      utilityUnits,
      paidThrough,
      lastPaymentAt: paidAt,
      lastOpHash: opHash,
      status: "active",
      arrearsSince: null,
      warningsSent: existing?.warningsSent ?? 0,
      raw: { transactions: rows, paymentCall: call.op, tierId, action },
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [clubDuesMemberLedger.contractId, clubDuesMemberLedger.walletAddress],
      set: {
        userId: requesterUserId,
        utilityUnits,
        paidThrough,
        lastPaymentAt: paidAt,
        lastOpHash: opHash,
        status: "active",
        arrearsSince: null,
        raw: { transactions: rows, paymentCall: call.op, tierId, action },
        updatedAt: now,
      },
    })
    .returning();

  await db
    .update(clubDuesPaymentIntents)
    .set({
      status: "completed",
      walletAddress: call.sender,
      opHash,
      raw: { transactions: rows, paymentCall: call.op, tierId, action },
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(clubDuesPaymentIntents.id, intent.id));

  await createNotification({
    userId: requesterUserId,
    eventKey: "club_dues.payment_verified",
    title: "Club dues verified",
    body: `${contract.name} dues are paid through ${paidThrough.toLocaleDateString()}.`,
    metadata: {
      contractId: contract.id,
      contractAddress: contract.contractAddress,
      paymentRef,
      opHash,
      months,
      tierId,
      action,
      utilityUnits,
    },
  });

  return {
    ok: true,
    membershipId: ledger.id,
    paidThrough: paidThrough.toISOString(),
    utilityUnits,
  };
}

export async function getMyClubDuesMemberships(userId: number) {
  const wallets = await linkedWalletsForUser(userId);
  const filters = [eq(clubDuesMemberLedger.userId, userId)];
  if (wallets.length > 0) filters.push(inArray(clubDuesMemberLedger.walletAddress, wallets));
  const rows = await db
    .select({ ledger: clubDuesMemberLedger, contract: clubDuesContracts })
    .from(clubDuesMemberLedger)
    .innerJoin(clubDuesContracts, eq(clubDuesMemberLedger.contractId, clubDuesContracts.id))
    .where(or(...filters))
    .orderBy(desc(clubDuesMemberLedger.paidThrough))
    .limit(100);
  return rows.map((row) => serializeLedger(row.ledger, row.contract));
}

export async function sweepClubDuesArrears(options: {
  chainMark?: boolean;
  actorUserId?: number | null;
} = {}) {
  const now = new Date();
  const rows = await db
    .select({ ledger: clubDuesMemberLedger, contract: clubDuesContracts })
    .from(clubDuesMemberLedger)
    .innerJoin(clubDuesContracts, eq(clubDuesMemberLedger.contractId, clubDuesContracts.id))
    .where(and(lt(clubDuesMemberLedger.paidThrough, now), ne(clubDuesMemberLedger.status, "closed")))
    .limit(500);

  let marked = 0;
  let warned = 0;
  const chainMarks: Array<{ ledgerId: number; opHash?: string | null; error?: string }> = [];

  for (const row of rows) {
    const graceMs = row.contract.gracePeriodDays * 24 * 60 * 60 * 1_000;
    if (row.ledger.paidThrough.getTime() + graceMs >= now.getTime()) continue;

    const warningMs = row.contract.arrearsWarningDays * 24 * 60 * 60 * 1_000;
    const shouldWarn =
      !row.ledger.lastWarningAt ||
      row.ledger.lastWarningAt.getTime() + warningMs <= now.getTime();
    await db
      .update(clubDuesMemberLedger)
      .set({
        status: "arrears",
        arrearsSince: row.ledger.arrearsSince ?? now,
        warningsSent: shouldWarn
          ? sql`${clubDuesMemberLedger.warningsSent} + 1`
          : row.ledger.warningsSent,
        lastWarningAt: shouldWarn ? now : row.ledger.lastWarningAt,
        updatedAt: now,
      })
      .where(eq(clubDuesMemberLedger.id, row.ledger.id));
    marked += 1;

    if (shouldWarn && row.ledger.userId) {
      warned += 1;
      await createNotification({
        userId: row.ledger.userId,
        eventKey: "club_dues.member_arrears_warned",
        title: "Club dues are overdue",
        body: `${row.contract.name} dues expired on ${row.ledger.paidThrough.toLocaleDateString()}. Renew to restore access.`,
        metadata: {
          contractId: row.contract.id,
          contractAddress: row.contract.contractAddress,
          walletAddress: row.ledger.walletAddress,
          paidThrough: row.ledger.paidThrough.toISOString(),
        },
      });
    }

    if (options.chainMark && row.contract.contractAddress) {
      try {
        const signer = await callSigner({
          intent: "custom",
          walletId: row.contract.managerWalletId,
          counterpartyContract: row.contract.contractAddress,
          entrypoint: "mark_arrears",
          params: [row.ledger.walletAddress],
          amountMutez: "0",
          runId: `club-dues-arrears-${row.ledger.id}`,
        });
        chainMarks.push({ ledgerId: row.ledger.id, opHash: signer.opHash ?? null });
      } catch (err) {
        chainMarks.push({
          ledgerId: row.ledger.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await db
    .update(clubDuesContracts)
    .set({ lastArrearsSweepAt: now, updatedAt: now })
    .where(eq(clubDuesContracts.status, "live"));

  return { marked, warned, chainMarks };
}

export async function adminClubDuesSummary() {
  const [contracts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      live: sql<number>`count(*) filter (where ${clubDuesContracts.status} = 'live')::int`,
      drafts: sql<number>`count(*) filter (where ${clubDuesContracts.status} = 'draft')::int`,
    })
    .from(clubDuesContracts);
  const [members] = await db
    .select({
      total: sql<number>`count(*)::int`,
      arrears: sql<number>`count(*) filter (where ${clubDuesMemberLedger.status} = 'arrears')::int`,
    })
    .from(clubDuesMemberLedger);
  const recentDeployments = await db
    .select()
    .from(clubDuesDeploymentRuns)
    .orderBy(desc(clubDuesDeploymentRuns.createdAt))
    .limit(20);

  return {
    signerConfigured: isSignerConfigured(),
    kilnUrl: defaultKilnApiUrl(),
    totals: {
      contracts: contracts?.total ?? 0,
      liveContracts: contracts?.live ?? 0,
      drafts: contracts?.drafts ?? 0,
      members: members?.total ?? 0,
      arrears: members?.arrears ?? 0,
    },
    contracts: await listClubDuesContracts({ includeDrafts: true }),
    recentDeployments,
  };
}
