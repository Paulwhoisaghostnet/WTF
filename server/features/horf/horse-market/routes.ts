import { Router } from "express";
import { z } from "zod";
import { ValidationResult, validateAddress } from "@taquito/utils";
import { requireHorfCsrf, requireHorfWallet } from "../wallet-scope";
import { HorfTokenNotOwnedError } from "../inspections";
import { HorfCustodyUntrustedError } from "../stables/custody";
import { HorseTokenIneligibleError, HorseTokenNotFoundError } from "../stables/eligibility";
import { HorseMarketPermitError, horseMarketConfig, horseMarketListings, issueHorseMarketPermit } from "./market";

const router = Router();
const contract = z.string().regex(/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/);
const nat = z.string().regex(/^\d+$/);
const permitSchema = z.object({
  address: z.string(), tokenContract: contract, tokenId: nat,
  quantity: nat, unitPriceHorseRaw: nat,
});

router.get("/api/horf/horse-market/config", async (_req, res) => {
  try { return res.json(await horseMarketConfig()); }
  catch (error) {
    console.error("[horf-market] config failed:", error);
    return res.status(503).json({ error: "HORSE market Mainnet state is temporarily unavailable" });
  }
});

router.get("/api/horf/horse-market/listings", async (_req, res) => {
  try { return res.json(await horseMarketListings()); }
  catch (error) {
    console.error("[horf-market] listings failed:", error);
    return res.status(503).json({ error: "HORSE listings are temporarily unavailable" });
  }
});

router.post("/api/horf/horse-market/permit", requireHorfCsrf, async (req, res) => {
  const parsed = permitSchema.safeParse(req.body);
  if (!parsed.success || validateAddress(parsed.data.address) !== ValidationResult.VALID ||
      validateAddress(parsed.data.tokenContract) !== ValidationResult.VALID) {
    return res.status(400).json({ error: "A valid seller, horse token, quantity, and HORSE price are required" });
  }
  if (!(await requireHorfWallet(req, res, parsed.data.address))) return;
  try { return res.json(await issueHorseMarketPermit(parsed.data)); }
  catch (error) {
    if (error instanceof HorseMarketPermitError || error instanceof HorfTokenNotOwnedError ||
        error instanceof HorfCustodyUntrustedError || error instanceof HorseTokenIneligibleError) {
      return res.status(422).json({ error: error.message });
    }
    if (error instanceof HorseTokenNotFoundError) return res.status(404).json({ error: error.message });
    console.error("[horf-market] permit failed:", error);
    return res.status(503).json({ error: "Marshal sale permit is temporarily unavailable" });
  }
});

export default router;
