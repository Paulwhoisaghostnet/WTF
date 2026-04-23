import { Router, type Request } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";
import { db } from "../db";
import {
  collectionContracts,
  collectionTemplates,
  operatorActions,
} from "@shared/schema";
import { requirePermission, isAuthenticated } from "../auth/passport";

/*
 * Phase 8 — WTF Contract Factory routes.
 *
 * Every WTF-branded collection contract originates through Kiln: the
 * operator names a collection, picks a template kind, supplies
 * origination storage, and this route forwards the SmartPy source and
 * storage to the Kiln workflow API. Kiln returns compiled Michelson
 * and (after clearance) an origination result. We persist the resulting
 * address on the collection_contracts row so the Control Board has a
 * single index of every contract the WTF factory has ever put live.
 *
 * Security posture:
 *  - All deploy actions require `manage_gameshow` (cohost+).
 *  - `network` is forced to match Kiln's health response; mainnet is
 *    only allowed if the operator passes `--confirm-mainnet` AND the
 *    server env flag WTF_FACTORY_ALLOW_MAINNET=1.
 *  - Kiln runs in its own process; if it is unreachable the route
 *    returns 503 instead of silently queuing.
 */

const router = Router();

const TEMPLATE_KINDS = [
  "teia_one_of_one",
  "open_edition",
  "bonding_curve",
  "blind_mint",
  "buyback",
] as const;

const NETWORKS = ["ghostnet", "shadownet", "mainnet"] as const;

const KILN_API_URL = (
  process.env.KILN_API_URL ?? "http://127.0.0.1:3080"
).replace(/\/$/, "");
const KILN_API_TOKEN =
  process.env.KILN_API_TOKEN?.trim() ||
  process.env.WTF_KILN_API_TOKEN?.trim() ||
  undefined;

const REPO_ROOT = resolve(process.cwd(), "..");

async function loadTemplateSource(templateKind: string): Promise<{
  sourcePath: string;
  source: string;
}> {
  const [template] = await db
    .select()
    .from(collectionTemplates)
    .where(eq(collectionTemplates.kind, templateKind as any))
    .limit(1);
  if (!template) {
    throw new Error(`Unknown template kind "${templateKind}"`);
  }
  const abs = template.sourcePath.startsWith("/")
    ? template.sourcePath
    : join(REPO_ROOT, template.sourcePath);
  const source = await fs.readFile(abs, "utf8");
  return { sourcePath: abs, source };
}

async function kilnFetch<T = unknown>(
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (KILN_API_TOKEN) {
    headers["x-api-token"] = KILN_API_TOKEN;
  }
  const res = await fetch(`${KILN_API_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const err: any = new Error(
      `Kiln ${path} failed: HTTP ${res.status} — ${text.slice(0, 400)}`
    );
    err.status = res.status;
    err.kilnBody = text;
    throw err;
  }
  try {
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    return { raw: text } as unknown as T;
  }
}

async function logOperator(
  req: Request,
  actorId: number | null,
  actionKind: string,
  contractId: number | null,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(operatorActions).values({
      actorUserId: actorId,
      actionKind,
      targetKind: "collection_contract",
      targetId: contractId,
      payloadJson: payload,
      ip:
        (typeof req.headers["x-forwarded-for"] === "string"
          ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
          : undefined) ??
        req.socket.remoteAddress ??
        null,
    });
  } catch (err) {
    console.warn("[collection-factory] audit write failed:", err);
  }
}

// ───────────────────────────────────────────────────────────────────
// GET /api/factory/templates  → public template registry.
// ───────────────────────────────────────────────────────────────────
router.get(
  "/api/factory/templates",
  isAuthenticated,
  async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(collectionTemplates)
        .orderBy(collectionTemplates.kind);
      res.json({
        kilnUrl: KILN_API_URL,
        templates: rows,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ───────────────────────────────────────────────────────────────────
// GET /api/factory/contracts  → all tracked WTF contracts across envs.
// ───────────────────────────────────────────────────────────────────
const contractsQuerySchema = z
  .object({
    network: z.enum(NETWORKS).optional(),
    status: z
      .enum(["pending", "originating", "live", "failed", "retired"])
      .optional(),
    templateKind: z.enum(TEMPLATE_KINDS).optional(),
  })
  .strict();

router.get(
  "/api/factory/contracts",
  isAuthenticated,
  async (req, res, next) => {
    try {
      const parsed = contractsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "bad_query", details: parsed.error.flatten() });
      }
      const filters: any[] = [];
      if (parsed.data.network) {
        filters.push(eq(collectionContracts.network, parsed.data.network));
      }
      if (parsed.data.status) {
        filters.push(eq(collectionContracts.status, parsed.data.status));
      }
      if (parsed.data.templateKind) {
        filters.push(
          eq(collectionContracts.templateKind, parsed.data.templateKind)
        );
      }
      const rows = await db
        .select()
        .from(collectionContracts)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(collectionContracts.createdAt))
        .limit(200);
      res.json({ contracts: rows });
    } catch (err) {
      next(err);
    }
  }
);

// ───────────────────────────────────────────────────────────────────
// POST /api/factory/compile  → compile + clearance only, no origination.
// ───────────────────────────────────────────────────────────────────
const compileSchema = z
  .object({
    templateKind: z.enum(TEMPLATE_KINDS),
    initialStorage: z.string().min(1).max(50_000),
    simulationSteps: z
      .array(
        z.object({
          wallet: z.enum(["bert", "ernie", "user"]).default("user"),
          entrypoint: z.string().min(1).max(120),
          args: z.any(),
        })
      )
      .default([]),
  })
  .strict();

router.post(
  "/api/factory/compile",
  requirePermission("manage_gameshow"),
  async (req, res, next) => {
    try {
      const parsed = compileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "bad_body", details: parsed.error.flatten() });
      }
      const { templateKind, initialStorage, simulationSteps } = parsed.data;
      const { source, sourcePath } = await loadTemplateSource(templateKind);
      const workflow = await kilnFetch("/api/kiln/workflow/run", {
        sourceType: "smartpy",
        source,
        initialStorage,
        simulationSteps,
      });
      res.json({
        templateKind,
        sourcePath,
        workflow,
      });
    } catch (err: any) {
      if (err?.status) {
        return res
          .status(503)
          .json({ error: "kiln_unreachable", message: err.message });
      }
      next(err);
    }
  }
);

// ───────────────────────────────────────────────────────────────────
// POST /api/factory/deploy  → origin & persist a new WTF contract.
// ───────────────────────────────────────────────────────────────────
const deploySchema = z
  .object({
    templateKind: z.enum(TEMPLATE_KINDS),
    name: z.string().min(1).max(140),
    network: z.enum(NETWORKS),
    initialStorage: z.string().min(1).max(50_000),
    wallet: z.enum(["A", "B"]).default("A"),
    clearanceId: z.string().min(4).max(80).optional(),
    autoClearance: z.boolean().default(true),
    collectionMeta: z.record(z.string(), z.any()).optional(),
    originationParams: z.record(z.string(), z.any()).optional(),
    confirmMainnet: z.boolean().optional(),
  })
  .strict();

router.post(
  "/api/factory/deploy",
  requirePermission("manage_gameshow"),
  async (req, res, next) => {
    try {
      const parsed = deploySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "bad_body", details: parsed.error.flatten() });
      }
      const data = parsed.data;

      if (data.network === "mainnet") {
        if (!data.confirmMainnet) {
          return res
            .status(400)
            .json({ error: "confirm_mainnet_required" });
        }
        if (process.env.WTF_FACTORY_ALLOW_MAINNET !== "1") {
          return res
            .status(403)
            .json({ error: "mainnet_disabled_in_env" });
        }
      }

      const { source } = await loadTemplateSource(data.templateKind);

      // Create placeholder row so we have a stable id for audit + on-chain cross-ref.
      const [placeholder] = await db
        .insert(collectionContracts)
        .values({
          templateKind: data.templateKind,
          name: data.name,
          network: data.network,
          status: "originating",
          collectionMeta: data.collectionMeta ?? null,
          originationParams: data.originationParams ?? null,
          deployedByUserId: (req.user as any)?.id ?? null,
        })
        .returning();
      const rowId = placeholder.id;

      let clearanceId = data.clearanceId;
      if (!clearanceId && data.autoClearance) {
        const workflow = (await kilnFetch("/api/kiln/workflow/run", {
          sourceType: "smartpy",
          source,
          initialStorage: data.initialStorage,
          simulationSteps: [],
        })) as any;
        clearanceId = workflow?.clearance?.record?.id;
      }

      let uploadResult: any;
      try {
        uploadResult = await kilnFetch("/api/kiln/upload", {
          code: source,
          initialStorage: data.initialStorage,
          wallet: data.wallet,
          clearanceId,
        });
      } catch (err: any) {
        await db
          .update(collectionContracts)
          .set({
            status: "failed",
            errorMessage:
              err?.message?.slice(0, 400) ?? "kiln upload failed",
            updatedAt: new Date(),
          })
          .where(eq(collectionContracts.id, rowId));
        await logOperator(req, (req.user as any)?.id ?? null, "factory_deploy_failed", rowId, {
          templateKind: data.templateKind,
          network: data.network,
          error: err?.message?.slice(0, 400),
        });
        return res
          .status(err?.status ?? 502)
          .json({ error: "kiln_upload_failed", message: err?.message });
      }

      const address: string | undefined =
        uploadResult?.address ||
        uploadResult?.contract?.address ||
        uploadResult?.origination?.address;
      const opHash: string | undefined =
        uploadResult?.opHash ||
        uploadResult?.origination?.opHash ||
        uploadResult?.hash;

      const [updated] = await db
        .update(collectionContracts)
        .set({
          status: address ? "live" : "failed",
          address: address ?? null,
          opHash: opHash ?? null,
          deployedAt: address ? new Date() : null,
          errorMessage: address ? null : "kiln_upload_no_address",
          updatedAt: new Date(),
        })
        .where(eq(collectionContracts.id, rowId))
        .returning();

      await logOperator(
        req,
        (req.user as any)?.id ?? null,
        address ? "factory_deploy_live" : "factory_deploy_failed",
        rowId,
        {
          templateKind: data.templateKind,
          network: data.network,
          address: address ?? null,
          opHash: opHash ?? null,
        }
      );

      res.json({
        contract: updated,
        kiln: uploadResult,
      });
    } catch (err: any) {
      if (err?.status) {
        return res
          .status(503)
          .json({ error: "kiln_unreachable", message: err.message });
      }
      next(err);
    }
  }
);

// ───────────────────────────────────────────────────────────────────
// POST /api/factory/contracts/:id/retire  → mark live contract retired.
// ───────────────────────────────────────────────────────────────────
router.post(
  "/api/factory/contracts/:id/retire",
  requirePermission("manage_gameshow"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "bad_id" });
      }
      const [row] = await db
        .update(collectionContracts)
        .set({ status: "retired", retiredAt: new Date(), updatedAt: new Date() })
        .where(eq(collectionContracts.id, id))
        .returning();
      if (!row) return res.status(404).json({ error: "not_found" });
      await logOperator(req, (req.user as any)?.id ?? null, "factory_retire", id, {
        templateKind: row.templateKind,
      });
      res.json({ contract: row });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
