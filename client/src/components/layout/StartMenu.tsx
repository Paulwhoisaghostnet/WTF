import { useEffect, useMemo, useRef, useState, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { MenuList, MenuListItem, Separator } from "react95";
import { useLocation } from "wouter";
import { DESKTOP_APPS, type DesktopAppKey } from "@shared/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { useWindowManager } from "../../lib/window-context";
import { MOBILE, MOBILE_BP } from "../../global-styles";
import { PAGE_DEFS } from "../../routes/page-defs";
import {
  buildStartMenuEntries,
  filterStartMenuEntriesByQuery,
  type StartMenuGroup,
  type StartMenuItem,
} from "./start-menu-model";
import { Win95ContextMenu, type Win95ContextMenuEntry } from "./Win95ContextMenu";
import {
  DESKTOP_SHORTCUT_EVENT,
  serializeShortcutPayload,
  START_MENU_SHORTCUT_MIME,
  type StartMenuShortcutPayload,
} from "../../features/desktop/desktop-shortcuts";
import type { DesktopAppsResponse } from "@shared/desktop-apps";

const DISABLED_DESKTOP_APPS = Object.fromEntries(
  DESKTOP_APPS.map((key) => [key, false])
) as Record<DesktopAppKey, boolean>;

/* ─── Layout ──────────────────────────────────────── */

const MenuContainer = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 200;
  width: var(--wtf-menu-width, 258px);
  filter: drop-shadow(2px 3px 0 rgba(0, 0, 0, 0.58));
  border-radius: var(--wtf-menu-radius, 0);

  html[data-wtf-appearance-style="wtf-xp"] &,
  html[data-wtf-appearance-style="wtf-aqua"] &,
  html[data-wtf-appearance-style="wtf-zine"] & {
    filter: none;
    box-shadow: var(--wtf-menu-shadow, 2px 3px 0 rgba(0, 0, 0, 0.58));
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 3px solid #000000;
  }

  ${MOBILE} {
    width: calc(100vw - 8px);
    left: 4px;
    max-height: 70dvh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
`;

const SideBar = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--wtf-menu-sidebar-width, 28px);
  background:
    linear-gradient(to top, #000080, #1084d0 62%, #2fefef),
    #000080;
  display: flex;
  align-items: flex-end;
  padding-bottom: 8px;
  justify-content: center;
  border-radius: var(--wtf-menu-radius, 0) 0 0 var(--wtf-menu-radius, 0);

  html[data-wtf-appearance-style="wtf-xp"] & {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--wtf-active-title, #245edb) 60%, #ffffff), var(--wtf-active-title, #245edb) 48%, color-mix(in srgb, var(--wtf-active-title, #245edb) 70%, #000000)),
      var(--wtf-active-title, #245edb);
  }

  html[data-wtf-appearance-style="wtf-aqua"] & {
    display: none;
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    background:
      repeating-linear-gradient(-12deg, var(--wtf-active-title, #000080) 0 9px, color-mix(in srgb, var(--wtf-active-title, #000080) 70%, #ffffff) 9px 16px);
    border-right: 3px solid #000000;
  }

  ${MOBILE} { width: 22px; }
`;

const SideBarText = styled.span`
  color: white;
  font-weight: bold;
  font-size: 16px;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  letter-spacing: 2px;

  ${MOBILE} { font-size: 12px; letter-spacing: 1px; }
`;

const MenuContent = styled(MenuList)`
  padding-left: var(--wtf-menu-sidebar-width, 28px);
  width: 100%;
  overflow: visible;
  border-radius: var(--wtf-menu-radius, 0);

  html[data-wtf-appearance-style="wtf-aqua"] & {
    padding-left: 0;
    backdrop-filter: blur(16px);
  }

  ${MOBILE} {
    padding-left: 22px;
    max-height: 70dvh;
    overflow-y: auto;
  }
`;

const SearchPanel = styled.div`
  padding: 6px 7px 5px;
  border-bottom: 1px solid #808080;
  box-shadow: inset 0 -1px 0 #ffffff;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.38), rgba(0,0,0,0.04)),
    var(--wtf-button-face, #d7d7d7);

  html[data-wtf-appearance-style="wtf-zine"] & {
    border-bottom: 3px solid #000000;
    box-shadow: none;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  height: 28px;
  min-height: 28px !important;
  padding: 3px 7px;
  border: 2px inset #ffffff;
  background: #ffffff;
  color: #111111;
  font-size: 12px;
  border-radius: var(--wtf-control-radius, 0);

  &::placeholder {
    color: #606060;
  }
`;

const EmptySearch = styled.div`
  padding: 10px 8px;
  font-size: 12px;
  color: #404040;
`;

const MenuHint = styled.div`
  padding: 5px 8px 6px;
  border-top: 1px solid #808080;
  box-shadow: inset 0 1px 0 #ffffff;
  color: #404040;
  font-size: 10px;
  line-height: 1.25;

  html[data-wtf-appearance-style="wtf-zine"] & {
    border-top: 3px solid #000000;
    box-shadow: none;
    text-transform: uppercase;
  }
`;

/* ─── Menu items ──────────────────────────────────── */

const ItemRow = styled(MenuListItem)<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
  color: ${(p) => (p.$disabled ? "#808080" : "inherit")};
  text-shadow: ${(p) => (p.$disabled ? "1px 1px 0 #ffffff" : "inherit")};
  cursor: ${(p) => (p.$disabled ? "default" : "pointer")};
  min-height: var(--wtf-menu-item-min-height, 30px);
  border-radius: var(--wtf-control-radius, 0);

  &:hover {
    outline: ${(p) => (p.$disabled ? "none" : "1px dotted #ffffff")};
    outline-offset: -4px;
  }

  html[data-wtf-appearance-style="wtf-xp"] &:hover {
    outline: none;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.42), rgba(0,0,0,0.06)),
      var(--wtf-highlight-color, #000080);
    color: var(--wtf-active-title-text, #ffffff);
  }

  html[data-wtf-appearance-style="wtf-aqua"] &:hover {
    outline: none;
    background: color-mix(in srgb, var(--wtf-highlight-color, #000080) 82%, #ffffff);
    color: var(--wtf-active-title-text, #ffffff);
  }

  html[data-wtf-appearance-style="wtf-zine"] &:hover {
    outline: 2px solid #000000;
    outline-offset: -2px;
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0 #000000;
  }

  ${(p) =>
    p.$disabled
      ? `
        opacity: 0.68;
        pointer-events: auto;
      `
      : ""}

  ${MOBILE} {
    min-height: 40px;
    font-size: 14px;
    padding: 8px 12px;
  }
`;

const ItemIcon = styled.span`
  width: 20px;
  height: 20px;
  text-align: center;
  flex-shrink: 0;
  font-weight: 700;
  color: #000080;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #808080;
  background: #d7d7d7;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
  font-size: 11px;
  line-height: 1;
  border-radius: var(--wtf-control-radius, 0);

  html[data-wtf-appearance-style="wtf-xp"] &,
  html[data-wtf-appearance-style="wtf-aqua"] & {
    width: 24px;
    height: 24px;
  }

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 2px solid #000000;
    box-shadow: 2px 2px 0 #000000;
  }
`;

const ItemLabel = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SubArrow = styled.span`
  font-size: 10px;
  color: #000;
  margin-left: auto;
  flex-shrink: 0;
`;

/* ─── Submenu flyout ──────────────────────────────── */

const MAX_SUBMENU_COLUMN_ITEMS = 6;

const SubMenuWrap = styled.div`
  position: relative;
`;

const SubMenuFlyout = styled(MenuList)`
  position: absolute;
  left: 100%;
  bottom: 0;
  min-width: 190px;
  max-width: min(680px, calc(100vw - 248px));
  z-index: 210;
  box-shadow: var(--wtf-menu-shadow, 2px 2px 0 #000);
  border-radius: var(--wtf-menu-radius, 0);
  max-height: min(70vh, 500px);
  overflow: auto;

  html[data-wtf-appearance-style="wtf-zine"] & {
    border: 3px solid #000000;
  }

  ${MOBILE} {
    position: static;
    box-shadow: none;
    border-left: 3px solid #000080;
    margin-left: 8px;
    margin-bottom: 2px;
    min-width: 0;
    width: 100%;
  }
`;

const SubMenuColumns = styled.div`
  display: flex;
  align-items: stretch;
  max-width: 100%;

  ${MOBILE} {
    flex-direction: column;
  }
`;

const SubMenuColumn = styled.div`
  min-width: 190px;

  & + & {
    border-left: 1px solid #808080;
    box-shadow: inset 1px 0 0 #ffffff;
  }

  ${MOBILE} {
    min-width: 0;
    width: 100%;

    & + & {
      border-left: 0;
      box-shadow: none;
      border-top: 1px solid #808080;
    }
  }
`;

function chunkMenuItems(items: StartMenuItem[]) {
  const chunks: StartMenuItem[][] = [];
  for (let i = 0; i < items.length; i += MAX_SUBMENU_COLUMN_ITEMS) {
    chunks.push(items.slice(i, i + MAX_SUBMENU_COLUMN_ITEMS));
  }
  return chunks;
}

/* ─── SubMenu component ───────────────────────────── */

function MenuItemRow({
  item,
  onItemClick,
  onItemContextMenu,
}: {
  item: StartMenuItem;
  onItemClick: (path: string) => void;
  onItemContextMenu: (event: ReactMouseEvent, item: StartMenuItem) => void;
}) {
  const shortcutPayload: StartMenuShortcutPayload = {
    label: item.label,
    path: item.path,
    icon: item.icon,
  };

  return (
    <ItemRow
      $disabled={item.disabled}
      title={item.disabledReason ?? item.label}
      draggable={!item.disabled}
      onDragStart={(event) => {
        if (item.disabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(START_MENU_SHORTCUT_MIME, serializeShortcutPayload(shortcutPayload));
        event.dataTransfer.setData("text/plain", item.label);
      }}
      onContextMenu={(event) => onItemContextMenu(event, item)}
      onClick={(event) => {
        if (event.shiftKey) {
          onItemContextMenu(event, item);
          return;
        }
        if (!item.disabled) onItemClick(item.path);
      }}
    >
      <ItemIcon>{item.icon}</ItemIcon>
      <ItemLabel>{item.label}</ItemLabel>
    </ItemRow>
  );
}

function SubMenu({
  group,
  openKey,
  onHover,
  onClick,
  onItemClick,
  onItemContextMenu,
}: {
  group: StartMenuGroup;
  openKey: string | null;
  onHover: (key: string | null) => void;
  onClick: (key: string) => void;
  onItemClick: (path: string) => void;
  onItemContextMenu: (event: ReactMouseEvent, item: StartMenuItem) => void;
}) {
  const key = group.label;
  const isOpen = openKey === key;
  const columns = chunkMenuItems(group.items);

  return (
    <SubMenuWrap
      onMouseEnter={() => onHover(key)}
      onMouseLeave={() => onHover(null)}
    >
      <ItemRow onClick={() => onClick(key)}>
        <ItemIcon>{group.icon}</ItemIcon>
        <ItemLabel>{group.label}</ItemLabel>
        <SubArrow>▶</SubArrow>
      </ItemRow>

      {isOpen && (
        <SubMenuFlyout>
          <SubMenuColumns>
            {columns.map((column, columnIndex) => (
              <SubMenuColumn key={`${group.key}:column:${columnIndex}`}>
                {column.map((item) => (
                  <MenuItemRow
                    key={`${group.key}:${item.path}:${item.label}`}
                    item={item}
                    onItemClick={onItemClick}
                    onItemContextMenu={onItemContextMenu}
                  />
                ))}
              </SubMenuColumn>
            ))}
          </SubMenuColumns>
        </SubMenuFlyout>
      )}
    </SubMenuWrap>
  );
}

/* ─── StartMenu ───────────────────────────────────── */

interface StartMenuProps {
  onClose: () => void;
}

export function StartMenu({ onClose }: StartMenuProps) {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const wm = useWindowManager();
  const ref = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entries: Win95ContextMenuEntry[];
  } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const desktopAppsQuery = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () => api.get<DesktopAppsResponse>("/api/apps/desktop"),
    staleTime: 30_000,
  });

  const casinoStatusQuery = useQuery({
    queryKey: ["casino", "status"],
    queryFn: () =>
      api.get<{ membership: { active: boolean } }>("/api/casino/status"),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = "touches" in e ? e.touches[0]?.target : e.target;
      if (ref.current && !ref.current.contains(target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  const openWindow = useCallback(
    (path: string) => {
      wm.openPage(path);
      onClose();
    },
    [wm, onClose]
  );

  const isMobile =
    typeof window !== "undefined" && window.innerWidth <= MOBILE_BP;

  const handleHover = useCallback(
    (key: string | null) => {
      if (isMobile) return;
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (key) {
        hoverTimerRef.current = window.setTimeout(() => setOpenSub(key), 120);
      } else {
        hoverTimerRef.current = window.setTimeout(() => setOpenSub(null), 200);
      }
    },
    [isMobile]
  );

  const handleSubClick = useCallback(
    (key: string) => {
      setOpenSub((prev) => (prev === key ? null : key));
    },
    []
  );

  const requestDesktopShortcut = useCallback((item: StartMenuItem) => {
    if (item.disabled) return;
    window.dispatchEvent(
      new CustomEvent<StartMenuShortcutPayload>(DESKTOP_SHORTCUT_EVENT, {
        detail: {
          label: item.label,
          path: item.path,
          icon: item.icon,
        },
      })
    );
  }, []);

  const handleItemContextMenu = useCallback(
    (event: ReactMouseEvent, item: StartMenuItem) => {
      event.preventDefault();
      event.stopPropagation();
      const entries: Win95ContextMenuEntry[] = [
        {
          label: "Open",
          disabled: item.disabled,
          onSelect: () => openWindow(item.path),
        },
        {
          label: "Create Desktop Shortcut",
          disabled: item.disabled,
          onSelect: () => requestDesktopShortcut(item),
        },
      ];
      if (item.disabledReason) {
        entries.push(
          { kind: "separator" },
          {
            label: item.disabledReason,
            disabled: true,
            onSelect: () => {},
          }
        );
      }
      setContextMenu({ x: event.clientX, y: event.clientY, entries });
    },
    [openWindow, requestDesktopShortcut]
  );

  const appAvailability = desktopAppsQuery.data?.apps ?? DISABLED_DESKTOP_APPS;
  const roleInput = user?.roles ?? user?.role ?? null;
  const accessSurfaceIds = user?.wtfOsAccess?.surfaceIds ?? [];
  const rawMenuEntries = useMemo(
    () =>
      buildStartMenuEntries(PAGE_DEFS, appAvailability, roleInput, {
        casinoMembershipActive: casinoStatusQuery.data?.membership.active,
        accessSurfaceIds,
      }),
    [accessSurfaceIds, appAvailability, casinoStatusQuery.data?.membership.active, roleInput]
  );
  const menuEntries = useMemo(
    () => filterStartMenuEntriesByQuery(rawMenuEntries, query),
    [query, rawMenuEntries]
  );

  useEffect(() => {
    if (query.trim()) {
      const firstGroup = menuEntries.find((entry) => entry.kind === "group");
      setOpenSub(firstGroup?.kind === "group" ? firstGroup.group.label : null);
    }
  }, [menuEntries, query]);

  return (
    <MenuContainer ref={ref}>
      <SideBar>
        <SideBarText>wtfOS</SideBarText>
      </SideBar>
      <MenuContent>
        <SearchPanel>
          <SearchInput
            aria-label="Find stuff"
            autoFocus
            placeholder="Find stuff..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (query) {
                  setQuery("");
                } else {
                  onClose();
                }
              }
            }}
          />
        </SearchPanel>
        {menuEntries.map((entry, index) => {
          if (entry.kind === "separator") return <Separator key={`separator-${index}`} />;
          if (entry.kind === "item") {
            return (
              <MenuItemRow
                key={`item-${entry.item.path}`}
                item={entry.item}
                onItemClick={openWindow}
                onItemContextMenu={handleItemContextMenu}
              />
            );
          }
          return (
            <SubMenu
              key={entry.group.key}
              group={entry.group}
              openKey={openSub}
              onHover={handleHover}
              onClick={handleSubClick}
              onItemClick={openWindow}
              onItemContextMenu={handleItemContextMenu}
            />
          );
        })}

        {menuEntries.length === 0 && (
          <EmptySearch>
            {user
              ? "No matching stuff. Try Mission, Wallet, Daily, Media, or Admin."
              : "No matching stuff here. Log in for account, daily, wallet, and admin tools."}
          </EmptySearch>
        )}

        {menuEntries.length > 0 && <Separator />}

        {/* ── Session ── */}
        {user ? (
          <ItemRow
            onClick={async () => {
              try {
                await logout();
              } finally {
                setLocation("/");
                onClose();
              }
            }}
          >
            <ItemIcon>🪦</ItemIcon>
            <ItemLabel>Log Out</ItemLabel>
          </ItemRow>
        ) : (
          <ItemRow
            onClick={() => {
              setLocation("/login");
              onClose();
            }}
          >
            <ItemIcon>🎟️</ItemIcon>
            <ItemLabel>Log In</ItemLabel>
          </ItemRow>
        )}
        <MenuHint>Type to filter. Right-click or Shift-click an app for shortcuts.</MenuHint>
      </MenuContent>
      {contextMenu && (
        <Win95ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entries={contextMenu.entries}
          onClose={() => setContextMenu(null)}
        />
      )}
    </MenuContainer>
  );
}
