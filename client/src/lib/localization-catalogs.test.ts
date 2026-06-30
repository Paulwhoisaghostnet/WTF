import assert from "node:assert/strict";
import { test } from "node:test";
import {
  catalogs,
  enUSCatalog,
  esESCatalog,
  pseudoCatalog,
  systemTextMessageIds,
  type MessageId,
} from "./localization-catalogs";

test("locale catalogs cover every English source message id", () => {
  const englishIds = Object.keys(enUSCatalog).sort();
  for (const [locale, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(
      Object.keys(catalog).sort(),
      englishIds,
      `${locale} catalog must have the same message ids as en-US`
    );
  }
});

test("Spanish shell catalog translates the curated first-pass OS surface", () => {
  const curatedIds: MessageId[] = [
    "appWindow.close",
    "startMenu.searchPlaceholder",
    "commandPalette.command.themeBuilder",
    "desktop.context.createShortcut",
    "taskbar.walletConnect",
    "systemSettings.panel.language",
    "systemSettings.language.detail",
    "settingsCard.appearance.label",
    "themeBuilder.section.chatDefaults",
    "themeBuilder.chat.defaultWimFont",
    "themeBuilder.upload.help",
    "themeBuilder.pet.action.feed",
    "themeBuilder.agents.empty",
    "route.themeBuilder.title",
  ];

  for (const id of curatedIds) {
    assert.notEqual(esESCatalog[id], enUSCatalog[id], `${id} must not inherit English`);
  }
});

test("pseudo-locale expands system strings for layout testing", () => {
  assert.match(pseudoCatalog["systemSettings.title"], /^\[!! /);
  assert.match(pseudoCatalog["taskbar.walletConnect"], /Cónnéct Wállét/i);
  assert.ok(
    pseudoCatalog["systemSettings.language.detail"].length >
      enUSCatalog["systemSettings.language.detail"].length
  );
});

test("exact system text map covers shell labels without sweeping user-authored data", () => {
  assert.equal(systemTextMessageIds["Theme Builder"], "route.themeBuilder.title");
  assert.equal(systemTextMessageIds["Open Theme Builder"], "commandPalette.command.themeBuilder");
  assert.equal(systemTextMessageIds["Casino membership card required"], "startMenu.disabled.casino");

  for (const userAuthoredExample of [
    "My Room",
    "Desktop Agent",
    "Media #1",
    "Token",
    "Sample User",
  ]) {
    assert.equal(systemTextMessageIds[userAuthoredExample], undefined);
  }
});
