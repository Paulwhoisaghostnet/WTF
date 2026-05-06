import { type Dispatch, type RefObject, type SetStateAction } from "react";
import styled from "styled-components";
import { Button, Panel } from "react95";
import {
  Apple,
  Circle,
  Droplets,
  Heart,
  Moon,
  Palette,
  Pill,
  Shovel,
  X,
} from "lucide-react";
import { type HamsterState } from "@shared/desktop";
import { MOBILE } from "../../global-styles";
import { type PetTool } from "./DesktopPetTypes";

const CareTray = styled(Panel)`
  position: absolute;
  right: 12px;
  bottom: 8px;
  z-index: 2;
  width: 316px;
  padding: 8px;
  color: var(--wtf-text-color);
  background: var(--wtf-window-color);
  pointer-events: auto;

  ${MOBILE} {
    left: 8px;
    right: 8px;
    width: auto;
  }
`;

const CareTrayHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-weight: bold;

  button {
    min-width: 24px;
    height: 24px;
    padding: 0;
  }
`;

const CareToolGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;

  button {
    min-width: 0;
    min-height: 34px;
    font-size: 10px;
    line-height: 1;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 2px;
  }

  svg {
    width: 15px;
    height: 15px;
  }
`;

const MiniStatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin: 7px 0;
  font-size: 10px;

  span {
    padding: 2px 3px;
    border: 1px solid #7f7f7f;
    background: rgba(255, 255, 255, 0.42);
    text-align: center;
  }
`;

const CareStatusLine = styled.div<{ $error?: boolean }>`
  min-height: 14px;
  margin-top: 5px;
  font-size: 10px;
  color: ${(p) => (p.$error ? "#a00000" : "#000080")};
  overflow-wrap: anywhere;
`;

export function DesktopPetCareTray({
  trayRef,
  pet,
  activeTool,
  setActiveTool,
  onClose,
  onRevive,
  foodQty,
  medicineQty,
  shoeboxQty,
  activeLocalBallCount,
  localBallCapacity,
  inventoryStatus,
  toolHint,
}: {
  trayRef: RefObject<HTMLDivElement | null>;
  pet: HamsterState;
  activeTool: PetTool;
  setActiveTool: Dispatch<SetStateAction<PetTool>>;
  onClose: () => void;
  onRevive: () => void;
  foodQty: number;
  medicineQty: number;
  shoeboxQty: number;
  activeLocalBallCount: number;
  localBallCapacity: number;
  inventoryStatus: { text: string; error?: boolean };
  toolHint: string;
}) {
  return (
    <CareTray variant="outside" ref={trayRef as RefObject<HTMLDivElement>}>
      <CareTrayHeader>
        <span>{pet.name} care</span>
        <Button size="sm" onClick={onClose} title="Close pet care">
          <X />
        </Button>
      </CareTrayHeader>
      <MiniStatGrid>
        <span>Food {pet.hunger}</span>
        <span>Water {pet.thirst}</span>
        <span>Clean {pet.hygiene}</span>
        <span>Rest {pet.energy}</span>
        <span>{pet.sick ? "Sick" : `Risk ${pet.sicknessRisk}`}</span>
        <span>Care {pet.carePoints}</span>
        <span>Bond L{pet.bondLevel}</span>
        <span>Happy {pet.happinessIndexScore}</span>
        <span>Trauma {pet.trauma}</span>
      </MiniStatGrid>
      <CareToolGrid>
        <Button
          size="sm"
          active={activeTool === "food" ? true : undefined}
          disabled={foodQty <= 0}
          onClick={() => setActiveTool((tool) => (tool === "food" ? null : "food"))}
        >
          <Apple /> Food {foodQty}
        </Button>
        <Button
          size="sm"
          active={activeTool === "water" ? true : undefined}
          onClick={() => setActiveTool((tool) => (tool === "water" ? null : "water"))}
        >
          <Droplets /> Water
        </Button>
        <Button
          size="sm"
          active={activeTool === "scoop" ? true : undefined}
          onClick={() => setActiveTool((tool) => (tool === "scoop" ? null : "scoop"))}
        >
          <Shovel /> Scoop
        </Button>
        <Button
          size="sm"
          active={activeTool === "pet" ? true : undefined}
          onClick={() => {
            if (!pet.alive) {
              onRevive();
              return;
            }
            setActiveTool((tool) => (tool === "pet" ? null : "pet"));
          }}
        >
          <Heart /> {pet.alive ? "Pet" : "Revive"}
        </Button>
        <Button
          size="sm"
          active={activeTool === "medicine" ? true : undefined}
          disabled={!pet.alive || medicineQty <= 0}
          onClick={() => setActiveTool((tool) => (tool === "medicine" ? null : "medicine"))}
        >
          <Pill /> Med {medicineQty}
        </Button>
        <Button
          size="sm"
          active={activeTool === "pillow" ? true : undefined}
          disabled={!pet.alive || shoeboxQty <= 0}
          onClick={() => setActiveTool((tool) => (tool === "pillow" ? null : "pillow"))}
        >
          <Moon /> Box {shoeboxQty}
        </Button>
        <Button
          size="sm"
          active={activeTool === "ball" ? true : undefined}
          disabled={!pet.alive || activeLocalBallCount >= localBallCapacity}
          onClick={() => setActiveTool((tool) => (tool === "ball" ? null : "ball"))}
        >
          <Circle /> Ball {Math.max(0, localBallCapacity - activeLocalBallCount)}
        </Button>
        <Button
          size="sm"
          onClick={() => setActiveTool(null)}
          active={!activeTool ? true : undefined}
        >
          <Palette /> Idle
        </Button>
      </CareToolGrid>
      <div style={{ marginTop: 7, fontSize: 10 }}>{toolHint}</div>
      <CareStatusLine $error={inventoryStatus.error}>
        {inventoryStatus.text}
      </CareStatusLine>
    </CareTray>
  );
}
