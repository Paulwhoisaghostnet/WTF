import { Router } from "express";
import { db } from "../db";
import {
  marketplaceListings,
  marketplaceBids,
  users,
  userWallets,
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

router.get("/api/marketplace/mine", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const listings = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.sellerUserId, user.id))
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(100);
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your listings" });
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
    const {
      tokenContract,
      tokenId,
      tokenName,
      tokenThumbnail,
      amount,
      listingType,
      priceWtf,
      minBidWtf,
      endTime,
    } = req.body ?? {};

    if (
      typeof tokenContract !== "string" ||
      !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(tokenContract)
    ) {
      return res.status(400).json({ error: "Invalid FA2 token contract address" });
    }

    const parsedTokenId = String(tokenId ?? "").trim();
    const parsedAmount = Number(amount);
    const parsedPrice = Number(priceWtf);
    const parsedMinBid =
      minBidWtf === null || typeof minBidWtf === "undefined"
        ? null
        : Number(minBidWtf);

    if (!/^[0-9]+$/.test(parsedTokenId)) {
      return res.status(400).json({ error: "Invalid token ID" });
    }
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive integer" });
    }
    if (!Number.isInteger(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: "Price (WTF) must be a positive integer" });
    }
    if (listingType !== "buy_now" && listingType !== "auction") {
      return res.status(400).json({ error: "Invalid listing type" });
    }
    if (
      listingType === "auction" &&
      (parsedMinBid === null || !Number.isInteger(parsedMinBid) || parsedMinBid <= 0)
    ) {
      return res.status(400).json({ error: "Auction listings require a valid minimum bid" });
    }

    let parsedEndTime: Date | null = null;
    if (listingType === "auction") {
      if (!endTime || Number.isNaN(Date.parse(endTime))) {
        return res.status(400).json({ error: "Auction listings require a valid end time" });
      }
      parsedEndTime = new Date(endTime);
      if (parsedEndTime.getTime() <= Date.now()) {
        return res.status(400).json({ error: "Auction end time must be in the future" });
      }
    }

    // Require at least one linked wallet before listing.
    const linkedWallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);
    if (linkedWallets.length === 0) {
      return res.status(400).json({
        error:
          "Link a wallet in your Profile before creating marketplace listings",
      });
    }

    const [listing] = await db
      .insert(marketplaceListings)
      .values({
        sellerUserId: user.id,
        tokenContract,
        tokenId: parsedTokenId,
        tokenName: tokenName || null,
        tokenThumbnail: tokenThumbnail || null,
        amount: parsedAmount,
        listingType,
        priceWtf: parsedPrice,
        minBidWtf: listingType === "auction" ? parsedMinBid : null,
        endTime: parsedEndTime,
      })
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
