import { Router } from "express";
import { ValidationResult, validateAddress } from "@taquito/utils";
import { z } from "zod";
import {
  findHorfObjktListings, ObjktListingChangedError, preflightHorfObjktPurchase,
} from "./objkt-listings";

const router = Router();
const nat = z.string().regex(/^\d+$/);
const contract = z.string().refine((value) => value.startsWith("KT1") && validateAddress(value) === ValidationResult.VALID);
const address = z.string().refine((value) => validateAddress(value) === ValidationResult.VALID);
const listingQuery = z.object({ tokenContract: contract, tokenId: nat, cursor: nat.optional() });
const preflightBody = z.object({
  marketplaceContract: contract,
  askId: nat,
  tokenContract: contract,
  tokenId: nat,
  sellerAddress: address,
  priceMutez: nat,
});

router.get("/api/horf/horse-market/objkt-listings", async (req, res) => {
  const parsed = listingQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "valid_token_required" });
  const cursor = Number(parsed.data.cursor || "0");
  if (!Number.isSafeInteger(cursor) || cursor < 0) return res.status(400).json({ error: "invalid_cursor" });
  try {
    const result = await findHorfObjktListings(parsed.data.tokenContract, BigInt(parsed.data.tokenId).toString(), cursor);
    res.setHeader("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    console.error("[horf-market] Objkt listings failed:", error);
    return res.status(503).json({ error: "objkt_listings_unavailable" });
  }
});

router.post("/api/horf/horse-market/objkt-preflight", async (req, res) => {
  const parsed = preflightBody.safeParse(req.body);
  if (!parsed.success || BigInt(parsed.data.priceMutez) === 0n) {
    return res.status(400).json({ error: "valid_listing_required" });
  }
  try {
    const result = await preflightHorfObjktPurchase({
      ...parsed.data,
      askId: BigInt(parsed.data.askId).toString(),
      tokenId: BigInt(parsed.data.tokenId).toString(),
      priceMutez: BigInt(parsed.data.priceMutez).toString(),
    });
    res.setHeader("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    if (error instanceof ObjktListingChangedError) {
      return res.status(409).json({ error: "objkt_listing_changed", message: error.message });
    }
    console.error("[horf-market] Objkt purchase preflight failed:", error);
    return res.status(503).json({ error: "objkt_preflight_unavailable" });
  }
});

export default router;
