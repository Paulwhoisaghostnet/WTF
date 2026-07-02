import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import { Button, TextInput } from "react95";
import { HAMSTER_REACTIONS, HAMSTER_SECTION_LABEL } from "../../lib/hamster-emoji";
import {
  Compose,
  ComposeArea,
  EmojiPicker,
  ReplyingBar,
  StatusText,
} from "./BoardChrome";
import type { Attachment, ChannelDetail, ReplyTarget } from "./types";

interface BoardComposerProps {
  attachUrl: string;
  channel: ChannelDetail["channel"];
  composeRef: RefObject<HTMLTextAreaElement | null>;
  isSending: boolean;
  msgText: string;
  onAttachUrlChange: (value: string) => void;
  onCancelReply: () => void;
  onJumpToReply: (replyId: number) => void;
  onMsgTextChange: Dispatch<SetStateAction<string>>;
  onSend: (payload: {
    content: string;
    attachments?: Attachment[];
    parentReplyId?: number | null;
  }) => void;
  replyTo: ReplyTarget | null;
  sendError?: string | null;
  setShowComposeEmoji: (updater: (previous: boolean) => boolean) => void;
  showComposeEmoji: boolean;
  user: unknown;
}

function snippet(text: string, limit = 90) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}...`;
}

export function BoardComposer({
  attachUrl,
  channel,
  composeRef,
  isSending,
  msgText,
  onAttachUrlChange,
  onCancelReply,
  onJumpToReply,
  onMsgTextChange,
  onSend,
  replyTo,
  sendError,
  setShowComposeEmoji,
  showComposeEmoji,
  user,
}: BoardComposerProps) {
  const handleSend = () => {
    const content = msgText.trim();
    const attachments: Attachment[] = [];
    if (attachUrl.trim()) {
      const url = attachUrl.trim();
      const isImage = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);
      attachments.push({
        url,
        name: url.split("/").pop() || "file",
        type: isImage ? "image" : "file",
      });
    }
    if (!content && attachments.length === 0) return;
    onSend({
      content,
      attachments,
      parentReplyId: replyTo?.id ?? null,
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <Compose data-board-region="composer">
      {!user ? (
        <StatusText>Log in to post messages.</StatusText>
      ) : !channel.canPost ? (
        <StatusText>
          {channel.locked ? "Channel locked." : "Your role cannot post here."}
        </StatusText>
      ) : (
        <>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {replyTo && (
              <ReplyingBar>
                <span>
                  Replying to{" "}
                  <strong>
                    {replyTo.displayName || replyTo.username || `#${replyTo.id}`}
                  </strong>
                  : {snippet(replyTo.content)}
                </span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <Button
                    size="sm"
                    onClick={() => onJumpToReply(replyTo.id)}
                    style={{ fontSize: 10, padding: "1px 6px" }}
                  >
                    Jump
                  </Button>
                  <Button
                    size="sm"
                    onClick={onCancelReply}
                    style={{ fontSize: 10, padding: "1px 6px" }}
                  >
                    Cancel
                  </Button>
                </div>
              </ReplyingBar>
            )}
            <ComposeArea
              aria-label={
                replyTo
                  ? `Reply text for ${replyTo.displayName || replyTo.username || "message"}`
                  : `Message board composer for ${channel.title}`
              }
              ref={composeRef}
              value={msgText}
              onChange={(event) => onMsgTextChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                replyTo
                  ? `Reply to ${replyTo.displayName || replyTo.username || "message"}… (Enter send, Shift+Enter newline)`
                  : `Message #${channel.title}… (Enter send, Shift+Enter newline)`
              }
              disabled={isSending}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              position: "relative",
            }}
          >
            <div style={{ display: "flex", gap: 3 }}>
              <TextInput
                aria-label="Attachment URL"
                value={attachUrl}
                onChange={(event: any) => onAttachUrlChange(event.target.value)}
                placeholder="Attach URL"
                style={{ fontSize: 10, width: 90 }}
              />
              <Button
                data-compact-control="true"
                aria-label="Insert hamster emoji"
                size="sm"
                onClick={() => setShowComposeEmoji((previous) => !previous)}
                title="Insert hamster emoji"
                style={{ fontSize: 14, padding: "0 4px", lineHeight: 1 }}
              >
                🐹
              </Button>
            </div>
            {showComposeEmoji && (
              <EmojiPicker data-board-popover="emoji" style={{ bottom: "100%", right: 0, marginBottom: 4 }}>
                <div style={{ width: "100%", fontSize: 9, textAlign: "center", color: "#555", marginBottom: 2 }}>
                  {HAMSTER_SECTION_LABEL}
                </div>
                {HAMSTER_REACTIONS.map((reaction) => (
                  <button
                    key={reaction.char}
                    type="button"
                    aria-label={`Insert ${reaction.label}`}
                    title={reaction.label}
                    onClick={() => {
                      onMsgTextChange((previous) => previous + reaction.char);
                      setShowComposeEmoji(() => false);
                      composeRef.current?.focus();
                    }}
                  >
                    {reaction.char}
                  </button>
                ))}
              </EmojiPicker>
            )}
            <Button
              disabled={(!msgText.trim() && !attachUrl.trim()) || isSending}
              onClick={handleSend}
              style={{ minWidth: 64 }}
            >
              {isSending ? "..." : "Send"}
            </Button>
            {sendError && <StatusText>{sendError}</StatusText>}
          </div>
        </>
      )}
    </Compose>
  );
}
