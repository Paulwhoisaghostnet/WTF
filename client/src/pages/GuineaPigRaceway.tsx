import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel } from "react95";
import styled, { keyframes } from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useWindowManager } from "../lib/window-context";

type AmountView = { microwtf: string; wtf: string };
type RacewayPhase = "betting_open" | "betting_lockout" | "intro_marks" | "racing" | "results_replay";
type RacewayWagerType = "win" | "place" | "show" | "exacta" | "trifecta";
type RacewayEffectKey =
  | "snack_toss"
  | "squeaky_distraction"
  | "tunnel_rumor"
  | "fan_chant"
  | "confetti_pop";

type RacerStats = {
  speed: number;
  stamina: number;
  cornering: number;
  focus: number;
  courage: number;
};

type RacewayEntrant = {
  id: string;
  displayName: string;
  modelVariant: string;
  coat: string;
  laneStyle: string;
  scoutingReport: string;
  stats: RacerStats;
  trackBiasBps: number;
  conditionBiasBps: number;
  preRaceWeight: number;
  winProbabilityBps: number;
  modelPath: string;
  thumbnailPath: string;
  lane: number;
  currentProgressBps: number;
  currentPositionMeters: number;
  effectBps: number;
  betTotal: AmountView;
};

type RacewaySnapshot = {
  title: string;
  route: string;
  paymentMode: "mocked_wtf_balances";
  wageringEnabled: false;
  tokenPolicy: {
    asset: "WTF";
    entertainmentOnly: true;
    cashValue: "none";
    statement: string;
  };
  nowMs: number;
  assetManifestPath: string;
  user: {
    walletId: string;
    displayName: string;
    balance: AmountView;
  };
  race: {
    raceId: string;
    phase: RacewayPhase;
    elapsedSeconds: number;
    phaseSecondsRemaining: number;
    track: {
      key: string;
      label: string;
      lengthMeters: number;
      laneCount: number;
      surface: string;
      replayAngles: string[];
    };
    conditions: Array<{ key: string; label: string; modifierBps: number }>;
    globalVariableBps: Record<string, number>;
    uniquenessProfile: string;
    scheduleSeconds: {
      bettingOpen: number;
      bettingLockout: number;
      introMarks: number;
      race: number;
      replay: number;
    };
    houseTakeBps: number;
    pool: AmountView;
    houseTakeIfSettledNow: AmountView;
    winnerPoolIfSettledNow: AmountView;
    carryover: AmountView;
    toteBoard: {
      totalHandle: AmountView;
      poolSummaries: Array<{
        wagerType: RacewayWagerType;
        gross: AmountView;
        takeout: AmountView;
        net: AmountView;
        breakage: AmountView;
        carryover: AmountView;
        ticketCount: number;
      }>;
      winOdds: Array<{
        racerId: string;
        pool: AmountView;
        approximatePayoutPerWtf: AmountView | null;
      }>;
    };
  };
  entrants: RacewayEntrant[];
  bets: Array<{
    id: string;
    walletAddress: string;
    racerId: string;
    wagerType: RacewayWagerType;
    selections: string[];
    status: string;
    stakeMicrowtf: string;
    stake: AmountView;
  }>;
  tickets: Array<{
    id: string;
    raceId: string;
    walletAddress: string;
    wagerType: RacewayWagerType;
    selections: string[];
    status: string;
    stakeMicrowtf: string;
    stake: AmountView;
  }>;
  effects: Array<{
    id: string;
    displayName: string;
    racerId: string;
    effectKey: RacewayEffectKey;
    second: number;
    effectBps: number;
    cost: AmountView;
  }>;
  userActions: {
    defaultBet: AmountView;
    canBet: boolean;
    canInjectEffect: boolean;
    betRejectReason: string | null;
    effectRejectReason: string | null;
  };
  lastSettlement: null | {
    raceId: string;
    officialStatus: string;
    winningRacerId: string;
    winningRacerName: string;
    finishOrder: string[];
    totalHandle: AmountView;
    houseTake: AmountView;
    breakage: AmountView;
    winnerPool: AmountView;
    carryover: AmountView;
    auditHash: string;
    replayManifest: {
      cameraAngles: string[];
      keyframeCount: number;
      settlementHash: string;
    };
  };
  timeline: Array<{ id: string; atMs: number; kind: string; message: string }>;
};

const glow = keyframes`
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.15); }
`;

const Shell = styled.div`
  min-height: 100%;
  padding: 10px;
  color: #f8f0d4;
  background:
    radial-gradient(circle at 74% 18%, rgba(62, 170, 111, 0.22), transparent 24%),
    linear-gradient(180deg, #131b16 0%, #101211 100%);
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-bottom: 10px;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`;

const TitlePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 12px;
  background: #f1d784;
  color: #111;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;
`;

const Badges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  font-size: 11px;
`;

const Badge = styled.span<{ $hot?: boolean }>`
  border: 1px solid #111;
  background: ${(p) => (p.$hot ? "#9affb3" : "#fff0a8")};
  color: #111;
  padding: 2px 6px;
  font-weight: 700;
`;

const Wallet = styled(Panel).attrs({ variant: "well" })`
  min-width: 270px;
  padding: 10px;
  background: #e7ddc0;
  color: #111;
  font-size: 12px;
  line-height: 1.45;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 10px;

  @media (max-width: 1040px) {
    grid-template-columns: 1fr;
  }
`;

const Box = styled(GroupBox)`
  min-width: 0;
  color: #111;
  background: #d7cfb5;
`;

const SceneShell = styled(Panel).attrs({ variant: "well" })`
  position: relative;
  min-height: 430px;
  overflow: hidden;
  background: #080b09;
  border-color: #fff #3a3a3a #3a3a3a #fff;
`;

const Canvas = styled.canvas`
  width: 100%;
  height: 430px;
  display: block;
`;

const Tote = styled.div`
  position: absolute;
  inset: 10px auto auto 10px;
  max-width: min(460px, calc(100% - 20px));
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  pointer-events: none;
`;

const ToteChip = styled.span`
  border: 1px solid #111;
  background: rgba(247, 231, 177, 0.94);
  color: #111;
  padding: 3px 7px;
  font-size: 11px;
  font-weight: 700;
`;

const ReplayBar = styled.div`
  position: absolute;
  inset: auto 10px 10px 10px;
  display: flex;
  gap: 6px;
  overflow: auto;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
`;

const RacerCard = styled(Panel).attrs({ variant: "well" })`
  padding: 8px;
  background: #f1e8c8;
  color: #111;
  font-size: 12px;
  line-height: 1.35;
`;

const RacerTop = styled.div`
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
`;

const Thumb = styled.img`
  width: 56px;
  height: 56px;
  object-fit: contain;
  border: 1px inset #888;
  background: #fff8dd;
`;

const Meter = styled.div<{ $value: number }>`
  height: 7px;
  border: 1px inset #808080;
  background: #e7dec0;
  margin-top: 4px;

  &::after {
    content: "";
    display: block;
    width: ${(p) => Math.max(4, Math.min(100, p.$value))}%;
    height: 100%;
    background: #259b57;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
`;

const StatStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 3px;
  margin-top: 6px;
  font-size: 10px;
`;

const Stat = styled.span`
  border: 1px solid #7a6e50;
  background: #fff4bc;
  padding: 2px 3px;
  text-align: center;
`;

const Feed = styled.div`
  display: grid;
  gap: 6px;
  max-height: 240px;
  overflow: auto;
  font-size: 12px;
`;

function phaseLabel(phase: RacewayPhase) {
  return phase.replaceAll("_", " ").toUpperCase();
}

function statTotal(stats: RacerStats) {
  return Math.round((stats.speed + stats.stamina + stats.cornering + stats.focus + stats.courage) / 5);
}

function wagerLabel(wagerType: RacewayWagerType) {
  return wagerType.toUpperCase();
}

function RacewayScene({ entrants, phase }: { entrants: RacewayEntrant[]; phase: RacewayPhase }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const entrantsRef = useRef(entrants);
  const phaseRef = useRef(phase);

  useEffect(() => {
    entrantsRef.current = entrants;
    phaseRef.current = phase;
  }, [entrants, phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const liveCanvas = canvas;
    let dispose = false;
    let cleanup = () => {};

    async function boot() {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (dispose) return;

      const renderer = new THREE.WebGLRenderer({
        canvas: liveCanvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x101411);
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
      camera.position.set(0, 12, 18);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xfff2cf, 0x244d31, 2.2));
      const key = new THREE.DirectionalLight(0xffe3a3, 2.4);
      key.position.set(8, 14, 10);
      scene.add(key);

      const track = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(18, 0.18, 8),
        new THREE.MeshStandardMaterial({ color: 0x32583a, roughness: 0.74 })
      );
      base.position.y = -0.12;
      track.add(base);
      for (let lane = 0; lane < 8; lane += 1) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(17, 0.03, 0.025),
          new THREE.MeshStandardMaterial({ color: lane % 2 ? 0xf5e3a5 : 0xffffff })
        );
        line.position.set(0, 0.02, -3.5 + lane);
        track.add(line);
      }
      const finish = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.08, 7.8),
        new THREE.MeshStandardMaterial({ color: 0xffe66d, emissive: 0x554000 })
      );
      finish.position.set(8.2, 0.05, 0);
      track.add(finish);
      scene.add(track);

      const loader = new GLTFLoader();
      const racers = new Map<string, InstanceType<typeof THREE.Object3D>>();
      const fallbackMaterials = [0xb77350, 0xc9c9c9, 0x222222, 0xe5b746, 0x40404b, 0x9b6c48, 0xf1dfbd, 0xc2402a];

      function makeFallback(index: number) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 18, 10),
          new THREE.MeshStandardMaterial({ color: fallbackMaterials[index % fallbackMaterials.length], roughness: 0.8 })
        );
        body.scale.set(1.45, 0.72, 0.82);
        group.add(body);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.26, 16, 8),
          new THREE.MeshStandardMaterial({ color: fallbackMaterials[index % fallbackMaterials.length], roughness: 0.8 })
        );
        head.position.set(0.52, 0.06, 0);
        group.add(head);
        return group;
      }

      entrantsRef.current.forEach((entrant, index) => {
        const fallback = makeFallback(index);
        fallback.scale.setScalar(0.9);
        scene.add(fallback);
        racers.set(entrant.id, fallback);
        loader.load(
          entrant.modelPath,
          (gltf) => {
            if (dispose) return;
            const model = gltf.scene;
            model.scale.setScalar(0.42);
            scene.remove(fallback);
            scene.add(model);
            racers.set(entrant.id, model);
          },
          undefined,
          () => undefined
        );
      });

      function resize() {
        const rect = liveCanvas.getBoundingClientRect();
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / Math.max(1, rect.height);
        camera.updateProjectionMatrix();
      }

      function animate(time: number) {
        if (dispose) return;
        resize();
        const entrantsNow = entrantsRef.current;
        entrantsNow.forEach((entrant, index) => {
          const model = racers.get(entrant.id);
          if (!model) return;
          const progress = entrant.currentProgressBps / 10_000;
          const laneZ = -3 + index * (6 / Math.max(1, entrantsNow.length - 1));
          const wiggle = Math.sin(time / 180 + index) * 0.06;
          const startPose = phaseRef.current === "intro_marks" ? Math.sin(time / 260 + index) * 0.18 : 0;
          model.position.set(-7.7 + progress * 15.7 + startPose, 0.42 + wiggle, laneZ);
          model.rotation.y = Math.PI / 2 + Math.sin(time / 360 + index) * 0.08;
          model.rotation.z = phaseRef.current === "racing" ? Math.sin(time / 120 + index) * 0.08 : 0;
        });
        track.rotation.y = Math.sin(time / 6000) * 0.025;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
      cleanup = () => {
        renderer.dispose();
        scene.traverse((object) => {
          const mesh = object as { geometry?: { dispose?: () => void }; material?: unknown };
          mesh.geometry?.dispose?.();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach((entry) => entry?.dispose?.());
          else if (material && typeof material === "object" && "dispose" in material) {
            (material as { dispose: () => void }).dispose();
          }
        });
      };
    }

    boot();
    return () => {
      dispose = true;
      cleanup();
    };
  }, [entrants.map((entrant) => entrant.id).join("|")]);

  return <Canvas ref={canvasRef} aria-label="Guinea Pig Raceway 3D race scene" />;
}

function postRaceway(path: string, body?: unknown) {
  return api.post<{ ok: boolean; error?: string; snapshot: RacewaySnapshot }>(path, body ?? {});
}

function RacewaySurface() {
  const qc = useQueryClient();
  const wm = useWindowManager();
  const query = useQuery({
    queryKey: ["casino", "guinea-pig-raceway", "state"],
    queryFn: () => api.get<RacewaySnapshot>("/api/casino/guinea-pig-raceway/state"),
    refetchInterval: 2_000,
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => postRaceway(path, body),
    onSuccess: (result) => {
      qc.setQueryData(["casino", "guinea-pig-raceway", "state"], result.snapshot);
    },
  });
  const data = query.data;
  const error =
    action.data?.ok === false
      ? action.data.error
      : action.error instanceof Error
        ? action.error.message
        : query.error instanceof Error
          ? query.error.message
          : "";

  const sortedEntrants = useMemo(
    () => [...(data?.entrants ?? [])].sort((a, b) => b.winProbabilityBps - a.winProbabilityBps),
    [data?.entrants]
  );

  if (!data) {
    return (
      <Shell>
        <SceneShell>
          {query.isLoading ? <Hourglass size={36} /> : <Button onClick={() => wm.openPage("/casino")}>Back to Casino</Button>}
          {error && <p>{error}</p>}
        </SceneShell>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header>
        <TitlePanel>
          <Title>Guinea Pig Raceway</Title>
          <Badges>
            <Badge $hot>{phaseLabel(data.race.phase)}</Badge>
            <Badge>Entertainment-only WTF</Badge>
            <Badge>GLB racers</Badge>
            <Badge>No cash value</Badge>
          </Badges>
        </TitlePanel>
        <Wallet>
          <div>{data.user.displayName}</div>
          <div>Balance: {data.user.balance.wtf} WTF</div>
          <div>Handle: {data.race.toteBoard.totalHandle.wtf} WTF</div>
          <div>House/takeout if official: {data.race.houseTakeIfSettledNow.wtf} WTF</div>
          <div>{data.tokenPolicy.statement}</div>
        </Wallet>
      </Header>

      <Layout>
        <div>
          <SceneShell>
            <RacewayScene entrants={data.entrants} phase={data.race.phase} />
            <Tote>
              <ToteChip>{data.race.track.label}</ToteChip>
              <ToteChip>{data.race.phaseSecondsRemaining}s</ToteChip>
              <ToteChip>{data.race.conditions.map((condition) => condition.label).join(" / ")}</ToteChip>
            </Tote>
            <ReplayBar>
              {(data.lastSettlement?.replayManifest.cameraAngles ?? data.race.track.replayAngles).map((angle) => (
                <ToteChip key={angle}>{angle.replaceAll("_", " ")}</ToteChip>
              ))}
            </ReplayBar>
          </SceneShell>

          <Box label="Race Card">
            <Grid>
              {sortedEntrants.map((entrant) => (
                <RacerCard key={entrant.id}>
                  <RacerTop>
                    <Thumb src={entrant.thumbnailPath} alt="" />
                    <div>
                      <strong>{entrant.displayName}</strong>
                      <div>{entrant.coat}</div>
                      <div>{(entrant.winProbabilityBps / 100).toFixed(2)}% odds band</div>
                      <div>
                        Win pool:{" "}
                        {data.race.toteBoard.winOdds.find((entry) => entry.racerId === entrant.id)?.pool.wtf ?? "0"} WTF
                      </div>
                    </div>
                  </RacerTop>
                  <Meter $value={entrant.winProbabilityBps / 100} />
                  <StatStrip>
                    <Stat>S {entrant.stats.speed}</Stat>
                    <Stat>ST {entrant.stats.stamina}</Stat>
                    <Stat>C {entrant.stats.cornering}</Stat>
                    <Stat>F {entrant.stats.focus}</Stat>
                    <Stat>G {entrant.stats.courage}</Stat>
                  </StatStrip>
                  <div>Form {statTotal(entrant.stats)} · effects {entrant.effectBps} bps</div>
                  <div>Backed: {entrant.betTotal.wtf} WTF</div>
                  <Actions>
                    {(["win", "place", "show"] as RacewayWagerType[]).map((wagerType) => (
                      <Button
                        key={wagerType}
                        size="sm"
                        disabled={!data.userActions.canBet || action.isPending}
                        onClick={() =>
                          action.mutate({
                            path: "/api/casino/guinea-pig-raceway/bet",
                            body: {
                              racerId: entrant.id,
                              wagerType,
                              selections: [entrant.id],
                              stakeMicrowtf: data.userActions.defaultBet.microwtf,
                            },
                          })
                        }
                      >
                        {wagerLabel(wagerType)} {data.userActions.defaultBet.wtf}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      disabled={!data.userActions.canInjectEffect || action.isPending}
                      onClick={() =>
                        action.mutate({
                          path: "/api/casino/guinea-pig-raceway/effect",
                          body: { racerId: entrant.id, effectKey: "snack_toss" },
                        })
                      }
                    >
                      Snack
                    </Button>
                  </Actions>
                </RacerCard>
              ))}
            </Grid>
          </Box>
        </div>

        <div>
          <Box label="Track Conditions">
            <p>{data.race.track.surface.replaceAll("_", " ")}</p>
            {data.race.conditions.map((condition) => (
              <div key={condition.key}>
                {condition.label}: {condition.modifierBps} bps
              </div>
            ))}
            {Object.entries(data.race.globalVariableBps).map(([key, value]) => (
              <div key={key}>
                {key}: {value} bps
              </div>
            ))}
          </Box>

          <Box label="Betting Window">
            <p>Phase: {phaseLabel(data.race.phase)}</p>
            <p>Winner pool: {data.race.winnerPoolIfSettledNow.wtf} WTF</p>
            <p>Carryover: {data.race.carryover.wtf} WTF</p>
            {data.userActions.betRejectReason && <p>{data.userActions.betRejectReason}</p>}
            {data.userActions.effectRejectReason && <p>{data.userActions.effectRejectReason}</p>}
            {error && <p>{error}</p>}
          </Box>

          <Box label="Tote Board">
            <Feed>
              {data.race.toteBoard.poolSummaries.map((pool) => (
                <div key={pool.wagerType}>
                  <strong>{wagerLabel(pool.wagerType)}</strong>: {pool.gross.wtf} WTF handle · {pool.ticketCount} tickets ·{" "}
                  {pool.takeout.wtf} takeout · {pool.breakage.wtf} breakage
                </div>
              ))}
            </Feed>
          </Box>

          <Box label="Ticket Ledger">
            <Feed>
              {data.tickets.length ? (
                data.tickets.slice(0, 10).map((ticket) => (
                  <div key={ticket.id}>
                    {wagerLabel(ticket.wagerType)} {ticket.selections.join(" / ")} · {ticket.stake.wtf} WTF · {ticket.status}
                  </div>
                ))
              ) : (
                <div>No accepted tickets yet.</div>
              )}
            </Feed>
          </Box>

          {data.lastSettlement && (
            <Box label="Replay Booth">
              <p>
                {data.lastSettlement.winningRacerName} won {data.lastSettlement.raceId}.
              </p>
              <p>Official status: {data.lastSettlement.officialStatus}</p>
              <p>Total handle: {data.lastSettlement.totalHandle.wtf} WTF</p>
              <p>Net pools: {data.lastSettlement.winnerPool.wtf} WTF</p>
              <p>Breakage: {data.lastSettlement.breakage.wtf} WTF</p>
              <p>Replay frames: {data.lastSettlement.replayManifest.keyframeCount}</p>
              <p>{data.lastSettlement.auditHash.slice(0, 18)}</p>
            </Box>
          )}

          <Box label="Effects">
            <Feed>
              {data.effects.length ? (
                data.effects.map((effect) => (
                  <div key={effect.id}>
                    {effect.displayName}: {effect.effectKey.replaceAll("_", " ")} on {effect.racerId} at {effect.second}s
                  </div>
                ))
              ) : (
                <div>No effects yet.</div>
              )}
            </Feed>
          </Box>

          <Box label="Timeline">
            <Feed>
              {data.timeline.map((event) => (
                <div key={event.id}>{event.message}</div>
              ))}
            </Feed>
          </Box>
        </div>
      </Layout>
    </Shell>
  );
}

export function GuineaPigRaceway() {
  return (
    <AppWindow title="Guinea Pig Raceway">
      <RacewaySurface />
    </AppWindow>
  );
}
