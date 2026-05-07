import { Router } from "express";
import { registerAdminPermissionRoutes } from "../features/admin/permissions-routes";
import { registerAdminWtfTvRoutes } from "../features/admin/wtf-tv-routes";
import { registerAdminMediaStorageRoutes } from "../features/admin/media-storage-routes";
import { registerAdminRewardRoutes } from "../features/admin/reward-routes";
import { registerAdminUserRoutes } from "../features/admin/user-routes";
import { registerAdminStatsRoutes } from "../features/admin/stats-routes";
import { registerAdminInAppMarketRoutes } from "../features/admin/in-app-market-routes";

const router = Router();

registerAdminPermissionRoutes(router);
registerAdminWtfTvRoutes(router);
registerAdminMediaStorageRoutes(router);
registerAdminRewardRoutes(router);
registerAdminUserRoutes(router);
registerAdminStatsRoutes(router);
registerAdminInAppMarketRoutes(router);

export default router;
