import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  type DesktopWorldEdge,
  type DesktopWorldFoodSmell,
} from "@shared/desktop";
import { DesktopPetScene } from "./DesktopPetScene";
import {
  type DesktopObstacle,
  type EscapeTunnelState,
  type ScentScratchState,
  type VisitingPetState,
  type WalkaboutSignpostState,
} from "./DesktopPetModel";
import {
  useDesktopDropActions,
  type PetDrop,
} from "./drops";
import { randomHamsterTarget } from "./DesktopPetSimulation";
import { useDesktopPetInventory } from "./useDesktopPetInventory";
import { useDesktopPetPersistence } from "./persistence";
import {
  useDesktopPetCleanupTick,
  useDesktopPetDataGateway,
  useDesktopPetLocomotion,
  useDesktopPetToolCursor,
} from "./pet";
import {
  useDesktopAntSimulation,
  type AntState,
  type PheromonePoint,
} from "./ants";
import {
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
  const { data, actionMutation } = useDesktopPetDataGateway(enabled);

  const { activeTool, setActiveTool, toolCursorPosition } = useDesktopPetToolCursor({
    enabled,
    careOpen,
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
    ballQty,
    consumeInventoryItem,
    foodQty,
    inventoryStatus,
    medicineQty,
    setInventoryStatus,
  } = useDesktopPetInventory(enabled && Boolean(data?.pet));
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
  }, [enabled]);

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
    setInventoryStatus,
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

  useDesktopPetCleanupTick({
    enabled,
    dropsRef,
    escapedBallSlotsRef,
    escapeTunnelRef,
    setDesktopNow,
    setDrops,
    setEscapedBallSlots,
    setEscapeTunnel,
    setWalkaboutSignpost,
    setScentScratchCue,
  });

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
    async (e: PointerEvent<HTMLDivElement>) => {
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
          setInventoryStatus({ text: "No pet balls in inventory.", error: true });
          return;
        }
        addBallToy(x, y);
        return;
      }
      if (activeTool === "food") {
        if (foodQty <= 0) {
          setInventoryStatus({ text: "No pet food in inventory.", error: true });
          return;
        }
        const consumed = await consumeInventoryItem("pet-food");
        if (!consumed) return;
      }
      addDrop(activeTool, x, y);
    },
    [
      activeTool,
      addBallToy,
      addDrop,
      ballQty,
      consumeInventoryItem,
      foodQty,
      setInventoryStatus,
    ]
  );

  if (!enabled || !data?.pet) return null;
  const pet = data.pet;
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

  const handlePetClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
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
        setInventoryStatus({ text: "No pet medicine in inventory.", error: true });
        return;
      }
      const consumed = await consumeInventoryItem("pet-medicine");
      if (!consumed) return;
      actionMutation.mutate("medicine");
      return;
    }
    if (activeTool && activeTool !== "pet") return;
    actionMutation.mutate("pet");
  };

  return (
    <DesktopPetScene
      activeTool={activeTool}
      ants={ants}
      bounds={bounds}
      careTrayProps={
        careOpen
          ? {
              trayRef: careTrayRef,
              pet,
              activeTool,
              setActiveTool,
              onClose: () => onCareOpenChange(false),
              onRevive: () => actionMutation.mutate("revive"),
              foodQty,
              medicineQty,
              activeLocalBallCount,
              localBallCapacity,
              inventoryStatus,
              toolHint,
            }
          : null
      }
      careTrayRef={careTrayRef}
      desktopNow={desktopNow}
      dropMode={dropMode}
      drops={drops}
      facing={facing}
      moving={moving}
      onDropMove={moveDrop}
      onDropPutAwayPillow={putAwayPillow}
      onDropRemoveRemains={removeRemains}
      onDropScoop={scoopDrop}
      onDropTrash={trashFood}
      onLayerPointerDown={handleLayerPointerDown}
      onPetClick={handlePetClick}
      onToyFling={flingToy}
      onToyMove={moveToy}
      pet={pet}
      petIsAway={petIsAway}
      pheromones={pheromones}
      position={position}
      scentScratchCue={scentScratchCue}
      toolCursorPosition={toolCursorPosition}
      toys={toys}
      trashRect={trashRect}
      visitingPets={visitingPets}
      walkaboutSignpost={walkaboutSignpost}
    />
  );
}
