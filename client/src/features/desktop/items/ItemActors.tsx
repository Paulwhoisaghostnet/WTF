import {
  useCallback,
  useMemo,
  useRef,
  type ChangeEvent,
  type PointerEvent,
} from "react";
import styled, { keyframes } from "styled-components";
import { clampFloatingPosition } from "../geometry";
import {
  DESKTOP_CURSOR_TOOL_LABELS,
  type DesktopCursorTool,
} from "../tools";
import {
  getDesktopItemScale,
  getDesktopItemRect,
  getDesktopItemSize,
  type DesktopItemKind,
  type DesktopItemState,
  type StickyNoteStroke,
} from "./model";

export function DesktopItemActors({
  items,
  bounds,
  now,
  onMove,
  onFanRotate,
  activeTool,
  onToolSelect,
  onScaleItem,
  onCursorTrayToggle,
  onTrainKitOpen,
  onOpenJukebox,
  onPortalGunEquip,
  onRemoveItem,
  onStickyText,
  onStickyStroke,
  onToolMove,
  splitAssemblyKeyDown = false,
}: {
  items: DesktopItemState[];
  bounds: { width: number; height: number };
  now: number;
  onMove: (id: string, position: { x: number; y: number }, options?: { splitAssembly?: boolean }) => void;
  onFanRotate: (id: string) => void;
  activeTool: DesktopCursorTool;
  onToolSelect: (tool: DesktopCursorTool) => void;
  onScaleItem: (id: string, factor: number) => void;
  onCursorTrayToggle: (id: string) => void;
  onTrainKitOpen: (id: string) => void;
  onOpenJukebox: () => void;
  onPortalGunEquip: () => void;
  onRemoveItem: (id: string) => void;
  onStickyText: (id: string, text: string) => void;
  onStickyStroke: (id: string, stroke: StickyNoteStroke) => void;
  onToolMove: (id: string, position: { x: number; y: number }, options?: { splitAssembly?: boolean }) => void;
  splitAssemblyKeyDown?: boolean;
}) {
  return (
    <>
      {items.map((item) =>
        item.kind === "sticky-note" ? (
          <StickyNoteActor
            key={item.id}
            item={item}
            bounds={bounds}
            onMove={onMove}
            onText={onStickyText}
            onStroke={onStickyStroke}
            now={now}
            activeTool={activeTool}
            onScale={onScaleItem}
          />
        ) : (
          <DesktopItemActor
            key={item.id}
            item={item}
            bounds={bounds}
            now={now}
            activeTool={activeTool}
            onToolSelect={onToolSelect}
            onScale={onScaleItem}
            onCursorTrayToggle={onCursorTrayToggle}
            onTrainKitOpen={onTrainKitOpen}
            onOpenJukebox={onOpenJukebox}
            onPortalGunEquip={onPortalGunEquip}
            onRemoveItem={onRemoveItem}
            splitAssemblyKeyDown={splitAssemblyKeyDown}
            onMove={item.kind === "mop" || item.kind === "vacuum" ? onToolMove : onMove}
            onFanRotate={onFanRotate}
          />
        )
      )}
    </>
  );
}

function DesktopItemActor({
  item,
  bounds,
  now,
  activeTool,
  onToolSelect,
  onScale,
  onCursorTrayToggle,
  onTrainKitOpen,
  onOpenJukebox,
  onPortalGunEquip,
  onRemoveItem,
  splitAssemblyKeyDown,
  onMove,
  onFanRotate,
}: {
  item: Exclude<DesktopItemState, { kind: "sticky-note" }>;
  bounds: { width: number; height: number };
  now: number;
  activeTool: DesktopCursorTool;
  onToolSelect: (tool: DesktopCursorTool) => void;
  onScale: (id: string, factor: number) => void;
  onCursorTrayToggle: (id: string) => void;
  onTrainKitOpen: (id: string) => void;
  onOpenJukebox: () => void;
  onPortalGunEquip: () => void;
  onRemoveItem: (id: string) => void;
  splitAssemblyKeyDown: boolean;
  onMove: (id: string, position: { x: number; y: number }, options?: { splitAssembly?: boolean }) => void;
  onFanRotate: (id: string) => void;
}) {
  const dragRef = useRef({
    dragging: false,
    moved: false,
    ox: 0,
    oy: 0,
    mode: "move" as "move" | "scale" | "portal-close",
    startX: 0,
    startScale: 1,
    splitAssembly: false,
  });
  const portalCloseTimerRef = useRef<number | null>(null);
  const rect = getDesktopItemRect(item, bounds, now);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const scaleMode =
        activeTool === "scale" &&
        item.kind !== "cursor-tool-tray" &&
        item.kind !== "portal" &&
        item.material?.scaleCompatible !== false;
      if (activeTool === "portal-gun" && item.kind === "portal") {
        portalCloseTimerRef.current = window.setTimeout(() => {
          portalCloseTimerRef.current = null;
          onRemoveItem(item.id);
        }, 5000);
      }
      dragRef.current = {
        dragging: true,
        moved: false,
        ox: e.clientX - rect.x,
        oy: e.clientY - rect.y,
        mode: activeTool === "portal-gun" && item.kind === "portal" ? "portal-close" : scaleMode ? "scale" : "move",
        startX: e.clientX,
        startScale: getDesktopItemScale(item, now),
        splitAssembly: splitAssemblyKeyDown,
      };
    },
    [activeTool, item, now, onRemoveItem, rect.x, rect.y, splitAssemblyKeyDown]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag.dragging) return;
      drag.moved = true;
      if (drag.mode === "portal-close") return;
      if (portalCloseTimerRef.current) {
        window.clearTimeout(portalCloseTimerRef.current);
        portalCloseTimerRef.current = null;
      }
      if (drag.mode === "scale") {
        const nextScale = Math.max(0.25, Math.min(2.5, drag.startScale + (e.clientX - drag.startX) / 130));
        onScale(item.id, nextScale);
        return;
      }
      onMove(
        item.id,
        clampFloatingPosition(
          { x: e.clientX - drag.ox, y: e.clientY - drag.oy },
          bounds,
          rect.width,
          rect.height
        ),
        { splitAssembly: drag.splitAssembly }
      );
    },
    [bounds, item.id, onMove, onScale, rect.height, rect.width]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const drag = dragRef.current;
      dragRef.current.dragging = false;
      if (portalCloseTimerRef.current) {
        window.clearTimeout(portalCloseTimerRef.current);
        portalCloseTimerRef.current = null;
      }
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (drag.moved) return;
      if (item.kind === "tiny-fan") onFanRotate(item.id);
      else if (item.kind === "cursor-tool-tray") onCursorTrayToggle(item.id);
      else if (item.kind === "train-kit-box") onTrainKitOpen(item.id);
      else if (item.kind === "jukebox") onOpenJukebox();
      else if (item.kind === "portal-gun") {
        onPortalGunEquip();
        onToolSelect(activeTool === "portal-gun" ? "standard" : "portal-gun");
      }
    },
    [
      activeTool,
      item.id,
      item.kind,
      onCursorTrayToggle,
      onFanRotate,
      onOpenJukebox,
      onPortalGunEquip,
      onToolSelect,
      onTrainKitOpen,
    ]
  );

  return (
    <DesktopItemButton
      type="button"
      aria-label={
        item.kind === "hanging-light"
          ? `${item.variant} hanging light`
          : item.kind === "artifact-icon"
            ? item.label
            : item.kind.replace("-", " ")
      }
      $x={rect.x}
      $y={rect.y}
      $w={rect.width}
      $h={rect.height}
      $kind={item.kind}
      $scale={getDesktopItemScale(item, now)}
      $activeTool={activeTool}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {item.kind === "tiny-fan" ? (
        <FanIcon $angle={item.angle} $active={item.active}>
          <span />
          <i />
        </FanIcon>
      ) : item.kind === "hanging-light" ? (
        <HangingLightIcon $variant={item.variant} />
      ) : item.kind === "mop" ? (
        <MopIcon $dirty={item.dirty} $usesLeft={item.usesLeft}>
          <span />
          <i />
        </MopIcon>
      ) : item.kind === "vacuum" ? (
        <VacuumIcon $charge={item.charge}>
          <span />
          <i />
        </VacuumIcon>
      ) : item.kind === "cursor-tool-tray" ? (
        <CursorTrayIcon $open={item.open}>
          <span />
          <i />
          {item.open && (
            <CursorTrayPanel onPointerDown={(e) => e.stopPropagation()}>
              {(["standard", "scale", "portal-gun"] as DesktopCursorTool[]).map((tool) => (
                <CursorToolButton
                  key={tool}
                  type="button"
                  data-compact-control="true"
                  $active={activeTool === tool}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToolSelect(tool);
                  }}
                >
                  {DESKTOP_CURSOR_TOOL_LABELS[tool]}
                </CursorToolButton>
              ))}
            </CursorTrayPanel>
          )}
        </CursorTrayIcon>
      ) : item.kind === "train-kit-box" ? (
        <TrainKitIcon $opened={item.opened}>
          <span />
          <i />
          {item.opened && <b>OPEN</b>}
        </TrainKitIcon>
      ) : item.kind === "train-track-piece" ? (
        <TrainTrackIcon $shape={item.shape} $rotation={item.rotation} />
      ) : item.kind === "train-engine" ? (
        <TrainEngineIcon $variant={item.variant} $rotation={item.rotation}>
          <span />
        </TrainEngineIcon>
      ) : item.kind === "train-car" ? (
        <TrainCarIcon $variant={item.variant} $rotation={item.rotation} />
      ) : item.kind === "portal-gun" ? (
        <PortalGunIcon $active={activeTool === "portal-gun"} $color={item.nextColor}>
          <span />
        </PortalGunIcon>
      ) : item.kind === "portal" ? (
        <PortalIcon $color={item.color}>
          <span />
        </PortalIcon>
      ) : item.kind === "jukebox" ? (
        <JukeboxIcon>
          <span />
          <i />
        </JukeboxIcon>
      ) : item.kind === "paper-shredder" ? (
        <PaperShredderIcon $wear={item.wear}>
          <span />
          <i />
        </PaperShredderIcon>
      ) : (
        <GenericArtifactIcon>
          <span>{item.monogram}</span>
          <i>{item.label}</i>
        </GenericArtifactIcon>
      )}
    </DesktopItemButton>
  );
}

function StickyNoteActor({
  item,
  bounds,
  now,
  activeTool,
  onScale,
  onMove,
  onText,
  onStroke,
}: {
  item: Extract<DesktopItemState, { kind: "sticky-note" }>;
  bounds: { width: number; height: number };
  now: number;
  activeTool: DesktopCursorTool;
  onScale: (id: string, factor: number) => void;
  onMove: (id: string, position: { x: number; y: number }, options?: { splitAssembly?: boolean }) => void;
  onText: (id: string, text: string) => void;
  onStroke: (id: string, stroke: StickyNoteStroke) => void;
}) {
  const dragRef = useRef({
    dragging: false,
    mode: "move" as "move" | "scale",
    ox: 0,
    oy: 0,
    startX: 0,
    startScale: 1,
  });
  const strokeRef = useRef<StickyNoteStroke | null>(null);

  const handleText = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onText(item.id, event.target.value);
    },
    [item.id, onText]
  );

  const handleDragPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        dragging: true,
        mode: activeTool === "scale" ? "scale" : "move",
        ox: e.clientX - item.x,
        oy: e.clientY - item.y,
        startX: e.clientX,
        startScale: getDesktopItemScale(item, now),
      };
    },
    [activeTool, item, now]
  );

  const handleDragPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag.dragging) return;
      if (drag.mode === "scale") {
        const nextScale = Math.max(0.25, Math.min(2.5, drag.startScale + (e.clientX - drag.startX) / 130));
        onScale(item.id, nextScale);
        return;
      }
      onMove(
        item.id,
        clampFloatingPosition(
          { x: e.clientX - drag.ox, y: e.clientY - drag.oy },
          bounds,
          getDesktopItemSize(item).width,
          getDesktopItemSize(item).height
        )
      );
    },
    [bounds, item, onMove, onScale]
  );

  const handleDragPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current.dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const relativePoint = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const handleStrokeStart = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
      strokeRef.current = {
        id: `stroke-${Date.now()}-${Math.round(Math.random() * 9999)}`,
        color: "#253036",
        width: 2 + Math.random() * 1.2,
        points: [relativePoint(e)],
      };
    },
    [relativePoint]
  );

  const handleStrokeMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const stroke = strokeRef.current;
      if (!stroke) return;
      stroke.points = [...stroke.points, relativePoint(e)].slice(-120);
    },
    [relativePoint]
  );

  const handleStrokeEnd = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const stroke = strokeRef.current;
      strokeRef.current = null;
      (e.currentTarget as SVGSVGElement).releasePointerCapture?.(e.pointerId);
      if (stroke && stroke.points.length > 1) onStroke(item.id, stroke);
    },
    [item.id, onStroke]
  );

  const pathData = useMemo(
    () =>
      item.strokes.map((stroke) => ({
        stroke,
        d: stroke.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
      })),
    [item.strokes]
  );

  return (
    <StickyNoteRoot
      $x={item.x}
      $y={item.y}
      $paperWetness={item.paperWetness}
      $stickyWetness={item.stickyWetness}
      $curl={item.curl}
      $scale={getDesktopItemScale(item, now)}
      aria-label="Sticky note trap"
    >
      <StickyNoteGrip
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
      />
      <StickyNoteText
        value={item.text}
        maxLength={600}
        onChange={handleText}
        spellCheck={false}
        aria-label="Sticky note text"
      />
      <StickyInkLayer
        viewBox="0 0 132 112"
        preserveAspectRatio="none"
        onPointerDown={handleStrokeStart}
        onPointerMove={handleStrokeMove}
        onPointerUp={handleStrokeEnd}
      >
        {pathData.map(({ stroke, d }) => (
          <path
            key={stroke.id}
            d={d}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {item.marks.map((mark) => (
          <ellipse
            key={mark.id}
            cx={mark.x}
            cy={mark.y}
            rx="5.8"
            ry="2.6"
            fill={mark.color}
            opacity={mark.opacity}
            transform={`rotate(${(mark.x + mark.y) % 36 - 18} ${mark.x} ${mark.y})`}
          />
        ))}
      </StickyInkLayer>
      <StickyStrip aria-hidden="true" $wetness={item.stickyWetness} />
    </StickyNoteRoot>
  );
}

const fanSpin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const discoPulse = keyframes`
  0%, 100% { filter: hue-rotate(0deg) saturate(1.1); }
  50% { filter: hue-rotate(100deg) saturate(1.55); }
`;

const DesktopItemButton = styled.button<{
  $x: number;
  $y: number;
  $w: number;
  $h: number;
  $kind: DesktopItemKind;
  $scale: number;
  $activeTool: DesktopCursorTool;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${(p) => p.$w}px;
  height: ${(p) => p.$h}px;
  padding: 0;
  min-height: 0;
  border: 0;
  background: transparent;
  appearance: none;
  pointer-events: auto;
  touch-action: none;
  cursor: grab;
  filter: drop-shadow(2px 3px 1px rgba(0, 0, 0, 0.38));
  outline: ${(p) => (p.$activeTool === "scale" && p.$kind !== "portal" ? "1px dashed rgba(255, 255, 255, 0.72)" : "0")};

  &:active {
    cursor: grabbing;
  }
`;

const FanIcon = styled.span<{ $angle: number; $active: boolean }>`
  position: absolute;
  inset: 3px;
  border: 2px solid #222222;
  border-radius: 8px;
  background:
    radial-gradient(circle at 50% 50%, #eeeeee 0 5px, #333333 5.5px 8px, transparent 8.5px),
    linear-gradient(145deg, #d9eef3, #8599a1);
  transform: rotate(${(p) => p.$angle}rad);

  span {
    position: absolute;
    left: 8px;
    top: 8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background:
      conic-gradient(from 0deg, #374151 0 18%, transparent 18% 25%, #374151 25% 43%, transparent 43% 50%, #374151 50% 68%, transparent 68% 75%, #374151 75% 93%, transparent 93%);
    animation: ${(p) => (p.$active ? fanSpin : "none")} 420ms linear infinite;
  }

  i {
    position: absolute;
    right: -16px;
    top: 17px;
    width: 17px;
    height: 5px;
    border-radius: 999px;
    background: rgba(172, 226, 236, 0.58);
    box-shadow:
      -4px -8px 0 rgba(172, 226, 236, 0.36),
      -8px 8px 0 rgba(172, 226, 236, 0.28);
  }
`;

const HangingLightIcon = styled.span<{ $variant: "disco" | "moon" | "sun" }>`
  position: absolute;
  left: 50%;
  top: 0;
  width: 2px;
  height: 20px;
  transform: translateX(-50%);
  background: #222222;

  &::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 18px;
    width: 34px;
    height: 34px;
    transform: translateX(-50%);
    border: 2px solid #202020;
    border-radius: ${(p) => (p.$variant === "disco" ? "50%" : p.$variant === "moon" ? "50%" : "46%")};
    background:
      ${(p) =>
        p.$variant === "disco"
          ? "conic-gradient(#f72585, #3a86ff, #ffbe0b, #06d6a0, #f72585)"
          : p.$variant === "moon"
            ? "radial-gradient(circle at 68% 34%, #f7f0c8 0 5px, transparent 5.5px), linear-gradient(145deg, #f8fafc, #a7b2c4)"
            : "radial-gradient(circle at 50% 50%, #fff7ad 0 35%, #f59e0b 36% 100%)"};
    box-shadow:
      0 0 18px
        ${(p) =>
          p.$variant === "disco"
            ? "rgba(96, 165, 250, 0.5)"
            : p.$variant === "moon"
              ? "rgba(203, 213, 225, 0.62)"
              : "rgba(251, 191, 36, 0.64)"},
      0 0 48px
        ${(p) =>
          p.$variant === "disco"
            ? "rgba(236, 72, 153, 0.28)"
            : p.$variant === "moon"
              ? "rgba(148, 163, 184, 0.24)"
              : "rgba(245, 158, 11, 0.28)"};
    animation: ${(p) => (p.$variant === "disco" ? discoPulse : "none")} 1900ms linear infinite;
  }
`;

const MopIcon = styled.span<{ $dirty: number; $usesLeft: number }>`
  position: absolute;
  left: 11px;
  top: 2px;
  width: 8px;
  height: 34px;
  transform: rotate(38deg);
  border-radius: 999px;
  background: linear-gradient(#b8793e, #74421f);

  span {
    position: absolute;
    left: -12px;
    bottom: -9px;
    width: 30px;
    height: 18px;
    border-radius: 2px 2px 10px 10px;
    background:
      linear-gradient(
        90deg,
        #e8e0cc,
        rgba(100, 76, 52, ${(p) => 0.12 + p.$dirty * 0.48}),
        #ded0b5
      );
    border: 1px solid #5c4632;
  }

  i {
    position: absolute;
    right: -23px;
    bottom: -8px;
    font-size: 9px;
    color: #111111;
  }

  i::before {
    content: "${(p) => p.$usesLeft}";
  }
`;

const VacuumIcon = styled.span<{ $charge: number }>`
  position: absolute;
  left: 4px;
  top: 15px;
  width: 38px;
  height: 22px;
  border: 2px solid #1f2937;
  border-radius: 12px 14px 9px 9px;
  background:
    radial-gradient(circle at 28% 78%, #111827 0 4px, transparent 4.5px),
    radial-gradient(circle at 76% 78%, #111827 0 4px, transparent 4.5px),
    linear-gradient(135deg, #c8d4e2, #5b7892);
  opacity: ${(p) => 0.55 + p.$charge * 0.45};

  span {
    position: absolute;
    left: -2px;
    top: -12px;
    width: 26px;
    height: 14px;
    border: 3px solid #374151;
    border-bottom: 0;
    border-radius: 14px 14px 0 0;
  }

  i {
    position: absolute;
    right: -12px;
    bottom: 2px;
    width: 15px;
    height: 8px;
    border-radius: 2px;
    background: #334155;
  }
`;

const CursorTrayIcon = styled.span<{ $open: boolean }>`
  position: absolute;
  inset: 4px;
  border: 2px solid #111111;
  border-radius: 4px;
  background:
    linear-gradient(180deg, #eeeeee, #a8b2bc),
    repeating-linear-gradient(90deg, transparent 0 7px, rgba(0, 0, 0, 0.16) 7px 8px);
  box-shadow:
    inset 2px 2px 0 rgba(255, 255, 255, 0.78),
    inset -3px -3px 0 rgba(0, 0, 0, 0.2);

  span {
    position: absolute;
    left: 14px;
    top: 10px;
    width: 14px;
    height: 20px;
    clip-path: polygon(0 0, 100% 46%, 58% 56%, 82% 100%, 58% 100%, 36% 62%, 0 88%);
    background: #111111;
  }

  i {
    position: absolute;
    right: 5px;
    bottom: 5px;
    width: 13px;
    height: 13px;
    border: 1px solid #111111;
    background: ${(p) => (p.$open ? "#00a3a3" : "#c0c0c0")};
  }
`;

const CursorTrayPanel = styled.div`
  position: absolute;
  left: 54px;
  top: 0;
  z-index: 30;
  width: 86px;
  padding: 4px;
  border: 2px outset #f0f0f0;
  background: #c0c0c0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const CursorToolButton = styled.button<{ $active: boolean }>`
  min-height: 18px;
  padding: 1px 4px;
  border: 2px ${(p) => (p.$active ? "inset" : "outset")} #dfdfdf;
  background: ${(p) => (p.$active ? "#9fd4d4" : "#c0c0c0")};
  color: #111111;
  font-size: 10px;
  line-height: 1.1;
  text-align: left;
`;

const TrainKitIcon = styled.span<{ $opened: boolean }>`
  position: absolute;
  inset: 4px;
  border: 2px solid #4a2f16;
  border-radius: 3px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 28%),
    linear-gradient(180deg, #c98a4c, #8f5424);
  box-shadow:
    inset 0 18px 0 rgba(255, 255, 255, 0.1),
    inset -6px -6px 0 rgba(62, 39, 17, 0.28);

  span {
    position: absolute;
    left: 11px;
    top: 16px;
    width: 50px;
    height: 25px;
    border: 2px solid #111111;
    background:
      radial-gradient(circle at 18% 80%, #111 0 4px, transparent 4.5px),
      radial-gradient(circle at 78% 80%, #111 0 4px, transparent 4.5px),
      linear-gradient(90deg, #ef4444 0 44%, #facc15 44% 100%);
  }

  i {
    position: absolute;
    left: 6px;
    top: 6px;
    right: 6px;
    height: ${(p) => (p.$opened ? "10px" : "0")};
    border-top: 2px solid #4a2f16;
    transform: ${(p) => (p.$opened ? "rotate(-8deg)" : "none")};
  }

  b {
    position: absolute;
    right: 5px;
    bottom: 4px;
    font-size: 8px;
    color: #111111;
  }
`;

const TrainTrackIcon = styled.span<{ $shape: "straight" | "curve" | "switch"; $rotation: number }>`
  position: absolute;
  inset: 5px;
  transform: rotate(${(p) => p.$rotation}deg);

  &::before {
    content: "";
    position: absolute;
    inset: 8px 2px;
    border: 4px solid #4b5563;
    border-left-color: ${(p) => (p.$shape === "curve" ? "transparent" : "#4b5563")};
    border-radius: ${(p) => (p.$shape === "curve" ? "50% 50% 0 0" : "4px")};
  }

  &::after {
    content: "";
    position: absolute;
    left: 7px;
    right: 7px;
    top: 20px;
    height: 2px;
    background: repeating-linear-gradient(90deg, #6b3f1d 0 5px, transparent 5px 10px);
  }
`;

const TrainEngineIcon = styled.span<{ $variant: "starter" | "express" | "freight"; $rotation: number }>`
  position: absolute;
  inset: 4px;
  transform: rotate(${(p) => p.$rotation}deg);
  border: 2px solid #111111;
  border-radius: 5px 14px 7px 5px;
  background:
    radial-gradient(circle at 18% 86%, #111 0 5px, transparent 5.5px),
    radial-gradient(circle at 72% 86%, #111 0 5px, transparent 5.5px),
    linear-gradient(90deg, ${(p) => (p.$variant === "express" ? "#2563eb" : p.$variant === "freight" ? "#475569" : "#ef4444")}, #facc15);

  span {
    position: absolute;
    right: 5px;
    top: 5px;
    width: 11px;
    height: 11px;
    border: 1px solid #111111;
    background: #dbeafe;
  }
`;

const TrainCarIcon = styled.span<{ $variant: "boxcar" | "flatbed" | "caboose"; $rotation: number }>`
  position: absolute;
  inset: 4px;
  transform: rotate(${(p) => p.$rotation}deg);
  border: 2px solid #111111;
  border-radius: 4px;
  background:
    radial-gradient(circle at 20% 86%, #111 0 4px, transparent 4.5px),
    radial-gradient(circle at 78% 86%, #111 0 4px, transparent 4.5px),
    linear-gradient(180deg, ${(p) => (p.$variant === "caboose" ? "#dc2626" : p.$variant === "flatbed" ? "#78716c" : "#0f766e")}, #d7c28a);
`;

const PortalGunIcon = styled.span<{ $active: boolean; $color: "blue" | "orange" }>`
  position: absolute;
  left: 4px;
  top: 12px;
  width: 50px;
  height: 21px;
  border: 2px solid #111111;
  border-radius: 15px 4px 4px 15px;
  background:
    radial-gradient(circle at 14px 10px, ${(p) => (p.$color === "blue" ? "#38bdf8" : "#fb923c")} 0 5px, transparent 5.5px),
    linear-gradient(90deg, #f8fafc, #94a3b8);
  box-shadow: ${(p) => (p.$active ? "0 0 12px rgba(56, 189, 248, 0.72)" : "none")};

  span {
    position: absolute;
    right: -12px;
    top: 6px;
    width: 16px;
    height: 8px;
    border: 2px solid #111111;
    background: #1f2937;
  }
`;

const PortalIcon = styled.span<{ $color: "blue" | "orange" }>`
  position: absolute;
  inset: 2px 6px;
  border-radius: 50%;
  border: 4px solid ${(p) => (p.$color === "blue" ? "#38bdf8" : "#fb923c")};
  background:
    radial-gradient(ellipse at center, rgba(255, 255, 255, 0.72) 0 18%, transparent 19%),
    repeating-conic-gradient(
      from 0deg,
      ${(p) => (p.$color === "blue" ? "#0ea5e9" : "#f97316")} 0 9deg,
      #ffffff 9deg 14deg,
      transparent 14deg 20deg
    );
  image-rendering: pixelated;
  animation: portal-flicker 880ms steps(2, end) infinite;

  span {
    position: absolute;
    inset: 10px 7px;
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.82);
  }

  @keyframes portal-flicker {
    50% { filter: brightness(1.35) saturate(1.3); }
  }
`;

const JukeboxIcon = styled.span`
  position: absolute;
  inset: 4px 8px;
  border: 2px solid #111111;
  border-radius: 19px 19px 5px 5px;
  background:
    radial-gradient(circle at 50% 24%, #fef3c7 0 12px, #111111 12.5px 15px, transparent 15.5px),
    linear-gradient(180deg, #f43f5e, #7c2d12);
  box-shadow: inset 0 0 0 4px rgba(255, 255, 255, 0.18);

  span {
    position: absolute;
    left: 9px;
    right: 9px;
    bottom: 11px;
    height: 20px;
    background: repeating-linear-gradient(180deg, #facc15 0 3px, #111111 3px 5px);
  }

  i {
    position: absolute;
    left: 9px;
    right: 9px;
    top: 36px;
    height: 4px;
    background: #38bdf8;
  }
`;

const PaperShredderIcon = styled.span<{ $wear: number }>`
  position: absolute;
  inset: 5px;
  border: 2px solid #111111;
  border-radius: 4px;
  background:
    linear-gradient(180deg, #e5e7eb, #64748b),
    repeating-linear-gradient(90deg, transparent 0 5px, rgba(0, 0, 0, ${(p) => 0.08 + p.$wear * 0.16}) 5px 7px);

  span {
    position: absolute;
    left: 7px;
    right: 7px;
    top: 8px;
    height: 7px;
    background: #111111;
  }

  i {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 7px;
    height: 18px;
    background: repeating-linear-gradient(90deg, #f8fafc 0 3px, transparent 3px 6px);
  }
`;

const GenericArtifactIcon = styled.span`
  position: absolute;
  inset: 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 2px solid #111111;
  border-radius: 4px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(180, 190, 202, 0.9)),
    linear-gradient(180deg, #dbeafe, #94a3b8);
  box-shadow:
    inset -4px -4px 0 rgba(15, 23, 42, 0.18),
    inset 3px 3px 0 rgba(255, 255, 255, 0.72);
  color: #111111;

  span {
    display: block;
    min-width: 34px;
    padding: 2px 3px;
    border: 1px solid rgba(17, 24, 39, 0.6);
    background: rgba(255, 255, 255, 0.74);
    font-size: 11px;
    line-height: 1;
    font-weight: 700;
    text-align: center;
  }

  i {
    display: block;
    width: 52px;
    font-style: normal;
    font-size: 8px;
    line-height: 1;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StickyNoteRoot = styled.div<{
  $x: number;
  $y: number;
  $paperWetness: number;
  $stickyWetness: number;
  $curl: number;
  $scale: number;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 132px;
  height: 112px;
  pointer-events: auto;
  touch-action: none;
  transform:
    rotate(${(p) => -1.6 + p.$curl * 5}deg)
    skewY(${(p) => p.$curl * -2.6}deg)
    scale(${(p) => p.$scale});
  transform-origin: 0 0;
  background:
    radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.36), transparent 30%),
    linear-gradient(
      180deg,
      rgba(253, 224, 71, ${(p) => 0.96 - p.$paperWetness * 0.2}),
      rgba(250, 204, 21, ${(p) => 0.9 - p.$paperWetness * 0.26})
    );
  border: 1px solid rgba(99, 82, 19, 0.75);
  box-shadow:
    ${(p) => 2 + p.$curl * 5}px ${(p) => 4 + p.$curl * 7}px 3px rgba(0, 0, 0, ${(p) => 0.26 + p.$curl * 0.14}),
    inset 0 -20px 14px rgba(120, 75, 11, ${(p) => 0.08 + p.$stickyWetness * 0.14});
  filter: saturate(${(p) => 1 - p.$paperWetness * 0.28});
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: ${(p) => 12 + p.$curl * 28}px;
    height: ${(p) => 10 + p.$curl * 24}px;
    border-radius: 100% 0 0 0;
    background: rgba(251, 191, 36, 0.72);
    box-shadow: -2px -2px 3px rgba(0, 0, 0, 0.12);
    opacity: ${(p) => p.$curl};
  }
`;

const StickyNoteGrip = styled.div`
  position: absolute;
  right: 0;
  top: 0;
  width: 22px;
  height: 22px;
  z-index: 5;
  cursor: grab;
  background:
    linear-gradient(135deg, transparent 0 48%, rgba(120, 75, 11, 0.22) 49% 52%, transparent 53%),
    radial-gradient(circle at 65% 35%, rgba(120, 75, 11, 0.24), transparent 36%);

  &:active {
    cursor: grabbing;
  }
`;

const StickyNoteText = styled.textarea`
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 4;
  width: 116px;
  height: 58px;
  padding: 0;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: #273238;
  font-family: "Comic Sans MS", "Bradley Hand", "Marker Felt", cursive;
  font-size: 13px;
  line-height: 1.22;
  letter-spacing: 0;
  overflow: hidden;
`;

const StickyInkLayer = styled.svg`
  position: absolute;
  left: 0;
  top: 0;
  z-index: 3;
  width: 132px;
  height: 112px;
  pointer-events: auto;
`;

const StickyStrip = styled.div<{ $wetness: number }>`
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 1;
  width: 100%;
  height: 40px;
  background:
    linear-gradient(
      90deg,
      rgba(180, 83, 9, ${(p) => 0.22 - p.$wetness * 0.12}),
      rgba(146, 64, 14, ${(p) => 0.12 + p.$wetness * 0.16})
    );
  border-top: 1px dashed rgba(120, 75, 11, 0.42);
  filter: blur(${(p) => p.$wetness * 0.6}px);
`;
