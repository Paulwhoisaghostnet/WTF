import { useCallback, type Dispatch, type SetStateAction } from "react";
import { clampFloatingPosition } from "../geometry";
import {
  materialForDesktopKind,
  normalizeScaleFactor,
  scaleExpiresAt,
  type PortalColor,
} from "../materials";
import {
  MAX_DESKTOP_ITEMS,
  getDesktopItemRect,
  getDesktopItemSize,
  getScaledDesktopItemSize,
  itemKindForTool,
  lightVariantForTool,
  type DesktopItemState,
  type DesktopLightVariant,
  type StickyNoteStroke,
} from "./model";

type MutableRef<T> = { current: T };
type InventoryStatusSetter = Dispatch<SetStateAction<{ text: string; error?: boolean }>>;

export type DesktopArtifactTool =
  | "fan"
  | "sticky-note"
  | "mop"
  | "vacuum"
  | "light-disco"
  | "light-moon"
  | "light-sun";

export type DesktopArtifactItemKind =
  | "cursor-tool-tray"
  | "train-kit-box"
  | "portal-gun"
  | "jukebox"
  | "paper-shredder";

interface DesktopItemActionsArgs {
  bounds: { width: number; height: number };
  itemsRef: MutableRef<DesktopItemState[]>;
  setItems: Dispatch<SetStateAction<DesktopItemState[]>>;
  setInventoryStatus?: InventoryStatusSetter;
}

function nextItemId(kind: string) {
  return `${kind}-${Date.now()}-${Math.round(Math.random() * 9999)}`;
}

function baseItemFields(
  kind: string,
  position: { x: number; y: number },
  options: {
    sourceSku?: string;
    inventoryOrdinal?: number;
  } = {}
) {
  return {
    createdAt: Date.now(),
    sourceSku: options.sourceSku,
    inventoryOrdinal: options.inventoryOrdinal,
    material: materialForDesktopKind(kind),
    ...position,
  };
}

export function createDesktopItemForTool(
  tool: DesktopArtifactTool,
  x: number,
  y: number,
  bounds: { width: number; height: number },
  options: {
    sourceSku?: string;
    inventoryOrdinal?: number;
  } = {}
): DesktopItemState {
  const kind = itemKindForTool(tool);
  const size = getDesktopItemSize(kind);
  const position = clampFloatingPosition(
    { x: x - size.width / 2, y: y - size.height / 2 },
    bounds,
    size.width,
    size.height
  );
  if (kind === "tiny-fan") {
    return {
      id: nextItemId(kind),
      kind,
      angle: -Math.PI / 8,
      active: true,
      ...baseItemFields(kind, position, options),
    };
  }
  if (kind === "sticky-note") {
    return {
      id: nextItemId(kind),
      kind,
      text: "",
      stickiness: 0.52 + Math.random() * 0.4,
      stickyWetness: 0,
      paperWetness: 0,
      curl: 0,
      strokes: [],
      marks: [],
      lastPetLessonAt: 0,
      ...baseItemFields(kind, position, options),
    };
  }
  if (kind === "mop") {
    return {
      id: nextItemId(kind),
      kind,
      usesLeft: 3,
      dirty: 0,
      ...baseItemFields(kind, position, options),
    };
  }
  if (kind === "vacuum") {
    return {
      id: nextItemId(kind),
      kind,
      charge: 1,
      ...baseItemFields(kind, position, options),
    };
  }
  return {
    id: nextItemId(`${kind}-${tool}`),
    kind,
    variant: lightVariantForTool(tool) as DesktopLightVariant,
    ...baseItemFields(kind, position, options),
  };
}

export function createDesktopArtifactItem(
  kind: DesktopArtifactItemKind,
  x: number,
  y: number,
  bounds: { width: number; height: number },
  options: {
    sourceSku?: string;
    inventoryOrdinal?: number;
  } = {}
): DesktopItemState {
  const size = getDesktopItemSize(kind);
  const position = clampFloatingPosition(
    { x: x - size.width / 2, y: y - size.height / 2 },
    bounds,
    size.width,
    size.height
  );
  if (kind === "cursor-tool-tray") {
    return {
      id: nextItemId(kind),
      kind,
      open: false,
      ...baseItemFields(kind, position, options),
    };
  }
  if (kind === "train-kit-box") {
    return {
      id: nextItemId(kind),
      kind,
      opened: false,
      ...baseItemFields(kind, position, options),
    };
  }
  if (kind === "portal-gun") {
    return {
      id: nextItemId(kind),
      kind,
      nextColor: "blue",
      ...baseItemFields(kind, position, options),
    };
  }
  if (kind === "jukebox") {
    return {
      id: nextItemId(kind),
      kind,
      ...baseItemFields(kind, position, options),
    };
  }
  return {
    id: nextItemId(kind),
    kind,
    wear: 0,
    ...baseItemFields(kind, position, options),
  };
}

export function createGenericDesktopArtifact(
  label: string,
  monogram: string,
  x: number,
  y: number,
  bounds: { width: number; height: number },
  options: {
    sourceSku?: string;
    inventoryOrdinal?: number;
  } = {}
): DesktopItemState {
  const size = getDesktopItemSize("artifact-icon");
  const position = clampFloatingPosition(
    { x: x - size.width / 2, y: y - size.height / 2 },
    bounds,
    size.width,
    size.height
  );
  return {
    id: nextItemId(`artifact-${options.sourceSku ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
    kind: "artifact-icon",
    label: label.slice(0, 40) || "Desktop Item",
    monogram: monogram.slice(0, 5).toUpperCase() || "ITEM",
    ...baseItemFields("artifact-icon", position, options),
  };
}

export function useDesktopItemActions({
  bounds,
  itemsRef,
  setItems,
  setInventoryStatus,
}: DesktopItemActionsArgs) {
  const addDesktopItem = useCallback(
    (tool: DesktopArtifactTool, x: number, y: number) => {
      const newItem = createDesktopItemForTool(tool, x, y, bounds);
      const nextItems = [...itemsRef.current, newItem].slice(-MAX_DESKTOP_ITEMS);
      itemsRef.current = nextItems;
      setItems(nextItems);
      setInventoryStatus?.({
        text:
          newItem.kind === "hanging-light"
            ? `${newItem.variant[0].toUpperCase()}${newItem.variant.slice(1)} light placed.`
            : `${newItem.kind.replace("-", " ")} placed.`,
      });
      return newItem;
    },
    [bounds, itemsRef, setInventoryStatus, setItems]
  );

  const moveDesktopItem = useCallback(
    (id: string, next: { x: number; y: number }, options: { splitAssembly?: boolean } = {}) => {
      let moved: DesktopItemState | null = null;
      const current = itemsRef.current.find((item) => item.id === id);
      if (!current) return null;
      const size = getScaledDesktopItemSize(current);
      const clamped = clampFloatingPosition(next, bounds, size.width, size.height);
      const assemblyId =
        "assemblyId" in current && typeof current.assemblyId === "string"
          ? current.assemblyId
          : null;
      const moveAssembly = Boolean(assemblyId && !options.splitAssembly);
      const dx = clamped.x - current.x;
      const dy = clamped.y - current.y;
      const nextItems = itemsRef.current.map((item) => {
        if (moveAssembly && "assemblyId" in item && item.assemblyId === assemblyId) {
          const itemSize = getScaledDesktopItemSize(item);
          const groupPosition = clampFloatingPosition(
            { x: item.x + dx, y: item.y + dy },
            bounds,
            itemSize.width,
            itemSize.height
          );
          const updated = { ...item, ...groupPosition } as DesktopItemState;
          if (item.id === id) moved = updated;
          return updated;
        }
        if (item.id !== id) return item;
        moved = { ...item, ...clamped } as DesktopItemState;
        return moved;
      });
      itemsRef.current = nextItems;
      setItems(nextItems);
      return moved;
    },
    [bounds, itemsRef, setItems]
  );

  const scaleDesktopItem = useCallback(
    (id: string, factor: number) => {
      const now = Date.now();
      let scaled: DesktopItemState | null = null;
      const nextItems = itemsRef.current.map((item) => {
        if (item.id !== id) return item;
        scaled = {
          ...item,
          scaleFactor: normalizeScaleFactor(factor),
          scaleExpiresAt: scaleExpiresAt(now),
        } as DesktopItemState;
        return scaled;
      });
      itemsRef.current = nextItems;
      setItems(nextItems);
      return scaled;
    },
    [itemsRef, setItems]
  );

  const toggleCursorToolTray = useCallback(
    (id: string) => {
      const nextItems = itemsRef.current.map((item) =>
        item.id === id && item.kind === "cursor-tool-tray"
          ? { ...item, open: !item.open }
          : item
      );
      itemsRef.current = nextItems;
      setItems(nextItems);
    },
    [itemsRef, setItems]
  );

  const removeDesktopItem = useCallback(
    (id: string) => {
      const nextItems = itemsRef.current.filter((item) => item.id !== id);
      itemsRef.current = nextItems;
      setItems(nextItems);
      return nextItems;
    },
    [itemsRef, setItems]
  );

  const placePortal = useCallback(
    (color: PortalColor, x: number, y: number) => {
      const size = getDesktopItemSize("portal");
      const position = clampFloatingPosition(
        { x: x - size.width / 2, y: y - size.height / 2 },
        bounds,
        size.width,
        size.height
      );
      const portal: DesktopItemState = {
        id: nextItemId(`portal-${color}`),
        kind: "portal",
        color,
        ...baseItemFields("portal", position),
      };
      const nextItems = [
        ...itemsRef.current.filter((item) => item.kind !== "portal" || item.color !== color),
        portal,
      ].slice(-MAX_DESKTOP_ITEMS);
      itemsRef.current = nextItems;
      setItems(nextItems);
      return portal;
    },
    [bounds, itemsRef, setItems]
  );

  const unpackTrainKit = useCallback(
    (id: string) => {
      const kit = itemsRef.current.find((item) => item.id === id && item.kind === "train-kit-box");
      if (!kit || kit.kind !== "train-kit-box") return [];
      if (kit.opened) return [];
      const assemblyId = `train-${kit.id}`;
      const rect = getDesktopItemRect(kit, bounds);
      const origin = {
        x: Math.min(bounds.width - 240, Math.max(12, rect.x + rect.width + 12)),
        y: Math.min(bounds.height - 180, Math.max(12, rect.y)),
      };
      const pieces: DesktopItemState[] = [
        {
          id: nextItemId("track-straight"),
          kind: "train-track-piece",
          shape: "straight",
          rotation: 0,
          assemblyId,
          snappedTo: [],
          ...baseItemFields("train-track-piece", { x: origin.x, y: origin.y }),
        },
        {
          id: nextItemId("track-curve"),
          kind: "train-track-piece",
          shape: "curve",
          rotation: 90,
          assemblyId,
          snappedTo: [],
          ...baseItemFields("train-track-piece", { x: origin.x + 58, y: origin.y }),
        },
        {
          id: nextItemId("track-curve"),
          kind: "train-track-piece",
          shape: "curve",
          rotation: 180,
          assemblyId,
          snappedTo: [],
          ...baseItemFields("train-track-piece", { x: origin.x + 58, y: origin.y + 48 }),
        },
        {
          id: nextItemId("track-straight"),
          kind: "train-track-piece",
          shape: "straight",
          rotation: 180,
          assemblyId,
          snappedTo: [],
          ...baseItemFields("train-track-piece", { x: origin.x, y: origin.y + 48 }),
        },
        {
          id: nextItemId("train-engine"),
          kind: "train-engine",
          variant: "starter",
          speed: 1,
          rotation: 0,
          assemblyId,
          ...baseItemFields("train-engine", { x: origin.x + 10, y: origin.y + 18 }),
        },
        {
          id: nextItemId("train-car"),
          kind: "train-car",
          variant: "boxcar",
          rotation: 0,
          assemblyId,
          ...baseItemFields("train-car", { x: origin.x + 76, y: origin.y + 18 }),
        },
      ];
      const nextItems = [
        ...itemsRef.current.map((item) =>
          item.id === id && item.kind === "train-kit-box"
            ? { ...item, opened: true }
            : item
        ),
        ...pieces,
      ].slice(-MAX_DESKTOP_ITEMS);
      itemsRef.current = nextItems;
      setItems(nextItems);
      return pieces;
    },
    [bounds, itemsRef, setItems]
  );

  const rotateFan = useCallback(
    (id: string) => {
      const nextItems = itemsRef.current.map((item) =>
        item.id === id && item.kind === "tiny-fan"
          ? { ...item, angle: (item.angle + Math.PI / 4) % (Math.PI * 2), active: true }
          : item
      );
      itemsRef.current = nextItems;
      setItems(nextItems);
    },
    [itemsRef, setItems]
  );

  const updateStickyNoteText = useCallback(
    (id: string, text: string) => {
      const nextItems = itemsRef.current.map((item) =>
        item.id === id && item.kind === "sticky-note" ? { ...item, text: text.slice(0, 600) } : item
      );
      itemsRef.current = nextItems;
      setItems(nextItems);
    },
    [itemsRef, setItems]
  );

  const addStickyNoteStroke = useCallback(
    (id: string, stroke: StickyNoteStroke) => {
      const nextItems = itemsRef.current.map((item) =>
        item.id === id && item.kind === "sticky-note"
          ? { ...item, strokes: [...item.strokes, stroke].slice(-18) }
          : item
      );
      itemsRef.current = nextItems;
      setItems(nextItems);
    },
    [itemsRef, setItems]
  );

  const updateDesktopItems = useCallback(
    (updater: (items: DesktopItemState[]) => DesktopItemState[]) => {
      const nextItems = updater(itemsRef.current).slice(-MAX_DESKTOP_ITEMS);
      itemsRef.current = nextItems;
      setItems(nextItems);
      return nextItems;
    },
    [itemsRef, setItems]
  );

  return {
    addDesktopItem,
    moveDesktopItem,
    rotateFan,
    updateStickyNoteText,
    addStickyNoteStroke,
    placePortal,
    removeDesktopItem,
    updateDesktopItems,
    scaleDesktopItem,
    toggleCursorToolTray,
    unpackTrainKit,
  };
}
