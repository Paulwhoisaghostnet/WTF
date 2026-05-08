import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import {
  normalizeDesktopItems,
} from "./storage";
import {
  MAX_DESKTOP_ITEMS,
  type DesktopItemState,
  type StickyNoteStroke,
} from "./model";
import {
  createDesktopArtifactItem,
  createGenericDesktopArtifact,
  createDesktopItemForTool,
  useDesktopItemActions,
  type DesktopArtifactItemKind,
  type DesktopArtifactTool,
} from "./useDesktopItemActions";

type DesktopFunInventoryResponse = {
  inventory?: Array<{
    sku: string;
    quantity: number;
  }>;
};

const DESKTOP_ARTIFACT_STORAGE_PREFIX = "wtf.desktop.artifacts.v1";

export type DesktopArtifactSpawner =
  | { kind: "tool"; tool: DesktopArtifactTool }
  | { kind: "item"; itemKind: DesktopArtifactItemKind }
  | { kind: "generic"; label: string; monogram: string };

export const DESKTOP_ARTIFACT_SKUS: Record<string, DesktopArtifactSpawner> = {
  "desktop-tiny-fan": { kind: "tool", tool: "fan" },
  "desktop-light-disco": { kind: "tool", tool: "light-disco" },
  "desktop-light-moon": { kind: "tool", tool: "light-moon" },
  "desktop-light-sun": { kind: "tool", tool: "light-sun" },
  "desktop-sticky-note-trap": { kind: "tool", tool: "sticky-note" },
  "desktop-mop": { kind: "tool", tool: "mop" },
  "desktop-vacuum": { kind: "tool", tool: "vacuum" },
  "desktop-spraycan": { kind: "generic", label: "Spraycan", monogram: "SPRY" },
  "desktop-catapult": { kind: "generic", label: "Catapult", monogram: "CAT" },
  "desktop-ant-farm": { kind: "generic", label: "Ant Farm", monogram: "ANT" },
  "desktop-cursor-tool-tray": { kind: "item", itemKind: "cursor-tool-tray" },
  "desktop-train-base-kit": { kind: "item", itemKind: "train-kit-box" },
  "desktop-portal-gun": { kind: "item", itemKind: "portal-gun" },
  "desktop-jukebox": { kind: "item", itemKind: "jukebox" },
  "desktop-paper-shredder": { kind: "item", itemKind: "paper-shredder" },
};

function desktopArtifactStorageKey(userId: number | null) {
  return `${DESKTOP_ARTIFACT_STORAGE_PREFIX}:${userId ?? "anon"}`;
}

function spawnPointForOrdinal(
  ordinal: number,
  bounds: { width: number; height: number }
) {
  const usableWidth = Math.max(80, bounds.width - 140);
  const usableHeight = Math.max(80, bounds.height - 180);
  return {
    x: 56 + ((ordinal * 83) % usableWidth),
    y: 72 + ((ordinal * 59) % usableHeight),
  };
}

function sameDesktopItemPositions(a: DesktopItemState[], b: DesktopItemState[]) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return other && item.id === other.id && item.x === other.x && item.y === other.y;
  });
}

function reportDesktopArtifactEvent(payload: {
  eventType: string;
  objectId: string;
  objectKind: string;
  action: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  void api.post<{ ok: true }>("/api/desktop/events", payload).catch(() => {
    // Inventory-backed desktop artifacts should remain usable even if event logging fails.
  });
}

export function useDesktopArtifacts({
  enabled,
  userId,
  bounds,
}: {
  enabled: boolean;
  userId: number | null;
  bounds: { width: number; height: number };
}) {
  const [items, setItems] = useState<DesktopItemState[]>([]);
  const itemsRef = useRef<DesktopItemState[]>([]);
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!enabled) {
      loadedKeyRef.current = null;
      itemsRef.current = [];
      setItems([]);
      return;
    }
    const key = desktopArtifactStorageKey(userId);
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      const normalized = normalizeDesktopItems(parsed, bounds);
      itemsRef.current = normalized;
      setItems(normalized);
    } catch {
      itemsRef.current = [];
      setItems([]);
    }
  }, [bounds, bounds.height, bounds.width, enabled, userId]);

  useEffect(() => {
    if (!enabled || !loadedKeyRef.current || bounds.width <= 1 || bounds.height <= 1) return;
    const normalized = normalizeDesktopItems(itemsRef.current, bounds);
    if (sameDesktopItemPositions(itemsRef.current, normalized)) return;
    itemsRef.current = normalized;
    setItems(normalized);
  }, [bounds, bounds.height, bounds.width, enabled]);

  useEffect(() => {
    if (!enabled) return;
    try {
      window.localStorage.setItem(desktopArtifactStorageKey(userId), JSON.stringify(items));
    } catch {
      // Desktop artifacts should never block the shell if storage is unavailable.
    }
  }, [enabled, items, userId]);

  const inventoryQuery = useQuery({
    queryKey: ["in-app-market", "desktop_fun", "desktop-artifacts", userId],
    queryFn: () =>
      api.get<DesktopFunInventoryResponse>(
        "/api/in-app-market?category=desktop_fun"
      ),
    enabled,
    staleTime: 30_000,
  });

  const artifactInventory = useMemo(() => {
    const rows = inventoryQuery.data?.inventory ?? [];
    return rows
      .map((row) => ({
        sku: row.sku,
        quantity: Math.max(0, Math.min(99, Math.floor(Number(row.quantity) || 0))),
        spawner: DESKTOP_ARTIFACT_SKUS[row.sku],
      }))
      .filter((row): row is { sku: string; quantity: number; spawner: DesktopArtifactSpawner } =>
        Boolean(row.spawner)
      );
  }, [inventoryQuery.data?.inventory]);

  useEffect(() => {
    if (!enabled || bounds.width <= 1 || bounds.height <= 1) return;
    if (artifactInventory.length === 0) return;
    let changed = false;
    const nextItems = [...itemsRef.current];
    const spawnedItems: DesktopItemState[] = [];
    for (const row of artifactInventory) {
      for (let ordinal = 1; ordinal <= row.quantity; ordinal += 1) {
        const exists = nextItems.some(
          (item) => item.sourceSku === row.sku && item.inventoryOrdinal === ordinal
        );
        if (exists) continue;
        const point = spawnPointForOrdinal(nextItems.length + ordinal, bounds);
        if (row.spawner.kind === "tool") {
          const item = createDesktopItemForTool(row.spawner.tool, point.x, point.y, bounds, {
            sourceSku: row.sku,
            inventoryOrdinal: ordinal,
          });
          nextItems.push(item);
          spawnedItems.push(item);
        } else if (row.spawner.kind === "item") {
          const item = createDesktopArtifactItem(row.spawner.itemKind, point.x, point.y, bounds, {
            sourceSku: row.sku,
            inventoryOrdinal: ordinal,
          });
          nextItems.push(item);
          spawnedItems.push(item);
        } else {
          const item = createGenericDesktopArtifact(
            row.spawner.label,
            row.spawner.monogram,
            point.x,
            point.y,
            bounds,
            {
              sourceSku: row.sku,
              inventoryOrdinal: ordinal,
            }
          );
          nextItems.push(item);
          spawnedItems.push(item);
        }
        changed = true;
      }
    }
    if (!changed) return;
    const trimmed = nextItems.slice(-MAX_DESKTOP_ITEMS);
    itemsRef.current = trimmed;
    setItems(trimmed);
    const trimmedIds = new Set(trimmed.map((item) => item.id));
    for (const item of spawnedItems.filter((spawned) => trimmedIds.has(spawned.id))) {
      reportDesktopArtifactEvent({
        eventType: "desktop.artifact.spawned",
        objectId: item.id,
        objectKind: item.kind,
        action: "spawn",
        metadata: {
          sourceSku: item.sourceSku ?? null,
          inventoryOrdinal: item.inventoryOrdinal ?? null,
        },
      });
    }
  }, [artifactInventory, bounds, bounds.height, bounds.width, enabled]);

  const {
    moveDesktopItem,
    placePortal,
    removeDesktopItem,
    rotateFan,
    scaleDesktopItem,
    toggleCursorToolTray,
    unpackTrainKit,
    updateStickyNoteText,
    addStickyNoteStroke,
    updateDesktopItems,
  } = useDesktopItemActions({
    bounds,
    itemsRef,
    setItems,
  });

  return {
    addStickyNoteStroke: (id: string, stroke: StickyNoteStroke) => addStickyNoteStroke(id, stroke),
    items,
    itemsRef,
    moveDesktopItem,
    placePortal,
    removeDesktopItem,
    rotateFan,
    scaleDesktopItem,
    setItems,
    toggleCursorToolTray,
    unpackTrainKit,
    updateStickyNoteText,
    updateDesktopItems,
  };
}
