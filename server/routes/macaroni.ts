import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { requirePermission } from "../auth/passport";
import {
  claimUserSite,
  getUserSiteState,
  publishUserSite,
  saveUserSitePage,
  WtfUserSiteError,
} from "../features/wtf-sites/service";
import {
  normalizeUserSiteSlug,
} from "../features/wtf-sites/policy";
import { WTF_USER_SITE_HOME_SLUG } from "@shared/wtf-user-sites";
import {
  buildMacaroniPublishedHtml,
  slugForDropTitle,
} from "../features/macaroni/publish";

const router = Router();

const DEFAULT_IPFS_MAX_BYTES = 250 * 1024 * 1024;

const publishSchema = z.object({
  config: z.object({}).passthrough(),
  slug: z.string().trim().min(1).max(80).optional(),
});

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function macaroniIpfsMaxBytes(): number {
  return envInt("MACARONI_IPFS_MAX_BYTES", DEFAULT_IPFS_MAX_BYTES);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: macaroniIpfsMaxBytes(),
    files: 1,
    fields: 8,
    fieldSize: 1024 * 1024,
  },
});

function runPinUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const message =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? `File exceeds the ${macaroniIpfsMaxBytes()} byte Macaroni IPFS upload limit`
        : "Invalid Macaroni IPFS upload";
    return res.status(400).json({ error: message });
  });
}

function pinningJwt(): string {
  return (
    process.env.WTFGAMESHOW_IPFS_JWT ||
    process.env.WTF_GAMESHOW_IPFS_JWT ||
    process.env.WTFGAMESHOW_PINATA_JWT ||
    process.env.PINATA_JWT ||
    process.env.PINATA_API_JWT ||
    ""
  ).trim();
}

function publicOrigin(req: Request): string {
  const configured = process.env.PUBLIC_SITE_URL || process.env.APP_PUBLIC_URL || "";
  if (configured.trim()) return configured.trim().replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`.replace(/\/+$/, "");
}

function dropSlug(input: { slug?: string; title?: unknown }): string | null {
  const explicit = input.slug?.trim();
  const raw = explicit || slugForDropTitle(input.title);
  const normalized = normalizeUserSiteSlug(raw);
  if (!normalized || normalized === WTF_USER_SITE_HOME_SLUG) {
    return explicit ? null : "macaroni-drop";
  }
  return normalized;
}

function handleMacaroniSiteError(res: Response, err: unknown) {
  if (err instanceof WtfUserSiteError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error("[macaroni] route error:", err);
  return res.status(500).json({ error: "Failed to process Macaroni request" });
}

router.post(
  "/api/macaroni/ipfs/pin",
  requirePermission("trusted_market_creator"),
  runPinUpload,
  async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Upload a file to pin" });

    const jwt = pinningJwt();
    if (!jwt) {
      return res.status(503).json({ error: "Macaroni IPFS pinning is not configured" });
    }

    const fileBytes = new Uint8Array(file.buffer.byteLength);
    fileBytes.set(file.buffer);
    const form = new FormData();
    form.append(
      "file",
      new Blob([fileBytes], { type: file.mimetype || "application/octet-stream" }),
      file.originalname || "macaroni-upload"
    );

    const upstream = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(502).json({
        error: "Macaroni IPFS pinning failed",
        status: upstream.status,
        details: text.slice(0, 1000),
      });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "Macaroni IPFS pinning returned invalid JSON" });
    }

    const cid = String(payload.IpfsHash || payload.cid || "");
    if (!cid) return res.status(502).json({ error: "Macaroni IPFS pinning returned no CID" });
    return res.json({ ...payload, cid, IpfsHash: cid, ipfsUri: `ipfs://${cid}` });
  }
);

router.post(
  "/api/macaroni/publish",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid Macaroni publish payload" });
    }

    const config = parsed.data.config as Record<string, unknown>;
    const slug = dropSlug({ slug: parsed.data.slug, title: config.title });
    if (!slug) {
      return res.status(400).json({ error: "Invalid Macaroni drop slug" });
    }

    try {
      const user = req.user as { id: number };
      let state = await getUserSiteState(user.id);
      if (!state.site) state = await claimUserSite(user.id);
      if (!state.site) {
        return res.status(409).json({ error: "Claim a wtfOS site before publishing Macaroni drops" });
      }

      const title = String(config.title || "Macaroni Drop").trim().slice(0, 200) || "Macaroni Drop";
      const html = buildMacaroniPublishedHtml({
        config,
        publicOrigin: publicOrigin(req),
      });

      await saveUserSitePage({
        userId: user.id,
        slug,
        title,
        html,
      });
      const published = await publishUserSite(user.id);
      const host = published.site?.host ?? state.site.host;
      return res.status(201).json({
        ok: true,
        slug,
        host,
        url: `https://${host}/${slug}`,
        site: published.site,
      });
    } catch (err) {
      return handleMacaroniSiteError(res, err);
    }
  }
);

export default router;
