import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const desktopShellPath = "client/src/components/layout/Desktop.tsx";
const desktopShell = readFileSync(desktopShellPath, "utf8");
const desktopShellLines = desktopShell.split("\n").length;

test("desktop shell delegates desktop actors and effects to feature modules", () => {
  assert.ok(desktopShellLines < 1500, `Desktop.tsx has ${desktopShellLines} lines`);

  for (const importPath of [
    "../../features/desktop/CustomCursor",
    "../../features/desktop/DesktopIcons",
    "../../features/desktop/DesktopPet",
    "../../features/desktop/SundayGrass",
    "../../features/desktop/useDesktopPhysics",
  ]) {
    assert.match(desktopShell, new RegExp(importPath.replaceAll("/", "\\/")));
  }
});

test("desktop feature modules own extracted cursor grass icons physics and pet domains", () => {
  for (const path of [
    "client/src/features/desktop/CustomCursor.tsx",
    "client/src/features/desktop/DesktopIcons.tsx",
    "client/src/features/desktop/DesktopPet.tsx",
    "client/src/features/desktop/SundayGrass.tsx",
    "client/src/features/desktop/useDesktopPhysics.ts",
    "client/src/features/desktop/geometry.ts",
    "client/src/features/desktop/items/useDesktopItemSimulation.ts",
    "client/src/features/desktop/pet/useDesktopPetLocomotion.ts",
    "client/src/features/desktop/toys/useDesktopToySimulation.ts",
    "client/src/features/desktop/world/useDesktopWorldGateway.ts",
  ]) {
    assert.ok(existsSync(path), `${path} must exist`);
  }
});
