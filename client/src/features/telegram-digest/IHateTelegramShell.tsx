import { useMemo, useState } from "react";
import styled from "styled-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Hourglass, Panel, TextInput } from "react95";
import { AppWindow } from "../../components/layout/AppWindow";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

type DigestConfig = {
  botConfigured: boolean;
  webhookSecretConfigured: boolean;
  bridgeHmacConfigured: boolean;
  userClientModeConfigured: boolean;
  fartNoisesBot: string;
};

type DigestSource = {
  id: number;
  key: string;
  title: string;
  description: string | null;
  telegramUsername: string | null;
  sourceKind: string;
  enabled: boolean;
  publicVisible: boolean;
  digestEnabled: boolean;
};

type DigestMessage = {
  id: number;
  sourceId: number;
  messageKind: "message" | "announcement" | "fart_noise" | "system";
  authorName: string | null;
  authorUsername: string | null;
  text: string;
  summary: string | null;
  publicLink: string | null;
  messageDate: string;
  source: DigestSource | null;
};

type FartTrack = {
  id: number;
  walletAddress: string;
  label: string | null;
  status: string;
  fartTokenBalance: string | null;
  lastCheckedAt: string | null;
};

type Announcement = {
  id: number;
  title: string;
  body: string;
  status: string;
  failure: string | null;
  createdAt: string;
};

const Shell = styled.div`
  min-height: 100%;
  background: #c0c0c0;
  padding: 12px;
  color: #101010;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  margin-bottom: 12px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 28px;
  line-height: 1.05;
`;

const Subtitle = styled.p`
  margin: 6px 0 0;
  max-width: 760px;
  font-size: 13px;
  line-height: 1.45;
`;

const StatusStrip = styled(Panel)`
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 6px;
  padding: 8px;
  font-size: 11px;
  min-width: 280px;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
  gap: 12px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const Section = styled(Panel)`
  padding: 10px;
  margin-bottom: 12px;
`;

const SectionTitle = styled.h2`
  margin: 0 0 8px;
  font-size: 16px;
`;

const Toolbar = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 10px;
`;

const SourceRail = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`;

const SourceButton = styled(Button)<{ $active?: boolean }>`
  font-weight: ${(props) => (props.$active ? 700 : 400)};
`;

const MessageList = styled.div`
  display: grid;
  gap: 8px;
`;

const MessageRow = styled(Panel)<{ $fart?: boolean }>`
  padding: 8px;
  background: ${(props) => (props.$fart ? "#fff0a8" : "#eeeeee")};
`;

const MessageMeta = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  margin-bottom: 5px;
`;

const MessageText = styled.div`
  font-size: 13px;
  line-height: 1.42;
  white-space: pre-wrap;
  word-break: break-word;
`;

const Muted = styled.p`
  margin: 6px 0;
  color: #404040;
  font-size: 12px;
  line-height: 1.35;
`;

const Small = styled.span`
  color: #404040;
`;

const FormGrid = styled.div`
  display: grid;
  gap: 8px;
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  font-size: 12px;
`;

const TrackRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border-top: 1px solid #808080;
  padding-top: 8px;
  margin-top: 8px;
  font-size: 12px;
`;

const Empty = styled.div`
  padding: 14px;
  border: 1px dashed #808080;
  background: #d8d8d8;
  font-size: 12px;
`;

function isStaffRole(role: string | undefined) {
  return role === "admin" || role === "host" || role === "cohost";
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "pending";
  return date.toLocaleString();
}

export function IHateTelegramShell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sourceKey, setSourceKey] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLabel, setWalletLabel] = useState("");
  const [announcement, setAnnouncement] = useState({
    sourceId: "",
    title: "",
    body: "",
  });
  const [sourceDraft, setSourceDraft] = useState({
    key: "",
    title: "",
    telegramUsername: "",
    sourceKind: "channel",
  });

  const canAdmin = isStaffRole(user?.role);

  const configQuery = useQuery({
    queryKey: ["telegram-digest", "config"],
    queryFn: () => api.get<DigestConfig>("/api/telegram-digest/config"),
  });

  const sourcesQuery = useQuery({
    queryKey: ["telegram-digest", "sources"],
    queryFn: () => api.get<{ sources: DigestSource[] }>("/api/telegram-digest/sources"),
  });

  const messagesQuery = useQuery({
    queryKey: ["telegram-digest", "messages", sourceKey, kind],
    queryFn: () => {
      const params = new URLSearchParams();
      if (sourceKey !== "all") params.set("source", sourceKey);
      if (kind !== "all") params.set("kind", kind);
      params.set("limit", "100");
      return api.get<{ messages: DigestMessage[] }>(
        `/api/telegram-digest/messages?${params.toString()}`
      );
    },
    refetchInterval: 20_000,
  });

  const fartTracksQuery = useQuery({
    queryKey: ["telegram-digest", "farts"],
    queryFn: () => api.get<{ tracks: FartTrack[] }>("/api/telegram-digest/me/farts"),
    enabled: Boolean(user),
  });

  const announcementsQuery = useQuery({
    queryKey: ["telegram-digest", "announcements"],
    queryFn: () =>
      api.get<{ announcements: Announcement[] }>(
        "/api/telegram-digest/admin/announcements"
      ),
    enabled: canAdmin,
  });

  const saveFartTrack = useMutation({
    mutationFn: () =>
      api.post("/api/telegram-digest/me/farts", {
        walletAddress,
        label: walletLabel || null,
      }),
    onSuccess: () => {
      setWalletAddress("");
      setWalletLabel("");
      qc.invalidateQueries({ queryKey: ["telegram-digest", "farts"] });
    },
  });

  const queueAnnouncement = useMutation({
    mutationFn: () =>
      api.post("/api/telegram-digest/admin/announcements", {
        sourceId: announcement.sourceId ? Number(announcement.sourceId) : null,
        title: announcement.title,
        body: announcement.body,
      }),
    onSuccess: () => {
      setAnnouncement({ sourceId: "", title: "", body: "" });
      qc.invalidateQueries({ queryKey: ["telegram-digest", "announcements"] });
    },
  });

  const saveSource = useMutation({
    mutationFn: () =>
      api.post("/api/telegram-digest/admin/sources", {
        ...sourceDraft,
        telegramUsername: sourceDraft.telegramUsername || null,
      }),
    onSuccess: () => {
      setSourceDraft({
        key: "",
        title: "",
        telegramUsername: "",
        sourceKind: "channel",
      });
      qc.invalidateQueries({ queryKey: ["telegram-digest", "sources"] });
    },
  });

  const sources = sourcesQuery.data?.sources ?? [];
  const messages = messagesQuery.data?.messages ?? [];
  const farts = useMemo(
    () => messages.filter((message) => message.messageKind === "fart_noise"),
    [messages]
  );

  return (
    <AppWindow title="I Hate Telegram">
      <Shell>
        <Header>
          <div>
            <Title>I Hate Telegram</Title>
            <Subtitle>
              Readers Digest for Tezos Telegram hotspots, WTF announcements, and
              FART NOISES alerts that the WTF bridge is allowed to see.
            </Subtitle>
          </div>
          <StatusStrip variant="well">
            <span>Bot: {configQuery.data?.botConfigured ? "ready" : "missing"}</span>
            <span>
              Webhook: {configQuery.data?.webhookSecretConfigured ? "ready" : "missing"}
            </span>
            <span>
              HMAC: {configQuery.data?.bridgeHmacConfigured ? "ready" : "missing"}
            </span>
            <span>
              User client:{" "}
              {configQuery.data?.userClientModeConfigured ? "ready" : "missing"}
            </span>
          </StatusStrip>
        </Header>

        <Layout>
          <div>
            <Section>
              <SectionTitle>Digest</SectionTitle>
              <SourceRail>
                <SourceButton $active={sourceKey === "all"} onClick={() => setSourceKey("all")}>
                  All sources
                </SourceButton>
                {sources.map((source) => (
                  <SourceButton
                    key={source.id}
                    $active={sourceKey === source.key}
                    onClick={() => setSourceKey(source.key)}
                  >
                    {source.title}
                  </SourceButton>
                ))}
              </SourceRail>
              <Toolbar>
                <SourceButton $active={kind === "all"} onClick={() => setKind("all")}>
                  All
                </SourceButton>
                <SourceButton
                  $active={kind === "fart_noise"}
                  onClick={() => setKind("fart_noise")}
                >
                  FART NOISES
                </SourceButton>
                <SourceButton
                  $active={kind === "announcement"}
                  onClick={() => setKind("announcement")}
                >
                  Announcements
                </SourceButton>
                <Button onClick={() => messagesQuery.refetch()}>Refresh</Button>
              </Toolbar>

              {messagesQuery.isLoading ? (
                <Empty>
                  <Hourglass size={20} /> Loading digest...
                </Empty>
              ) : messages.length === 0 ? (
                <Empty>No approved Telegram messages have been ingested yet.</Empty>
              ) : (
                <MessageList>
                  {messages.map((message) => (
                    <MessageRow key={message.id} $fart={message.messageKind === "fart_noise"}>
                      <MessageMeta>
                        <strong>{message.source?.title ?? "Telegram"}</strong>
                        <Small>{message.messageKind}</Small>
                        <Small>{fmtDate(message.messageDate)}</Small>
                        {message.authorName && <Small>{message.authorName}</Small>}
                        {message.publicLink && (
                          <a href={message.publicLink} target="_blank" rel="noreferrer">
                            open
                          </a>
                        )}
                      </MessageMeta>
                      <MessageText>{message.summary || message.text}</MessageText>
                    </MessageRow>
                  ))}
                </MessageList>
              )}
            </Section>
          </div>

          <div>
            <Section>
              <SectionTitle>WTF Is That Smell</SectionTitle>
              <Muted>{farts.length} FART NOISES items in the current view.</Muted>
              {(fartTracksQuery.data?.tracks ?? []).length === 0 ? (
                <Muted>No wallet tracks saved here yet.</Muted>
              ) : (
                fartTracksQuery.data!.tracks.map((track) => (
                  <TrackRow key={track.id}>
                    <span>
                      {track.label || track.walletAddress}
                      <br />
                      <Small>{track.walletAddress}</Small>
                    </span>
                    <Small>
                      {track.status}
                      <br />
                      {track.fartTokenBalance ?? "0"} FART
                    </Small>
                  </TrackRow>
                ))
              )}
              {user && (
                <FormGrid>
                  <Field>
                    Track wallet
                    <TextInput
                      value={walletAddress}
                      onChange={(e: any) => setWalletAddress(e.target.value)}
                    />
                  </Field>
                  <Field>
                    Label
                    <TextInput
                      value={walletLabel}
                      onChange={(e: any) => setWalletLabel(e.target.value)}
                    />
                  </Field>
                  <Button
                    disabled={!walletAddress.trim() || saveFartTrack.isPending}
                    onClick={() => saveFartTrack.mutate()}
                  >
                    Save Track
                  </Button>
                </FormGrid>
              )}
            </Section>

            {canAdmin && (
              <Section>
                <SectionTitle>Admin</SectionTitle>
                <FormGrid>
                  <Field>
                    Source key
                    <TextInput
                      value={sourceDraft.key}
                      onChange={(e: any) =>
                        setSourceDraft((draft) => ({ ...draft, key: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    Source title
                    <TextInput
                      value={sourceDraft.title}
                      onChange={(e: any) =>
                        setSourceDraft((draft) => ({ ...draft, title: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    Telegram username
                    <TextInput
                      value={sourceDraft.telegramUsername}
                      onChange={(e: any) =>
                        setSourceDraft((draft) => ({
                          ...draft,
                          telegramUsername: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Button
                    disabled={!sourceDraft.key || !sourceDraft.title || saveSource.isPending}
                    onClick={() => saveSource.mutate()}
                  >
                    Save Source
                  </Button>
                </FormGrid>

                <FormGrid style={{ marginTop: 12 }}>
                  <Field>
                    Announcement lane
                    <select
                      value={announcement.sourceId}
                      onChange={(e) =>
                        setAnnouncement((draft) => ({
                          ...draft,
                          sourceId: e.target.value,
                        }))
                      }
                    >
                      <option value="">No Telegram target</option>
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    Announcement title
                    <TextInput
                      value={announcement.title}
                      onChange={(e: any) =>
                        setAnnouncement((draft) => ({ ...draft, title: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    Announcement body
                    <TextInput
                      value={announcement.body}
                      onChange={(e: any) =>
                        setAnnouncement((draft) => ({ ...draft, body: e.target.value }))
                      }
                    />
                  </Field>
                  <Button
                    disabled={
                      !announcement.title ||
                      !announcement.body ||
                      queueAnnouncement.isPending
                    }
                    onClick={() => queueAnnouncement.mutate()}
                  >
                    Queue Announcement
                  </Button>
                </FormGrid>

                {(announcementsQuery.data?.announcements ?? []).slice(0, 5).map((item) => (
                  <TrackRow key={item.id}>
                    <span>
                      {item.title}
                      <br />
                      <Small>{fmtDate(item.createdAt)}</Small>
                    </span>
                    <Small>{item.status}</Small>
                  </TrackRow>
                ))}
              </Section>
            )}
          </div>
        </Layout>
      </Shell>
    </AppWindow>
  );
}
