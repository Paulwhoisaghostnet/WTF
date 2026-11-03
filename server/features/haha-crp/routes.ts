import { Router } from "express";
import { z } from "zod";
import { ValidationResult, validateAddress } from "@taquito/utils";
import { HAHA_CRP_CATEGORIES, HAHA_CRP_CURRENT_SEASON } from "@shared/haha-crp";
import { isTezosWallet } from "../horf/model";
import { requireHorfCsrf, requireHorfWallet } from "../horf/wallet-scope";
import { resolveNomineeIdentity } from "../crp-nominations/identity-resolver";
import {
  createHahaNomination, deleteHahaNomination, HahaNominationError,
  hahaSeasonInfo, hahaStandings, mineHahaNominations,
} from "./service";

const router = Router();
const categoryIds = new Set(HAHA_CRP_CATEGORIES.map((category) => category.id));
const validWallet = (value: unknown): value is string =>
  isTezosWallet(value) && validateAddress(value) === ValidationResult.VALID;
const nominationSchema = z.object({
  nominatorAddress: z.string(),
  nomineeAddress: z.string(),
  nomineeDisplayName: z.string().trim().max(320).optional().nullable(),
  categoryId: z.string(),
  note: z.string().trim().max(2000).optional().nullable(),
});
const nominatorSchema = z.object({ nominatorAddress: z.string() });
const resolveSchema = z.object({ nominatorAddress: z.string(), query: z.string().trim().min(1).max(320) });

router.get("/api/haha-crp/season", (_req, res) => res.json(hahaSeasonInfo()));

router.get("/api/haha-crp/standings", async (req, res) => {
  const season = String(req.query.season || HAHA_CRP_CURRENT_SEASON.key);
  if (season !== HAHA_CRP_CURRENT_SEASON.key) return res.status(400).json({ error: "unknown_season" });
  try { return res.json(await hahaStandings()); }
  catch (error) {
    console.error("[haha-crp] standings failed:", error);
    return res.status(503).json({ error: "standings_unavailable" });
  }
});

router.get("/api/haha-crp/mine", async (req, res) => {
  const address = req.query.address;
  if (!validWallet(address)) return res.status(400).json({ error: "valid_wallet_required" });
  if (!(await requireHorfWallet(req, res, address))) return;
  try { return res.json(await mineHahaNominations(address)); }
  catch (error) {
    console.error("[haha-crp] wallet nominations failed:", error);
    return res.status(503).json({ error: "nominations_unavailable" });
  }
});

router.post("/api/haha-crp/resolve", requireHorfCsrf, async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success || !validWallet(parsed.data.nominatorAddress)) {
    return res.status(400).json({ error: "valid_nominator_and_query_required" });
  }
  if (!(await requireHorfWallet(req, res, parsed.data.nominatorAddress))) return;
  try {
    // A direct wallet must remain selectable even when social indexers are late.
    if (validWallet(parsed.data.query)) {
      const address = parsed.data.query;
      return res.json({ query: address, kind: "wallet", wallets: [{ address, displayName: null, tezosDomain: null, sources: ["wallet_address"] }],
        xHandles: [], bskyHandles: [], bundles: [{ id: `wallet:${address}`, tezosAddress: address,
          tezosDomain: null, displayName: null, xHandle: null, bskyHandle: null, sources: ["wallet_address"] }] });
    }
    return res.json(await resolveNomineeIdentity(parsed.data.query));
  } catch (error) {
    console.error("[haha-crp] nominee lookup failed:", error);
    return res.status(503).json({ error: "nominee_lookup_unavailable" });
  }
});

router.post("/api/haha-crp/nominations", requireHorfCsrf, async (req, res) => {
  const parsed = nominationSchema.safeParse(req.body);
  if (!parsed.success || !validWallet(parsed.data.nominatorAddress) || !validWallet(parsed.data.nomineeAddress)) {
    return res.status(400).json({ error: "valid_wallet_nomination_required" });
  }
  const input = parsed.data;
  if (!categoryIds.has(input.categoryId)) return res.status(400).json({ error: "unknown_haha_category" });
  if (input.nominatorAddress === input.nomineeAddress) return res.status(400).json({ error: "nominate_another_wallet" });
  if (!(await requireHorfWallet(req, res, input.nominatorAddress))) return;
  try {
    const rawUserId = Number((req.user as { id?: unknown } | undefined)?.id);
    const nomination = await createHahaNomination({
      nominatorAddress: input.nominatorAddress,
      nominatorUserId: Number.isSafeInteger(rawUserId) && rawUserId > 0 ? rawUserId : null,
      nomineeAddress: input.nomineeAddress,
      nomineeDisplayName: input.nomineeDisplayName?.trim() || null,
      categoryId: input.categoryId,
      note: input.note?.trim() || null,
    });
    return res.status(201).json({ nomination });
  } catch (error) {
    if (error instanceof HahaNominationError) {
      return res.status(error.code === "closed" ? 403 : 409).json({ error: error.code === "limit" ? "three_nominees_per_category" : error.code });
    }
    console.error("[haha-crp] nomination failed:", error);
    return res.status(503).json({ error: "nomination_unavailable" });
  }
});

router.delete("/api/haha-crp/nominations/:id", requireHorfCsrf, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = nominatorSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success || !validWallet(parsed.data.nominatorAddress)) {
    return res.status(400).json({ error: "valid_nomination_and_wallet_required" });
  }
  if (!(await requireHorfWallet(req, res, parsed.data.nominatorAddress))) return;
  try {
    const deleted = await deleteHahaNomination(id, parsed.data.nominatorAddress);
    return deleted ? res.json({ ok: true }) : res.status(404).json({ error: "nomination_not_found" });
  } catch (error) {
    if (error instanceof HahaNominationError && error.code === "closed") return res.status(403).json({ error: "season_closed" });
    console.error("[haha-crp] nomination removal failed:", error);
    return res.status(503).json({ error: "nomination_unavailable" });
  }
});

export default router;
