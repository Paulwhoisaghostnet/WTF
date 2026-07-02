import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsSource = readFileSync("client/src/pages/SystemSettings.tsx", "utf8");

test("System Settings route exposes a Gamma-aware presentation boundary", () => {
  assert.match(settingsSource, /usePresentationShell/);
  assert.match(settingsSource, /data-system-settings-presentation-host=\{presentation\.host\}/);
  assert.match(settingsSource, /data-system-settings-surface="settings"/);
  assert.match(settingsSource, /data-system-settings-region="surface"/);
  assert.match(settingsSource, /\[data-system-settings-presentation-host="gamma"\]/);
});

test("System Settings Gamma chrome covers hub cards status interface and boundary panels", () => {
  for (const region of [
    "status-grid",
    "status-cell",
    "separator",
    "panel",
    "card-grid",
    "card",
    "icon",
    "open-button",
    "actions",
    "mode-button",
  ]) {
    assert.match(settingsSource, new RegExp(`data-system-settings-region="${region}"`));
  }

  assert.match(settingsSource, /data-system-settings-card=\{setting\.id\}/);
  for (const id of ["profile", "subdomains"]) {
    assert.match(settingsSource, new RegExp(`id: "${id}"`));
  }
  for (const card of ["interface", "boundary"]) {
    assert.match(settingsSource, new RegExp(`data-system-settings-card="${card}"`));
  }

  assert.match(settingsSource, /background-image:\s*none/);
  assert.match(settingsSource, /box-shadow:\s*none/);
  assert.match(settingsSource, /text-shadow:\s*none/);
  assert.match(settingsSource, /border-radius:\s*6px/);
  assert.match(settingsSource, /#00d2ff/);
});

test("System Settings keeps shared settings events and owner-route behavior raw", () => {
  assert.match(settingsSource, /eventType:\s*"system_settings\.viewed"/);
  assert.match(settingsSource, /eventType:\s*"system_settings\.opened"/);
  assert.match(settingsSource, /eventType:\s*"system_settings\.interface_mode_changed"/);
  assert.match(settingsSource, /presentationRouteHref\(setting\.route,\s*presentation\.host\)/);
  assert.match(settingsSource, /presentationRouteHref\("\/cli",\s*presentation\.host\)/);
  assert.match(settingsSource, /presentationRouteHref\("\/mission-control",\s*presentation\.host\)/);
  assert.doesNotMatch(settingsSource, /\/api\/gamma/);
});

test("System Settings owns the Language & Region locale control", () => {
  assert.match(settingsSource, /useLocalization/);
  assert.match(settingsSource, /data-system-settings-panel="language"/);
  assert.match(settingsSource, /data-system-settings-card="language-region"/);
  assert.match(settingsSource, /systemSettings\.language\.label/);
  assert.match(settingsSource, /localeOptions\.map/);
  assert.match(settingsSource, /setLocale\(nextLocale\)/);
  assert.match(settingsSource, /eventType:\s*"system_settings\.language_changed"/);
});
