import { createRequire } from "node:module";
import path from "node:path";
import type { Request, RequestHandler } from "express";
import { canOpenAppsForRole } from "@shared/types";
import { getDesktopAppConfig } from "../../lib/desktop-apps";
import { listRolesForUserSnapshot } from "../../lib/user-roles";
import { and, eq } from "drizzle-orm";
import { userWallets } from "@shared/schema";
import { db, pool } from "../../db";
import { register, runJob } from "../../lib/scheduler";
import { createFundingService, type FundingGame } from "./funding";
import { postgresFundingStore } from "./funding-store";
import { shadownetXtzFundingConfig, mainnetWtfFundingConfig, fundingMonitorConfigs, monitorFundingHeads, tezosFundingChain } from "./funding-contract";

export type WtfiapAuthority = {
  handler: RequestHandler;
  ready: Promise<unknown>;
  close(): Promise<void>;
  funding: FundingGame;
};
let authority: WtfiapAuthority | undefined;
let funding: ReturnType<typeof createFundingService> | undefined;
let monitors: ReturnType<typeof monitorFundingHeads>[] = [];
let monitorStartup: Promise<void> | undefined;
const JOB_NAME = "wtfiap-escrow-reconciliation";
export async function canAccessWtfiap(request: Request) {
  return (await getDesktopAppConfig()).wtfiap === true && canOpenAppsForRole(
    request.user ? await listRolesForUserSnapshot(request.user) : null);
}
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
      onRoomChanged: () => funding?.kick(),
    });
  }
  return authority!;
}
export function getWtfiapFunding() {
  if (!funding) {
    const config = shadownetXtzFundingConfig();
    const mainnetWtf = mainnetWtfFundingConfig();
    const store = postgresFundingStore(pool);
    funding = createFundingService({ config, configs: { XTZ: config, WTF: mainnetWtf }, store, game: getWtfiapAuthority().funding,
      chain: tezosFundingChain(), onWake: () => { void runJob(JOB_NAME); },
      linkedWallet: async (userId, address) => {
        const rows = await db.select({ id: userWallets.id }).from(userWallets)
          .where(and(eq(userWallets.userId, Number(userId)), eq(userWallets.walletAddress, address)));
        return rows.length > 0;
      } });
    register({ name: JOB_NAME, intervalMs: 0, scope: "wtfiap-escrow", fn: async () => {
      await funding!.drain();
      if (funding!.health.error) throw new Error(funding!.health.error);
      return { cursorAfter: { ...funding!.health } };
    } });
    monitorStartup = store.list().then(records => {
      const states: Array<{ connected: boolean; error: string | null }> = [];
      monitors = fundingMonitorConfigs([config, mainnetWtf], records).map(pinned => {
        const state = { connected: false, error: null as string | null }; states.push(state);
        const laneHealth = {
          get headStreamConnected() { return state.connected; },
          set headStreamConnected(value: boolean) {
            state.connected = value;
            funding!.health.headStreamConnected = states.some(item => item.connected);
          },
          get error() { return state.error; },
          set error(value: string | null) {
            state.error = value;
            if (value && !states.some(item => item.connected)) funding!.health.error = value;
          },
        };
        return monitorFundingHeads(pinned, () => funding?.kick(), laneHealth);
      });
    }).catch(() => { funding!.health.error = "Saved funding networks could not be loaded for chain monitoring."; });
  }
  return funding;
}
export async function startWtfiapAuthority(): Promise<void> {
  await getWtfiapAuthority().ready;
  getWtfiapFunding().kick();
}
export async function stopWtfiapAuthority(): Promise<void> {
  await monitorStartup;
  await Promise.all(monitors.map(monitor => monitor.close()));
  if (funding) await funding.close();
  if (authority) await authority.close();
}
