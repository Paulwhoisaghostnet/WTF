import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import Matter from "matter-js";
import { type DesktopAppearance, type DesktopIconLayout } from "@shared/desktop";
import { type DesktopBounds } from "./geometry";
import {
  clampIconPosition,
  ICON_H,
  ICON_W,
  type DesktopIconDef,
} from "./DesktopIcons";

type DesktopIconPhysicsOptions = {
  appearance: Pick<DesktopAppearance, "desktopGravityMode" | "desktopPhysicsEnabled">;
  surfaceSize: DesktopBounds;
  visibleIcons: DesktopIconDef[];
  visibleIconKey: string;
  iconPositions: DesktopIconLayout;
  setIconPositions: Dispatch<SetStateAction<DesktopIconLayout>>;
  saveIconLayout: (layout: DesktopIconLayout) => void;
};

export function useDesktopIconPhysics({
  appearance,
  surfaceSize,
  visibleIcons,
  visibleIconKey,
  iconPositions,
  setIconPositions,
  saveIconLayout,
}: DesktopIconPhysicsOptions) {
  const saveIconLayoutRef = useRef<(layout: DesktopIconLayout) => void>(() => {});
  const positionsRef = useRef<DesktopIconLayout>({});
  const physicsRef = useRef<{
    engine: Matter.Engine;
    bodies: Map<string, Matter.Body>;
    raf: number;
    dragging: string | null;
    dirty: boolean;
    stillFrames: number;
  } | null>(null);

  useEffect(() => {
    saveIconLayoutRef.current = saveIconLayout;
  }, [saveIconLayout]);

  useEffect(() => {
    positionsRef.current = iconPositions;
  }, [iconPositions]);

  const syncBodyPosition = useCallback((key: string, pos: { x: number; y: number }) => {
    const body = physicsRef.current?.bodies.get(key);
    if (!body) return;
    Matter.Body.setPosition(body, {
      x: pos.x + ICON_W / 2,
      y: pos.y + ICON_H / 2,
    });
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
  }, []);

  const handleIconMove = useCallback(
    (key: string, pos: { x: number; y: number }) => {
      setIconPositions((prev) => {
        const next = { ...prev, [key]: pos };
        positionsRef.current = next;
        return next;
      });
      syncBodyPosition(key, pos);
    },
    [setIconPositions, syncBodyPosition]
  );

  const handleIconRelease = useCallback(
    (key: string, pos: { x: number; y: number }, velocity: { x: number; y: number }) => {
      const next = { ...positionsRef.current, [key]: pos };
      positionsRef.current = next;
      setIconPositions(next);
      const physics = physicsRef.current;
      if (physics) {
        const body = physics.bodies.get(key);
        physics.dragging = null;
        if (body) {
          const speed = Math.hypot(velocity.x, velocity.y);
          const flingScale = speed > 420 ? 1 / 55 : 1 / 160;
          Matter.Body.setVelocity(body, {
            x: Math.max(-24, Math.min(24, velocity.x * flingScale)),
            y: Math.max(-24, Math.min(24, velocity.y * flingScale)),
          });
          physics.dirty = true;
          saveIconLayout(next);
          return;
        }
      }
      saveIconLayout(next);
    },
    [saveIconLayout, setIconPositions]
  );

  const handleIconDragStart = useCallback((key: string) => {
    if (physicsRef.current) physicsRef.current.dragging = key;
  }, []);

  const handleIconDragEnd = useCallback((key: string) => {
    const physics = physicsRef.current;
    if (physics?.dragging === key) physics.dragging = null;
  }, []);

  useEffect(() => {
    if (!appearance.desktopPhysicsEnabled || surfaceSize.width <= 1 || surfaceSize.height <= 1) {
      if (physicsRef.current) {
        cancelAnimationFrame(physicsRef.current.raf);
        physicsRef.current = null;
      }
      return;
    }

    const engine = Matter.Engine.create({ enableSleeping: true });
    engine.gravity.y = appearance.desktopGravityMode === "on" ? 0.95 : 0;
    engine.gravity.x = 0;
    const bodies = new Map<string, Matter.Body>();
    const wallThickness = 80;
    const walls = [
      Matter.Bodies.rectangle(surfaceSize.width / 2, -wallThickness / 2, surfaceSize.width, wallThickness, { isStatic: true }),
      Matter.Bodies.rectangle(surfaceSize.width / 2, surfaceSize.height + wallThickness / 2, surfaceSize.width, wallThickness, { isStatic: true }),
      Matter.Bodies.rectangle(-wallThickness / 2, surfaceSize.height / 2, wallThickness, surfaceSize.height, { isStatic: true }),
      Matter.Bodies.rectangle(surfaceSize.width + wallThickness / 2, surfaceSize.height / 2, wallThickness, surfaceSize.height, { isStatic: true }),
    ];

    for (const def of visibleIcons) {
      const pos = positionsRef.current[def.key] ?? { x: def.defaultX, y: def.defaultY };
      const body = Matter.Bodies.rectangle(
        pos.x + ICON_W / 2,
        pos.y + ICON_H / 2,
        ICON_W,
        ICON_H,
        {
          restitution: 0.82,
          friction: 0.08,
          frictionAir: appearance.desktopGravityMode === "zero" ? 0.008 : 0.045,
          label: def.key,
        }
      );
      bodies.set(def.key, body);
    }

    Matter.Composite.add(engine.world, [...walls, ...bodies.values()]);

    const physics = {
      engine,
      bodies,
      raf: 0,
      dragging: null as string | null,
      dirty: false,
      stillFrames: 0,
    };
    physicsRef.current = physics;

    const tick = () => {
      Matter.Engine.update(engine, 1000 / 60);
      let maxSpeed = 0;
      const nextLayout: DesktopIconLayout = {};

      for (const [key, body] of bodies.entries()) {
        if (physics.dragging === key) continue;
        const pos = clampIconPosition(
          {
            x: body.position.x - ICON_W / 2,
            y: body.position.y - ICON_H / 2,
          },
          surfaceSize
        );
        nextLayout[key] = pos;
        maxSpeed = Math.max(maxSpeed, Math.hypot(body.velocity.x, body.velocity.y));
      }

      if (Object.keys(nextLayout).length > 0) {
        setIconPositions((prev) => {
          let changed = false;
          const merged = { ...prev };
          for (const [key, pos] of Object.entries(nextLayout)) {
            const old = prev[key];
            if (!old || Math.abs(old.x - pos.x) > 0.5 || Math.abs(old.y - pos.y) > 0.5) {
              merged[key] = pos;
              changed = true;
            }
          }
          if (changed) physics.dirty = true;
          if (changed) positionsRef.current = merged;
          return changed ? merged : prev;
        });
      }

      if (physics.dirty && !physics.dragging) {
        physics.stillFrames = maxSpeed < 0.06 ? physics.stillFrames + 1 : 0;
        if (physics.stillFrames > 45) {
          const settled: DesktopIconLayout = {};
          for (const [key, body] of bodies.entries()) {
            settled[key] = clampIconPosition(
              {
                x: body.position.x - ICON_W / 2,
                y: body.position.y - ICON_H / 2,
              },
              surfaceSize
            );
          }
          physics.dirty = false;
          physics.stillFrames = 0;
          saveIconLayoutRef.current(settled);
        }
      }

      physics.raf = requestAnimationFrame(tick);
    };

    physics.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(physics.raf);
      Matter.Composite.clear(engine.world, false);
      if (physicsRef.current === physics) physicsRef.current = null;
    };
  }, [
    appearance.desktopGravityMode,
    appearance.desktopPhysicsEnabled,
    setIconPositions,
    surfaceSize,
    visibleIconKey,
    visibleIcons,
  ]);

  return {
    handleIconDragStart,
    handleIconDragEnd,
    handleIconMove,
    handleIconRelease,
  };
}
