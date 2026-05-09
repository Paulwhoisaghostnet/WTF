import { useEffect, useRef } from "react";
import type { SyntheticEvent } from "react";
import styled from "styled-components";
import { MenuList, MenuListItem, Separator } from "react95";

export type Win95ContextMenuAction = {
  kind?: "item";
  label: string;
  disabled?: boolean;
  onSelect: () => void;
};

export type Win95ContextMenuEntry =
  | Win95ContextMenuAction
  | { kind: "separator" };

const ContextMenuRoot = styled(MenuList)`
  position: fixed;
  z-index: 520;
  min-width: 172px;
  max-width: min(260px, calc(100vw - 12px));
  box-shadow: 2px 2px 0 #000;
`;

const ContextMenuItem = styled(MenuListItem)<{ $disabled?: boolean }>`
  font-size: 11px;
  min-height: 22px;
  cursor: ${(p) => (p.$disabled ? "default" : "pointer")};
  color: ${(p) => (p.$disabled ? "#808080" : "inherit")};
  text-shadow: ${(p) => (p.$disabled ? "1px 1px 0 #ffffff" : "inherit")};
`;

export function Win95ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: Win95ContextMenuEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const safeX = Number.isFinite(x) ? x : 4;
  const safeY = Number.isFinite(y) ? y : 4;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <ContextMenuRoot
      ref={ref as any}
      style={{
        left: Math.max(4, Math.min(safeX, window.innerWidth - 268)),
        top: Math.max(4, Math.min(safeY, window.innerHeight - 220)),
      }}
      onContextMenu={(event: SyntheticEvent) => event.preventDefault()}
      onPointerDown={(event: SyntheticEvent) => event.stopPropagation()}
    >
      {entries.map((entry, index) =>
        entry.kind === "separator" ? (
          <Separator key={`separator-${index}`} />
        ) : (
          <ContextMenuItem
            key={`${entry.label}-${index}`}
            $disabled={entry.disabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (entry.disabled) return;
              entry.onSelect();
              onClose();
            }}
          >
            {entry.label}
          </ContextMenuItem>
        )
      )}
    </ContextMenuRoot>
  );
}
