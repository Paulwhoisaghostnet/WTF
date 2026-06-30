import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { canOpenAppsForRole, type UserRoleInput } from "@shared/types";
import { PAGE_DEFS } from "../../routes/page-defs";
import { logClientSystemEvent } from "../../lib/system-log";
import { useLocalization, type TranslateFn } from "../../lib/localization";
import {
  buildCommandPaletteCommands,
  filterCommandPaletteCommands,
  type CommandPaletteCategory,
  type CommandPaletteCommand,
} from "../../features/command-palette/command-palette-model";
import type { DesktopAppAvailability } from "../../routes/page-defs";

interface CommandPaletteProps {
  role: UserRoleInput;
  accessSurfaceIds?: readonly string[];
  appAvailability?: DesktopAppAvailability;
  navigate: (path: string) => void;
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9200;
  display: grid;
  place-items: start center;
  padding: 12vh 12px 12px;
  background: rgba(0, 0, 0, 0.18);
`;

const Dialog = styled.div`
  width: min(640px, calc(100vw - 24px));
  max-height: min(620px, calc(100vh - 40px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 2px outset #dfdfdf;
  background: #c0c0c0;
  box-shadow: 3px 3px 0 #000000;
  color: #111111;
`;

const SearchRow = styled.label`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 2px solid #808080;
  box-shadow: inset 0 -1px 0 #ffffff;
`;

const SearchGlyph = styled.span`
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #808080;
  background: #eeeeee;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
`;

const Input = styled.input`
  width: 100%;
  min-width: 0;
  border: 2px inset #dfdfdf;
  background: #ffffff;
  padding: 6px 8px;
  font: inherit;
`;

const Results = styled.div`
  min-height: 0;
  overflow: auto;
  padding: 6px;
  display: grid;
  gap: 4px;
`;

const ResultButton = styled.button<{ $active?: boolean }>`
  min-height: 44px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 1px solid ${(p) => (p.$active ? "#000080" : "#808080")};
  background: ${(p) => (p.$active ? "#000080" : "#ffffff")};
  color: ${(p) => (p.$active ? "#ffffff" : "#111111")};
  padding: 6px 8px;
  text-align: left;
  font: inherit;
  cursor: pointer;
`;

const Label = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: bold;
`;

const Path = styled.div`
  min-width: 0;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--wtf-type-caption, 13px);
`;

const Category = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  text-transform: uppercase;
`;

const Empty = styled.div`
  padding: 18px;
  text-align: center;
  color: #333333;
`;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function categoryLabel(category: CommandPaletteCategory, t: TranslateFn): string {
  if (category === "wallet") return t("commandPalette.category.wallet");
  if (category === "reward") return t("commandPalette.category.reward");
  if (category === "media") return t("commandPalette.category.media");
  if (category === "system") return t("commandPalette.category.system");
  if (category === "admin") return t("commandPalette.category.admin");
  if (category === "app") return t("commandPalette.category.app");
  return t("commandPalette.category.route");
}

function categoryGlyph(category: CommandPaletteCategory): string {
  if (category === "wallet") return "WA";
  if (category === "reward") return "RW";
  if (category === "media") return "MD";
  if (category === "system") return "OS";
  if (category === "admin") return "AD";
  if (category === "app") return "AP";
  return "GO";
}

export function CommandPalette({
  role,
  accessSurfaceIds = [],
  appAvailability = {},
  navigate,
}: CommandPaletteProps) {
  const { t, translateSystemText } = useLocalization();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const appAccessAllowed = canOpenAppsForRole(role);
  const commands = useMemo(
    () => buildCommandPaletteCommands(PAGE_DEFS, role, accessSurfaceIds, appAvailability),
    [accessSurfaceIds, appAvailability, role]
  );
  const localizedCommands = useMemo(
    () =>
      commands.map((command) => ({
        ...command,
        label: translateSystemText(command.label),
      })),
    [commands, translateSystemText]
  );
  const results = useMemo(
    () => filterCommandPaletteCommands(localizedCommands, query),
    [localizedCommands, query]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!appAccessAllowed) return;
        if (isEditableTarget(event.target) && !open) return;
        event.preventDefault();
        setOpen((current) => {
          const next = !current;
          if (next) {
            logClientSystemEvent({
              eventType: "command_palette.opened",
              metadata: { source: "keyboard" },
            });
          }
          return next;
        });
        return;
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appAccessAllowed, open]);

  useEffect(() => {
    if (!appAccessAllowed) setOpen(false);
  }, [appAccessAllowed]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const runCommand = (command: CommandPaletteCommand) => {
    logClientSystemEvent({
      eventType: "command_palette.executed",
      metadata: {
        commandId: command.id,
        category: command.category,
        path: command.path,
      },
    });
    setOpen(false);
    setQuery("");
    navigate(command.path);
  };

  return (
    <Overlay data-testid="command-palette-overlay" onMouseDown={() => setOpen(false)}>
      <Dialog
        role="dialog"
        aria-label={t("commandPalette.title")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <SearchRow>
          <SearchGlyph>MC</SearchGlyph>
          <Input
            ref={inputRef}
            aria-label={t("commandPalette.searchLabel")}
            value={query}
            placeholder={t("commandPalette.placeholder")}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                runCommand(results[activeIndex]);
              }
            }}
          />
        </SearchRow>
        <Results>
          {results.length === 0 ? (
            <Empty>{t("common.noCommands")}</Empty>
          ) : (
            results.map((command, index) => (
              <ResultButton
                key={command.id}
                $active={index === activeIndex}
                data-testid={`command-palette-command-${command.id}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runCommand(command)}
              >
                <SearchGlyph>{categoryGlyph(command.category)}</SearchGlyph>
                <div>
                  <Label>{command.label}</Label>
                  <Path>{command.path}</Path>
                </div>
                <Category>{categoryLabel(command.category, t)}</Category>
              </ResultButton>
            ))
          )}
        </Results>
      </Dialog>
    </Overlay>
  );
}
