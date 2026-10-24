import { Router } from "express";
import { getWtfiapAuthority, getWtfiapFunding, getWtfiapOpenDuel, canAccessWtfiap } from "../features/wtfiap/service";
import { createFundingHandler } from "../features/wtfiap/funding-http";
import { createOpenDuelHandler } from "../features/wtfiap/open-duel-http";
const router = Router();
router.use(createFundingHandler({ getService: getWtfiapFunding, canAccess: canAccessWtfiap }));
router.use(createOpenDuelHandler({ getService: getWtfiapOpenDuel, canAccess: canAccessWtfiap }));

// Mounted at the root to retain the complete API path for the authority. The
// shared JSON, session, CSRF and API rate middleware already ran in createApp.
router.use((req, res, next) => {
  if (req.path !== "/api/wtfiap/party" && !req.path.startsWith("/api/wtfiap/party/")) return next();
  return getWtfiapAuthority().handler(req, res, next);
});
export default router;
