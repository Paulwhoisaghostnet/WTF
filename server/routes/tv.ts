import { Router } from "express";
import { registerTvBumperRoutes } from "../features/tv/bumper-routes";
import { registerTvLiveStateRoutes } from "../features/tv/live-routes";
import { registerTvCacheRoutes } from "../features/tv/cache-routes";
import { registerTvTelemetryRoutes } from "../features/tv/telemetry-routes";
import { registerTvPlaylistRoutes } from "../features/tv/playlist-routes";
import { registerTvPlaybackRoutes } from "../features/tv/playback-routes";
import { registerTvChannelRoutes } from "../features/tv/channel-routes";

const router = Router();
registerTvBumperRoutes(router);
registerTvLiveStateRoutes(router);
registerTvCacheRoutes(router);
registerTvTelemetryRoutes(router);
registerTvPlaylistRoutes(router);
registerTvPlaybackRoutes(router);
registerTvChannelRoutes(router);

export default router;
