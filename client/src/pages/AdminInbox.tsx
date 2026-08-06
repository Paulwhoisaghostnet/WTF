import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Clipboard, Inbox, Send, ShieldCheck, X } from "lucide-react";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiEmptyState, UiNotice, UiPanel, UiStatusPill, UiToolbar } from "../components/wtfos-ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type MessageKind = "issue" | "idea" | "question" | "feedback" | "other";
type ReaderMode = "raw" | "email" | "agent";

type AdminInboxAttachment = {
  mediaId: number;
  name: string;
  mimeType: string;
  size: number | null;
  url: string;
};

type AdminInboxMessage = {
  id: number;
  kind: MessageKind;
  subject: string;
  message: string;
  status: "unread" | "read";
  sender: {
    id: number;
    username: string;
    displayName: string | null;
    email: string | null;
  };
  routePath: string | null;
  createdAt: string;
  readAt: string | null;
  readByUserId: number | null;
  senderReadAt: string | null;
  attachments: AdminInboxAttachment[];
  replies: Array<{
    id: number;
    senderUserId: number;
    senderKind: "admin" | "user";
    senderUsername: string;
    senderDisplayName: string | null;
    body: string;
    createdAt: string;
  }>;
  rawFields: Array<{ field: string; value: string }>;
  email: string;
  agentMarkdown: string;
};

type AdminInboxResponse = {
  messages: AdminInboxMessage[];
  unreadCount: number;
};

type PendingScreenshot = {
  id: string;
  file: File;
  previewUrl: string;
};

const MAX_SCREENSHOTS = 5;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

const Surface = styled.div`
  min-height: 580px;
  padding: var(--wtf-space-3, 12px);
  background: var(--wtf-color-surface, #c0c0c0);
  color: var(--wtf-color-text, #111);
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;

  h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }

  p {
    margin: 0;
    max-width: 760px;
    line-height: 1.45;
  }

  @media (max-width: 680px) {
    flex-direction: column;
  }
`;

const TrustMark = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #166534;
  background: #ecfdf3;
  color: #14532d;
  font-weight: 700;
  white-space: nowrap;
`;

const FormGrid = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.7fr);
  gap: 12px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 10px;
  align-content: start;
`;

const Field = styled.label`
  display: grid;
  gap: 5px;
  font-weight: 700;
`;

const Helper = styled.span`
  color: #4b5563;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.35;
`;

const Input = styled.input`
  min-height: 36px;
  padding: 7px 9px;
  border: 2px inset #fff;
  background: #fff;
  color: #111;
  font: inherit;

  &:focus-visible {
    outline: 3px solid #005fcc;
    outline-offset: 2px;
  }
`;

const Select = styled.select`
  min-height: 36px;
  padding: 7px 9px;
  border: 2px inset #fff;
  background: #fff;
  color: #111;
  font: inherit;

  &:focus-visible {
    outline: 3px solid #005fcc;
    outline-offset: 2px;
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  min-height: 108px;
  box-sizing: border-box;
  resize: vertical;
  padding: 8px 9px;
  border: 2px inset #fff;
  background: #fff;
  color: #111;
  font: inherit;
  line-height: 1.45;

  &:focus-visible {
    outline: 3px solid #005fcc;
    outline-offset: 2px;
  }
`;

const EvidencePrompt = styled.div`
  padding: 12px;
  border: 1px solid #9a6700;
  background: #fff8d6;
  color: #4f3600;

  strong {
    display: block;
    margin-bottom: 4px;
  }
`;

const ScreenshotGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
`;

const Screenshot = styled.div`
  position: relative;
  padding: 6px;
  border: 1px solid #7b7b7b;
  background: #fff;

  img {
    display: block;
    width: 100%;
    height: 88px;
    object-fit: cover;
    background: #eee;
  }

  span {
    display: block;
    margin-top: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  button {
    position: absolute;
    top: 8px;
    right: 8px;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid #111;
    background: #fff;
    color: #991b1b;
  }
`;

const AdminLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(240px, 0.78fr) minmax(0, 1.45fr);
  gap: 12px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const MessageList = styled.div`
  display: grid;
  gap: 6px;
  max-height: 610px;
  overflow: auto;
`;

const MessageRow = styled.button<{ $active: boolean; $unread: boolean }>`
  width: 100%;
  padding: 10px;
  border: 1px solid ${({ $active }) => ($active ? "#064e3b" : "#7b7b7b")};
  border-left: 5px solid ${({ $unread }) => ($unread ? "#b45309" : "#64748b")};
  background: ${({ $active }) => ($active ? "#ecfdf5" : "#fff")};
  color: #111;
  text-align: left;
  cursor: pointer;

  strong,
  span {
    display: block;
  }

  span {
    margin-top: 4px;
    color: #4b5563;
    font-size: 12px;
  }

  &:focus-visible {
    outline: 3px solid #005fcc;
    outline-offset: 1px;
  }
`;

const Reader = styled.div`
  min-width: 0;
`;

const RawTableWrap = styled.div`
  overflow: auto;
  border: 1px solid #7b7b7b;
  background: #fff;

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 8px;
    border-bottom: 1px solid #d1d5db;
    text-align: left;
    vertical-align: top;
    white-space: pre-wrap;
  }

  th {
    width: 180px;
    background: #f3f4f6;
  }
`;

const Document = styled.pre`
  min-height: 300px;
  max-height: 520px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid #7b7b7b;
  background: #fff;
  color: #111;
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const AttachmentLinks = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
  margin-top: 10px;

  a {
    display: block;
    padding: 6px;
    border: 1px solid #7b7b7b;
    background: #fff;
    color: #003b7a;
  }

  img {
    display: block;
    width: 100%;
    height: 110px;
    object-fit: cover;
    margin-bottom: 5px;
    background: #eee;
  }
`;

const Conversation = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 12px;
`;

const ReplyBubble = styled.div<{ $admin: boolean }>`
  max-width: 88%;
  justify-self: ${({ $admin }) => ($admin ? "end" : "start")};
  padding: 9px 10px;
  border: 1px solid ${({ $admin }) => ($admin ? "#166534" : "#7b7b7b")};
  background: ${({ $admin }) => ($admin ? "#ecfdf3" : "#fff")};
  white-space: pre-wrap;
  line-height: 1.45;

  small {
    display: block;
    margin-bottom: 5px;
    color: #4b5563;
  }
`;

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function submittedRoute(): string {
  if (typeof window === "undefined") return "/admin-inbox";
  const params = new URLSearchParams(window.location.search);
  return params.get("from") || "/admin-inbox";
}

export function AdminInbox() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<MessageKind>("issue");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reproductionSteps, setReproductionSteps] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [impact, setImpact] = useState("");
  const [screenshots, setScreenshots] = useState<PendingScreenshot[]>([]);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = Number(new URLSearchParams(window.location.search).get("message"));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });
  const [readerMode, setReaderMode] = useState<ReaderMode>("agent");
  const [copyStatus, setCopyStatus] = useState("");
  const [replyBody, setReplyBody] = useState("");

  const inboxQuery = useQuery<AdminInboxResponse>({
    queryKey: ["admin-inbox", "messages"],
    queryFn: () => api.get("/api/admin-inbox/messages"),
    enabled: isAdmin,
  });

  const messages = inboxQuery.data?.messages ?? [];
  const selected = useMemo(
    () => messages.find((item) => item.id === selectedId) ?? messages[0] ?? null,
    [messages, selectedId]
  );

  useEffect(() => {
    if (!selectedId && messages[0]) setSelectedId(messages[0].id);
  }, [messages, selectedId]);

  const markRead = useMutation({
    mutationFn: (id: number) => api.patch(`/api/admin-inbox/messages/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-inbox", "messages"] }),
  });

  useEffect(() => {
    if (selected?.status === "unread" && !markRead.isPending) markRead.mutate(selected.id);
  }, [selected?.id, selected?.status]);

  const sendReply = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      api.post(`/api/admin-inbox/messages/${id}/replies`, { body }),
    onSuccess: () => {
      setReplyBody("");
      void queryClient.invalidateQueries({ queryKey: ["admin-inbox", "messages"] });
      void queryClient.invalidateQueries({ queryKey: ["comms"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const submitMessage = useMutation({
    mutationFn: async () => {
      const mediaIds: number[] = [];
      for (const screenshot of screenshots) {
        const fileData = await fileAsDataUrl(screenshot.file);
        const uploaded = await api.post<{ id: number }>("/api/media/upload", {
          title: screenshot.file.name,
          originalFilename: screenshot.file.name,
          mimeType: screenshot.file.type,
          fileData,
          mediaCategory: "image",
        });
        mediaIds.push(uploaded.id);
      }
      return api.post<{ messageId: number; adminRecipients: number; attachmentCount: number }>(
        "/api/admin-inbox/messages",
        {
          kind,
          subject,
          message,
          evidence,
          reproductionSteps,
          expectedOutcome,
          impact,
          routePath: submittedRoute(),
          clientUrl: typeof window === "undefined" ? null : window.location.href,
          attachmentMediaIds: mediaIds,
        }
      );
    },
    onSuccess: (result) => {
      screenshots.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setScreenshots([]);
      setKind("issue");
      setSubject("");
      setMessage("");
      setEvidence("");
      setReproductionSteps("");
      setExpectedOutcome("");
      setImpact("");
      setFormError("");
      setSuccessMessage(
        `Message ${result.messageId} delivered to the admin inbox with ${result.attachmentCount} screenshot${result.attachmentCount === 1 ? "" : "s"}.`
      );
      void queryClient.invalidateQueries({ queryKey: ["comms"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setFormError(error instanceof Error ? error.message : "Your message could not be delivered. Please try again.");
    },
  });

  const addScreenshots = (event: ChangeEvent<HTMLInputElement>) => {
    setFormError("");
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const room = MAX_SCREENSHOTS - screenshots.length;
    if (files.length > room) {
      setFormError(`You can attach up to ${MAX_SCREENSHOTS} screenshots.`);
      return;
    }
    const invalid = files.find(
      (file) => !file.type.startsWith("image/") || file.size > MAX_SCREENSHOT_BYTES
    );
    if (invalid) {
      setFormError(`${invalid.name} must be an image no larger than 8 MB.`);
      return;
    }
    setScreenshots((current) => [
      ...current,
      ...files.map((file) => ({
        id: `${file.name}:${file.size}:${file.lastModified}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  };

  const removeScreenshot = (id: string) => {
    setScreenshots((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    submitMessage.mutate();
  };

  const openMessage = (item: AdminInboxMessage) => {
    setSelectedId(item.id);
    if (item.status === "unread" && !markRead.isPending) markRead.mutate(item.id);
  };

  const copyDocument = async () => {
    if (!selected) return;
    const content = readerMode === "email" ? selected.email : selected.agentMarkdown;
    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Copy failed");
    }
  };

  return (
    <AppWindow title="Contact Admin">
      <Surface data-admin-inbox-surface={isAdmin ? "inbox" : "compose"}>
        <Header>
          <div>
            <h1>{isAdmin ? "Admin Inbox" : "Contact an admin"}</h1>
            <p>
              {isAdmin
                ? "Read direct user messages with their original fields, email rendering, screenshots, and an agent-ready Markdown brief."
                : "Send a private message directly to the people who administer wtfOS. Reports, questions, ideas, and evidence are welcome."}
            </p>
          </div>
          <TrustMark>
            <ShieldCheck size={18} aria-hidden /> {isAdmin ? "Admin access" : "Private admin channel"}
          </TrustMark>
        </Header>

        {isAdmin ? (
          <AdminLayout>
            <UiPanel title={`Messages · ${inboxQuery.data?.unreadCount ?? 0} unread`}>
              {inboxQuery.isLoading ? <p role="status">Loading admin messages…</p> : null}
              {inboxQuery.isError ? (
                <UiNotice tone="danger">{(inboxQuery.error as Error).message}</UiNotice>
              ) : null}
              <MessageList aria-label="Admin inbox messages">
                {messages.map((item) => (
                  <MessageRow
                    key={item.id}
                    type="button"
                    $active={selected?.id === item.id}
                    $unread={item.status === "unread"}
                    aria-label={`${item.status === "unread" ? "Unread" : "Read"} ${item.kind} from ${item.sender.displayName || item.sender.username}: ${item.subject}`}
                    onClick={() => openMessage(item)}
                  >
                    <strong>{item.subject}</strong>
                    <span>
                      {item.kind} · {item.sender.displayName || item.sender.username} · {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </MessageRow>
                ))}
              </MessageList>
              {!inboxQuery.isLoading && messages.length === 0 ? (
                <UiEmptyState title="No user messages yet">
                  New submissions from the Contact Admin desktop app will appear here.
                </UiEmptyState>
              ) : null}
            </UiPanel>

            <UiPanel title={selected ? selected.subject : "Message reader"}>
              {selected ? (
                <Reader>
                  <UiToolbar>
                    <UiStatusPill $tone={selected.status === "unread" ? "warning" : "success"}>
                      {selected.status}
                    </UiStatusPill>
                    <UiButton size="sm" uiVariant={readerMode === "raw" ? "primary" : "default"} onClick={() => setReaderMode("raw")}>Raw form table</UiButton>
                    <UiButton size="sm" uiVariant={readerMode === "email" ? "primary" : "default"} onClick={() => setReaderMode("email")}>Email</UiButton>
                    <UiButton size="sm" uiVariant={readerMode === "agent" ? "primary" : "default"} onClick={() => setReaderMode("agent")}>Agent Markdown</UiButton>
                    {readerMode !== "raw" ? (
                      <UiButton size="sm" onClick={copyDocument}>
                        {copyStatus === "Copied" ? <Check size={14} aria-hidden /> : <Clipboard size={14} aria-hidden />} {copyStatus || "Copy"}
                      </UiButton>
                    ) : null}
                  </UiToolbar>
                  {readerMode === "raw" ? (
                    <RawTableWrap>
                      <table>
                        <tbody>
                          {selected.rawFields.map((field) => (
                            <tr key={field.field}>
                              <th scope="row">{field.field}</th>
                              <td>{field.value || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </RawTableWrap>
                  ) : (
                    <Document aria-label={readerMode === "email" ? "Email formatted message" : "Agent-readable Markdown message"}>
                      {readerMode === "email" ? selected.email : selected.agentMarkdown}
                    </Document>
                  )}
                  {selected.attachments.length ? (
                    <AttachmentLinks aria-label="Attached screenshots">
                      {selected.attachments.map((attachment) => (
                        <a key={attachment.mediaId} href={attachment.url} target="_blank" rel="noreferrer">
                          <img src={attachment.url} alt={`Screenshot evidence: ${attachment.name}`} loading="lazy" />
                          {attachment.name}
                        </a>
                      ))}
                    </AttachmentLinks>
                  ) : null}
                  <Conversation aria-label="Conversation with reporting user">
                    <ReplyBubble $admin={false}>
                      <small>{selected.sender.displayName || selected.sender.username} · original message</small>
                      {selected.message}
                    </ReplyBubble>
                    {selected.replies.map((reply) => (
                      <ReplyBubble key={reply.id} $admin={reply.senderKind === "admin"}>
                        <small>
                          {reply.senderKind === "admin" ? "Admin" : "User"} · {reply.senderDisplayName || reply.senderUsername} · {new Date(reply.createdAt).toLocaleString()}
                        </small>
                        {reply.body}
                      </ReplyBubble>
                    ))}
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (replyBody.trim()) sendReply.mutate({ id: selected.id, body: replyBody.trim() });
                      }}
                    >
                      <Field>
                        Reply to {selected.sender.displayName || selected.sender.username}
                        <Textarea value={replyBody} rows={3} maxLength={10000} onChange={(event) => setReplyBody(event.target.value)} />
                      </Field>
                      {sendReply.isError ? <UiNotice tone="danger">{(sendReply.error as Error).message}</UiNotice> : null}
                      <UiButton type="submit" uiVariant="primary" disabled={!replyBody.trim() || sendReply.isPending}>
                        <Send size={14} aria-hidden /> {sendReply.isPending ? "Sending reply…" : "Send admin reply"}
                      </UiButton>
                    </form>
                  </Conversation>
                </Reader>
              ) : (
                <UiEmptyState title="Select a message">Choose a user message from the inbox.</UiEmptyState>
              )}
            </UiPanel>
          </AdminLayout>
        ) : (
          <FormGrid onSubmit={submit}>
            <UiPanel title="Your message">
              <Stack>
                <Field>
                  What kind of message is this?
                  <Select value={kind} onChange={(event) => setKind(event.target.value as MessageKind)}>
                    <option value="issue">Something is not working</option>
                    <option value="idea">Idea or suggestion</option>
                    <option value="question">Question for an admin</option>
                    <option value="feedback">General feedback</option>
                    <option value="other">Something else</option>
                  </Select>
                </Field>
                <Field>
                  Subject
                  <Input value={subject} minLength={4} maxLength={180} required onChange={(event) => setSubject(event.target.value)} placeholder="A short description" />
                </Field>
                <Field>
                  Message
                  <Helper>Tell us what happened, what you need, or what you want us to understand.</Helper>
                  <Textarea value={message} minLength={4} maxLength={10000} required rows={7} onChange={(event) => setMessage(event.target.value)} />
                </Field>
                <Field>
                  Impact
                  <Helper>Who is affected, and how badly does this block you?</Helper>
                  <Textarea value={impact} maxLength={4000} rows={3} onChange={(event) => setImpact(event.target.value)} />
                </Field>
              </Stack>
            </UiPanel>

            <Stack>
              <UiPanel title="Evidence and context">
                <Stack>
                  <EvidencePrompt>
                    <strong>Would you like to attach some screenshots?</strong>
                    Screenshots and exact reproduction details help an admin verify the issue and help an AI agent understand it quickly.
                  </EvidencePrompt>
                  <Field>
                    Evidence notes
                    <Helper>Describe what the screenshots show, including any error text or unexpected state.</Helper>
                    <Textarea value={evidence} maxLength={6000} rows={4} onChange={(event) => setEvidence(event.target.value)} />
                  </Field>
                  <Field>
                    Steps to reproduce
                    <Helper>List the clicks, inputs, route, account state, or timing that led here.</Helper>
                    <Textarea value={reproductionSteps} maxLength={6000} rows={4} onChange={(event) => setReproductionSteps(event.target.value)} />
                  </Field>
                  <Field>
                    What did you expect instead?
                    <Textarea value={expectedOutcome} maxLength={4000} rows={3} onChange={(event) => setExpectedOutcome(event.target.value)} />
                  </Field>
                  <UiButton as="label" uiVariant="default">
                    <Camera size={16} aria-hidden /> Attach screenshots
                    <input type="file" accept="image/*" multiple hidden disabled={screenshots.length >= MAX_SCREENSHOTS || submitMessage.isPending} onChange={addScreenshots} />
                  </UiButton>
                  <Helper>Up to {MAX_SCREENSHOTS} images, 8 MB each. Only admins can open these uploads.</Helper>
                  {screenshots.length ? (
                    <ScreenshotGrid>
                      {screenshots.map((item) => (
                        <Screenshot key={item.id}>
                          <img src={item.previewUrl} alt={`Pending screenshot: ${item.file.name}`} />
                          <button type="button" aria-label={`Remove screenshot ${item.file.name}`} onClick={() => removeScreenshot(item.id)}>
                            <X size={16} aria-hidden />
                          </button>
                          <span title={item.file.name}>{item.file.name}</span>
                        </Screenshot>
                      ))}
                    </ScreenshotGrid>
                  ) : null}
                </Stack>
              </UiPanel>
              {formError ? <UiNotice tone="danger">{formError}</UiNotice> : null}
              {successMessage ? <UiNotice tone="success">{successMessage}</UiNotice> : null}
              <UiButton uiVariant="primary" type="submit" disabled={!subject.trim() || !message.trim() || submitMessage.isPending}>
                {submitMessage.isPending ? <Inbox size={16} aria-hidden /> : <Send size={16} aria-hidden />}
                {submitMessage.isPending ? "Delivering to admins…" : "Send to admin inbox"}
              </UiButton>
              <Helper>
                Signed in as {user?.displayName || user?.username}. Your identity is attached by the server so admins know who to follow up with.
              </Helper>
            </Stack>
          </FormGrid>
        )}
      </Surface>
    </AppWindow>
  );
}
