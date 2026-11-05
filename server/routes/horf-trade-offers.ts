import { Router, type Request, type Response } from "express";
import { isTezosWallet } from "../features/horf/model";
import { HorfTokenNotOwnedError } from "../features/horf/inspections";
import { HorseTokenIneligibleError, HorseTokenNotFoundError } from "../features/horf/stables/eligibility";
import { requireHorfCsrf, requireHorfWallet } from "../features/horf/wallet-scope";
import { createHorfTradeOffer, getHorfTradeOffer, HorfTradeOfferError,
  listHorfTradeOffers, parseHorfTradeOfferProposal, respondToHorfTradeOffer } from "../features/horf/trade-offers";

const router = Router();

function offerId(value: string): number | null {
  const id = /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

router.get("/api/horf/trade-offers", async (req, res) => {
  const address = req.query.address;
  const box = req.query.box;
  if (!isTezosWallet(address) || (box !== "incoming" && box !== "outgoing")) {
    return res.status(400).json({ error: "Choose a verified wallet and an incoming or outgoing offer box" });
  }
  try {
    if (!(await requireHorfWallet(req, res, address))) return;
    return res.json({ offers: await listHorfTradeOffers(address, box) });
  } catch (error) {
    console.error("[horf] trade offer inbox failed:", error);
    return res.status(503).json({ error: "Horse trade messages are temporarily unavailable" });
  }
});

router.post("/api/horf/trade-offers", requireHorfCsrf, async (req, res) => {
  const proposal = parseHorfTradeOfferProposal(req.body);
  if (!proposal) return res.status(400).json({ error: "Choose a sign, one owned horse, and a verified wallet" });
  try {
    if (!(await requireHorfWallet(req, res, proposal.offererAddress))) return;
    return res.status(201).json({ offer: await createHorfTradeOffer(proposal) });
  } catch (error) {
    if (error instanceof HorfTradeOfferError) return res.status(error.statusCode).json({ error: error.message });
    if (error instanceof HorfTokenNotOwnedError || error instanceof HorseTokenIneligibleError) {
      return res.status(422).json({ error: error.message });
    }
    if (error instanceof HorseTokenNotFoundError) return res.status(404).json({ error: error.message });
    console.error("[horf] trade offer proposal failed:", error);
    return res.status(503).json({ error: "Horse trade offer could not be sent" });
  }
});

async function respond(req: Request, res: Response, action: "decline" | "cancel") {
  const id = offerId(String(req.params.id || ""));
  const address = req.body?.address;
  const reason = req.body?.declineReason;
  if (id === null || !isTezosWallet(address) ||
      (reason !== undefined && reason !== null && typeof reason !== "string")) {
    return res.status(400).json({ error: "Choose a valid horse offer and verified wallet" });
  }
  try {
    const offer = await getHorfTradeOffer(id);
    if (!offer) return res.status(404).json({ error: "Horse offer not found" });
    const expected = action === "decline" ? offer.ownerAddress : offer.offererAddress;
    if (address !== expected) return res.status(403).json({ error: "This horse offer belongs to another rider" });
    if (!(await requireHorfWallet(req, res, address))) return;
    return res.json({ offer: await respondToHorfTradeOffer(id, address, action,
      action === "decline" && typeof reason === "string" ? reason.trim() || null : null) });
  } catch (error) {
    if (error instanceof HorfTradeOfferError) return res.status(error.statusCode).json({ error: error.message });
    console.error(`[horf] trade offer ${action} failed:`, error);
    return res.status(503).json({ error: "Horse trade offer could not be updated" });
  }
}

router.post("/api/horf/trade-offers/:id/decline", requireHorfCsrf,
  (req, res) => respond(req, res, "decline"));
router.post("/api/horf/trade-offers/:id/cancel", requireHorfCsrf,
  (req, res) => respond(req, res, "cancel"));

export default router;
