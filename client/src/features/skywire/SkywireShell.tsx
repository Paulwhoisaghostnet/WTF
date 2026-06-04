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
  grid-template-columns: minmax(168px, 210px) minmax(0, 1fr);
  gap: 8px;
  align-items: start;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.nav`
  border: 1px solid var(--sky-border, #285465);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(13, 28, 37, 0.98) 0%, rgba(7, 19, 26, 0.98) 100%);
  color: var(--sky-text, #f2fbff);
  padding: 8px;
  display: grid;
  gap: 10px;
  max-height: min(72vh, 760px);
  overflow: auto;
  box-shadow: inset 0 0 0 1px rgba(103, 232, 249, 0.08);
`;

const NavGroup = styled.section`
  display: grid;
  gap: 4px;
`;

const NavGroupLabel = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sky-muted, #abc1ca);
  padding: 0 4px;
`;

const NavButton = styled.button<{ $active?: boolean }>`
  appearance: none;
  border: 1px solid
    ${({ $active }) => ($active ? "var(--sky-cyan, #67e8f9)" : "var(--sky-border, #285465)")} !important;
  border-radius: 6px;
  background-color: ${({ $active }) => ($active ? "rgba(15, 118, 126, 0.98)" : "rgba(16, 39, 51, 0.92)")} !important;
  background-image: ${({ $active }) =>
    $active
      ? "linear-gradient(135deg, rgba(15, 118, 126, 0.98), rgba(31, 41, 99, 0.98))"
      : "linear-gradient(180deg, rgba(16, 39, 51, 0.95), rgba(9, 25, 34, 0.95))"} !important;
  color: ${({ $active }) => ($active ? "#f8feff" : "var(--sky-text, #f2fbff)")} !important;
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  box-shadow: ${({ $active }) => ($active ? "0 0 0 2px rgba(103, 232, 249, 0.12)" : "none")};

  strong {
    display: block;
    font-size: 13px;
    line-height: 1.1;
  }

  span {
    display: block;
    font-size: 11px;
    color: ${({ $active }) => ($active ? "#dbfbff" : "var(--sky-muted, #abc1ca)")};
    line-height: 1.2;
  }

  &:hover {
    border-color: var(--sky-cyan, #67e8f9);
    background-color: ${({ $active }) => ($active ? "rgba(15, 118, 126, 0.98)" : "rgba(20, 55, 66, 0.98)")} !important;
    background-image: ${({ $active }) =>
      $active
        ? "linear-gradient(135deg, rgba(15, 118, 126, 0.98), rgba(31, 41, 99, 0.98))"
        : "linear-gradient(180deg, rgba(20, 55, 66, 0.98), rgba(11, 31, 43, 0.98))"} !important;
  }
`;

const NavIconSlot = styled.span`
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
`;

const ContentPane = styled.div`
  min-width: 0;
  display: grid;
  gap: 8px;
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
  border: 1px solid var(--sky-border, #285465);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(18, 47, 58, 0.96) 0%, rgba(9, 25, 34, 0.96) 100%);
  color: var(--sky-text, #f2fbff);
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
    color: var(--sky-text, #f2fbff);
  }

  span {
    color: var(--sky-muted, #abc1ca);
    line-height: 1.35;
  }
`;

const TierGrid = styled.div`
  display: grid;
  gap: 6px;
`;

const TierCard = styled.div`
  border: 1px solid var(--sky-border, #285465);
  border-radius: 8px;
  background: rgba(16, 39, 51, 0.9);
  color: var(--sky-text, #f2fbff);
  padding: 8px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  line-height: 1.35;
`;

const ComposeBox = styled.div`
  border: 1px solid var(--sky-border, #285465);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(18, 47, 58, 0.96), rgba(9, 25, 34, 0.96));
  color: var(--sky-text, #f2fbff);
  padding: 10px;
  display: grid;
  gap: 8px;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 72px;
  border: 1px solid var(--sky-border-strong, #3a8797);
  border-radius: 6px;
  background: #07141c;
  color: var(--sky-text, #f2fbff);
  padding: 6px;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;

  &::placeholder {
    color: var(--sky-dim, #7f9aa5);
  }
`;

const AdminHint = styled.div`
  border: 1px solid rgba(65, 217, 156, 0.48);
  border-radius: 8px;
  background: rgba(11, 47, 43, 0.72);
  color: var(--sky-text, #f2fbff);
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

  return (
    <Sidebar aria-label="Skywire navigation">
      {groups.map((group: SkywireNavGroup) => (
        <NavGroup key={group.id}>
          <NavGroupLabel>{group.label}</NavGroupLabel>
          {group.items.map((item) => {
            const Icon = NAV_ICONS[item.id] || Radio;
            return (
            <NavButton
              key={item.id}
              type="button"
              $active={sidebarTab === item.id}
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
          })}
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
