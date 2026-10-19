import { createRequire } from "node:module";
import path from "node:path";
import type { Request, RequestHandler } from "express";
import { canOpenAppsForRole } from "@shared/types";
import { getDesktopAppConfig } from "../../lib/desktop-apps";
import { listRolesForUserSnapshot } from "../../lib/user-roles";

export type WtfiapAuthority = {
  handler: RequestHandler;
  ready: Promise<unknown>;
  close(): Promise<void>;
};
let authority: WtfiapAuthority | undefined;
export function getWtfiapAuthority(): WtfiapAuthority {
  if (!authority) {
    // Keep the vendored CJS engine outside esbuild's transformed module graph.
    // Docker copies server/ intact; this path is identical in source and dist.
    const require = createRequire(path.resolve("package.json"));
    const { createWtfiapAuthority } = require(path.resolve("server/features/wtfiap/authority.cjs"));
    authority = createWtfiapAuthority({
      dataDir: process.env.WTFIAP_DATA_DIR || path.resolve(".wtfiap-data.local"),
      isEnabled: async () => (await getDesktopAppConfig()).wtfiap === true,
      canAccess: async (request: Request) => canOpenAppsForRole(
        request.user ? await listRolesForUserSnapshot(request.user) : null),
    });
  }
  return authority!;
}
export async function startWtfiapAuthority(): Promise<void> {
  await getWtfiapAuthority().ready;
}
export async function stopWtfiapAuthority(): Promise<void> {
  if (authority) await authority.close();
}
