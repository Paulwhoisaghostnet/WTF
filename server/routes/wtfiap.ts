import { Router } from "express";
import { getWtfiapAuthority, getWtfiapFunding, getWtfiapOpenDuel, getWtfiapSponsorFunding, canAccessWtfiap } from "../features/wtfiap/service";
import { createFundingHandler } from "../features/wtfiap/funding-http";
import { createOpenDuelHandler } from "../features/wtfiap/open-duel-http";
import { createSponsorFundingHandler } from "../features/wtfiap/sponsor-funding-http";
const router = Router();
router.use(createSponsorFundingHandler({ getService: getWtfiapSponsorFunding, canAccess: canAccessWtfiap }));
router.use(createFundingHandler({ getService: getWtfiapFunding, canAccess: canAccessWtfiap }));
router.use(createOpenDuelHandler({ getService: getWtfiapOpenDuel, canAccess: canAccessWtfiap }));

// Mounted at the root to retain the complete API path for the authority. The
// shared JSON, session, CSRF and API rate middleware already ran in createApp.
router.use((req, res, next) => {
  if (req.path !== "/api/wtfiap/party" && !req.path.startsWith("/api/wtfiap/party/")) return next();
  return getWtfiapAuthority().handler(req, res, next);
});
export default router;
