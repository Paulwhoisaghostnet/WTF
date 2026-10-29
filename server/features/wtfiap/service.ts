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
import { shadownetXtzFundingConfig, mainnetWtfFundingConfig, mainnetXtzFundingConfig, fundingMonitorConfigs, monitorFundingHeads, tezosFundingChain } from "./funding-contract";
import { createOpenDuelService, openDuelConfigs } from "./open-duel";
import { createNotificationsForUsers } from "../../lib/notifications";

export type WtfiapAuthority = {
  handler: RequestHandler;
  ready: Promise<unknown>;
  close(): Promise<void>;
  funding: FundingGame;
};
let authority: WtfiapAuthority | undefined;
let funding: ReturnType<typeof createFundingService> | undefined;
let openDuel: ReturnType<typeof createOpenDuelService> | undefined;
let monitors: ReturnType<typeof monitorFundingHeads>[] = [];
let monitorStartup: Promise<void> | undefined;
const JOB_NAME = "wtfiap-escrow-reconciliation";
const OPEN_JOB_NAME = "wtfiap-open-duel-reconciliation";
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
      onRoomChanged: () => { funding?.kick(); if (openDuel) void runJob(OPEN_JOB_NAME); },
      onPreparationOpened: async ({ roomCode, roundNumber, recipients }: { roomCode: string; roundNumber: number; recipients: Array<{ userId: string; playerId: string }> }) => {
        const users = recipients.map(recipient => Number(recipient.userId)).filter(userId => Number.isSafeInteger(userId) && userId > 0);
        if (!users.length) return;
        await createNotificationsForUsers(users, {
          eventKey: `wtfiap.turn.${roomCode}.${roundNumber}`,
          title: "Your coLILseum turn is ready",
          body: `Round ${roundNumber} is open. Return to your room to shop, arrange your lineup, and mark ready.`,
          metadata: { route: `/colilseum/${roomCode}`, roomCode, roundNumber, action: "return-to-room" },
          preferenceKey: "game_turn_alerts",
        });
      },
      openDuelNetworks: Object.values(openDuelConfigs()).filter(lane => lane.enabled).map(lane => lane.network),
    });
  }
  return authority!;
}
export function getWtfiapFunding() {
  if (!funding) {
    const config = shadownetXtzFundingConfig();
    const mainnetWtf = mainnetWtfFundingConfig();
    const mainnetXtz = mainnetXtzFundingConfig();
    const store = postgresFundingStore(pool);
    funding = createFundingService({ config, configs: { XTZ: config, WTF: mainnetWtf, XTZ_MAINNET: mainnetXtz }, store, game: getWtfiapAuthority().funding,
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
      monitors = fundingMonitorConfigs([config, mainnetWtf, mainnetXtz], records).map(pinned => {
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
export function getWtfiapOpenDuel() {
  if (!openDuel) {
    openDuel = createOpenDuelService({ pool, game: getWtfiapAuthority().funding as any,
      linkedWallet: async (userId, address) => {
        const rows = await db.select({ id: userWallets.id }).from(userWallets)
          .where(and(eq(userWallets.userId, Number(userId)), eq(userWallets.walletAddress, address)));
        return rows.length > 0;
      } });
    register({ name: OPEN_JOB_NAME, intervalMs: 0, scope: "wtfiap-open-duel", fn: async () => {
      await openDuel!.reconcileAll();
      return { cursorAfter: { lastReconciledAt: new Date().toISOString() } };
    } });
    for (const lane of Object.values(openDuel.configs).filter(config => config.enabled)) {
      void (async () => {
        const rpc = lane.rpc.replace(/\/$/, "");
        const response = await fetch(rpc + "/chains/main/blocks/head/context/constants");
        if (!response.ok) return;
        const constants: any = await response.json();
        const minimalBlockDelaySeconds = Number(constants.minimal_block_delay);
        if (!Number.isSafeInteger(minimalBlockDelaySeconds) || minimalBlockDelaySeconds <= 0) return;
        monitors.push(monitorFundingHeads({ network: lane.network, rpcUrl: lane.rpc, minimalBlockDelaySeconds } as any,
          () => { void runJob(OPEN_JOB_NAME); }, { headStreamConnected: false, error: null }));
      })().catch(() => undefined);
    }
  }
  return openDuel;
}
export async function startWtfiapAuthority(): Promise<void> {
  await getWtfiapAuthority().ready;
  getWtfiapFunding().kick();
  getWtfiapOpenDuel();
  void runJob(OPEN_JOB_NAME);
}
export async function stopWtfiapAuthority(): Promise<void> {
  await monitorStartup;
  await Promise.all(monitors.map(monitor => monitor.close()));
  if (funding) await funding.close();
  if (authority) await authority.close();
}
