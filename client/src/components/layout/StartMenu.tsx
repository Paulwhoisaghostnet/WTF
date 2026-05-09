import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { MenuList, MenuListItem, Separator } from "react95";
import { useLocation } from "wouter";
import type { DesktopAppKey } from "@shared/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { useWindowManager } from "../../lib/window-context";
import { MOBILE, MOBILE_BP } from "../../global-styles";
import {
  filterStartMenuGroup,
  isStartMenuItemEnabled,
  type StartMenuAppAvailability,
} from "./start-menu-app-gates";

/* ─── Layout ──────────────────────────────────────── */

const MenuContainer = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 200;
  width: 230px;

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
  width: 28px;
  background: linear-gradient(to top, #000080, #1084d0);
  display: flex;
  align-items: flex-end;
  padding-bottom: 8px;
  justify-content: center;

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
  padding-left: 28px;
  width: 100%;

  ${MOBILE} { padding-left: 22px; }
`;

/* ─── Menu items ──────────────────────────────────── */

const ItemRow = styled(MenuListItem)`
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;

  ${MOBILE} {
    min-height: 40px;
    font-size: 14px;
    padding: 8px 12px;
  }
`;

const ItemIcon = styled.span`
  font-size: 14px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
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

const SubMenuWrap = styled.div`
  position: relative;
`;

const SubMenuFlyout = styled(MenuList)`
  position: absolute;
  left: 100%;
  bottom: 0;
  min-width: 190px;
  z-index: 210;
  box-shadow: 2px 2px 0 #000;

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

/* ─── Data ────────────────────────────────────────── */

interface MenuItem {
  label: string;
  path: string;
  icon: string;
}

interface MenuGroup {
  label: string;
  icon: string;
  items: MenuItem[];
}

const gameGroup: MenuGroup = {
  label: "Gameshow",
  icon: "🎪",
  items: [
    { label: "Rounds", path: "/rounds", icon: "🎰" },
    { label: "Challenges", path: "/challenges", icon: "💀" },
    { label: "Side Quests", path: "/side-quests", icon: "🐹" },
  ],
};

const socialGroup: MenuGroup = {
  label: "Social",
  icon: "🐦‍⬛",
  items: [
    { label: "Inbox", path: "/messages", icon: "👻" },
    { label: "Message Board", path: "/messageboard", icon: "🧼" },
    { label: "Dicksword", path: "/dicksword", icon: "💬" },
    { label: "I Hate Telegram", path: "/i-hate-telegram", icon: "TG" },
  ],
};

const marketGroup: MenuGroup = {
  label: "On Chain",
  icon: "🏴‍☠️",
  items: [
    { label: "On Chain Market", path: "/marketplace", icon: "⚓" },
    { label: "Trade Boards", path: "/trade-boards", icon: "🃏" },
    { label: "Club Dues", path: "/dues", icon: "DU" },
    { label: "Swap", path: "/swap", icon: "🦴" },
  ],
};

const casinoGroup: MenuGroup = {
  label: "Casino",
  icon: "$",
  items: [
    { label: "WTF Casino", path: "/casino", icon: "$" },
    { label: "WTF Arcade", path: "/arcade", icon: "AR" },
    { label: "My Games", path: "/console", icon: "CN" },
  ],
};

const myFilesGroup: MenuGroup = {
  label: "My Files",
  icon: "📂",
  items: [
    { label: "My Videos", path: "/my-videos", icon: "📼" },
    { label: "My Photos", path: "/my-photos", icon: "🖼️" },
    { label: "My Music", path: "/my-music", icon: "🎵" },
    { label: "My Gallery", path: "/my-gallery", icon: "🖌️" },
    { label: "Studio", path: "/studio", icon: "🎨" },
    { label: "Game Studio", path: "/game-studio", icon: "🧩" },
    { label: "Nikshumika Paint", path: "/tools/nikshumika-paint", icon: "🎨" },
    { label: "Kandinsky Composer", path: "/tools/kandinsky-composer", icon: "🖼️" },
    { label: "Winamp Bootloader", path: "/tezamp/winamp-bootloader", icon: "🎛️" },
  ],
};

const browseGroup: MenuGroup = {
  label: "Browse",
  icon: "🕸️",
  items: [
    { label: "Leaderboard", path: "/leaderboard", icon: "🏆" },
    { label: "Gallery", path: "/gallery", icon: "🖼️" },
    { label: "Links", path: "/links", icon: "⛓️" },
    { label: "FAQ", path: "/faq", icon: "🐸" },
  ],
};

/* ─── SubMenu component ───────────────────────────── */

function SubMenu({
  group,
  openKey,
  onHover,
  onClick,
  onItemClick,
}: {
  group: MenuGroup;
  openKey: string | null;
  onHover: (key: string | null) => void;
  onClick: (key: string) => void;
  onItemClick: (path: string) => void;
}) {
  const key = group.label;
  const isOpen = openKey === key;

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
          {group.items.map((item) => (
            <ItemRow key={item.path} onClick={() => onItemClick(item.path)}>
              <ItemIcon>{item.icon}</ItemIcon>
              <ItemLabel>{item.label}</ItemLabel>
            </ItemRow>
          ))}
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
  const { user, isAdmin, logout } = useAuth();
  const wm = useWindowManager();
  const ref = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const desktopAppsQuery = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () =>
      api.get<{ apps: Record<DesktopAppKey, boolean> }>("/api/apps/desktop"),
    staleTime: 30_000,
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

  const appAvailability: StartMenuAppAvailability = desktopAppsQuery.data?.apps ?? {};
  const showWtfIam = isStartMenuItemEnabled("/wtfiam", appAvailability);
  const authGroups = useMemo(
    () =>
      [gameGroup, socialGroup, marketGroup, casinoGroup, myFilesGroup]
        .map((group) => filterStartMenuGroup(group, appAvailability))
        .filter((group): group is MenuGroup => Boolean(group)),
    [appAvailability]
  );
  const gatedBrowseGroup = useMemo(
    () => filterStartMenuGroup(browseGroup, appAvailability),
    [appAvailability]
  );

  return (
    <MenuContainer ref={ref}>
      <SideBar>
        <SideBarText>WTF Gameshow</SideBarText>
      </SideBar>
      <MenuContent>
        {/* ── Authenticated: grouped items ── */}
        {user && (
          <>
            <ItemRow onClick={() => openWindow("/dashboard")}>
              <ItemIcon>🔮</ItemIcon>
              <ItemLabel>Dashboard</ItemLabel>
            </ItemRow>
            <Separator />

            {showWtfIam && (
              <ItemRow onClick={() => openWindow("/wtfiam")}>
                <ItemIcon>🛍️</ItemIcon>
                <ItemLabel>WTF In-App Marketplace</ItemLabel>
              </ItemRow>
            )}

            {authGroups.map((group) => (
              <SubMenu
                key={group.label}
                group={group}
                openKey={openSub}
                onHover={handleHover}
                onClick={handleSubClick}
                onItemClick={openWindow}
              />
            ))}
            <Separator />

            <ItemRow onClick={() => openWindow("/profile")}>
              <ItemIcon>💅</ItemIcon>
              <ItemLabel>Profile</ItemLabel>
            </ItemRow>
            <ItemRow onClick={() => openWindow("/desktop-settings")}>
              <ItemIcon>🖥️</ItemIcon>
              <ItemLabel>System Appearance</ItemLabel>
            </ItemRow>
            <Separator />
          </>
        )}

        {/* ── Admin ── */}
        {isAdmin && (
          <>
            <ItemRow onClick={() => openWindow("/admin")}>
              <ItemIcon>☠️</ItemIcon>
              <ItemLabel>Admin Panel</ItemLabel>
            </ItemRow>
            <Separator />
          </>
        )}

        {/* ── Browse (public) ── */}
        {gatedBrowseGroup && (
          <>
            <SubMenu
              group={gatedBrowseGroup}
              openKey={openSub}
              onHover={handleHover}
              onClick={handleSubClick}
              onItemClick={openWindow}
            />
            <Separator />
          </>
        )}

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
      </MenuContent>
    </MenuContainer>
  );
}
