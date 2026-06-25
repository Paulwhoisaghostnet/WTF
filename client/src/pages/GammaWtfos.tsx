import { useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import styled, { createGlobalStyle, keyframes } from "styled-components";
import {
  Crown,
  Gamepad2,
  Hammer,
  Image,
  MessageCircle,
  Palette,
  RadioTower,
  Send,
  Store,
  UsersRound,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type GammaXpPeer = {
  rank?: number;
  username?: string | null;
  displayName?: string | null;
  experiencePoints?: number | null;
  role?: string | null;
  xpTierLabel?: string | null;
};

type GammaPeer = {
  id: string;
  name: string;
  role: string;
  motion: string;
  route: string;
  xp: string;
};

type GammaStation = {
  key: string;
  label: string;
  route: string;
  kind: string;
  pull: string;
  icon: typeof Palette;
};

const FALLBACK_PEERS: GammaPeer[] = [
  {
    id: "fallback-creator",
    name: "studio.signal",
    role: "creator",
    motion: "sketching a drop",
    route: "/studio",
    xp: "role lit",
  },
  {
    id: "fallback-collector",
    name: "vault.radio",
    role: "collector",
    motion: "watching fresh pieces",
    route: "/gallery",
    xp: "xp hum",
  },
  {
    id: "fallback-builder",
    name: "cabinet.build",
    role: "builder",
    motion: "tuning a playable room",
    route: "/game-studio",
    xp: "level glow",
  },
  {
    id: "fallback-curator",
    name: "floor.curator",
    role: "curator",
    motion: "threading signals",
    route: "/w",
    xp: "quest spark",
  },
  {
    id: "fallback-community",
    name: "live.table",
    role: "community",
    motion: "opening a room",
    route: "/live",
    xp: "party wire",
  },
];

const MAKE_STATIONS: GammaStation[] = [
  {
    key: "studio",
    label: "Studio",
    route: "/studio",
    kind: "make",
    pull: "draft art, pages, drops",
    icon: Palette,
  },
  {
    key: "broot",
    label: "Broot",
    route: "/tools/broot",
    kind: "make",
    pull: "generate visual matter",
    icon: Hammer,
  },
  {
    key: "macaroni",
    label: "Macaroni",
    route: "/tools/macaroni",
    kind: "publish",
    pull: "package mintable work",
    icon: Zap,
  },
  {
    key: "ipfs",
    label: "IPFS",
    route: "/ipfs-pinning",
    kind: "publish",
    pull: "keep media alive",
    icon: Send,
  },
];

const FLOOR_STATIONS: GammaStation[] = [
  {
    key: "gallery",
    label: "Gallery",
    route: "/gallery",
    kind: "look",
    pull: "fresh objects and profiles",
    icon: Image,
  },
  {
    key: "arcade",
    label: "Arcade",
    route: "/arcade",
    kind: "play",
    pull: "published games and rooms",
    icon: Gamepad2,
  },
  {
    key: "market",
    label: "Market",
    route: "/marketplace",
    kind: "collect",
    pull: "listed pieces and sinks",
    icon: Store,
  },
  {
    key: "leaderboard",
    label: "Levels",
    route: "/leaderboard",
    kind: "signal",
    pull: "visible roles and XP",
    icon: Crown,
  },
];

const COMMS_STATIONS: GammaStation[] = [
  {
    key: "w",
    label: "W",
    route: "/w",
    kind: "talk",
    pull: "public feed",
    icon: MessageCircle,
  },
  {
    key: "wim",
    label: "WIM",
    route: "/wim",
    kind: "talk",
    pull: "instant messages",
    icon: Send,
  },
  {
    key: "live",
    label: "LIVE",
    route: "/live/r/wtf-live",
    kind: "gather",
    pull: "rooms and stages",
    icon: UsersRound,
  },
  {
    key: "skywire",
    label: "Skywire",
    route: "/skywire?standalone=1",
    kind: "relay",
    pull: "broadcast outside",
    icon: RadioTower,
  },
];

const COUNT_STATIONS: GammaStation[] = [
  {
    key: "sidequests",
    label: "Sidequests",
    route: "/side-quests",
    kind: "ops",
    pull: "daily sparks",
    icon: Zap,
  },
  {
    key: "challenges",
    label: "Challenges",
    route: "/challenges",
    kind: "ops",
    pull: "season arcs",
    icon: Gamepad2,
  },
  {
    key: "admin",
    label: "The Count",
    route: "/admin",
    kind: "ops",
    pull: "roles, rewards, markets",
    icon: Crown,
  },
];

function peerName(peer: GammaXpPeer): string {
  const displayName = String(peer.displayName || "").trim();
  if (displayName) return displayName;
  const username = String(peer.username || "").trim();
  if (username) return username;
  return `wallet ${peer.rank ?? "signal"}`;
}

function peerRoute(peer: GammaXpPeer): string {
  const username = String(peer.username || "").trim();
  return username ? `/user/${encodeURIComponent(username)}` : "/leaderboard";
}

function peerMotion(peer: GammaXpPeer): string {
  const tier = String(peer.xpTierLabel || "").trim();
  if (tier) return tier;
  const role = String(peer.role || "").trim();
  return role ? `${role} signal` : "visible on-chain pulse";
}

function mapPeers(rows: GammaXpPeer[] | undefined): GammaPeer[] {
  const liveRows = Array.isArray(rows) ? rows.filter((row) => peerName(row).trim()) : [];
  const mapped = liveRows.slice(0, 8).map((row, index) => ({
    id: `xp-${row.username || row.rank || index}`,
    name: peerName(row),
    role: String(row.role || "member"),
    motion: peerMotion(row),
    route: peerRoute(row),
    xp:
      typeof row.experiencePoints === "number"
        ? `${row.experiencePoints.toLocaleString()} XP`
        : row.xpTierLabel || "XP trail",
  }));
  return mapped.length >= 3 ? mapped : FALLBACK_PEERS;
}

export function GammaWtfos() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const xpQuery = useQuery({
    queryKey: ["gamma-wtfos", "xp-peers"],
    queryFn: () => api.get<GammaXpPeer[]>("/api/leaderboard/rewards/exp?limit=8"),
    staleTime: 45_000,
    retry: false,
  });
  const peers = useMemo(() => mapPeers(xpQuery.data), [xpQuery.data]);
  const handleLaunch = (route: string) => navigate(route);
  const signedLabel = user?.username ? `@${user.username}` : "guest signal";
  const identityRoute = user?.username ? `/user/${encodeURIComponent(user.username)}` : "/login";

  return (
    <GammaShell
      data-gamma-wtfos
      data-gamma-style-contract
      data-color-budget="5"
      data-gradient-budget="1"
      data-gradient-stops="2"
      data-hard-lines="0"
      data-theme="tezos-dark"
    >
      <GammaResponsiveStyle />
      <GammaAtmosphere aria-hidden="true" />
      <GammaFrame>
        <TopStrip data-gamma-top-strip>
          <BrandLockup>
            <SignalDot />
            <div>
              <Kicker>WTFOS.GAMMA</Kicker>
              <BrandTitle>WTFOS</BrandTitle>
            </div>
          </BrandLockup>
          <IdentityCluster>
            <span>{signedLabel}</span>
            <GhostButton
              type="button"
              onClick={() => handleLaunch(identityRoute)}
              data-gamma-launch={identityRoute}
            >
              {user ? "Profile" : "Enter"}
            </GhostButton>
          </IdentityCluster>
        </TopStrip>

        <HeroGrid data-gamma-copy>
          <HeroStatement>
            <HeroEyebrow>Tezos arcade operating floor</HeroEyebrow>
            <h1>Make art. Publish it. Find the room where people are already moving.</h1>
            <HeroCopy>
              WTFOS is a live Tezos workspace where creation tools, galleries, arcade projects,
              rewards, roles, and conversation share the same floor.
            </HeroCopy>
            <HeroArcadeStrip data-gamma-hero-arcade>
              {["Studio", "Broot", "Gallery", "Arcade", "WIM", "LIVE"].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </HeroArcadeStrip>
            <HeroCommands data-gamma-primary-actions>
              <CommandButton
                type="button"
                onClick={() => handleLaunch("/gallery")}
                data-gamma-launch="/gallery"
              >
                <Image size={18} aria-hidden="true" />
                Gallery floor
              </CommandButton>
              <CommandButton
                type="button"
                onClick={() => handleLaunch("/tools/broot")}
                data-gamma-launch="/tools/broot"
              >
                <Hammer size={18} aria-hidden="true" />
                Start Broot
              </CommandButton>
              <CommandButton
                type="button"
                onClick={() => handleLaunch("/w")}
                data-gamma-comms-action
                data-gamma-launch="/w"
              >
                <MessageCircle size={18} aria-hidden="true" />
                Tune to W
              </CommandButton>
            </HeroCommands>
          </HeroStatement>

          <PeerOrbit data-gamma-peer-cloud>
            {peers.slice(0, 5).map((peer, index) => (
              <PeerSignal
                key={peer.id}
                type="button"
                onClick={() => handleLaunch(peer.route)}
                data-gamma-peer
                data-gamma-launch={peer.route}
                style={{ "--orbit-delay": `${index * 0.4}s` } as CSSProperties}
              >
                <span>{peer.name}</span>
                <small>{peer.motion}</small>
                <b>{peer.xp}</b>
              </PeerSignal>
            ))}
          </PeerOrbit>
        </HeroGrid>

        <ArcadeFloor data-gamma-arcade>
          <ArcadeLane data-gamma-lane="make">
            <LaneHeader>
              <span>Make / Publish</span>
              <small>tools become drops</small>
            </LaneHeader>
            <StationRibbon>
              {MAKE_STATIONS.map((station) => (
                <StationButton
                  key={station.key}
                  type="button"
                  onClick={() => handleLaunch(station.route)}
                  data-gamma-cabinet={station.key}
                  data-gamma-launch={station.route}
                >
                  <station.icon size={19} aria-hidden="true" />
                  <span>{station.label}</span>
                  <small>{station.pull}</small>
                  <b>{station.kind}</b>
                </StationButton>
              ))}
            </StationRibbon>
          </ArcadeLane>

          <ArcadeLane data-gamma-lane="floor">
            <LaneHeader>
              <span>Look / Collect / Play</span>
              <small>public proof before gates</small>
            </LaneHeader>
            <StationRibbon>
              {FLOOR_STATIONS.map((station) => (
                <StationButton
                  key={station.key}
                  type="button"
                  onClick={() => handleLaunch(station.route)}
                  data-gamma-cabinet={station.key}
                  data-gamma-launch={station.route}
                >
                  <station.icon size={19} aria-hidden="true" />
                  <span>{station.label}</span>
                  <small>{station.pull}</small>
                  <b>{station.kind}</b>
                </StationButton>
              ))}
            </StationRibbon>
          </ArcadeLane>

          <ArcadeLane data-gamma-lane="comms">
            <LaneHeader>
              <span>Talk / Gather / Relay</span>
              <small>communication in the floor plan</small>
            </LaneHeader>
            <StationRibbon>
              {COMMS_STATIONS.map((station) => (
                <StationButton
                  key={station.key}
                  type="button"
                  onClick={() => handleLaunch(station.route)}
                  data-gamma-cabinet={station.key}
                  data-gamma-comms-action
                  data-gamma-launch={station.route}
                >
                  <station.icon size={19} aria-hidden="true" />
                  <span>{station.label}</span>
                  <small>{station.pull}</small>
                  <b>{station.kind}</b>
                </StationButton>
              ))}
            </StationRibbon>
          </ArcadeLane>
        </ArcadeFloor>

        <LowerBand>
          <ProgressionVeil data-gamma-buried-progression>
            <VeilPulse aria-hidden="true" />
            <div>
              <span>XP rings</span>
              <strong>Witness / Make / Relay / Host</strong>
            </div>
            <p>
              Levels, roles, rewards, sidequests, and challenges sit under the cabinets as signal
              lights. The route you open decides which gates appear.
            </p>
          </ProgressionVeil>

          <CommsSpine data-gamma-social-spine>
            <SpineHeader>
              <UsersRound size={20} aria-hidden="true" />
              <span>People are part of the interface</span>
            </SpineHeader>
            <PeerStack>
              {peers.slice(0, 4).map((peer) => (
                <PeerLine key={`line-${peer.id}`}>
                  <button type="button" onClick={() => handleLaunch(peer.route)} data-gamma-launch={peer.route}>
                    {peer.name}
                  </button>
                  <span>{peer.role}</span>
                </PeerLine>
              ))}
            </PeerStack>
          </CommsSpine>

          <CountBooth data-gamma-count-booth>
            <LaneHeader>
              <span>The Count booth</span>
              <small>admin gates stay admin gates</small>
            </LaneHeader>
            {COUNT_STATIONS.map((station) => (
              <CountButton
                key={station.key}
                type="button"
                onClick={() => handleLaunch(station.route)}
                data-gamma-cabinet={station.key}
                data-gamma-launch={station.route}
              >
                <station.icon size={17} aria-hidden="true" />
                <span>{station.label}</span>
                <small>{station.pull}</small>
              </CountButton>
            ))}
          </CountBooth>
        </LowerBand>
      </GammaFrame>
    </GammaShell>
  );
}

const drift = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(2rem, -1rem, 0) scale(1.03); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-0.7rem); }
`;

const GammaShell = styled.main`
  --gamma-ink: #050712;
  --gamma-panel: #10162f;
  --gamma-tez: #2c7df7;
  --gamma-cyan: #00d2ff;
  --gamma-milk: #f4f8ff;
  height: 100svh;
  min-height: 100svh;
  overflow-x: clip;
  overflow-y: auto;
  position: relative;
  background: var(--gamma-ink);
  color: var(--gamma-milk);
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  letter-spacing: 0;

  button {
    all: unset;
    min-height: 2.75rem;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--gamma-cyan);
    outline-offset: 0.35rem;
  }
`;

const GammaAtmosphere = styled.div`
  position: fixed;
  inset: -18% -10% 45% -10%;
  pointer-events: none;
  background: linear-gradient(120deg, var(--gamma-tez), var(--gamma-cyan));
  opacity: 0.16;
  filter: blur(5rem);
  animation: ${drift} 13s ease-in-out infinite;
`;

const GammaFrame = styled.div`
  position: relative;
  width: min(92rem, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1.25rem 0 4rem;
`;

const TopStrip = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 4.5rem;
  gap: 1rem;
`;

const BrandLockup = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const SignalDot = styled.span`
  width: 1.1rem;
  height: 1.1rem;
  background: var(--gamma-cyan);
  transform: rotate(45deg);
`;

const Kicker = styled.div`
  color: var(--gamma-cyan);
  font-size: 0.75rem;
  text-transform: uppercase;
`;

const BrandTitle = styled.div`
  color: var(--gamma-milk);
  font-size: 1.35rem;
  font-weight: 900;
`;

const IdentityCluster = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  color: var(--gamma-milk);
  font-size: 0.9rem;
`;

const GhostButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--gamma-cyan);
  font-weight: 800;
`;

const HeroGrid = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(20rem, 0.98fr);
  align-items: center;
  gap: 4rem;
  min-height: calc(76svh - 5rem);
  padding: 2.5rem 0 4.5rem;
`;

const HeroStatement = styled.div`
  max-width: 48rem;

  h1 {
    margin: 0;
    color: var(--gamma-milk);
    font-size: 4.9rem;
    line-height: 0.92;
    letter-spacing: 0;
    font-weight: 950;
  }
`;

const HeroEyebrow = styled.div`
  color: var(--gamma-cyan);
  font-size: 0.9rem;
  text-transform: uppercase;
  margin-bottom: 1.1rem;
`;

const HeroCopy = styled.p`
  max-width: 39rem;
  margin: 1.35rem 0 0;
  color: var(--gamma-milk);
  opacity: 0.78;
  font-size: 1.08rem;
  line-height: 1.65;
`;

const HeroCommands = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1.4rem;
  margin-top: 1.6rem;
`;

const CommandButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: var(--gamma-milk);
  font-size: 1rem;
  font-weight: 850;
  padding: 0.35rem 0;

  svg {
    color: var(--gamma-cyan);
  }

  &:hover {
    color: var(--gamma-cyan);
  }
`;

const HeroArcadeStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.45rem;
  margin-top: 1.55rem;
  color: var(--gamma-tez);
  font-size: 1rem;
  font-weight: 900;
  text-transform: uppercase;

  span {
    color: var(--gamma-tez);
  }
`;

const PeerOrbit = styled.div`
  min-height: 23rem;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-template-rows: repeat(5, 4.3rem);
  align-items: center;
`;

const PeerSignal = styled.button`
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  min-width: 0;
  color: var(--gamma-milk);
  overflow-wrap: anywhere;
  animation: ${float} 5.5s ease-in-out infinite;
  animation-delay: var(--orbit-delay);

  span {
    color: var(--gamma-cyan);
    font-size: 0.94rem;
    font-weight: 850;
  }

  small {
    color: var(--gamma-milk);
    opacity: 0.72;
    font-size: 0.76rem;
  }

  b {
    color: var(--gamma-tez);
    font-size: 0.72rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  &:nth-child(1) {
    grid-column: 1 / 4;
    grid-row: 1;
  }

  &:nth-child(2) {
    grid-column: 4 / 7;
    grid-row: 2;
  }

  &:nth-child(3) {
    grid-column: 2 / 5;
    grid-row: 3;
  }

  &:nth-child(4) {
    grid-column: 4 / 7;
    grid-row: 4;
  }

  &:nth-child(5) {
    grid-column: 1 / 4;
    grid-row: 5;
  }
`;

const ArcadeFloor = styled.section`
  display: grid;
  gap: 5rem;
  padding: 0 0 5rem;
`;

const ArcadeLane = styled.section`
  display: grid;
  gap: 1.4rem;
`;

const LaneHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;

  span {
    color: var(--gamma-milk);
    font-size: 1.35rem;
    font-weight: 900;
  }

  small {
    color: var(--gamma-cyan);
    font-size: 0.82rem;
    text-transform: uppercase;
  }
`;

const StationRibbon = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2.2rem;
`;

const StationButton = styled.button`
  min-height: 10rem;
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 0.62rem;
  color: var(--gamma-milk);
  overflow-wrap: anywhere;

  svg {
    color: var(--gamma-cyan);
  }

  span {
    font-size: 1.55rem;
    font-weight: 950;
  }

  small {
    color: var(--gamma-milk);
    opacity: 0.68;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  b {
    color: var(--gamma-tez);
    font-size: 0.72rem;
    text-transform: uppercase;
  }

  &:hover span {
    color: var(--gamma-cyan);
  }
`;

const LowerBand = styled.section`
  display: grid;
  grid-template-columns: 1.1fr 0.9fr 0.78fr;
  gap: 4rem;
  align-items: start;
  padding: 4rem 0 1rem;
`;

const ProgressionVeil = styled.div`
  display: grid;
  gap: 1rem;

  div {
    display: grid;
    gap: 0.35rem;
  }

  span {
    color: var(--gamma-cyan);
    font-size: 0.85rem;
    text-transform: uppercase;
  }

  strong {
    color: var(--gamma-milk);
    font-size: 1.65rem;
    line-height: 1.12;
  }

  p {
    max-width: 32rem;
    margin: 0;
    color: var(--gamma-milk);
    opacity: 0.72;
    line-height: 1.65;
  }
`;

const VeilPulse = styled.i`
  display: block;
  width: 7.5rem;
  height: 0.72rem;
  background: var(--gamma-tez);
  transform: skewX(-22deg);
  animation: ${float} 4s ease-in-out infinite;
`;

const CommsSpine = styled.div`
  display: grid;
  gap: 1.2rem;
`;

const SpineHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--gamma-milk);
  font-weight: 900;

  svg {
    color: var(--gamma-cyan);
  }
`;

const PeerStack = styled.div`
  display: grid;
  gap: 1rem;
`;

const PeerLine = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;

  button {
    color: var(--gamma-cyan);
    font-weight: 850;
  }

  span {
    color: var(--gamma-milk);
    opacity: 0.7;
    font-size: 0.82rem;
    text-transform: uppercase;
  }
`;

const CountBooth = styled.aside`
  display: grid;
  gap: 1.1rem;
`;

const CountButton = styled.button`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 0.7rem;
  row-gap: 0.12rem;
  min-width: 0;
  color: var(--gamma-milk);
  overflow-wrap: anywhere;

  svg {
    color: var(--gamma-cyan);
  }

  span {
    font-weight: 900;
  }

  small {
    grid-column: 2;
    color: var(--gamma-milk);
    opacity: 0.64;
  }
`;

const GammaResponsiveStyle = createGlobalStyle`
  @media (prefers-reduced-motion: reduce) {
    ${GammaAtmosphere},
    ${PeerSignal},
    ${VeilPulse} {
      animation: none;
    }
  }

  @media (max-width: 980px) {
    ${HeroGrid} {
      grid-template-columns: 1fr;
      min-height: auto;
      padding: 2rem 0 4rem;
      gap: 2.5rem;
    }

    ${HeroStatement} h1 {
      font-size: 3.2rem;
      line-height: 0.96;
    }

    ${PeerOrbit} {
      min-height: auto;
      grid-template-columns: 1fr;
      grid-template-rows: none;
      gap: 1.3rem;
    }

    ${PeerSignal} {
      grid-column: auto !important;
      grid-row: auto !important;
    }

    ${StationRibbon},
    ${LowerBand} {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 620px) {
    ${GammaFrame} {
      width: min(100% - 1.1rem, 92rem);
      padding-top: 0.8rem;
    }

    ${TopStrip},
    ${LaneHeader},
    ${IdentityCluster} {
      align-items: flex-start;
      flex-direction: column;
    }

    ${HeroStatement} h1 {
      font-size: 2.42rem;
    }

    ${HeroCopy} {
      font-size: 0.98rem;
    }

    ${HeroCommands} {
      flex-direction: column;
      gap: 0.85rem;
    }

    ${CommandButton},
    ${StationButton},
    ${CountButton} {
      min-height: 3rem;
    }

    ${StationButton} span {
      font-size: 1.25rem;
    }
  }
`;
