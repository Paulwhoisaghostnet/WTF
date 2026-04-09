import { useEffect, useRef } from "react";
import styled from "styled-components";
import { MenuList, MenuListItem, Separator } from "react95";
import { useLocation } from "wouter";
import { useAuth } from "../../lib/auth-context";
import { useWindowManager } from "../../lib/window-context";
import { MOBILE } from "../../global-styles";

const MenuContainer = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 200;
  width: 220px;

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

  ${MOBILE} {
    padding-left: 22px;
  }
`;

const TouchMenuItem = styled(MenuListItem)`
  ${MOBILE} {
    min-height: 40px;
    font-size: 14px;
    padding: 8px 12px;
  }
`;

const publicItems = [
  { label: "Leaderboard", path: "/leaderboard" },
  { label: "Gallery", path: "/gallery" },
  { label: "Message Board", path: "/messageboard" },
  { label: "Links", path: "/links" },
  { label: "FAQ", path: "/faq" },
];

const authItems = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Rounds", path: "/rounds" },
  { label: "Challenges", path: "/challenges" },
  { label: "Side Quests", path: "/side-quests" },
  { label: "Inbox", path: "/messages" },
  { label: "Marketplace", path: "/marketplace" },
  { label: "Trade Boards", path: "/trade-boards" },
  { label: "Swap", path: "/swap" },
  { label: "Profile", path: "/profile" },
];

const adminItems = [{ label: "Admin Panel", path: "/admin" }];

interface StartMenuProps {
  onClose: () => void;
}

export function StartMenu({ onClose }: StartMenuProps) {
  const [, setLocation] = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const wm = useWindowManager();
  const ref = useRef<HTMLDivElement>(null);

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

  const openWindow = (path: string) => {
    wm.openPage(path);
    onClose();
  };

  return (
    <MenuContainer ref={ref}>
      <SideBar>
        <SideBarText>WTF Gameshow</SideBarText>
      </SideBar>
      <MenuContent>
        {user && (
          <>
            {authItems.map((item) => (
              <TouchMenuItem key={item.path} onClick={() => openWindow(item.path)}>
                {item.label}
              </TouchMenuItem>
            ))}
            <Separator />
          </>
        )}
        {isAdmin && (
          <>
            {adminItems.map((item) => (
              <TouchMenuItem key={item.path} onClick={() => openWindow(item.path)}>
                {item.label}
              </TouchMenuItem>
            ))}
            <Separator />
          </>
        )}
        {publicItems.map((item) => (
          <TouchMenuItem key={item.path} onClick={() => openWindow(item.path)}>
            {item.label}
          </TouchMenuItem>
        ))}
        <Separator />
        {user ? (
          <TouchMenuItem
            onClick={async () => {
              try {
                await logout();
              } finally {
                setLocation("/login");
                onClose();
              }
            }}
          >
            Log Out
          </TouchMenuItem>
        ) : (
          <TouchMenuItem onClick={() => { setLocation("/login"); onClose(); }}>
            Log In
          </TouchMenuItem>
        )}
      </MenuContent>
    </MenuContainer>
  );
}
