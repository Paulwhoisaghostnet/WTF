import { Router } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import { asc, and, eq, or } from "drizzle-orm";
import { db } from "../db";
import { horfInspectionApprovals, horfOpenRangeOffers, horfTraderProfiles, horfTraderSeasonProfiles } from "@shared/schema";
import { getOwnedFa2TokensPage } from "../tzkt";
import { HORF_HORSE_CHAIN_ID } from "../features/horf/horse-config";
import { horfMainnetIndex, HORF_MAINNET_TZKT_BASE } from "../features/horf/mainnet-index";
import { approvedHorseTags, horseTagEvidence, isTezosWallet } from "../features/horf/model";
import { resolveHorfSeason } from "../features/horf/seasons";
import { requireHorfCsrf, requireHorfWallet } from "../features/horf/wallet-scope";
import { sanitizeProfilePfpImageUrl } from "../features/profile/pfp-policy";
import { loadHorfTraderNames } from "../features/horf/trader-names";
import {
  loadTraderObjktTokens, qualifyingTraderHorses, traderTokenMedia, traderTokenKey,
} from "../features/horf/trader-horses";
import { editionKey, getTraderEditionCounts } from "../features/horf/trader-editions";
import { excludedHorseTokenKeys } from "../features/horf/nonhorse-reports";

const router = Router();
// Match the existing public Horf wallet page. Every qualifying holding remains
// reachable through the offset cursor, including after a page with no matches.
const BALANCE_PAGE_SIZE = 48;
// Match the existing WTF OS uploaded-avatar policy in /api/profile/avatar-media.
const PROFILE_PICTURE_BYTES = 2 * 1024 * 1024;
const profilePictureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_PICTURE_BYTES, files: 1, fields: 0, parts: 1 },
});

function profileSeason(req: { query: Record<string, unknown> }) {
  const value = req.query.season;
  return typeof value === "undefined" || typeof value === "string"
    ? resolveHorfSeason(value ?? null)
    : null;
}

function detectProfilePictureMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function ownUploadedPictureUrl(value: string, address: string): boolean {
  const route = `/api/horf/traders/${address}/profile-picture`;
  return value === route || (value.startsWith(`${route}?`) && /^v=[0-9a-f]{12}$/.test(value.slice(route.length + 1)));
}

function normalizeHorfUsername(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) return null;
  if ([...normalized].length > 50 || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
}

async function traderProfile(address: string, seasonKey: string) {
  const [[profile], [season], names] = await Promise.all([
    db.select({ imageUrl: horfTraderProfiles.imageUrl, imageSha256: horfTraderProfiles.imageSha256,
      imageMime: horfTraderProfiles.imageMime, updatedAt: horfTraderProfiles.updatedAt })
      .from(horfTraderProfiles).where(eq(horfTraderProfiles.address, address)).limit(1),
    db.select({ description: horfTraderSeasonProfiles.description, updatedAt: horfTraderSeasonProfiles.updatedAt })
      .from(horfTraderSeasonProfiles).where(and(eq(horfTraderSeasonProfiles.address, address),
        eq(horfTraderSeasonProfiles.seasonKey, seasonKey))).limit(1),
    loadHorfTraderNames([address]),
  ]);
  const identity = names.get(address) || { username: null, displayName: null,
    usernameSource: "wallet" as const, canEditUsername: true };
  const imageUrl = profile?.imageMime && profile.imageSha256
    ? `/api/horf/traders/${address}/profile-picture?v=${profile.imageSha256.slice(0, 12)}`
    : profile?.imageUrl ?? null;
  const updatedAt = season?.updatedAt || profile?.updatedAt || null;
  return { address, seasonKey, imageUrl, ...identity, description: season?.description ?? "",
    updatedAt: updatedAt?.toISOString() ?? null };
}

/** Public profile data is wallet-scoped, with one commentary block per known season. */
router.get("/api/horf/traders/:address/profile", async (req, res) => {
  const address = req.params.address;
  const season = profileSeason(req);
  if (!isTezosWallet(address) || !season) return res.status(400).json({ error: "A valid trader wallet and named season are required" });
  try { return res.json(await traderProfile(address, season.key)); }
  catch (error) {
    console.error("[horf] trader profile read failed:", error);
    return res.status(503).json({ error: "Trader profile is temporarily unavailable" });
  }
});

router.put("/api/horf/traders/:address/profile", requireHorfCsrf, async (req, res) => {
  const address = req.params.address;
  const season = profileSeason(req);
  const description = req.body?.description;
  const submittedImage = req.body?.imageUrl;
  const submittedUsername = req.body?.username;
  if (!isTezosWallet(address) || !season || typeof description !== "string" ||
      (submittedImage !== undefined && submittedImage !== null && typeof submittedImage !== "string") ||
      (submittedUsername !== undefined && submittedUsername !== null && typeof submittedUsername !== "string")) {
    return res.status(400).json({ error: "A valid trader wallet, named season, image, username, and description are required" });
  }
  const username = submittedUsername === undefined ? undefined : normalizeHorfUsername(submittedUsername);
  if (typeof submittedUsername === "string" && submittedUsername.trim() && !username) {
    return res.status(400).json({ error: "Horf username must be one line and at most 50 characters" });
  }
  const imageMode = submittedImage === undefined ||
    (typeof submittedImage === "string" && ownUploadedPictureUrl(submittedImage, address))
    ? "preserve" : submittedImage === null || submittedImage.trim() === "" ? "clear" : "remote";
  const safeImageUrl = imageMode === "remote" ? sanitizeProfilePfpImageUrl(submittedImage) : null;
  if (imageMode === "remote" && !safeImageUrl) {
    return res.status(400).json({ error: "Use an approved HTTPS or IPFS profile image URL" });
  }
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    if (username !== undefined) {
      const identity = (await loadHorfTraderNames([address])).get(address);
      if (identity && !identity.canEditUsername) {
        return res.status(409).json({ error: "This linked wallet uses its WTF OS username" });
      }
    }
    const now = new Date();
    const imageChange = imageMode === "preserve" ? {} : {
      imageUrl: safeImageUrl, imageBytes: null, imageMime: null, imageSha256: null,
    };
    const usernameChange = username === undefined ? {} : { horfUsername: username };
    await db.transaction(async (tx) => {
      await tx.insert(horfTraderProfiles).values({ address, ...imageChange, ...usernameChange, updatedAt: now })
        .onConflictDoUpdate({ target: horfTraderProfiles.address, set: { ...imageChange, ...usernameChange, updatedAt: now } });
      await tx.insert(horfTraderSeasonProfiles).values({ address, seasonKey: season.key,
        description, updatedAt: now })
        .onConflictDoUpdate({ target: [horfTraderSeasonProfiles.address, horfTraderSeasonProfiles.seasonKey],
          set: { description, updatedAt: now } });
    });
    return res.json(await traderProfile(address, season.key));
  } catch (error) {
    console.error("[horf] trader profile update failed:", error);
    return res.status(503).json({ error: "Trader profile could not be saved" });
  }
});

/** Files are persisted in PostgreSQL, not a deploy-local uploads directory. */
router.post("/api/horf/traders/:address/profile-picture", requireHorfCsrf, (req, res) => {
  profilePictureUpload.single("file")(req, res, async (uploadError) => {
    if (uploadError) return res.status(uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ error: uploadError instanceof Error ? uploadError.message : "Profile image upload failed" });
    const address = req.params.address;
    const season = profileSeason(req);
    if (!isTezosWallet(address) || !season) return res.status(400).json({ error: "A valid trader wallet and named season are required" });
    const bytes = req.file?.buffer;
    const mime = bytes ? detectProfilePictureMime(bytes) : null;
    if (!bytes || !mime || bytes.length > PROFILE_PICTURE_BYTES) {
      return res.status(!bytes ? 400 : bytes.length > PROFILE_PICTURE_BYTES ? 413 : 415)
        .json({ error: "Choose a PNG, JPEG, WEBP, or GIF profile picture up to 2 MB" });
    }
    try {
      if (!(await requireHorfWallet(req, res, address))) return;
      const hash = createHash("sha256").update(bytes).digest("hex");
      const now = new Date();
      await db.insert(horfTraderProfiles).values({ address, imageUrl: null,
        imageBytes: bytes, imageMime: mime, imageSha256: hash, updatedAt: now })
        .onConflictDoUpdate({ target: horfTraderProfiles.address, set: {
          imageUrl: null, imageBytes: bytes, imageMime: mime, imageSha256: hash, updatedAt: now,
        } });
      return res.json(await traderProfile(address, season.key));
    } catch (error) {
      console.error("[horf] trader profile picture upload failed:", error);
      return res.status(503).json({ error: "Trader profile picture could not be saved" });
    }
  });
});

router.get("/api/horf/traders/:address/profile-picture", async (req, res) => {
  const address = req.params.address;
  if (!isTezosWallet(address)) return res.status(400).json({ error: "A valid trader wallet is required" });
  try {
    const [profile] = await db.select({ imageBytes: horfTraderProfiles.imageBytes,
      imageMime: horfTraderProfiles.imageMime, imageSha256: horfTraderProfiles.imageSha256 })
      .from(horfTraderProfiles).where(eq(horfTraderProfiles.address, address)).limit(1);
    if (!profile?.imageBytes || !profile.imageMime || !profile.imageSha256) return res.status(404).json({ error: "Trader profile picture not found" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("ETag", `\"${profile.imageSha256}\"`);
    res.type(profile.imageMime);
    return res.send(profile.imageBytes);
  } catch (error) {
    console.error("[horf] trader profile picture read failed:", error);
    return res.status(503).json({ error: "Trader profile picture is temporarily unavailable" });
  }
});

router.get("/api/horf/traders/:address/horses", async (req, res) => {
  const address = req.params.address;
  const offset = Number(req.query.offset ?? 0);
  const viewer = req.query.viewer;
  const refresh = req.query.refresh === "1";
  if (!isTezosWallet(address) || !Number.isSafeInteger(offset) || offset < 0 ||
      (viewer !== undefined && !isTezosWallet(viewer)) || (req.query.refresh != null && !refresh)) {
    return res.status(400).json({ error: "Valid trader wallet, viewer, and nonnegative offset are required" });
  }
  try {
    const head = await horfMainnetIndex.getJson<{ chainId?: string }>("/head");
    if (head.chainId !== HORF_HORSE_CHAIN_ID) {
      return res.status(503).json({ error: "Trader horses require the Tezos Mainnet index" });
    }
    const page = await getOwnedFa2TokensPage(address, BALANCE_PAGE_SIZE, offset,
      { sourceBase: HORF_MAINNET_TZKT_BASE, forceFresh: refresh });
    const indexed = await loadTraderObjktTokens(page.items);
    const [approvalRows, excluded] = await Promise.all([page.items.length ? db.select({
      contract: horfInspectionApprovals.tokenContract,
      tokenId: horfInspectionApprovals.tokenId,
    }).from(horfInspectionApprovals).where(and(
      eq(horfInspectionApprovals.active, true),
      or(...page.items.map((token) => and(
        eq(horfInspectionApprovals.tokenContract, token.contract),
        eq(horfInspectionApprovals.tokenId, token.tokenId),
      ))),
    )) : Promise.resolve([]), excludedHorseTokenKeys(page.items)]);
    const approved = new Set(approvalRows.map((row) => traderTokenKey(row)));
    const horses = qualifyingTraderHorses(page.items, indexed, approved, excluded);
    let viewerBalances: Map<string, string> | null = null;
    if (typeof viewer === "string") {
      try { viewerBalances = viewer === address
        ? new Map(horses.map((horse) => [editionKey(horse), horse.balance]))
        : await getTraderEditionCounts(viewer, horses, BALANCE_PAGE_SIZE); }
      catch (error) { console.warn("[horf] trader horse viewer balance unavailable:", error); }
    }
    return res.json({
      address,
      balanceStatus: viewer && !viewerBalances ? "unavailable" : "ready",
      items: horses.map((horse) => ({ ...horse,
        viewerBalance: typeof viewer === "string" ? viewerBalances?.get(editionKey(horse)) ?? null : null,
        approvedForMarshalsMarket: approved.has(traderTokenKey(horse)),
      })),
      pagination: { hasMore: page.hasMore, nextOffset: page.nextOffset },
    });
  } catch (error) {
    console.error("[horf] trader horse holdings failed:", error);
    return res.status(503).json({ error: "Trader horse holdings are temporarily unavailable" });
  }
});

router.get("/api/horf/traders/:address/offers", async (req, res) => {
  const address = req.params.address;
  const viewer = req.query.viewer;
  if (!isTezosWallet(address) || (viewer !== undefined && !isTezosWallet(viewer))) {
    return res.status(400).json({ error: "A valid trader wallet and viewer are required" });
  }
  try {
    const rows = await db.select().from(horfOpenRangeOffers)
      .where(and(eq(horfOpenRangeOffers.active, true), eq(horfOpenRangeOffers.ownerWalletAddress, address)))
      .orderBy(asc(horfOpenRangeOffers.createdAt), asc(horfOpenRangeOffers.id));
    let indexed: Awaited<ReturnType<typeof loadTraderObjktTokens>> = [];
    let metadataStatus: "ready" | "unavailable" = "ready";
    try {
      indexed = await loadTraderObjktTokens(rows.map((row) => ({ contract: row.tokenContract, tokenId: row.tokenId })));
    } catch (error) {
      metadataStatus = "unavailable";
      console.warn("[horf] trader offer artwork unavailable:", error);
    }
    const byKey = new Map(indexed.filter((token) => typeof token.fa_contract === "string" && typeof token.token_id === "string")
      .map((token) => [traderTokenKey({ contract: token.fa_contract!, tokenId: token.token_id! }), token]));
    const [approvalRows, excluded] = await Promise.all([rows.length ? db.select({
      contract: horfInspectionApprovals.tokenContract,
      tokenId: horfInspectionApprovals.tokenId,
    }).from(horfInspectionApprovals).where(and(eq(horfInspectionApprovals.active, true),
      or(...rows.map((row) => and(eq(horfInspectionApprovals.tokenContract, row.tokenContract),
        eq(horfInspectionApprovals.tokenId, row.tokenId)))))) : Promise.resolve([]),
      excludedHorseTokenKeys(rows.map((row) => ({ contract: row.tokenContract, tokenId: row.tokenId })))]);
    const approved = new Set(approvalRows.map((row) => traderTokenKey(row)));
    // Old direct offers remain in the database, but they cannot advertise art
    // that no longer passes the mint-tag policy or lacks HAHA review.
    const visibleRows = rows.filter((row) => {
      if (excluded.has(traderTokenKey({ contract: row.tokenContract, tokenId: row.tokenId }))) return false;
      const token = byKey.get(traderTokenKey({ contract: row.tokenContract, tokenId: row.tokenId }));
      if (!token) return false;
      const tags = (token.tags || []).map((item) => item.tag || {});
      const evidence = horseTagEvidence(token, new Set(approvedHorseTags(tags)));
      return evidence === "horse" || (evidence === "haha-review" && approved.has(traderTokenKey({ contract: row.tokenContract, tokenId: row.tokenId })));
    });
    let ownerBalances: Map<string, string> | null = null;
    let viewerBalances: Map<string, string> | null = null;
    try {
      const head = await horfMainnetIndex.getJson<{ chainId?: string }>("/head");
      if (head.chainId !== HORF_HORSE_CHAIN_ID) throw new Error("Trader balances require the Tezos Mainnet index");
      const keys = visibleRows.map((row) => ({ contract: row.tokenContract, tokenId: row.tokenId }));
      ownerBalances = await getTraderEditionCounts(address, keys, BALANCE_PAGE_SIZE);
      if (typeof viewer === "string") viewerBalances = viewer === address
        ? ownerBalances : await getTraderEditionCounts(viewer, keys, BALANCE_PAGE_SIZE);
    } catch (error) {
      console.warn("[horf] trader offer balances unavailable:", error);
      ownerBalances = null;
      viewerBalances = null;
    }
    return res.json({
      address,
      metadataStatus,
      balanceStatus: ownerBalances ? "ready" : "unavailable",
      offers: visibleRows.map((row) => {
        const token = byKey.get(traderTokenKey({ contract: row.tokenContract, tokenId: row.tokenId }));
        const key = editionKey({ contract: row.tokenContract, tokenId: row.tokenId });
        return {
          id: row.id,
          ownerAddress: row.ownerWalletAddress,
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          amount: row.amount,
          ownerBalance: ownerBalances?.get(key) ?? null,
          viewerBalance: typeof viewer === "string" ? viewerBalances?.get(key) ?? null : null,
          acceptedTokenPolicy: row.acceptedTokenPolicy,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          name: String(token?.name || `Token #${row.tokenId}`).trim() || `Token #${row.tokenId}`,
          ...(token ? traderTokenMedia(token) : { image: null, artifactUri: null, mime: null }),
        };
      }),
    });
  } catch (error) {
    console.error("[horf] trader offers failed:", error);
    return res.status(503).json({ error: "Trader offers are temporarily unavailable" });
  }
});

export default router;
