import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  getHamsterColorScheme,
  type DesktopWorldEdge,
  type DesktopWorldFoodSmell,
} from "@shared/desktop";
import { HamsterPixelSprite } from "../../components/layout/HamsterPixelSprite";
import { CareToolCursor, DesktopDropItem } from "./DesktopPetActors";
import { DesktopPetCareTray } from "./DesktopPetCareTray";
import {
  type DesktopObstacle,
  type EscapeTunnelState,
  type ScentScratchState,
  type VisitingPetState,
  type WalkaboutSignpostState,
} from "./DesktopPetModel";
import {
  WATER_ABSORB_MS,
  useDesktopDropActions,
  type PetDrop,
  type PetDropKind,
} from "./drops";
import { randomHamsterTarget } from "./DesktopPetSimulation";
import { useDesktopPetMarket } from "./useDesktopPetMarket";
import { useDesktopPetPersistence } from "./persistence";
import { useDesktopPetLocomotion } from "./pet";
import {
  HamsterActor,
  HamsterNameLabel,
  PetLayer,
  TunnelScratchCue,
  VisitingPetActor,
  WalkaboutSignpost,
} from "./DesktopPetWorldActors";
import {
  AntActor,
  PheromoneDot,
  getPheromoneAge,
  useDesktopAntSimulation,
  type AntState,
  type PheromonePoint,
} from "./ants";
import {
  DesktopBallToy,
  MAX_TOY_BALLS,
  useDesktopToyActions,
  useDesktopToySimulation,
  type EscapedBallSlot,
  type PetToyState,
} from "./toys";
import {
  useDesktopWorldGateway,
  useVisitingPetSimulation,
} from "./world";
import {
  type PetActionMutationInput,
  type PetResponse,
  type PetTool,
} from "./DesktopPetTypes";

const MARKET_ESTIMATED_FEE_TEZ = "0.07";

export type { DesktopObstacle } from "./DesktopPetModel";

export function DesktopPet({
  enabled,
  bounds,
  userId,
  careOpen,
  onCareOpenChange,
  obstacles,
  trashRect,
}: {
  enabled: boolean;
  bounds: { width: number; height: number };
  userId: number | null;
  careOpen: boolean;
  onCareOpenChange: (open: boolean) => void;
  obstacles: DesktopObstacle[];
  trashRect: DesktopObstacle | null;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["desktop", "pet"],
    queryFn: () => api.get<PetResponse>("/api/desktop/pet"),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });

  const actionMutation = useMutation({
    mutationFn: (request: PetActionMutationInput) => {
      const action = typeof request === "string" ? request : request.action;
      const metadata = typeof request === "string" ? {} : request.metadata ?? {};
      return api.post<PetResponse & { xpAmount: number }>("/api/desktop/pet/actions", {
        action,
        metadata: { surface: "desktop_pet", ...metadata },
      });
    },
    onSuccess: (result) => {
      qc.setQueryData(["desktop", "pet"], (prev: PetResponse | undefined) => ({
        pet: result.pet,
        events: prev?.events ?? [],
      }));
      qc.invalidateQueries({ queryKey: ["auth", "user"] });
      qc.invalidateQueries({ queryKey: ["desktop", "pet"] });
    },
  });

  const [activeTool, setActiveTool] = useState<PetTool>(null);
  const [toolCursorPosition, setToolCursorPosition] = useState({
    x: 0,
    y: 0,
    visible: false,
  });
  const [drops, setDrops] = useState<PetDrop[]>([]);
  const [toys, setToys] = useState<PetToyState[]>([]);
  const [escapedBallSlots, setEscapedBallSlots] = useState<EscapedBallSlot[]>([]);
  const [ants, setAnts] = useState<AntState[]>([]);
  const [pheromones, setPheromones] = useState<PheromonePoint[]>([]);
  const [visitingPets, setVisitingPets] = useState<VisitingPetState[]>([]);
  const [petAwayUntil, setPetAwayUntil] = useState(0);
  const [escapeTunnel, setEscapeTunnel] = useState<EscapeTunnelState | null>(null);
  const [walkaboutSignpost, setWalkaboutSignpost] = useState<WalkaboutSignpostState | null>(null);
  const [scentScratchCue, setScentScratchCue] = useState<
    (WalkaboutSignpostState & { edge: DesktopWorldEdge }) | null
  >(null);
  const [desktopNow, setDesktopNow] = useState(() => Date.now());
  const {
    addCartTicket,
    ballItem,
    ballQty,
    cartEntries,
    cartSubtotalExp,
    cartSubtotalWtfFormatted,
    cartTicketCount,
    cartTickets,
    changeCartTicket,
    checkoutBusy,
    checkoutMarketCart,
    clearCart,
    consumeMarketItem,
    expBalance,
    foodQty,
    marketConfigured,
    marketCurrency,
    marketListings,
    marketStatus,
    medicineQty,
    setMarketCurrency,
    setMarketStatus,
    shoeboxQty,
  } = useDesktopPetMarket(enabled);
  const [position, setPosition] = useState(() => randomHamsterTarget(bounds));
  const [homePosition, setHomePosition] = useState(() => randomHamsterTarget(bounds));
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [moving, setMoving] = useState(false);
  const dropsRef = useRef<PetDrop[]>([]);
  const toysRef = useRef<PetToyState[]>([]);
  const escapedBallSlotsRef = useRef<EscapedBallSlot[]>([]);
  const antsRef = useRef<AntState[]>([]);
  const visitingPetsRef = useRef<VisitingPetState[]>([]);
  const pheromonesRef = useRef<PheromonePoint[]>([]);
  const obstaclesRef = useRef<DesktopObstacle[]>([]);
  const spawnedWorldVisitorsRef = useRef(new Set<string>());
  const positionRef = useRef(position);
  const homePositionRef = useRef(homePosition);
  const wanderTargetRef = useRef(randomHamsterTarget(bounds));
  const escapeEdgeRef = useRef<DesktopWorldEdge | null>(null);
  const escapeTunnelRef = useRef<EscapeTunnelState | null>(null);
  const neighborFoodSmellRef = useRef<DesktopWorldFoodSmell | null>(null);
  const scentScratchRef = useRef<ScentScratchState | null>(null);
  const nextPetEscapeAtRef = useRef(Date.now() + 70_000 + Math.random() * 80_000);
  const nextHomeReturnAtRef = useRef(Date.now() + 55_000 + Math.random() * 55_000);
  const escapeRequestCooldownRef = useRef(0);
  const toyEscapeRequestIdsRef = useRef(new Set<string>());
  const defenseCooldownRef = useRef(0);
  const digestionRef = useRef({ pendingPoops: 0, nextPoopAt: 0 });
  const mutatePetActionRef = useRef(actionMutation.mutate);
  const careTrayRef = useRef<HTMLDivElement | null>(null);
  const sleepRef = useRef({ nextPillowSleepAt: 0, nextFloorRestAt: 0 });
  const sicknessExposureRef = useRef({ nextAt: 0 });
  const remainsClearedRef = useRef(false);
  const lastAliveRef = useRef<boolean | null>(null);

  useEffect(() => {
    mutatePetActionRef.current = actionMutation.mutate;
  }, [actionMutation.mutate]);

  useEffect(() => {
    dropsRef.current = drops;
  }, [drops]);

  useEffect(() => {
    toysRef.current = toys;
  }, [toys]);

  useEffect(() => {
    escapedBallSlotsRef.current = escapedBallSlots;
  }, [escapedBallSlots]);

  useEffect(() => {
    antsRef.current = ants;
  }, [ants]);

  useEffect(() => {
    visitingPetsRef.current = visitingPets;
  }, [visitingPets]);

  useEffect(() => {
    pheromonesRef.current = pheromones;
  }, [pheromones]);

  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    homePositionRef.current = homePosition;
  }, [homePosition]);

  useEffect(() => {
    escapeTunnelRef.current = escapeTunnel;
  }, [escapeTunnel]);

  useDesktopPetPersistence({
    enabled,
    userId,
    bounds,
    position,
    homePosition,
    drops,
    toys,
    escapedBallSlots,
    positionRef,
    homePositionRef,
    setPosition,
    setHomePosition,
    setDrops,
    setToys,
    setEscapedBallSlots,
  });

  useEffect(() => {
    if (enabled) return;
    antsRef.current = [];
    toysRef.current = [];
    escapedBallSlotsRef.current = [];
    visitingPetsRef.current = [];
    pheromonesRef.current = [];
    neighborFoodSmellRef.current = null;
    scentScratchRef.current = null;
    spawnedWorldVisitorsRef.current.clear();
    setAnts([]);
    setToys([]);
    setEscapedBallSlots([]);
    setVisitingPets([]);
    setPheromones([]);
    setPetAwayUntil(0);
    setEscapeTunnel(null);
    setWalkaboutSignpost(null);
    setScentScratchCue(null);
    setActiveTool(null);
  }, [enabled]);

  useEffect(() => {
    if (!careOpen) setActiveTool(null);
  }, [careOpen]);

  useEffect(() => {
    if (!activeTool) {
      setToolCursorPosition((prev) => ({ ...prev, visible: false }));
      return;
    }

    const root = document.documentElement;
    root.setAttribute("data-wtf-hamster-care-tool", activeTool);
    const style = document.createElement("style");
    style.setAttribute("data-wtf-hamster-care-tool-style", activeTool);
    style.textContent = `
      html[data-wtf-hamster-care-tool] body,
      html[data-wtf-hamster-care-tool] body * {
        cursor: none !important;
      }
      html[data-wtf-hamster-care-tool] [data-desktop-cursor] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    const move = (event: PointerEvent) => {
      setToolCursorPosition({
        x: event.clientX,
        y: event.clientY,
        visible: true,
      });
    };
    const hide = () => {
      setToolCursorPosition((prev) => ({ ...prev, visible: false }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", move, true);
    window.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move, true);
      window.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
      style.remove();
      if (root.getAttribute("data-wtf-hamster-care-tool") === activeTool) {
        root.removeAttribute("data-wtf-hamster-care-tool");
      }
    };
  }, [activeTool]);

  const requestPetWorldEscape = useDesktopWorldGateway({
    enabled,
    userId,
    bounds,
    pet: data?.pet,
    petAwayUntil,
    positionRef,
    homePositionRef,
    dropsRef,
    antsRef,
    pheromonesRef,
    obstaclesRef,
    visitingPetsRef,
    toysRef,
    spawnedWorldVisitorsRef,
    neighborFoodSmellRef,
    escapeRequestCooldownRef,
    nextPetEscapeAtRef,
    setAnts,
    setVisitingPets,
    setToys,
    setPetAwayUntil,
    setEscapeTunnel,
    setWalkaboutSignpost,
    setPosition,
  });

  const {
    addBallToy,
    flingToy,
    moveToy,
    requestToyWorldEscape,
  } = useDesktopToyActions({
    bounds,
    ballQty,
    toysRef,
    escapedBallSlotsRef,
    toyEscapeRequestIdsRef,
    setToys,
    setEscapedBallSlots,
    setMarketStatus,
  });

  useVisitingPetSimulation({
    enabled,
    bounds,
    visitingPetsRef,
    setVisitingPets,
  });

  useDesktopToySimulation({
    enabled,
    bounds,
    petAlive: data?.pet?.alive,
    petAwayUntil,
    positionRef,
    dropsRef,
    toysRef,
    visitingPetsRef,
    obstaclesRef,
    escapeTunnelRef,
    toyEscapeRequestIdsRef,
    setDrops,
    setToys,
    requestToyWorldEscape,
  });

  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setDesktopNow(now);
      const currentDrops = dropsRef.current;
      const nextDrops = currentDrops.filter(
        (drop) => drop.kind !== "water" || now - (drop.createdAt ?? now) < WATER_ABSORB_MS
      );
      if (nextDrops.length !== currentDrops.length) {
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
      }
      if (escapeTunnelRef.current && now >= escapeTunnelRef.current.openUntil) {
        escapeTunnelRef.current = null;
        setEscapeTunnel(null);
      }
      setWalkaboutSignpost((sign) => (sign && now >= sign.until ? null : sign));
      setScentScratchCue((cue) => (cue && now >= cue.until ? null : cue));
      const activeEscapedSlots = escapedBallSlotsRef.current.filter((slot) => slot.until > now);
      if (activeEscapedSlots.length !== escapedBallSlotsRef.current.length) {
        escapedBallSlotsRef.current = activeEscapedSlots;
        setEscapedBallSlots(activeEscapedSlots);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  useDesktopPetLocomotion({
    enabled,
    bounds,
    pet: data?.pet,
    petAwayUntil,
    positionRef,
    dropsRef,
    antsRef,
    toysRef,
    visitingPetsRef,
    obstaclesRef,
    homePositionRef,
    wanderTargetRef,
    escapeEdgeRef,
    neighborFoodSmellRef,
    scentScratchRef,
    nextPetEscapeAtRef,
    nextHomeReturnAtRef,
    defenseCooldownRef,
    digestionRef,
    sleepRef,
    sicknessExposureRef,
    mutatePetActionRef,
    requestPetWorldEscape,
    setPosition,
    setFacing,
    setMoving,
    setDrops,
    setAnts,
    setToys,
    setVisitingPets,
    setScentScratchCue,
  });

  useDesktopAntSimulation({
    enabled,
    bounds,
    dropsRef,
    antsRef,
    pheromonesRef,
    obstaclesRef,
    setDrops,
    setAnts,
    setPheromones,
  });

  const {
    addDrop,
    addSkeletonRemains,
    moveDrop,
    trashFood,
    putAwayPillow,
    removeRemains,
    scoopDrop,
  } = useDesktopDropActions({
    bounds,
    dropsRef,
    antsRef,
    pheromonesRef,
    obstaclesRef,
    positionRef,
    sleepRef,
    remainsClearedRef,
    mutatePetActionRef,
    setDrops,
    setAnts,
    setPheromones,
  });

  useEffect(() => {
    if (!enabled || !data?.pet) return;
    if (data.pet.alive) {
      lastAliveRef.current = true;
      return;
    }
    if (lastAliveRef.current !== false) {
      remainsClearedRef.current = false;
    }
    lastAliveRef.current = false;
    if (!remainsClearedRef.current) addSkeletonRemains();
  }, [addSkeletonRemains, data?.pet, enabled]);

  const handleLayerPointerDown = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      if (
        activeTool !== "food" &&
        activeTool !== "water" &&
        activeTool !== "pillow" &&
        activeTool !== "ball"
      ) {
        return;
      }
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (activeTool === "ball") {
        if (ballQty <= 0) {
          setMarketStatus({ text: "No pet balls in inventory.", error: true });
          return;
        }
        addBallToy(x, y);
        return;
      }
      if (activeTool === "food") {
        if (foodQty <= 0) {
          setMarketStatus({ text: "No pet food in inventory.", error: true });
          return;
        }
        const consumed = await consumeMarketItem("pet-food");
        if (!consumed) return;
      }
      if (activeTool === "pillow" && shoeboxQty <= 0) {
        setMarketStatus({ text: "No shoebox in inventory.", error: true });
        return;
      }
      addDrop(activeTool, x, y);
    },
    [activeTool, addBallToy, addDrop, ballQty, consumeMarketItem, foodQty, shoeboxQty]
  );

  if (!enabled || !data?.pet) return null;
  const pet = data.pet;
  const scheme = getHamsterColorScheme(pet.colorSchemeKey);
  const petIsAway = petAwayUntil > desktopNow;
  const activeLocalBallCount =
    toys.filter((toy) => toy.kind === "ball" && toy.owner === "local").length +
    escapedBallSlots.filter((slot) => slot.until > desktopNow).length;
  const localBallCapacity = Math.min(ballQty, MAX_TOY_BALLS);
  const dropMode =
    activeTool === "food" ||
    activeTool === "water" ||
    activeTool === "pillow" ||
    activeTool === "ball";
  const toolHint =
    activeTool === "food"
      ? "Click the desktop to drop food."
      : activeTool === "water"
        ? "Click the desktop to drop water."
        : activeTool === "scoop"
          ? "Click poop or skeletal remains to clean up. Drag food/remains to trash."
          : activeTool === "pet"
            ? `Click ${pet.name} to pet.`
            : activeTool === "medicine"
              ? `Click ${pet.name} to give medicine.`
              : activeTool === "pillow"
                ? "Click the desktop to place a pillow. Drag it back here to put it away."
                : activeTool === "ball"
                  ? "Click the desktop to place a ball. Pets can knock it around."
                : "Pick a care tool.";

  return (
    <>
      <PetLayer $dropMode={dropMode} onPointerDown={handleLayerPointerDown}>
        {pheromones.map((trail) => (
          <PheromoneDot
            key={trail.id}
            $x={trail.x}
            $y={trail.y}
            $age={getPheromoneAge(desktopNow, trail)}
          />
        ))}
        {walkaboutSignpost && desktopNow < walkaboutSignpost.until && (
          <WalkaboutSignpost
            aria-hidden="true"
            $x={walkaboutSignpost.x}
            $y={walkaboutSignpost.y}
          />
        )}
        {scentScratchCue && desktopNow < scentScratchCue.until && (
          <TunnelScratchCue
            aria-hidden="true"
            $x={scentScratchCue.x}
            $y={scentScratchCue.y}
            $edge={scentScratchCue.edge}
          />
        )}
        {drops.map((drop) => (
          <DesktopDropItem
            key={drop.id}
            drop={drop}
            activeTool={activeTool}
            bounds={bounds}
            trashRect={trashRect}
            careTrayRef={careTrayRef}
            now={desktopNow}
            onMove={moveDrop}
            onScoop={scoopDrop}
            onTrash={trashFood}
            onPutAwayPillow={putAwayPillow}
            onRemoveRemains={removeRemains}
          />
        ))}
        {toys.map((toy) => (
          <DesktopBallToy
            key={toy.id}
            toy={toy}
            bounds={bounds}
            onMove={moveToy}
            onFling={flingToy}
          />
        ))}
        {ants.map((ant) => (
          <AntActor
            key={ant.id}
            $x={ant.x}
            $y={ant.y}
            $angle={ant.angle}
            $dancing={ant.phase === "dancing"}
            $carrying={ant.carrying}
          >
            <span />
          </AntActor>
        ))}
        {visitingPets.map((visitor) => {
          const visitorScheme = getHamsterColorScheme(visitor.schemeKey);
          return (
            <VisitingPetActor
              key={visitor.id}
              $x={visitor.x}
              $y={visitor.y}
              $facing={visitor.facing}
              style={{ "--label-flip": visitor.facing === "left" ? -1 : 1 } as React.CSSProperties}
            >
              <HamsterPixelSprite
                alive
                moving
                scheme={visitorScheme}
                width={90}
                height={60}
              />
              <HamsterNameLabel>{visitor.label}</HamsterNameLabel>
            </VisitingPetActor>
          );
        })}
        {pet.alive && !petIsAway && (
          <HamsterActor
            type="button"
            data-compact-control="true"
            $x={position.x}
            $y={position.y}
            $facing={facing}
            $glow={pet.genetics.phenotype.glow}
            $stealth={pet.genetics.phenotype.stealth}
            aria-label={`Care for ${pet.name}`}
            onClick={async (e) => {
              e.stopPropagation();
              if (activeTool === "water") {
                sicknessExposureRef.current.nextAt = 0;
                actionMutation.mutate({
                  action: "clean",
                  metadata: { cleanSource: "water_tool" },
                });
                return;
              }
              if (activeTool === "medicine") {
                if (medicineQty <= 0) {
                  setMarketStatus({ text: "No pet medicine in inventory.", error: true });
                  return;
                }
                const consumed = await consumeMarketItem("pet-medicine");
                if (!consumed) return;
                actionMutation.mutate("medicine");
                return;
              }
              if (activeTool && activeTool !== "pet") return;
              actionMutation.mutate("pet");
            }}
            style={{ "--label-flip": facing === "left" ? -1 : 1 } as React.CSSProperties}
          >
            <HamsterPixelSprite
              alive={pet.alive}
              moving={moving && pet.alive}
              scheme={scheme}
              width={90}
              height={60}
            />
            <HamsterNameLabel>{pet.name}</HamsterNameLabel>
          </HamsterActor>
        )}
      </PetLayer>

      {careOpen && (
        <DesktopPetCareTray
          trayRef={careTrayRef}
          pet={pet}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          onClose={() => onCareOpenChange(false)}
          onRevive={() => actionMutation.mutate("revive")}
          foodQty={foodQty}
          medicineQty={medicineQty}
          shoeboxQty={shoeboxQty}
          activeLocalBallCount={activeLocalBallCount}
          localBallCapacity={localBallCapacity}
          marketCurrency={marketCurrency}
          setMarketCurrency={setMarketCurrency}
          expBalance={expBalance}
          marketListings={marketListings}
          ballItem={ballItem ?? null}
          ballQty={ballQty}
          cartTickets={cartTickets}
          cartEntries={cartEntries}
          cartTicketCount={cartTicketCount}
          cartSubtotalWtfFormatted={cartSubtotalWtfFormatted}
          cartSubtotalExp={cartSubtotalExp}
          checkoutBusy={checkoutBusy}
          marketConfigured={marketConfigured}
          marketStatus={marketStatus}
          estimatedFeeTez={MARKET_ESTIMATED_FEE_TEZ}
          maxToyBalls={MAX_TOY_BALLS}
          toolHint={toolHint}
          addCartTicket={addCartTicket}
          changeCartTicket={changeCartTicket}
          clearCart={clearCart}
          checkoutMarketCart={checkoutMarketCart}
        />
      )}
      {activeTool && <CareToolCursor tool={activeTool} position={toolCursorPosition} />}
    </>
  );
}
