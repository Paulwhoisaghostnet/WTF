import { Router } from "express";
import { registerAdminPermissionRoutes } from "../features/admin/permissions-routes";
import { registerAdminRoleAccessRoutes } from "../features/admin/role-access-routes";
import { registerAdminWtfTvRoutes } from "../features/admin/wtf-tv-routes";
import { registerAdminMediaStorageRoutes } from "../features/admin/media-storage-routes";
import { registerAdminRewardRoutes } from "../features/admin/reward-routes";
import { registerAdminUserRoutes } from "../features/admin/user-routes";
import { registerAdminStatsRoutes } from "../features/admin/stats-routes";
import { registerAdminInAppMarketRoutes } from "../features/admin/in-app-market-routes";
import { registerAdminWDigestRoutes } from "../features/admin/w-digest-routes";
import { registerSpineAdminRoutes } from "../features/atproto-spine/admin-routes";
import { registerAppRegistryRoutes } from "../features/app-registry/admin-routes";

const router = Router();

registerAdminPermissionRoutes(router);
registerAdminRoleAccessRoutes(router);
registerAdminWtfTvRoutes(router);
registerAdminMediaStorageRoutes(router);
registerAdminRewardRoutes(router);
registerAdminUserRoutes(router);
registerAdminStatsRoutes(router);
registerAdminInAppMarketRoutes(router);
registerSpineAdminRoutes(router);
registerAppRegistryRoutes(router);
registerAdminWDigestRoutes(router);

export default router;
