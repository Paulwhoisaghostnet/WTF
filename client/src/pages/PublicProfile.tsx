import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GroupBox,
  Tabs,
  Tab,
  TabBody,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
  Hourglass,
  TextInput,
  Button,
} from "react95";
import styled from "styled-components";
import { useRoute } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { UserLink } from "../components/UserLink";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";

const Section = styled(GroupBox)`
  margin-bottom: 12px;
`;

const Field = styled.div`
  margin-bottom: 8px;
  font-size: 12px;
`;

const PfpCircle = styled.div<{ $hasImage: boolean }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid #808080;
  background: ${(p) => (p.$hasImage ? "none" : "#c0c0c0")};
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const SocialLink = styled.a`
  color: #000080;
  text-decoration: underline;
  font-size: 12px;
`;

const VerifiedBadge = styled.span`
  background: #008000;
  color: #fff;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 2px;
  margin-left: 4px;
`;

const TokenGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
`;

const TokenCard = styled.div`
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
  box-shadow: 1px 1px 0 #000;
  display: flex;
  flex-direction: column;
`;

const CardTitleBar = styled.div`
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: 11px;
  padding: 3px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
`;

const Thumb = styled.div`
  width: 100%;
  min-height: 140px;
  max-height: 200px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid #808080;
  border-bottom: 1px solid #808080;
  img { max-width: 100%; max-height: 200px; object-fit: contain; }
`;

const CardInfo = styled.div`
  padding: 6px 8px;
  font-size: 10px;
`;

const Meta = styled.div`
  font-size: 11px;
  color: #555;
  margin-bottom: 4px;
`;

const MsgRow = styled.div`
  margin-bottom: 8px;
  padding: 4px 8px;
  background: #fff;
  border: 1px solid #c0c0c0;
`;

const MsgBody = styled.div`
  margin-top: 2px;
  font-size: 12px;
`;

interface PublicUser {
  id: number;
  username: string;
  displayName?: string;
  role: string;
  experiencePoints?: number;
  bio?: string;
  pfpImageUrl?: string;
  email?: string;
  twitterHandle?: string;
  twitterVerified?: boolean;
  discordHandle?: string;
  discordVerified?: boolean;
  wallets: string[];
  createdAt: string;
}

interface TradeBoardToken {
  id: number;
  tokenContract: string;
  tokenId: string;
  tokenName: string;
  thumbnail?: string;
  balance: string;
  tradeBoardQuantity: number;
}

interface Listing {
  id: number;
  tokenContract: string;
  tokenId: string;
  tokenName: string;
  thumbnail?: string;
  amount: number;
  priceFormatted: string;
  listingType: string;
  createdAt: string;
}

interface XpEvent {
  id: number;
  amount: number;
  reason: string;
  createdAt: string;
}

interface DmMessage {
  id: number;
  senderId: number;
  content: string;
  createdAt: string;
  username: string;
  displayName?: string;
}

export function PublicProfile({ username: propUsername }: { username?: string }) {
  const [, params] = useRoute("/user/:username");
  const username = propUsername ?? params?.username;
  const [activeTab, setActiveTab] = useState(0);
  const [dmText, setDmText] = useState("");
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwnProfile = user && username && user.username.toLowerCase() === username.toLowerCase();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => api.get<PublicUser>(`/api/users/${username}`),
    enabled: !!username,
  });

  const { data: tradeBoard } = useQuery({
    queryKey: ["public-trade-board", username],
    queryFn: () => api.get<TradeBoardToken[]>(`/api/users/${username}/trade-board`),
    enabled: !!username && activeTab === 1,
  });

  const { data: listings } = useQuery({
    queryKey: ["public-listings", username],
    queryFn: () => api.get<Listing[]>(`/api/users/${username}/listings`),
    enabled: !!username && activeTab === 2,
  });

  const { data: activity } = useQuery({
    queryKey: ["public-activity", username],
    queryFn: () => api.get<XpEvent[]>(`/api/users/${username}/activity`),
    enabled: !!username && activeTab === 3,
  });

  const { data: dmData } = useQuery({
    queryKey: ["public-dm", username],
    queryFn: () => api.get<{ conversationId: number | null; messages: DmMessage[] }>(`/api/users/${username}/dm`),
    enabled: !!username && !!user && !isOwnProfile && activeTab === 4,
  });

  const sendDm = useMutation({
    mutationFn: async (content: string) => {
      if (dmData?.conversationId) {
        return api.post(`/api/messages/dms/${dmData.conversationId}/messages`, {
          content,
        });
      }
      if (!profile) throw new Error("No profile");

      const created = await api.post<{ id: number }>("/api/messages/dms", {
        targetUserId: profile.id,
      });

      return api.post(`/api/messages/dms/${created.id}/messages`, { content });
    },
    onSuccess: () => {
      setDmText("");
      qc.invalidateQueries({ queryKey: ["public-dm", username] });
    },
  });

  if (isLoading) return <AppWindow title="Profile"><p>Loading...</p></AppWindow>;
  if (error || !profile)
    return <AppWindow title="Profile"><p>User not found.</p></AppWindow>;

  const showDmTab = !!user && !isOwnProfile;

  return (
    <AppWindow title={`${profile.displayName || profile.username}'s Profile`}>
      <Tabs value={activeTab} onChange={(val: number) => setActiveTab(val)}>
        <Tab value={0}>About</Tab>
        <Tab value={1}>Trade Board</Tab>
        <Tab value={2}>Listings</Tab>
        <Tab value={3}>Activity</Tab>
        {showDmTab && <Tab value={4}>Messages</Tab>}
      </Tabs>

      <TabBody>
        {activeTab === 0 && <AboutTab profile={profile} />}
        {activeTab === 1 && <TradeBoardTab tokens={tradeBoard} />}
        {activeTab === 2 && <ListingsTab listings={listings} />}
        {activeTab === 3 && <ActivityTab events={activity} />}
        {activeTab === 4 && showDmTab && (
          <DmTab
            messages={dmData?.messages || []}
            dmText={dmText}
            setDmText={setDmText}
            onSend={() => { if (dmText.trim()) sendDm.mutate(dmText.trim()); }}
            sending={sendDm.isPending}
            sendError={sendDm.error instanceof Error ? sendDm.error.message : null}
          />
        )}
      </TabBody>
    </AppWindow>
  );
}

function AboutTab({ profile }: { profile: PublicUser }) {
  const wallets = Array.isArray(profile.wallets) ? profile.wallets : [];

  return (
    <>
      <Section label="About">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <PfpCircle $hasImage={!!profile.pfpImageUrl}>
            {profile.pfpImageUrl ? (
              <img src={profile.pfpImageUrl} alt="pfp" />
            ) : (
              <span style={{ fontSize: 10, color: "#555" }}>No PFP</span>
            )}
          </PfpCircle>
          <div>
            <Field><strong>Username:</strong> {profile.username}</Field>
            {profile.displayName && (
              <Field><strong>Display Name:</strong> {profile.displayName}</Field>
            )}
            <Field><strong>Role:</strong> {profile.role}</Field>
            <Field><strong>XP:</strong> {profile.experiencePoints ?? 0}</Field>
            <Field>
              <strong>Member since:</strong>{" "}
              {new Date(profile.createdAt).toLocaleDateString()}
            </Field>
            {profile.bio && <Field><strong>Bio:</strong> {profile.bio}</Field>}
          </div>
        </div>
      </Section>

      {(profile.email || profile.twitterHandle || profile.discordHandle) && (
        <Section label="Contact & Social">
          {profile.email && (
            <Field>
              <strong>Email:</strong>{" "}
              <SocialLink href={`mailto:${profile.email}`}>{profile.email}</SocialLink>
            </Field>
          )}
          {profile.twitterHandle && (
            <Field>
              <strong>Twitter:</strong>{" "}
              <SocialLink
                href={`https://twitter.com/${profile.twitterHandle}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                @{profile.twitterHandle}
              </SocialLink>
              {profile.twitterVerified && <VerifiedBadge>Verified</VerifiedBadge>}
            </Field>
          )}
          {profile.discordHandle && (
            <Field>
              <strong>Discord:</strong> {profile.discordHandle}
              {profile.discordVerified && <VerifiedBadge>Verified</VerifiedBadge>}
            </Field>
          )}
        </Section>
      )}

      {wallets.length > 0 && (
        <Section label="Wallets">
          {wallets.map((w) => (
            <Field key={w}>
              <a
                href={`https://tzkt.io/${w}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "monospace", fontSize: 11, color: "#000080" }}
              >
                {w}
              </a>
            </Field>
          ))}
        </Section>
      )}
    </>
  );
}

function TradeBoardTab({ tokens }: { tokens?: TradeBoardToken[] }) {
  if (!tokens) return <Hourglass size={32} />;
  if (tokens.length === 0) return <Meta>No tokens on trade board.</Meta>;
  return (
    <TokenGrid>
      {tokens.map((t) => (
        <TokenCard key={t.id}>
          <CardTitleBar>
            <span>📋</span>
            {t.tokenName}
          </CardTitleBar>
          <Thumb>
            {t.thumbnail ? (
              <img src={t.thumbnail} alt={t.tokenName} />
            ) : (
              <span style={{ fontSize: 28, color: "#808080" }}>?</span>
            )}
          </Thumb>
          <CardInfo>
            <div>Available: {t.tradeBoardQuantity} / {t.balance}</div>
          </CardInfo>
        </TokenCard>
      ))}
    </TokenGrid>
  );
}

function ListingsTab({ listings }: { listings?: Listing[] }) {
  if (!listings) return <Hourglass size={32} />;
  if (listings.length === 0) return <Meta>No active marketplace listings.</Meta>;
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeadCell>Token</TableHeadCell>
          <TableHeadCell style={{ textAlign: "right" }}>Price</TableHeadCell>
          <TableHeadCell style={{ textAlign: "right" }}>Qty</TableHeadCell>
          <TableHeadCell>Type</TableHeadCell>
          <TableHeadCell>Listed</TableHeadCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {listings.map((l) => (
          <TableRow key={l.id}>
            <TableDataCell>{l.tokenName || `#${l.tokenId}`}</TableDataCell>
            <TableDataCell style={{ textAlign: "right" }}>{l.priceFormatted} WTF</TableDataCell>
            <TableDataCell style={{ textAlign: "right" }}>{l.amount}</TableDataCell>
            <TableDataCell>{l.listingType}</TableDataCell>
            <TableDataCell style={{ fontSize: 11 }}>
              {new Date(l.createdAt).toLocaleDateString()}
            </TableDataCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ActivityTab({ events }: { events?: XpEvent[] }) {
  if (!events) return <Hourglass size={32} />;
  if (events.length === 0) return <Meta>No recent activity.</Meta>;
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeadCell>Date</TableHeadCell>
          <TableHeadCell>Reason</TableHeadCell>
          <TableHeadCell style={{ textAlign: "right" }}>XP</TableHeadCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id}>
            <TableDataCell style={{ fontSize: 11 }}>
              {new Date(e.createdAt).toLocaleString()}
            </TableDataCell>
            <TableDataCell>{e.reason}</TableDataCell>
            <TableDataCell style={{ textAlign: "right", color: e.amount >= 0 ? "#008000" : "#800000" }}>
              {e.amount >= 0 ? "+" : ""}{e.amount}
            </TableDataCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DmTab({
  messages,
  dmText,
  setDmText,
  onSend,
  sending,
  sendError,
}: {
  messages: DmMessage[];
  dmText: string;
  setDmText: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  sendError: string | null;
}) {
  return (
    <div>
      <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 8 }}>
        {messages.length === 0 && <Meta>No messages yet. Say hello!</Meta>}
        {messages.map((m) => (
          <MsgRow key={m.id}>
            <Meta>
              <strong><UserLink username={m.username} displayName={m.displayName} /></strong>{" "}
              {new Date(m.createdAt).toLocaleString()}
            </Meta>
            <MsgBody>{m.content}</MsgBody>
          </MsgRow>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <TextInput
          value={dmText}
          onChange={(e: any) => setDmText(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1 }}
          onKeyDown={(e: any) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        />
        <Button onClick={onSend} disabled={sending || !dmText.trim()} size="sm">
          Send
        </Button>
      </div>
      {sendError && (
        <Meta style={{ color: "#800000", marginTop: 6 }}>{sendError}</Meta>
      )}
    </div>
  );
}
