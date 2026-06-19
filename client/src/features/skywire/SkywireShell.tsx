import { useMemo, useState, type ReactNode } from "react";
import styled from "styled-components";
import { Button, GroupBox, TextField } from "react95";
import {
  Bell,
  Bug,
  Clapperboard,
  Home,
  Mail,
  PenLine,
  Radio,
  Search,
  Settings,
  ShoppingCart,
  Trophy,
  UserRound,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../lib/api";
import {
  SKYWIRE_PERMISSION_TIER_OPTIONS,
  skywirePermissionTierLabel,
  type SkywirePermissionTier,
} from "@shared/atproto-permissions";
import {
  skywireContextTitle,
  skywireNavGroups,
  type SkywireNavGroup,
  type SkywireTab,
} from "./skywire-nav";

const MainLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: start;
`;

const Sidebar = styled.nav`
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--sky-text, #f1ecfb);
  display: grid;
  gap: 8px;
  overflow: visible;
`;

const NavGroup = styled.section`
  display: grid;
  gap: 6px;
`;

const NavGroupLabel = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sky-muted, #b9acd6);
  padding: 0 4px;
`;

const NavButton = styled.button<{ $active?: boolean }>`
  appearance: none;
  border: 1px solid
    ${({ $active }) => ($active ? "var(--sky-cyan, #6ee7d8)" : "var(--sky-border, #3b3154)")} !important;
  border-radius: 999px !important;
  background-color: ${({ $active }) => ($active ? "rgba(21, 79, 75, 0.98)" : "rgba(32, 24, 47, 0.88)")} !important;
  background-image: ${({ $active }) =>
    $active
      ? "linear-gradient(135deg, rgba(26, 92, 86, 0.96), rgba(45, 52, 83, 0.9))"
      : "linear-gradient(180deg, rgba(32, 24, 47, 0.9), rgba(20, 15, 31, 0.9))"} !important;
  color: ${({ $active }) => ($active ? "#f8feff" : "var(--sky-text, #f1ecfb)")} !important;
  min-height: 40px;
  padding: 7px 12px;
  text-align: left;
  cursor: pointer;
  display: grid;
  grid-template-columns: 20px minmax(0, max-content);
  gap: 6px;
  align-items: center;
  flex: 0 0 auto;
  box-shadow: ${({ $active }) => ($active ? "0 0 0 2px rgba(110, 231, 216, 0.14)" : "none")} !important;
  white-space: nowrap;

  strong {
    display: block;
    font-size: 13px;
    line-height: 1.1;
  }

  div > span {
    display: none;
    font-size: 11px;
    color: ${({ $active }) => ($active ? "#dbfbff" : "var(--sky-muted, #b9acd6)")};
    line-height: 1.2;
  }

  &:hover {
    border-color: var(--sky-cyan, #6ee7d8);
    background-color: ${({ $active }) => ($active ? "rgba(45, 52, 83, 0.98)" : "rgba(42, 33, 64, 0.98)")} !important;
    background-image: ${({ $active }) =>
      $active
        ? "linear-gradient(135deg, rgba(45, 52, 83, 0.98), rgba(26, 80, 78, 0.92))"
        : "linear-gradient(180deg, rgba(42, 33, 64, 0.98), rgba(22, 16, 34, 0.98))"} !important;
  }
`;

const NavIconSlot = styled.span`
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
`;

const PrimaryNavRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  overflow-x: auto;
  padding: 2px 2px 8px;
  scrollbar-width: thin;
`;

const MoreNavDetails = styled.details`
  position: relative;
  flex: 0 0 auto;
`;

const MoreNavSummary = styled.summary`
  min-height: 40px;
  padding: 7px 12px;
  border: 1px solid var(--sky-border, #3b3154);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(32, 24, 47, 0.9), rgba(20, 15, 31, 0.9));
  color: var(--sky-text, #f1ecfb);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  list-style: none;
  white-space: nowrap;

  &::-webkit-details-marker {
    display: none;
  }

  &::after {
    content: "⌄";
    color: var(--sky-muted, #b9acd6);
  }
`;

const SecondaryNavPanel = styled.div`
  position: absolute;
  z-index: 20;
  right: 0;
  top: calc(100% + 8px);
  width: min(78vw, 360px);
  max-height: min(72vh, 620px);
  overflow: auto;
  border: 1px solid var(--sky-border-strong, #675a8a);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(32, 24, 47, 0.99) 0%, rgba(17, 12, 29, 0.99) 100%);
  padding: 10px;
  display: grid;
  gap: 12px;
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.4);

  ${NavButton} {
    grid-template-columns: 22px minmax(0, 1fr);
    border-radius: 10px !important;
    min-height: 48px;
    width: 100%;
    white-space: normal;
  }

  ${NavButton} div > span {
    display: block;
  }

  @media (max-width: 640px) {
    left: 0;
    right: auto;
    width: calc(100vw - 34px);
  }
`;

const ContentPane = styled.div`
  min-width: 0;
  display: grid;
  gap: 10px;
`;

const ContextBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid rgba(242, 201, 76, 0.56);
  border-radius: 8px;
  background: rgba(87, 64, 18, 0.52);
  color: #ffe9a6;
  padding: 6px 8px;
`;

const ContextTitle = styled.strong`
  overflow-wrap: anywhere;
`;

const WelcomeCard = styled.div`
  border: 1px solid var(--sky-border, #3b3154);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(32, 24, 47, 0.96) 0%, rgba(17, 12, 29, 0.96) 100%);
  color: var(--sky-text, #f1ecfb);
  padding: 12px;
  display: grid;
  gap: 10px;
`;

const StepList = styled.ol`
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  line-height: 1.35;
`;

const CapabilityCard = styled.div`
  border: 1px solid rgba(242, 201, 76, 0.48);
  border-radius: 8px;
  background: rgba(90, 66, 18, 0.56);
  color: #ffe9a6;
  padding: 10px;
  display: grid;
  gap: 8px;
`;

const SettingsSection = styled.section`
  display: grid;
  gap: 8px;
`;

const SectionHeader = styled.div`
  display: grid;
  gap: 2px;
  padding: 4px 2px 0;

  strong {
    font-size: 14px;
    color: var(--sky-text, #f1ecfb);
  }

  span {
    color: var(--sky-muted, #b9acd6);
    line-height: 1.35;
  }
`;

const TierGrid = styled.div`
  display: grid;
  gap: 6px;
`;

const TierCard = styled.div`
  border: 1px solid var(--sky-border, #3b3154);
  border-radius: 8px;
  background: rgba(32, 24, 47, 0.9);
  color: var(--sky-text, #f1ecfb);
  padding: 8px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  line-height: 1.35;
`;

const ComposeBox = styled.div`
  border: 1px solid var(--sky-border, #3b3154);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(32, 24, 47, 0.96), rgba(17, 12, 29, 0.96));
  color: var(--sky-text, #f1ecfb);
  padding: 10px;
  display: grid;
  gap: 8px;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 72px;
  border: 1px solid var(--sky-border-strong, #675a8a);
  border-radius: 6px;
  background: #110c1d;
  color: var(--sky-text, #f1ecfb);
  padding: 6px;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;

  &::placeholder {
    color: var(--sky-dim, #8d7ead);
  }
`;

const AdminHint = styled.div`
  border: 1px solid rgba(65, 217, 156, 0.48);
  border-radius: 8px;
  background: rgba(11, 47, 43, 0.72);
  color: var(--sky-text, #f1ecfb);
  padding: 8px;
  display: grid;
  gap: 6px;
  font-size: 12px;
  line-height: 1.35;
`;

const NAV_ICONS: Partial<Record<SkywireTab | "wtf-live", LucideIcon>> = {
  account: Settings,
  actor: UserRound,
  chat: Mail,
  challenges: Trophy,
  composer: PenLine,
  debug: Bug,
  discover: Search,
  home: Home,
  market: ShoppingCart,
  mentions: Bell,
  pipelines: Wrench,
  signals: Radio,
  tezos: Radio,
  vault: WalletCards,
  wtf: Clapperboard,
  "wtf-live": Clapperboard,
};

const PRIMARY_NAV_IDS = new Set<SkywireTab>(["home", "market", "signals", "chat", "vault", "account"]);

export function SkywireSidebar({
  isAdmin,
  activeTab,
  onSelect,
  onOpenWtfLive,
}: {
  isAdmin: boolean;
  activeTab: SkywireTab;
  onSelect: (tab: SkywireTab) => void;
  onOpenWtfLive?: () => void;
}) {
  const groups = useMemo(() => skywireNavGroups(isAdmin), [isAdmin]);
  const sidebarTab = ["thread", "actor", "pipelines"].includes(activeTab) ? "home" : activeTab;
  const allItems = groups.flatMap((group) => group.items);
  const primaryItems = allItems.filter((item) => PRIMARY_NAV_IDS.has(item.id));
  const secondaryGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !PRIMARY_NAV_IDS.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);
  const activeSecondaryItem = allItems.find((item) => item.id === sidebarTab && !PRIMARY_NAV_IDS.has(item.id));
  const renderNavButton = (item: SkywireNavGroup["items"][number]) => {
    const Icon = NAV_ICONS[item.id] || Radio;
    return (
      <NavButton
        key={item.id}
        type="button"
        $active={sidebarTab === item.id}
        aria-current={sidebarTab === item.id ? "page" : undefined}
        onClick={() => onSelect(item.id)}
        title={item.hint}
      >
        <NavIconSlot aria-hidden>
          <Icon size={16} strokeWidth={2.2} />
        </NavIconSlot>
        <div>
          <strong>{item.label}</strong>
          <span>{item.hint}</span>
        </div>
      </NavButton>
    );
  };

  return (
    <Sidebar aria-label="Skywire navigation">
      <PrimaryNavRow>
        {primaryItems.map(renderNavButton)}
        <MoreNavDetails open={Boolean(activeSecondaryItem)}>
          <MoreNavSummary>{activeSecondaryItem ? activeSecondaryItem.label : "More"}</MoreNavSummary>
          <SecondaryNavPanel>
            {secondaryGroups.map((group: SkywireNavGroup) => (
              <NavGroup key={group.id}>
                <NavGroupLabel>{group.label}</NavGroupLabel>
                {group.items.map(renderNavButton)}
              </NavGroup>
            ))}
            {onOpenWtfLive ? (
              <NavGroup>
                <NavGroupLabel>Separate app</NavGroupLabel>
                <NavButton type="button" onClick={onOpenWtfLive} title="Public rooms and stage broadcasts">
                  <NavIconSlot aria-hidden>
                    <Clapperboard size={16} strokeWidth={2.2} />
                  </NavIconSlot>
                  <div>
                    <strong>WTF LIVE</strong>
                    <span>Rooms &amp; stages app</span>
                  </div>
                </NavButton>
              </NavGroup>
            ) : null}
          </SecondaryNavPanel>
        </MoreNavDetails>
      </PrimaryNavRow>
    </Sidebar>
  );
}

export function SkywireContextBar({
  tab,
  selectedActor,
  selectedThreadPost,
  selectedPipelinePost,
  onBack,
}: {
  tab: SkywireTab;
  selectedActor: { handle?: string; displayName?: string | null } | null;
  selectedThreadPost: { author?: { handle?: string } | null } | null;
  selectedPipelinePost: { author?: { handle?: string } | null } | null;
  onBack: () => void;
}) {
  const title = skywireContextTitle(tab, selectedActor, selectedThreadPost, selectedPipelinePost);
  if (!title) return null;

  return (
    <ContextBar>
      <ContextTitle>{title}</ContextTitle>
      <Button size="sm" onClick={onBack}>
        ← Back
      </Button>
    </ContextBar>
  );
}

export function SkywireConnectWelcome({
  onOpenSettings,
  onConnect,
  handle,
  onHandleChange,
}: {
  onOpenSettings: () => void;
  onConnect: () => void;
  handle: string;
  onHandleChange: (value: string) => void;
}) {
  return (
    <WelcomeCard>
      <GroupBox label="Welcome to Skywire">
        <StepList>
          <li>Sign in to WTF OS first — Skywire uses your WTF session.</li>
          <li>Enter your Bluesky handle (for example <code>you.bsky.social</code>).</li>
          <li>Choose a permission tier before Bluesky OAuth opens.</li>
          <li>Return here to read Home, post, chat, and WTF LIVE records.</li>
        </StepList>
      </GroupBox>
      <GroupBox label="Step 1 · Connect Bluesky">
        <TextField
          value={handle}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onHandleChange(event.target.value)}
          placeholder="your-handle.bsky.social"
          fullWidth
        />
        <Button disabled={!handle.trim()} onClick={onConnect}>
          Continue to Permissions
        </Button>
        <Button onClick={onOpenSettings}>Open full Settings</Button>
      </GroupBox>
    </WelcomeCard>
  );
}

export function SkywireCapabilityGate({
  title,
  body,
  requiredTier,
  onOpenSettings,
}: {
  title: string;
  body: string;
  requiredTier?: SkywirePermissionTier;
  onOpenSettings: () => void;
}) {
  const tierLabel = requiredTier
    ? skywirePermissionTierLabel(requiredTier)
    : SKYWIRE_PERMISSION_TIER_OPTIONS[1].title;

  return (
    <CapabilityCard>
      <strong>{title}</strong>
      <span>{body}</span>
      <span>
        Go to <strong>Settings → Connection &amp; permissions</strong> and choose{" "}
        <strong>{tierLabel}</strong> or higher, then reconnect Bluesky.
      </span>
      <Button onClick={onOpenSettings}>Open Settings</Button>
    </CapabilityCard>
  );
}

export function SkywireSettingsSection({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <SettingsSection>
      <SectionHeader>
        <strong>
          Step {step} · {title}
        </strong>
        <span>{description}</span>
      </SectionHeader>
      {children}
    </SettingsSection>
  );
}

export function SkywirePermissionOverview() {
  return (
    <GroupBox label="Permission tiers at a glance">
      <TierGrid>
        {SKYWIRE_PERMISSION_TIER_OPTIONS.map((option) => (
          <TierCard key={option.key}>
            <strong>{option.title}</strong>
            <span>{option.summary}</span>
          </TierCard>
        ))}
      </TierGrid>
    </GroupBox>
  );
}

export function SkywireAdminSettingsHint({
  rolloutMode,
  onOpenWindowAdmin,
}: {
  rolloutMode?: string;
  onOpenWindowAdmin?: () => void;
}) {
  return (
    <AdminHint>
      <strong>Admin controls</strong>
      <span>
        Use the <strong>Admin</strong> button in the window title bar to toggle desktop apps, rollout env vars, and
        Skywire automation handles for this surface.
      </span>
      <span>Current rollout mode: {rolloutMode || "staff_alpha"}</span>
      {onOpenWindowAdmin ? (
        <Button size="sm" onClick={onOpenWindowAdmin}>
          Open window admin panel
        </Button>
      ) : null}
    </AdminHint>
  );
}

export function SkywireHomeCompose({
  canCompose,
  canUseSession,
  onPosted,
  onNeedSettings,
}: {
  canCompose: boolean;
  canUseSession: boolean;
  onPosted?: () => void;
  onNeedSettings: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const remaining = 300 - Array.from(text).length;

  if (!canUseSession) {
    return (
      <SkywireCapabilityGate
        title="Reconnect to post"
        body="Your Bluesky session expired or needs a fresh OAuth handshake."
        onOpenSettings={onNeedSettings}
      />
    );
  }

  if (!canCompose) {
    return (
      <SkywireCapabilityGate
        title="Posting needs Be Heard or Be Bold"
        body="Your current permission tier can read Skywire but cannot publish posts."
        requiredTier="be-heard"
        onOpenSettings={onNeedSettings}
      />
    );
  }

  return (
    <ComposeBox>
      <strong>What's happening?</strong>
      <TextArea
        value={text}
        maxLength={600}
        placeholder="Share something with your followers…"
        onChange={(event) => setText(event.target.value)}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>{remaining} characters left</span>
        <Button
          disabled={pending || remaining < 0 || !text.trim()}
          onClick={async () => {
            setPending(true);
            setError("");
            try {
              await api.post("/api/skywire/post", { text });
              setText("");
              onPosted?.();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Post failed.");
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
      {error ? <span>{error}</span> : null}
    </ComposeBox>
  );
}

export function SkywireMainLayout({
  sidebar,
  contextBar,
  children,
}: {
  sidebar: ReactNode;
  contextBar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MainLayout>
      {sidebar}
      <ContentPane>
        {contextBar}
        {children}
      </ContentPane>
    </MainLayout>
  );
}
