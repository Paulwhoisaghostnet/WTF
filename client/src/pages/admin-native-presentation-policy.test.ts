import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controlBoardSource = readFileSync("client/src/pages/ControlBoard.tsx", "utf8");
const backupManagerSource = readFileSync("client/src/pages/BackupManager.tsx", "utf8");
const contractFactorySource = readFileSync("client/src/pages/ContractFactory.tsx", "utf8");
const operatorWalletSource = readFileSync("client/src/pages/OperatorWallet.tsx", "utf8");
const uxLabSource = readFileSync("client/src/pages/UxLab.tsx", "utf8");
const collectionWorkspaceSource = readFileSync(
  "client/src/features/ux-lab/CollectionWorkspace.tsx",
  "utf8"
);

const nativeAdminSurfaces = [
  {
    label: "Control Board",
    source: controlBoardSource,
    host: "data-control-board-presentation-host={presentation.host}",
    hostSelector: "[data-control-board-presentation-host=\"gamma\"]",
    surface: "data-control-board-surface=\"gameshow-admin\"",
    regions: ["surface", "season-row", "tabs", "tab-body", "contestant-table"],
  },
  {
    label: "Backup Manager",
    source: backupManagerSource,
    host: "data-backup-manager-presentation-host={presentation.host}",
    hostSelector: "[data-backup-manager-presentation-host=\"gamma\"]",
    surface: "data-backup-manager-surface=\"restore-proof\"",
    regions: ["surface", "status-grid", "status-cell", "actions", "panel", "row"],
  },
  {
    label: "Contract Factory",
    source: contractFactorySource,
    host: "data-contract-factory-presentation-host={presentation.host}",
    hostSelector: "[data-contract-factory-presentation-host=\"gamma\"]",
    surface: "data-contract-factory-surface=\"factory\"",
    regions: ["surface", "tabs", "deploy-tab", "panel", "step-card", "table"],
  },
  {
    label: "Operator Wallet",
    source: operatorWalletSource,
    host: "data-operator-wallet-presentation-host={presentation.host}",
    hostSelector: "[data-operator-wallet-presentation-host=\"gamma\"]",
    surface: "data-operator-wallet-surface=\"operator-wallet\"",
    regions: ["surface", "panel", "row", "actions", "table", "separator"],
  },
  {
    label: "UX Lab",
    source: uxLabSource,
    host: "data-ux-lab-presentation-host={presentation.host}",
    hostSelector: "[data-ux-lab-presentation-host=\"gamma\"]",
    surface: "data-ux-lab-surface=\"collection-workspace\"",
    regions: ["workspace"],
  },
];

test("native admin routes expose Gamma-aware owner boundaries", () => {
  for (const surface of nativeAdminSurfaces) {
    assert.match(surface.source, /usePresentationShell/, surface.label);
    assert.match(surface.source, new RegExp(surface.host.replace(/[{}.[\]"()-]/g, "\\$&")), surface.label);
    assert.match(surface.source, new RegExp(surface.surface.replace(/[{}.[\]"()-]/g, "\\$&")), surface.label);
    assert.match(surface.source, new RegExp(surface.hostSelector.replace(/[{}.[\]"()-]/g, "\\$&")), surface.label);

    for (const region of surface.regions) {
      assert.match(surface.source, new RegExp(`data-[a-z-]+-region="${region}"`), `${surface.label} ${region}`);
    }
  }
});

test("native admin Gamma chrome follows the operational visual contract", () => {
  for (const { label, source } of nativeAdminSurfaces) {
    assert.match(source, /background:\s*#070706/, label);
    assert.match(source, /color:\s*#f2ead9/, label);
    assert.match(source, /#00d2ff/, label);
    assert.match(source, /background-image:\s*none/, label);
    assert.match(source, /box-shadow:\s*none/, label);
    assert.match(source, /border-radius:\s*6px/, label);
  }
});

test("native admin routes keep shared APIs and only wrap browser route handoffs", () => {
  assert.match(backupManagerSource, /\/api\/cockpit\/backup\/restore-proof/);
  assert.match(backupManagerSource, /presentationRouteHref\(path,\s*presentation\.host\)/);
  assert.match(controlBoardSource, /\/api\/control-board\/feed/);
  assert.match(contractFactorySource, /\/api\/factory\/templates/);
  assert.match(contractFactorySource, /\/api\/factory\/deploy/);
  assert.match(operatorWalletSource, /\/api\/operator-wallet\/summary/);
  assert.match(operatorWalletSource, /\/api\/operator-wallet\/disburse\/run/);
  assert.match(collectionWorkspaceSource, /presentationRouteHref\(path,\s*presentation\.host\)/);
  assert.doesNotMatch(
    [
      controlBoardSource,
      backupManagerSource,
      contractFactorySource,
      operatorWalletSource,
      uxLabSource,
      collectionWorkspaceSource,
    ].join("\n"),
    /\/api\/gamma/
  );
});
