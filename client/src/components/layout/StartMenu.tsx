import styled from "styled-components";
import { MenuList, MenuListItem, Separator } from "react95";
import { useLocation } from "wouter";
import { useAuth } from "../../lib/auth-context";

const MenuContainer = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 200;
  width: 220px;
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
`;

const SideBarText = styled.span`
  color: white;
  font-weight: bold;
  font-size: 16px;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  letter-spacing: 2px;
`;

const MenuContent = styled(MenuList)`
  padding-left: 28px;
  width: 100%;
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

  const navigate = (path: string) => {
    setLocation(path);
    onClose();
  };

  return (
    <MenuContainer>
      <SideBar>
        <SideBarText>WTF Gameshow</SideBarText>
      </SideBar>
      <MenuContent>
        {user && (
          <>
            {authItems.map((item) => (
              <MenuListItem key={item.path} onClick={() => navigate(item.path)}>
                {item.label}
              </MenuListItem>
            ))}
            <Separator />
          </>
        )}
        {isAdmin && (
          <>
            {adminItems.map((item) => (
              <MenuListItem key={item.path} onClick={() => navigate(item.path)}>
                {item.label}
              </MenuListItem>
            ))}
            <Separator />
          </>
        )}
        {publicItems.map((item) => (
          <MenuListItem key={item.path} onClick={() => navigate(item.path)}>
            {item.label}
          </MenuListItem>
        ))}
        <Separator />
        {user ? (
          <MenuListItem
            onClick={() => {
              logout();
              onClose();
            }}
          >
            Log Out
          </MenuListItem>
        ) : (
          <MenuListItem onClick={() => navigate("/login")}>
            Log In
          </MenuListItem>
        )}
      </MenuContent>
    </MenuContainer>
  );
}
