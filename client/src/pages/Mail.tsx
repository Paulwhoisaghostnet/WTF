import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Hourglass,
  TextInput,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import {
  UiButton,
  UiEmptyState,
  UiNotice,
  UiPanel,
  UiStatusPill,
} from "../components/wtfos-ui";
import { api } from "../lib/api";

type Mailbox = {
  id: number;
  address: string;
  status: string;
};

type MailStatus = {
  mailbox?: Partial<Mailbox> | null;
  eligible: boolean;
  config?: {
    provider: string;
    domain: string;
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    rolloutMode: string;
    resendConfigured: boolean;
    webhookSecretConfigured: boolean;
  };
};

type MailMessage = {
  id: number;
  direction: "inbound" | "outbound";
  status: string;
  fromAddress: string;
  toAddresses?: string[];
  subject: string;
  textBody: string | null;
  createdAt: string;
  receivedAt: string | null;
  sentAt: string | null;
};

const Shell = styled.div`
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: var(--wtf-space-3, 12px);
  min-height: 520px;
  min-width: 0;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
    min-height: 0;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
  align-content: start;
  min-width: 0;
`;

const MessageButton = styled(UiButton)<{ $active?: boolean }>`
  width: 100%;
  min-height: 48px;
  text-align: left;
  font-weight: ${(p) => (p.$active ? "bold" : "normal")};
  overflow: hidden;
  justify-content: flex-start;
`;

const MessagePanel = styled.div`
  min-height: 260px;
  max-height: min(420px, 60vh);
  overflow: auto;
  min-width: 0;
`;

const Meta = styled.div`
  font-size: var(--wtf-type-caption, 11px);
  color: var(--wtf-app-muted-text, #384352);
  overflow-wrap: anywhere;
  line-height: 1.35;
`;

const Body = styled.div`
  margin-top: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.45;
`;

const MessageTitle = styled.h3`
  margin: 0 0 var(--wtf-space-2, 8px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-title, 20px);
  line-height: 1.25;
  overflow-wrap: anywhere;
`;

const ComposeBody = styled.textarea`
  min-height: 104px;
  resize: vertical;
  padding: 8px;
  font: inherit;
  background: var(--wtf-app-control-bg, #ffffff);
  color: var(--wtf-app-text, #111);
  border: 2px inset var(--wtf-app-control-border, #808080);
  box-sizing: border-box;
`;

export function Mail() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [textBody, setTextBody] = useState("");

  const statusQuery = useQuery({
    queryKey: ["mail", "status"],
    queryFn: () => api.get<MailStatus>("/api/mail/status"),
  });
  const messagesQuery = useQuery({
    queryKey: ["mail", "messages"],
    queryFn: () => api.get<{ messages: MailMessage[] }>("/api/mail/messages"),
  });
  const messages = messagesQuery.data?.messages ?? [];
  const selected = useMemo(
    () => messages.find((message) => message.id === selectedId) ?? messages[0] ?? null,
    [messages, selectedId]
  );

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post("/api/mail/send", {
        to: to
          .split(/[,\s]+/)
          .map((entry) => entry.trim())
          .filter(Boolean),
        subject,
        textBody,
      }),
    onSuccess: () => {
      setTo("");
      setSubject("");
      setTextBody("");
      qc.invalidateQueries({ queryKey: ["mail", "messages"] });
      qc.invalidateQueries({ queryKey: ["comms"] });
    },
  });

  const status = statusQuery.data;
  const mailboxAddress = status?.mailbox?.address || "Mailbox pending";
  const mailboxStatus = status?.mailbox?.status || (status?.eligible ? "eligible" : "unavailable");
  const mailConfig = status?.config;
  const sendError = sendMutation.error
    ? sendMutation.error instanceof Error
      ? sendMutation.error.message
      : String(sendMutation.error)
    : "";

  return (
    <AppWindow title="WTF Mail">
      <Shell>
        <Stack>
          <UiPanel title="Mailbox">
            {statusQuery.isLoading ? (
              <Hourglass size={24} />
            ) : statusQuery.isError ? (
              <UiNotice tone="danger">{(statusQuery.error as Error).message}</UiNotice>
            ) : (
              <Stack>
                <strong>{mailboxAddress}</strong>
                <Meta>
                  {mailboxStatus} · {mailConfig?.rolloutMode || "unknown"} ·{" "}
                  {mailConfig?.provider || "provider pending"}
                </Meta>
                <Meta>
                  Inbound {mailConfig?.inboundEnabled ? "on" : "off"} · Outbound{" "}
                  {mailConfig?.outboundEnabled ? "on" : "off"}
                </Meta>
              </Stack>
            )}
          </UiPanel>

          <UiPanel title="Messages">
            {!messagesQuery.data ? (
              <Hourglass size={24} />
            ) : (
              <Stack>
                {messages.map((message) => (
                  <MessageButton
                    key={message.id}
                    $active={selected?.id === message.id}
                    aria-label={`Open mail: ${message.subject}`}
                    onClick={() => setSelectedId(message.id)}
                  >
                    <div>{message.subject}</div>
                    <Meta>
                      {message.direction === "inbound"
                        ? message.fromAddress
                        : (message.toAddresses ?? []).join(", ")}
                    </Meta>
                  </MessageButton>
                ))}
                {messages.length === 0 ? (
                  <UiEmptyState title="No mail yet">
                    Incoming and sent messages will appear here.
                  </UiEmptyState>
                ) : null}
              </Stack>
            )}
          </UiPanel>
        </Stack>

        <Stack>
          <UiPanel title="Compose">
            <Stack>
              <TextInput
                aria-label="Mail recipients"
                value={to}
                placeholder="to@example.com"
                onChange={(event: any) => setTo(event.target.value)}
              />
              <TextInput
                aria-label="Mail subject"
                value={subject}
                placeholder="Subject"
                onChange={(event: any) => setSubject(event.target.value)}
              />
              <ComposeBody
                aria-label="Mail message"
                value={textBody}
                placeholder="Message"
                rows={5}
                onChange={(event: any) => setTextBody(event.target.value)}
              />
              {sendError ? <UiNotice tone="danger">{sendError}</UiNotice> : null}
              <UiButton
                uiVariant="primary"
                disabled={
                  sendMutation.isPending ||
                  !to.trim() ||
                  !subject.trim() ||
                  !textBody.trim()
                }
                onClick={() => sendMutation.mutate()}
              >
                Send mail
              </UiButton>
            </Stack>
          </UiPanel>

          <UiPanel title="Selected Message">
            <MessagePanel>
              {selected ? (
                <>
                  <MessageTitle>{selected.subject}</MessageTitle>
                  <UiStatusPill $tone={selected.direction === "inbound" ? "info" : "neutral"}>
                    {selected.direction}
                  </UiStatusPill>
                  <Meta>From: {selected.fromAddress}</Meta>
                  <Meta>To: {(selected.toAddresses ?? []).join(", ") || "none"}</Meta>
                  <Meta>
                    {selected.status} ·{" "}
                    {new Date(selected.receivedAt || selected.sentAt || selected.createdAt).toLocaleString()}
                  </Meta>
                  <Body>{selected.textBody || "(empty message)"}</Body>
                </>
              ) : (
                <UiEmptyState title="Select a message">
                  Choose a message from the list to read it here.
                </UiEmptyState>
              )}
            </MessagePanel>
          </UiPanel>
        </Stack>
      </Shell>
    </AppWindow>
  );
}
