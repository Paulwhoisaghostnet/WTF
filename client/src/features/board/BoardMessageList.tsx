import type { RefObject, KeyboardEvent } from "react";
import { ROLE_LABELS } from "@shared/types";
import { UserLink } from "../../components/UserLink";
import { HAMSTER_REACTIONS, HAMSTER_SECTION_LABEL } from "../../lib/hamster-emoji";
import {
  AttachFile,
  AttachThumb,
  AvatarCircle,
  EmojiPicker,
  EmptyCenter,
  MsgActBtn,
  MsgActions,
  MsgAttachments,
  MsgAuthor,
  MsgAuthorLine,
  MsgBody,
  MsgContent,
  MsgRow,
  MsgScroll,
  MsgTime,
  ReactionBar,
  ReactionChip,
  ReplyQuote,
  RolePill,
} from "./BoardChrome";
import type { ChannelDetail, Message, ReplyTarget } from "./types";
import { EMOJI_QUICK, safeAttachmentUrl, timeAgo } from "./utils";

interface BoardMessageListProps {
  channel: ChannelDetail["channel"];
  composeRef: RefObject<HTMLTextAreaElement | null>;
  highlightReplyId: number | null;
  isMod: boolean;
  messageById: Map<number, Message>;
  messages: Message[];
  msgEndRef: RefObject<HTMLDivElement | null>;
  onDeleteMessage: (message: Message) => void;
  onEditMessage: (message: Message) => void;
  onJumpToReply: (replyId: number) => void;
  onReact: (messageId: number, emoji: string) => void;
  onReplyTo: (replyTo: ReplyTarget) => void;
  onToggleEmojiPicker: (messageId: number) => void;
  onTogglePin: (messageId: number, pinned: boolean) => void;
  showEmojiFor: number | null;
  user: { id: number } | null | undefined;
}

function avatarColor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 50%, 40%)`;
}

function snippet(text: string, limit = 90) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}...`;
}

function onKeyboardActivate(event: KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export function BoardMessageList({
  channel,
  composeRef,
  highlightReplyId,
  isMod,
  messageById,
  messages,
  msgEndRef,
  onDeleteMessage,
  onEditMessage,
  onJumpToReply,
  onReact,
  onReplyTo,
  onToggleEmojiPicker,
  onTogglePin,
  showEmojiFor,
  user,
}: BoardMessageListProps) {
  return (
    <MsgScroll>
      {messages.length === 0 && (
        <EmptyCenter style={{ padding: 32 }}>
          <span>No messages yet. Start the conversation!</span>
        </EmptyCenter>
      )}
      {messages.map((message) => {
        const authorName = message.displayName || message.username || "Unknown";
        const canDelete = (user && message.userId === user.id) || isMod;
        const canPin = channel.canManage;

        return (
          <MsgRow
            id={`board-msg-${message.id}`}
            key={message.id}
            $pinned={message.pinned}
            $highlight={highlightReplyId === message.id}
          >
            <AvatarCircle $color={avatarColor(authorName)}>
              {message.avatarUrl ? (
                <img src={message.avatarUrl} alt="" />
              ) : (
                authorName[0]?.toUpperCase()
              )}
            </AvatarCircle>
            <MsgBody>
              <MsgAuthorLine>
                <MsgAuthor>
                  <UserLink
                    username={message.username}
                    displayName={message.displayName}
                  />
                </MsgAuthor>
                {message.role && (
                  <RolePill>{ROLE_LABELS[message.role]}</RolePill>
                )}
                {message.webhookId && <RolePill>WEBHOOK</RolePill>}
                {message.pinned && <span style={{ fontSize: 10 }}>📌</span>}
                {message.editedAt && (
                  <span style={{ fontSize: 9, color: "#888" }}>(edited)</span>
                )}
                <MsgTime title={new Date(message.createdAt).toLocaleString()}>
                  {timeAgo(message.createdAt)}
                </MsgTime>
              </MsgAuthorLine>

              {message.parentReplyId && (
                <ReplyQuote
                  onClick={() => onJumpToReply(message.parentReplyId as number)}
                  title={`Jump to message #${message.parentReplyId}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) =>
                    onKeyboardActivate(event, () =>
                      onJumpToReply(message.parentReplyId as number)
                    )
                  }
                >
                  {(() => {
                    const parent = messageById.get(message.parentReplyId as number);
                    if (!parent) {
                      return `↪ Reply to message #${message.parentReplyId}`;
                    }
                    const parentName =
                      parent.displayName || parent.username || "Unknown";
                    return `↪ Replying to ${parentName}: ${snippet(parent.content)}`;
                  })()}
                </ReplyQuote>
              )}

              <MsgContent>{message.content}</MsgContent>

              {message.attachments.length > 0 && (
                <MsgAttachments>
                  {message.attachments.map((attachment, index) => {
                    const href = safeAttachmentUrl(attachment.url);
                    if (!href) return null;
                    return attachment.type === "image" ? (
                      <AttachThumb
                        key={index}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img src={href} alt={attachment.name} />
                      </AttachThumb>
                    ) : (
                      <AttachFile
                        key={index}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        📎 {attachment.name}
                      </AttachFile>
                    );
                  })}
                </MsgAttachments>
              )}

              {message.reactions.length > 0 && (
                <ReactionBar>
                  {message.reactions.map((reaction) => (
                    <ReactionChip
                      key={reaction.emoji}
                      $active={
                        !!user && reaction.users.some((entry) => entry.id === user.id)
                      }
                      onClick={() => {
                        if (!user) return;
                        onReact(message.id, reaction.emoji);
                      }}
                      title={reaction.users.map((entry) => entry.username).join(", ")}
                    >
                      {reaction.emoji} {reaction.users.length}
                    </ReactionChip>
                  ))}
                </ReactionBar>
              )}

              <MsgActions>
                {user && (
                  <div style={{ position: "relative" }}>
                    <MsgActBtn onClick={() => onToggleEmojiPicker(message.id)}>
                      React
                    </MsgActBtn>
                    {showEmojiFor === message.id && (
                      <EmojiPicker>
                        {EMOJI_QUICK.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => onReact(message.id, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                        <div style={{ width: "100%", borderTop: "1px solid #999", margin: "3px 0", fontSize: 9, textAlign: "center", color: "#555" }}>
                          {HAMSTER_SECTION_LABEL}
                        </div>
                        {HAMSTER_REACTIONS.map((reaction) => (
                          <button
                            key={reaction.char}
                            title={reaction.label}
                            onClick={() => onReact(message.id, reaction.char)}
                          >
                            {reaction.char}
                          </button>
                        ))}
                      </EmojiPicker>
                    )}
                  </div>
                )}
                {user && channel.canPost && (
                  <MsgActBtn
                    onClick={() => {
                      onReplyTo({
                        id: message.id,
                        username: message.username,
                        displayName: message.displayName,
                        content: message.content,
                      });
                      setTimeout(() => composeRef.current?.focus(), 0);
                    }}
                  >
                    Reply
                  </MsgActBtn>
                )}
                {canPin && (
                  <MsgActBtn
                    onClick={() => onTogglePin(message.id, !message.pinned)}
                  >
                    {message.pinned ? "Unpin" : "Pin"}
                  </MsgActBtn>
                )}
                {canDelete && user && message.userId === user.id && (
                  <MsgActBtn onClick={() => onEditMessage(message)}>
                    Edit
                  </MsgActBtn>
                )}
                {canDelete && (
                  <MsgActBtn onClick={() => onDeleteMessage(message)}>
                    Delete
                  </MsgActBtn>
                )}
              </MsgActions>
            </MsgBody>
          </MsgRow>
        );
      })}
      <div ref={msgEndRef} />
    </MsgScroll>
  );
}
