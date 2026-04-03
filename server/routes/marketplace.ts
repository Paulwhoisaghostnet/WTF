import { Router } from "express";
import { db } from "../db";
import {
  marketplaceListings,
  marketplaceBids,
  users,
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { isAuthenticated, requireRole } from "../auth/passport";

const router = Router();

router.get("/api/marketplace", async (req, res) => {
  try {
    const status = (req.query.status as string) || "active";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const listings = await db
      .select({
        id: marketplaceListings.id,
        sellerUserId: marketplaceListings.sellerUserId,
        sellerUsername: users.username,
        sellerDisplayName: users.displayName,
        tokenContract: marketplaceListings.tokenContract,
        tokenId: marketplaceListings.tokenId,
        tokenName: marketplaceListings.tokenName,
        tokenThumbnail: marketplaceListings.tokenThumbnail,
        amount: marketplaceListings.amount,
        listingType: marketplaceListings.listingType,
        priceWtf: marketplaceListings.priceWtf,
        minBidWtf: marketplaceListings.minBidWtf,
        endTime: marketplaceListings.endTime,
        status: marketplaceListings.status,
        createdAt: marketplaceListings.createdAt,
      })
      .from(marketplaceListings)
      .leftJoin(users, eq(marketplaceListings.sellerUserId, users.id))
      .where(eq(marketplaceListings.status, status as any))
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(limit);

    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

router.get("/api/marketplace/:id", async (req, res) => {
  try {
    const [listing] = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, parseInt(req.params.id as string)));
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const bids = await db
      .select({
        id: marketplaceBids.id,
        bidderUserId: marketplaceBids.bidderUserId,
        bidderUsername: users.username,
        amountWtf: marketplaceBids.amountWtf,
        opHash: marketplaceBids.opHash,
        createdAt: marketplaceBids.createdAt,
      })
      .from(marketplaceBids)
      .leftJoin(users, eq(marketplaceBids.bidderUserId, users.id))
      .where(eq(marketplaceBids.listingId, listing.id))
      .orderBy(desc(marketplaceBids.amountWtf));

    res.json({ ...listing, bids });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch listing" });
  }
});

router.post("/api/marketplace", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const [listing] = await db
      .insert(marketplaceListings)
      .values({ ...req.body, sellerUserId: user.id })
      .returning();
    res.status(201).json(listing);
  } catch (err) {
    res.status(500).json({ error: "Failed to create listing" });
  }
});

router.put("/api/marketplace/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id as string);

    const [existing] = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id));
    if (!existing) return res.status(404).json({ error: "Listing not found" });
    if (
      existing.sellerUserId !== user.id &&
      !["host", "cohost"].includes(user.role)
    )
      return res.status(403).json({ error: "Not authorized" });

    const [updated] = await db
      .update(marketplaceListings)
      .set(req.body)
      .where(eq(marketplaceListings.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update listing" });
  }
});

router.post(
  "/api/marketplace/:id/bid",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const listingId = parseInt(req.params.id as string);

      const [listing] = await db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, listingId));
      if (!listing)
        return res.status(404).json({ error: "Listing not found" });
      if (listing.status !== "active")
        return res.status(400).json({ error: "Listing is not active" });
      if (listing.listingType !== "auction")
        return res
          .status(400)
          .json({ error: "Can only bid on auction listings" });

      const [bid] = await db
        .insert(marketplaceBids)
        .values({
          listingId,
          bidderUserId: user.id,
          amountWtf: req.body.amountWtf,
          opHash: req.body.opHash,
        })
        .returning();
      res.status(201).json(bid);
    } catch (err) {
      res.status(500).json({ error: "Failed to place bid" });
    }
  }
);

export default router;
