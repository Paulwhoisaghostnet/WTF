import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const routesRegistry = readFileSync("server/routes.ts", "utf8");
const pageRegistry = readFileSync("client/src/routes/page-defs.ts", "utf8");

describe("WTF ecosystem wiring", () => {
  it("mounts every phase route module used by the client and bot", () => {
    const expectedRoutes = [
      "attendanceRoutes",
      "calendarRoutes",
      "collectionFactoryRoutes",
      "mintPortalRoutes",
      "operatorWalletRoutes",
    ];

    for (const route of expectedRoutes) {
      assert.match(routesRegistry, new RegExp(`app\\.use\\(${route}\\)`));
    }
  });

  it("registers desktop pages for mounted feature routes", () => {
    const expectedPages = [
      "/calendar",
      "/mint-portal",
      "/contract-factory",
      "/operator-wallet",
      "/control-board",
    ];

    for (const page of expectedPages) {
      assert.match(pageRegistry, new RegExp(`pattern: "${page}"`));
    }
  });

  it("keeps the Control Board page backed by its server contracts", () => {
    const controlBoardRoutes = readFileSync("server/routes/control-board.ts", "utf8");
    const schema = readFileSync("shared/schema-gameshow.ts", "utf8");

    const expectedServerRoutes = [
      "/api/control-board/feed",
      "/api/seasons/:id/contestants",
      "/api/contestants/:id/eliminate",
      "/api/contestants/:id/promote-from-reserve",
      "/api/rounds/:id/run-rule",
      "/api/rounds/:id/advance",
      "/api/rounds/:id/elimination-rule",
    ];

    for (const route of expectedServerRoutes) {
      assert.match(controlBoardRoutes, new RegExp(route.replaceAll("/", "\\/")));
    }
    assert.match(schema, /export const roundEliminations = pgTable\(\s*"round_eliminations"/);
  });

  it("keeps desktop UI interactions connected to challenge event ingestion", () => {
    const desktopShell = readFileSync("client/src/components/layout/Desktop.tsx", "utf8");
    const desktopSettings = readFileSync("client/src/pages/DesktopSettings.tsx", "utf8");
    const desktopItemActors = readFileSync(
      "client/src/features/desktop/items/ItemActors.tsx",
      "utf8"
    );
    const desktopRoutes = readFileSync("server/routes/desktop.ts", "utf8");

    assert.match(desktopRoutes, /router\.post\("\/api\/desktop\/events"/);
    assert.match(desktopRoutes, /ingestSystemEvent/);
    assert.match(desktopShell, /handleDesktopIconOpen/);
    assert.match(desktopShell, /onInteract=\{handleDesktopItemInteract\}/);
    assert.match(desktopShell, /desktop\.icon\.moved/);
    assert.match(desktopShell, /desktop\.tool\.selected/);
    assert.match(desktopSettings, /desktop\.icon_layout\.reset/);
    assert.match(desktopItemActors, /onInteract\?\.\(item, "jukebox_open"\)/);
    assert.match(desktopItemActors, /portal_gun_equip/);
  });

  it("classifies critical disk usage before warning disk usage", () => {
    assert.match(
      routesRegistry,
      /const status = usage >= 1\.0\s+\? "crit"\s+: usage >= 0\.9\s+\? "warn"/
    );
  });
});
