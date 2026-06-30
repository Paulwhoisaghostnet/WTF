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
import { usePresentationShell } from "../lib/presentation-shell";

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

function mailRegionAttrs(region: string): any {
  return { "data-mail-region": region };
}

const Shell = styled.div`
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: var(--wtf-space-3, 12px);
  min-height: 520px;
  min-width: 0;

  &[data-mail-presentation-host="gamma"] {
    background: #070706;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-mail-presentation-host="gamma"],
  &[data-mail-presentation-host="gamma"] * {
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  &[data-mail-presentation-host="gamma"] [data-mail-region] {
    background-image: none !important;
    box-shadow: none !important;
    border-color: rgba(242, 234, 217, 0.16) !important;
    border-width: 1px !important;
    border-radius: 6px !important;
  }

  &[data-mail-presentation-host="gamma"] :where(section[data-mail-region], [data-mail-region="message-row"], [data-mail-region="reader"], [data-mail-region="compose-body"]) {
    background: #11110f !important;
    color: #f2ead9 !important;
  }

  &[data-mail-presentation-host="gamma"] :where(h2, h3, strong) {
    color: #f2ead9 !important;
  }

  &[data-mail-presentation-host="gamma"] [data-mail-region="message-title"],
  &[data-mail-presentation-host="gamma"] [data-mail-region="mailbox-address"],
  &[data-mail-presentation-host="gamma"] [data-mail-region="status-pill"] {
    color: #00d2ff !important;
  }

  &[data-mail-presentation-host="gamma"] [data-mail-region="message-row"][data-mail-active="true"] {
    border-color: #00d2ff !important;
  }

  &[data-mail-presentation-host="gamma"] [data-mail-region="meta"],
  &[data-mail-presentation-host="gamma"] [data-mail-region="message-body"] {
    color: rgba(242, 234, 217, 0.68) !important;
  }

  &[data-mail-presentation-host="gamma"] :where(input, textarea) {
    background: #070706 !important;
    color: #f2ead9 !important;
    border: 1px solid rgba(242, 234, 217, 0.2) !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-mail-presentation-host="gamma"] :where(button) {
    background: transparent !important;
    color: #f2ead9 !important;
    border-color: rgba(0, 210, 255, 0.42) !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-mail-presentation-host="gamma"] :where(button:hover, button:focus-visible, input:focus-visible, textarea:focus-visible) {
    border-color: #00d2ff !important;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }

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

const MessageButton = styled(UiButton).attrs(mailRegionAttrs("message-row"))<{ $active?: boolean }>`
  width: 100%;
  min-height: 48px;
  text-align: left;
  font-weight: ${(p) => (p.$active ? "bold" : "normal")};
  overflow: hidden;
  justify-content: flex-start;
`;

const MessagePanel = styled.div.attrs(mailRegionAttrs("reader"))`
  min-height: 260px;
  max-height: min(420px, 60vh);
  overflow: auto;
  min-width: 0;
`;

const Meta = styled.div.attrs(mailRegionAttrs("meta"))`
  font-size: var(--wtf-type-caption, 11px);
  color: var(--wtf-app-muted-text, #384352);
  overflow-wrap: anywhere;
  line-height: 1.35;
`;

const Body = styled.div.attrs(mailRegionAttrs("message-body"))`
  margin-top: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.45;
`;

const MessageTitle = styled.h3.attrs(mailRegionAttrs("message-title"))`
  margin: 0 0 var(--wtf-space-2, 8px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-title, 20px);
  line-height: 1.25;
  overflow-wrap: anywhere;
`;

const ComposeBody = styled.textarea.attrs(mailRegionAttrs("compose-body"))`
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
  const presentation = usePresentationShell();
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
      <Shell
        data-mail-presentation-host={presentation.host}
        data-mail-surface="mail"
        data-mail-region="surface"
      >
        <Stack data-mail-region="sidebar">
          <UiPanel title="Mailbox" data-mail-region="mailbox-panel">
            {statusQuery.isLoading ? (
              <Hourglass size={24} />
            ) : statusQuery.isError ? (
              <UiNotice tone="danger">{(statusQuery.error as Error).message}</UiNotice>
            ) : (
              <Stack>
                <strong data-mail-region="mailbox-address">{mailboxAddress}</strong>
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

          <UiPanel title="Messages" data-mail-region="messages-panel">
            {!messagesQuery.data ? (
              <Hourglass size={24} />
            ) : (
              <Stack>
                {messages.map((message) => (
                  <MessageButton
                    key={message.id}
                    $active={selected?.id === message.id}
                    data-mail-active={selected?.id === message.id ? "true" : "false"}
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

        <Stack data-mail-region="workspace">
          <UiPanel title="Compose" data-mail-region="compose-panel">
            <Stack>
              <TextInput
                aria-label="Mail recipients"
                data-mail-region="recipient-input"
                value={to}
                placeholder="to@example.com"
                onChange={(event: any) => setTo(event.target.value)}
              />
              <TextInput
                aria-label="Mail subject"
                data-mail-region="subject-input"
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
                data-mail-region="send-button"
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

          <UiPanel title="Selected Message" data-mail-region="selected-panel">
            <MessagePanel>
              {selected ? (
                <>
                  <MessageTitle>{selected.subject}</MessageTitle>
                  <UiStatusPill
                    $tone={selected.direction === "inbound" ? "info" : "neutral"}
                    data-mail-region="status-pill"
                  >
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
