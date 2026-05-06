import { type ChangeEvent } from "react";
import { Button, GroupBox, Hourglass, TextInput, Tooltip } from "react95";
import {
  STUDIO_MEMBER_ROLE_LABELS,
  type StudioMemberSummary,
  type StudioPresenceEntry,
} from "@shared/types";
import {
  ChatBody,
  ChatMessageRow,
  ChatMeta,
  Column,
  ErrorBanner,
  PanelBody,
} from "./StudioChrome";
import { MemberInvitePicker } from "./MemberInvitePicker";
import type { ChatMessage } from "./types";
import { formatTimestamp } from "./utils";

interface StudioCollaborationColumnProps {
  canChat: boolean;
  canManage: boolean;
  chatDraft: string;
  chatError: string | null;
  chatLoading: boolean;
  chatMessages: ChatMessage[];
  invitePending: boolean;
  members: StudioMemberSummary[];
  onChatDraftChange: (draft: string) => void;
  onInvite: (userId: number) => void;
  onSendChat: () => void;
  onTogglePin: (messageId: number, pinned: boolean) => void;
  onTyping: () => void;
  pinnedMessages: ChatMessage[];
  presence: StudioPresenceEntry[];
  sendPending: boolean;
  userId: number;
}

export function StudioCollaborationColumn({
  canChat,
  canManage,
  chatDraft,
  chatError,
  chatLoading,
  chatMessages,
  invitePending,
  members,
  onChatDraftChange,
  onInvite,
  onSendChat,
  onTogglePin,
  onTyping,
  pinnedMessages,
  presence,
  sendPending,
  userId,
}: StudioCollaborationColumnProps) {
  return (
    <Column>
      <GroupBox label="Project chat" style={{ flex: 1, minHeight: 0 }}>
        <PanelBody>
          {chatLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <Hourglass size={24} />
            </div>
          ) : chatMessages.length === 0 ? (
            <div style={{ fontSize: 12, color: "#555" }}>
              No messages yet. Kick off the async feedback loop.
            </div>
          ) : (
            chatMessages.map((message) => {
              const isSystem = message.messageType === "studio_system";
              return (
                <ChatMessageRow key={message.id} $system={isSystem}>
                  <ChatMeta>
                    <span>
                      <strong>
                        {message.displayName || message.username || "Someone"}
                      </strong>{" "}
                      {isSystem ? "· system" : ""}
                    </span>
                    <span>{formatTimestamp(message.createdAt)}</span>
                  </ChatMeta>
                  <ChatBody>{message.content}</ChatBody>
                  {!isSystem ? (
                    <div style={{ marginTop: 2, textAlign: "right" }}>
                      <Button
                        size="sm"
                        onClick={() => onTogglePin(message.id, !message.pinned)}
                      >
                        {message.pinned ? "Unpin" : "Pin"}
                      </Button>
                    </div>
                  ) : null}
                </ChatMessageRow>
              );
            })
          )}
        </PanelBody>
      </GroupBox>

      {pinnedMessages.length > 0 ? (
        <GroupBox label={`Pinned notes (${pinnedMessages.length})`}>
          <div style={{ maxHeight: 120, overflowY: "auto", padding: 4 }}>
            {pinnedMessages.map((message) => (
              <div
                key={message.id}
                style={{
                  fontSize: 11,
                  padding: 4,
                  borderBottom: "1px dashed #888",
                }}
              >
                <strong>{message.displayName || message.username}:</strong>{" "}
                {message.content}
              </div>
            ))}
          </div>
        </GroupBox>
      ) : null}

      {canChat ? (
        <GroupBox label="Say something">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: 4,
            }}
          >
            {chatError ? <ErrorBanner>{chatError}</ErrorBanner> : null}
            <TextInput
              multiline
              rows={3}
              value={chatDraft}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                onChatDraftChange(event.target.value);
                onTyping();
              }}
              placeholder="Feedback, references, or just vibes."
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 4,
              }}
            >
              <Button size="sm" onClick={onSendChat} disabled={sendPending}>
                {sendPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </GroupBox>
      ) : null}

      <GroupBox label="Members">
        <div style={{ padding: 4, fontSize: 12 }}>
          {members.map((member) => {
            const isOnline = presence.some((entry) => entry.userId === member.userId);
            return (
              <div
                key={member.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "2px 0",
                }}
              >
                <span>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: isOnline ? "#1fbb38" : "#c0c0c0",
                      marginRight: 6,
                    }}
                  />
                  <Tooltip
                    text={STUDIO_MEMBER_ROLE_LABELS[member.role]}
                    enterDelay={150}
                  >
                    <span>{member.displayName || member.username}</span>
                  </Tooltip>
                </span>
                <span style={{ fontSize: 10, color: "#555" }}>
                  {STUDIO_MEMBER_ROLE_LABELS[member.role]}
                </span>
              </div>
            );
          })}
          {canManage ? (
            <MemberInvitePicker
              excludeUserIds={
                new Set<number>([
                  userId,
                  ...members.map((member) => member.userId),
                ])
              }
              onInvite={onInvite}
              isPending={invitePending}
            />
          ) : null}
        </div>
      </GroupBox>
    </Column>
  );
}
