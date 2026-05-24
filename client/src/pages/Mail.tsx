import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  Hourglass,
  Panel,
  TextInput,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";

type Mailbox = {
  id: number;
  address: string;
  status: string;
};

type MailStatus = {
  mailbox: Mailbox;
  eligible: boolean;
  config: {
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
  toAddresses: string[];
  subject: string;
  textBody: string | null;
  createdAt: string;
  receivedAt: string | null;
  sentAt: string | null;
};

const Shell = styled.div`
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 8px;
  min-height: 520px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 8px;
  align-content: start;
`;

const MessageButton = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  min-height: 48px;
  text-align: left;
  font-weight: ${(p) => (p.$active ? "bold" : "normal")};
  overflow: hidden;
`;

const MessagePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 10px;
  min-height: 260px;
  overflow: auto;
`;

const Meta = styled.div`
  font-size: 11px;
  color: #444;
  overflow-wrap: anywhere;
`;

const Body = styled.div`
  margin-top: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const ComposeBody = styled.textarea`
  min-height: 104px;
  resize: vertical;
  padding: 8px;
  font: inherit;
  background: white;
  color: black;
  border: 2px inset #dfdfdf;
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
  const sendError = sendMutation.error
    ? sendMutation.error instanceof Error
      ? sendMutation.error.message
      : String(sendMutation.error)
    : "";

  return (
    <AppWindow title="WTF Mail">
      <Shell>
        <Stack>
          <GroupBox label="Mailbox">
            {!status ? (
              <Hourglass size={24} />
            ) : (
              <Stack>
                <strong>{status.mailbox.address}</strong>
                <Meta>
                  {status.mailbox.status} · {status.config.rolloutMode} · {status.config.provider}
                </Meta>
                <Meta>
                  Inbound {status.config.inboundEnabled ? "on" : "off"} · Outbound{" "}
                  {status.config.outboundEnabled ? "on" : "off"}
                </Meta>
              </Stack>
            )}
          </GroupBox>

          <GroupBox label="Messages">
            {!messagesQuery.data ? (
              <Hourglass size={24} />
            ) : (
              <Stack>
                {messages.map((message) => (
                  <MessageButton
                    key={message.id}
                    $active={selected?.id === message.id}
                    onClick={() => setSelectedId(message.id)}
                  >
                    <div>{message.subject}</div>
                    <Meta>
                      {message.direction === "inbound"
                        ? message.fromAddress
                        : message.toAddresses.join(", ")}
                    </Meta>
                  </MessageButton>
                ))}
                {messages.length === 0 ? <Meta>No mail yet.</Meta> : null}
              </Stack>
            )}
          </GroupBox>
        </Stack>

        <Stack>
          <GroupBox label="Compose">
            <Stack>
              <TextInput
                value={to}
                placeholder="to@example.com"
                onChange={(event: any) => setTo(event.target.value)}
              />
              <TextInput
                value={subject}
                placeholder="Subject"
                onChange={(event: any) => setSubject(event.target.value)}
              />
              <ComposeBody
                value={textBody}
                placeholder="Message"
                rows={5}
                onChange={(event: any) => setTextBody(event.target.value)}
              />
              {sendError ? <Meta style={{ color: "#a00" }}>{sendError}</Meta> : null}
              <Button
                disabled={
                  sendMutation.isPending ||
                  !to.trim() ||
                  !subject.trim() ||
                  !textBody.trim()
                }
                onClick={() => sendMutation.mutate()}
              >
                Send
              </Button>
            </Stack>
          </GroupBox>

          <GroupBox label="Selected Message">
            <MessagePanel>
              {selected ? (
                <>
                  <h3 style={{ marginTop: 0 }}>{selected.subject}</h3>
                  <Meta>From: {selected.fromAddress}</Meta>
                  <Meta>To: {selected.toAddresses.join(", ")}</Meta>
                  <Meta>
                    {selected.status} ·{" "}
                    {new Date(selected.receivedAt || selected.sentAt || selected.createdAt).toLocaleString()}
                  </Meta>
                  <Body>{selected.textBody || "(empty message)"}</Body>
                </>
              ) : (
                <Meta>Select a message.</Meta>
              )}
            </MessagePanel>
          </GroupBox>
        </Stack>
      </Shell>
    </AppWindow>
  );
}
