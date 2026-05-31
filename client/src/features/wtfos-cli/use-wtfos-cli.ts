import { useCallback, useMemo, useState } from "react";
import {
  parseCliInput,
  wtfOsCliBanner,
  wtfOsCliMotd,
  type WtfOsCliEntry,
  type WtfOsCliEntryKind,
  type WtfOsCliThemeId,
} from "@shared/wtfos-cli";
import { logClientSystemEvent } from "../../lib/system-log";
import type { DesktopAppKey } from "@shared/types";
import type { DesktopAppAvailability } from "../../routes/page-defs";
import { buildBrowserWtfOsCliCommands, createBrowserRemote, indexWtfOsCliCommands } from "./cli-runtime";
import { getStoredCliTheme, setStoredCliTheme } from "./interface-mode";
import type { WtfOsInterfaceMode } from "./interface-mode";

function createEntry(kind: WtfOsCliEntryKind, text: string): WtfOsCliEntry {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, kind, text };
}

export interface UseWtfOsCliOptions {
  navigate: (path: string) => void;
  setInterfaceMode: (mode: WtfOsInterfaceMode) => void;
  getInterfaceMode: () => WtfOsInterfaceMode;
  username: string | null;
  displayName: string | null;
  role: import("@shared/types").UserRoleInput;
  accessSurfaceIds: readonly string[];
  appAvailability: DesktopAppAvailability;
  bootMessage?: string;
  maxEntries?: number;
  eventPrefix?: "terminal" | "cli";
}

export function useWtfOsCli({
  navigate,
  setInterfaceMode,
  getInterfaceMode,
  username,
  displayName,
  role,
  accessSurfaceIds,
  appAvailability,
  bootMessage,
  maxEntries = 120,
  eventPrefix = "terminal",
}: UseWtfOsCliOptions) {
  const [themeId, setThemeIdState] = useState<WtfOsCliThemeId>(() => getStoredCliTheme());
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<WtfOsCliEntry[]>(() => [
    createEntry("system", bootMessage ?? wtfOsCliBanner()),
    createEntry("output", wtfOsCliMotd()),
  ]);

  const commandIndex = useMemo(
    () => indexWtfOsCliCommands(buildBrowserWtfOsCliCommands()),
    []
  );
  const commandList = useMemo(
    () => [...new Set([...commandIndex.values()].map((command) => command.name))].sort(),
    [commandIndex]
  );

  const appendEntry = useCallback(
    (kind: WtfOsCliEntryKind, text: string) => {
      if (!text) return;
      setEntries((current) => [...current, createEntry(kind, text)].slice(-maxEntries));
    },
    [maxEntries]
  );

  const clearEntries = useCallback(() => {
    setEntries([]);
  }, []);

  const setTheme = useCallback((nextThemeId: WtfOsCliThemeId) => {
    setThemeIdState(nextThemeId);
    setStoredCliTheme(nextThemeId);
  }, []);

  const remote = useMemo(
    () =>
      createBrowserRemote({
        role,
        accessSurfaceIds,
        apps: appAvailability,
      }),
    [accessSurfaceIds, appAvailability, role]
  );

  const runRawCommand = useCallback(
    async (raw: string) => {
      const parsed = parseCliInput(raw);
      if (!parsed) return;

      appendEntry("input", `> ${parsed.raw}`);
      logClientSystemEvent({
        eventType: `${eventPrefix}.command_executed`,
        metadata: { command: parsed.name, allowed: commandIndex.has(parsed.name) },
      });

      const command = commandIndex.get(parsed.name);
      if (!command) {
        appendEntry("error", `Unknown command: ${parsed.name}. Type help.`);
        return;
      }

      setBusy(true);
      try {
        const result = await command.run(
          {
            remote,
            navigate: (path) => {
              navigate(path);
              return `Opening ${path}`;
            },
            setInterfaceMode,
            getInterfaceMode,
            setTheme,
            getTheme: () => themeId,
            clearEntries,
            appendSystem: (text) => appendEntry("system", text),
            username,
            displayName,
            extraHelpCommands: ["desktop", "cli"],
          },
          parsed.args
        );
        if (result) appendEntry("output", result);
      } catch (error) {
        appendEntry(
          "error",
          error instanceof Error ? error.message : "Command failed"
        );
      } finally {
        setBusy(false);
      }
    },
    [
      appendEntry,
      clearEntries,
      commandIndex,
      displayName,
      eventPrefix,
      getInterfaceMode,
      navigate,
      accessSurfaceIds,
      appAvailability,
      remote,
      role,
      setInterfaceMode,
      setTheme,
      themeId,
      username,
    ]
  );

  return {
    entries,
    busy,
    themeId,
    commandList,
    runRawCommand,
    clearEntries,
    setTheme,
  };
}
