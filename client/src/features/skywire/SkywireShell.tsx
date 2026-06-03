import { useMemo, useState, type ReactNode } from "react";
import styled from "styled-components";
import { Button, GroupBox, TextField } from "react95";
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
  border: 2px inset #fff;
  background: #ececec;
  padding: 8px;
  display: grid;
  gap: 10px;
  max-height: min(72vh, 760px);
  overflow: auto;
`;

const NavGroup = styled.section`
  display: grid;
  gap: 4px;
`;

const NavGroupLabel = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #404040;
  padding: 0 4px;
`;

const NavButton = styled.button<{ $active?: boolean }>`
  appearance: none;
  border: 2px ${({ $active }) => ($active ? "inset" : "outset")} #fff;
  background: ${({ $active }) => ($active ? "#0f8a96" : "#f7f7f7")};
  color: ${({ $active }) => ($active ? "#fff" : "#050505")};
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 6px;
  align-items: center;

  strong {
    display: block;
    font-size: 13px;
    line-height: 1.1;
  }

  span {
    display: block;
    font-size: 11px;
    opacity: ${({ $active }) => ($active ? 0.92 : 0.72)};
    line-height: 1.2;
  }

  &:hover {
    filter: brightness(0.98);
  }
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
  border: 2px inset #fff;
  background: #fff8d6;
  padding: 6px 8px;
`;

const ContextTitle = styled.strong`
  overflow-wrap: anywhere;
`;

const WelcomeCard = styled.div`
  border: 2px outset #fff;
  background: linear-gradient(180deg, #f7ffff 0%, #ececec 100%);
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
  border: 2px inset #fff;
  background: #fff5c7;
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
  }

  span {
    color: #404040;
    line-height: 1.35;
  }
`;

const TierGrid = styled.div`
  display: grid;
  gap: 6px;
`;

const TierCard = styled.div`
  border: 2px inset #fff;
  background: #f7f7f7;
  padding: 8px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  line-height: 1.35;
`;

const ComposeBox = styled.div`
  border: 2px outset #fff;
  background: #fff;
  padding: 10px;
  display: grid;
  gap: 8px;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 72px;
  border: 2px inset #fff;
  padding: 6px;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;
`;

const AdminHint = styled.div`
  border: 2px inset #fff;
  background: #e8fff3;
  padding: 8px;
  display: grid;
  gap: 6px;
  font-size: 12px;
  line-height: 1.35;
`;

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
          {group.items.map((item) => (
            <NavButton
              key={item.id}
              type="button"
              $active={sidebarTab === item.id}
              onClick={() => onSelect(item.id)}
              title={item.hint}
            >
              <span aria-hidden>{item.icon}</span>
              <div>
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </div>
            </NavButton>
          ))}
        </NavGroup>
      ))}
      {onOpenWtfLive ? (
        <NavGroup>
          <NavGroupLabel>Separate app</NavGroupLabel>
          <NavButton type="button" onClick={onOpenWtfLive} title="Public rooms and stage broadcasts">
            <span aria-hidden>📡</span>
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
