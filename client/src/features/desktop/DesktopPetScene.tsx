import type { ComponentProps, CSSProperties, MouseEvent, PointerEvent, RefObject } from "react";
import { getHamsterColorScheme, type HamsterState } from "@shared/desktop";
import { HamsterPixelSprite } from "../../components/layout/HamsterPixelSprite";
import { CareToolCursor, DesktopDropItem } from "./DesktopPetActors";
import { DesktopPetCareTray } from "./DesktopPetCareTray";
import type {
  DesktopObstacle,
  VisitingPetState,
  WalkaboutSignpostState,
} from "./DesktopPetModel";
import {
  HamsterActor,
  HamsterNameLabel,
  PetLayer,
  TunnelScratchCue,
  VisitingPetActor,
  WalkaboutSignpost,
} from "./DesktopPetWorldActors";
import { AntActor, PheromoneDot, getPheromoneAge, type AntState, type PheromonePoint } from "./ants";
import { DesktopBallToy, type PetToyState } from "./toys";
import type { DesktopWorldEdge } from "@shared/desktop";
import type { PetDrop } from "./drops";
import type { PetTool } from "./DesktopPetTypes";

type CareTrayProps = ComponentProps<typeof DesktopPetCareTray>;
type ToolCursorPosition = ComponentProps<typeof CareToolCursor>["position"];

interface DesktopPetSceneProps {
  activeTool: PetTool;
  ants: AntState[];
  bounds: { width: number; height: number };
  careTrayProps: CareTrayProps | null;
  careTrayRef: RefObject<HTMLDivElement | null>;
  desktopNow: number;
  dropMode: boolean;
  drops: PetDrop[];
  facing: "left" | "right";
  moving: boolean;
  onDropMove: (id: string, position: { x: number; y: number }) => void;
  onDropPutAwayPillow: (id: string) => void;
  onDropRemoveRemains: (id: string) => void;
  onDropScoop: (id: string) => void;
  onDropTrash: (id: string) => void;
  onLayerPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPetClick: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  onToyFling: (id: string, velocity: { vx: number; vy: number }) => void;
  onToyMove: (id: string, position: { x: number; y: number }) => void;
  pet: HamsterState;
  petIsAway: boolean;
  pheromones: PheromonePoint[];
  position: { x: number; y: number };
  scentScratchCue: (WalkaboutSignpostState & { edge: DesktopWorldEdge }) | null;
  toolCursorPosition: ToolCursorPosition;
  toys: PetToyState[];
  trashRect: DesktopObstacle | null;
  visitingPets: VisitingPetState[];
  walkaboutSignpost: WalkaboutSignpostState | null;
}

export function DesktopPetScene({
  activeTool,
  ants,
  bounds,
  careTrayProps,
  careTrayRef,
  desktopNow,
  dropMode,
  drops,
  facing,
  moving,
  onDropMove,
  onDropPutAwayPillow,
  onDropRemoveRemains,
  onDropScoop,
  onDropTrash,
  onLayerPointerDown,
  onPetClick,
  onToyFling,
  onToyMove,
  pet,
  petIsAway,
  pheromones,
  position,
  scentScratchCue,
  toolCursorPosition,
  toys,
  trashRect,
  visitingPets,
  walkaboutSignpost,
}: DesktopPetSceneProps) {
  const scheme = getHamsterColorScheme(pet.colorSchemeKey);

  return (
    <>
      <PetLayer $dropMode={dropMode} onPointerDown={onLayerPointerDown}>
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
            onMove={onDropMove}
            onScoop={onDropScoop}
            onTrash={onDropTrash}
            onPutAwayPillow={onDropPutAwayPillow}
            onRemoveRemains={onDropRemoveRemains}
          />
        ))}
        {toys.map((toy) => (
          <DesktopBallToy
            key={toy.id}
            toy={toy}
            bounds={bounds}
            onMove={onToyMove}
            onFling={onToyFling}
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
              style={{ "--label-flip": visitor.facing === "left" ? -1 : 1 } as CSSProperties}
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
            onClick={onPetClick}
            style={{ "--label-flip": facing === "left" ? -1 : 1 } as CSSProperties}
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

      {careTrayProps && <DesktopPetCareTray {...careTrayProps} />}
      {activeTool && <CareToolCursor tool={activeTool} position={toolCursorPosition} />}
    </>
  );
}
