import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { clone, commitment } from "./funding";
import { auditSavedRoom, preserveFailedRoom } from "./technical-void-cli";
import { createSponsorFundingService, type SponsorChainRoom,
  type SponsorConfig, type SponsorRecord, type SponsorStore } from "./sponsor-funding";

const require = createRequire(import.meta.url);
const { createServer } = require("./runtime/game/server/party-server.cjs");
const sponsorWallet = "tz1" + "1".repeat(33);
const guestWallet = "tz1" + "2".repeat(33);
const treasury = "tz1" + "3".repeat(33);
const escrow = "KT1" + "4".repeat(33);
const token = "KT1" + "5".repeat(33);

function prizePlan(mode: "fixed" | "random" | "pick", paid: boolean) {
  const tokens = mode === "fixed" ? [] : [7, 8].map(tokenId => ({
    contract: token, tokenId: String(tokenId), amount: "1",
  }));
  return {
    mode, minimumHumans: 2,
    places: [
      { place: 1, xtz: "0.01", wtf: "0", poolWeight: "1" },
      ...(tokens.length ? [{ place: 2, xtz: "0", wtf: "0", poolWeight: "1" }] : []),
    ], tokens, ...(tokens.length ? { pickCounts: [1, 1] } : {}),
    entry: paid
      ? { currency: "XTZ", fee: "0.01", poolShare: "50", designatedWallet: treasury }
      : { currency: "FREE", fee: "0", poolShare: "0", designatedWallet: null },
  };
}

function syntheticRoom(record: SponsorRecord): SponsorChainRoom {
  const p = record.plan;
  return {
    blockHash: "Bsynthetic", level: 20, status: "funding",
    termsHash: record.termsHash, rulesHash: record.lock!.rulesHash,
    seedCommitment: record.lock!.seedCommitment,
    sponsor: record.sponsor.walletAddress, referee: record.config.referee,
    entryCurrency: p.entry.currency === "FREE" ? 0 : p.entry.currency === "XTZ" ? 1 : 2,
    entryAtomic: p.entry.entryAtomic, minimumHumans: p.minimumHumans,
    mode: p.mode === "fixed" ? 0 : p.mode === "random" ? 1 : 2,
    poolNumerator: p.entry.poolNumerator, poolDenominator: p.entry.poolDenominator,
    designatedWallet: p.entry.designatedWallet || record.config.treasury,
    places: p.places.map(place => ({ xtz: place.xtzAtomic, wtf: place.wtfAtomic,
      poolWeight: place.poolWeight })),
    lots: p.tokens.map(lot => ({ tokenAddress: lot.contract, tokenId: lot.tokenId,
      amount: lot.amount, fixedPlace: lot.place || 0 })),
    pickCounts: p.pickCounts || [], entrants: [], paid: [],
    sponsorXtzFunded: false, sponsorWtfFunded: false,
    fundedLots: [], verifiedLots: [], lotEvidence: {},
    prizeXtz: p.deposit.xtzAtomic, prizeWtf: p.deposit.wtfAtomic,
    houseFee: p.entry.currency === "XTZ" ? record.config.houseFeeAtomic : "0",
    heldXtz: "0", heldWtf: "0", matchId: null, resultHash: null,
    transcriptHash: null, voidReasonHash: null, voidEvidenceHash: null,
    cashClaims: {}, lotClaims: {},
  };
}

async function hostedCase(mode: "fixed" | "random" | "pick", paid: boolean,
  network: "mainnet" | "shadownet") {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "colilseum-sponsor-hosted-"));
  const actors = new Map<string, string>();
  const authority = createServer({ dataDir, apiPrefix: "/api/wtfiap/party",
    staticFiles: false, resolveActor: (request: any) => {
      const authorization = request.headers.authorization;
      const account = request.headers["x-proof-account"] ||
        (authorization?.startsWith("Bearer ") ? actors.get(authorization.slice(7)) : null);
      return account ? { id: String(account), name: account === "1" ? "Sponsor" : "Entrant" } : null;
    } });
  const { url } = await authority.ready;
  const rows = new Map<string, SponsorRecord>();
  const store: SponsorStore = {
    read: async code => clone(rows.get(code) || null),
    list: async () => [...rows.values()].map(clone),
    mutate: async (code, fn) => {
      const result = await fn(clone(rows.get(code) || null));
      rows.set(code, clone(result.record)); return result.value;
    },
    exclusive: async fn => { await fn(); return true; },
  };
  const config: SponsorConfig = { enabled: true, network,
    chainId: network === "mainnet" ? "NetXdQprcVkpaWU" : "NetXsqzbfFenSTS",
    rpcUrl: network === "mainnet" ? "https://tezos-mainnet.octez.io/" :
      "https://tezos-shadownet.octez.io/", escrowContract: escrow,
    scriptHash: "a".repeat(64), roomCreator: sponsorWallet, referee: sponsorWallet,
    walletId: "synthetic-referee", treasury, wtfToken: { contract: token, tokenId: "0" },
    houseFeeAtomic: network === "mainnet" ? "500000" : "0",
    rulesHash: "b".repeat(64),
  };
  let chainRoom: SponsorChainRoom | null = null;
  const observedRoom = (): SponsorChainRoom => {
    assert(chainRoom, "Synthetic escrow room has not opened.");
    return chainRoom as SponsorChainRoom;
  };
  const submitted: string[] = [];
  const funding = createSponsorFundingService({ store, game: authority.funding,
    configs: { mainnet: { ...config, network: "mainnet" },
      shadownet: { ...config, network: "shadownet" } },
    linkedWallet: async (userId, wallet) =>
      (userId === "1" && wallet === sponsorWallet) ||
      (userId === "2" && wallet === guestWallet),
    onWake: () => undefined,
    chain: {
      read: async () => clone(chainRoom),
      submit: async (record, intent) => {
        submitted.push(intent.kind);
        if (intent.kind === "create_room") chainRoom = syntheticRoom(record);
        else {
          assert(chainRoom);
          if (intent.kind === "register_entrant")
            chainRoom.entrants.push(intent.params.player);
          else if (intent.kind === "start_room") {
            chainRoom.status = "active";
            chainRoom.matchId = intent.params.match_id;
          }
        }
        return { operationHash: "o" + "1".repeat(49) + String(submitted.length) };
      },
    },
  });
  async function request(method: string, route: string, account: string,
    body?: unknown, sessionToken?: string) {
    const response = await fetch(url + "/api/wtfiap/party" + route, {
      method, headers: { "x-proof-account": account,
        ...(sessionToken ? { Authorization: "Bearer " + sessionToken } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    assert(response.ok && result.ok, result.reason || "Hosted room action failed");
    return result;
  }
  try {
    const created = await request("POST", "/rooms", "1", {
      name: "Sponsor", roomType: "party", boardMode: "standard",
      preparationSeconds: null, rulesPreset: "ancient", sponsorNetwork: network,
      sponsorCompetes: true, allowAI: true, sponsor: prizePlan(mode, paid),
    });
    actors.set(created.sessionToken, "1");
    const code = created.roomCode;
    const joined = await request("POST", `/rooms/${code}/join`, "2", { name: "Entrant" });
    actors.set(joined.sessionToken, "2");
    await funding.bind(code, "1", sponsorWallet);
    await funding.bind(code, "2", guestWallet);
    await funding.open(code, "1");
    await funding.drain();
    assert(chainRoom);
    await funding.drain(); await funding.drain(); await funding.drain();
    assert.deepEqual([...observedRoom().entrants].sort(), [sponsorWallet, guestWallet].sort());
    const sponsorView = await funding.view(code, "1");
    assert.equal(sponsorView.network, network);
    assert(sponsorView.self.actions.sponsorXtz, JSON.stringify(sponsorView));
    assert.equal(sponsorView.self.actions.sponsorXtz.amountMutez,
      paid && network === "mainnet" ? "510000" : "10000");
    assert.equal(sponsorView.self.actions.sponsorLots.length, mode === "fixed" ? 0 : 2);
    const guestView = await funding.view(code, "2");
    assert(guestView.self.actions.entry, JSON.stringify(guestView));
    assert.equal(guestView.self.actions.entry.amountMutez,
      paid ? "10000" : "0");
    await assert.rejects(funding.start(code, "1"), /All prizes and human entries/);
    const escrowRoom = observedRoom();
    escrowRoom.sponsorXtzFunded = true;
    escrowRoom.heldXtz = sponsorView.self.actions.sponsorXtz.amountMutez;
    escrowRoom.fundedLots = sponsorView.self.actions.sponsorLots.map((lot: any) => lot.index);
    escrowRoom.verifiedLots = [...escrowRoom.fundedLots];
    escrowRoom.paid = [sponsorWallet, guestWallet];
    if (paid) escrowRoom.heldXtz = (BigInt(escrowRoom.heldXtz) + 20000n).toString();
    await funding.drain();
    assert.equal((await funding.view(code, "1")).self.canStart, true);
    await funding.start(code, "1");
    await funding.drain(); await funding.drain();
    const lobby = await request("GET", `/rooms/${code}/lobby`, "1");
    assert.equal(lobby.view.phase, "preparation");
    assert.equal(lobby.view.players.filter((player: any) => player.isAI).length, 6);
    const sponsorGame = await request("GET", `/rooms/${code}`, "1", undefined, created.sessionToken);
    const guestGame = await request("GET", `/rooms/${code}`, "2", undefined, joined.sessionToken);
    assert.equal(sponsorGame.view.roundNumber, 1);
    assert.equal(guestGame.view.roundNumber, 1);
    assert.equal((await funding.view(code, "1")).status, "active");
    if (mode === "fixed") {
      const record = rows.get(code)!;
      assert.equal((await auditSavedRoom(dataDir, record, Date.now())).ok, true);
      const file = path.join(dataDir, code + ".json");
      const broken = JSON.parse(await readFile(file, "utf8"));
      const match = JSON.parse(broken.match);
      match.players[0].hp = -1;
      broken.match = JSON.stringify(match);
      await writeFile(file, JSON.stringify(broken));
      const diagnostic = await auditSavedRoom(dataDir, record, Date.now());
      assert.equal(diagnostic.code, "authoritative-game-failure");
      const reason = "authoritative-game-failure";
      const evidence = { audit: diagnostic.evidence };
      const paused = { ...record, technicalVoid: { operatorId: "local-proof",
        requestedAt: new Date().toISOString(), reason, evidence,
        reasonHash: commitment(reason), evidenceHash: commitment(evidence) } };
      await preserveFailedRoom(dataDir, paused);
      const archive = JSON.parse(await readFile(file, "utf8"));
      assert.equal(archive.match, null);
      assert.equal(archive.fundingFaultArchive.snapshot.match, broken.match);
    }
    return { network, mode, paid, roomCode: code, submitted };
  } finally {
    await funding.close(); await authority.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

test("authenticated sponsored rooms admit verified free and paid prizes on both networks", async () => {
  const cases = [
    ["fixed", false, "shadownet"],
    ["random", true, "shadownet"],
    ["pick", true, "mainnet"],
  ] as const;
  for (const [mode, paid, network] of cases) {
    const proof = await hostedCase(mode, paid, network);
    assert.deepEqual(proof.submitted,
      ["create_room", "register_entrant", "register_entrant", "start_room"]);
  }
});
