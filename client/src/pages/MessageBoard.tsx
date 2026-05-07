import { useState, useEffect, useRef, useCallback } from "react";
import {
  Button,
  Hourglass,
  Separator,
} from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import type {
  Category,
  Channel,
  Message,
  ReplyTarget,
} from "../features/board/types";
import { CHANNEL_ICONS } from "../features/board/utils";
import { useBoardData } from "../features/board/useBoardData";
import { useBoardMutations } from "../features/board/useBoardMutations";
import { BoardSidebar } from "../features/board/BoardSidebar";
import { BoardMessageList } from "../features/board/BoardMessageList";
import { BoardComposer } from "../features/board/BoardComposer";
import { BoardChannelSettings } from "../features/board/BoardChannelSettings";
import { BoardManagementDialogs } from "../features/board/BoardManagementDialogs";
import {
  ChanHeader,
  ChanIcon,
  ChanTitleBig,
  EmptyCenter,
  MainCol,
  MobileBackButton,
  MsgActions,
  Shell,
  StatusText,
  TopicText,
} from "../features/board/BoardChrome";

/* ═══ helpers ═════════════════════════════════════════════ */

/* ═══ types ═══════════════════════════════════════════════ */

/* ═══ main component ═════════════════════════════════════ */

export function MessageBoard() {
  const { user } = useAuth();
  const isMod = !!user && ["admin", "host", "cohost"].includes(user.role);
  const initialRouteTargetRef = useRef<{ channelId: number | null; messageId: number | null } | null>(null);

  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [msgText, setMsgText] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showEmojiFor, setShowEmojiFor] = useState<number | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<number | null>>(new Set());
  const [mobileSidebar, setMobileSidebar] = useState(true);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [highlightReplyId, setHighlightReplyId] = useState<number | null>(null);

  // New channel / category form
  const [showNewCh, setShowNewCh] = useState(false);
  const [newChTitle, setNewChTitle] = useState("");
  const [newChCatId, setNewChCatId] = useState<number | null>(null);
  const [newChType, setNewChType] = useState("text");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [channelManageTarget, setChannelManageTarget] = useState<Channel | null>(null);
  const [categoryManageTarget, setCategoryManageTarget] = useState<Category | null>(null);
  const [categoryRenameInput, setCategoryRenameInput] = useState("");
  const [editingMessageTarget, setEditingMessageTarget] = useState<Message | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<Message | null>(null);
  const [showComposeEmoji, setShowComposeEmoji] = useState(false);

  const msgEndRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);
  const prevMsgCount = useRef(0);

  if (initialRouteTargetRef.current === null && typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const channelId = Number(params.get("channel") || "");
    const messageId = Number(params.get("message") || "");
    initialRouteTargetRef.current = {
      channelId: Number.isInteger(channelId) && channelId > 0 ? channelId : null,
      messageId: Number.isInteger(messageId) && messageId > 0 ? messageId : null,
    };
  }

  // Data fetching
  const {
    catChannels,
    catList,
    channelList,
    channels,
    ch,
    isLoading,
    messageById,
    messages,
    uncategorized,
  } = useBoardData(activeChannelId);

  // Auto-select first channel
  useEffect(() => {
    const routeTarget = initialRouteTargetRef.current;
    if (!activeChannelId && routeTarget?.channelId) {
      setActiveChannelId(routeTarget.channelId);
      if (routeTarget.messageId) setHighlightReplyId(routeTarget.messageId);
      return;
    }
    if (!activeChannelId && channelList && channelList.length > 0) {
      const first = channelList.find((c) => c.active);
      if (first) setActiveChannelId(first.id);
    }
  }, [activeChannelId, channelList]);

  useEffect(() => {
    if (!activeChannelId || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("channel") === String(activeChannelId)) return;
    params.set("channel", String(activeChannelId));
    params.delete("message");
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", next);
  }, [activeChannelId]);

  useEffect(() => {
    setReplyTo(null);
  }, [activeChannelId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  // Mutations
  const {
    createCatMut,
    createChMut,
    deleteCatMut,
    deleteChMut,
    deleteMsgMut,
    editMsgMut,
    modChMut,
    pinMsgMut,
    reactMut,
    renameCatMut,
    sendMsgMut,
  } = useBoardMutations({
    activeChannelId,
    newChCatId,
    newChTitle,
    newChType,
    newCatName,
    setActiveChannelId,
    setAttachUrl,
    setCategoryManageTarget,
    setCategoryRenameInput,
    setChannelManageTarget,
    setDeleteMessageTarget,
    setEditingMessageTarget,
    setEditingMessageText,
    setMsgText,
    setNewCatName,
    setNewChTitle,
    setReplyTo,
    setShowEmojiFor,
    setShowNewCat,
    setShowNewCh,
  });

  const jumpToReply = useCallback((replyId: number) => {
    const el = document.getElementById(`board-msg-${replyId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightReplyId(replyId);
    window.setTimeout(() => {
      setHighlightReplyId((current) => (current === replyId ? null : current));
    }, 1600);
  }, []);

  useEffect(() => {
    const routeTarget = initialRouteTargetRef.current;
    if (!routeTarget?.messageId || messages.length === 0) return;
    window.setTimeout(() => jumpToReply(routeTarget.messageId as number), 120);
    initialRouteTargetRef.current = {
      channelId: routeTarget.channelId,
      messageId: null,
    };
  }, [jumpToReply, messages.length]);

  const toggleCat = (catId: number | null) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <AppWindow title="Message Board">
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Hourglass size={32} />
        </div>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Message Board">
      <Shell>
        {/* ─── sidebar ──────────────────────── */}
        <BoardSidebar
          activeChannelId={activeChannelId}
          catChannels={catChannels}
          catList={catList}
          channels={channels}
          collapsedCats={collapsedCats}
          isMod={isMod}
          mobileSidebar={mobileSidebar}
          newCatName={newCatName}
          newChCatId={newChCatId}
          newChTitle={newChTitle}
          newChType={newChType}
          onCreateCategory={() => createCatMut.mutate()}
          onCreateChannel={() => createChMut.mutate()}
          onManageCategory={(category) => {
            setCategoryManageTarget(category);
            setCategoryRenameInput(category.name);
          }}
          onManageChannel={setChannelManageTarget}
          onOpenChannel={(channelId) => {
            setActiveChannelId(channelId);
            setMobileSidebar(false);
          }}
          onToggleCategory={toggleCat}
          setNewCatName={setNewCatName}
          setNewChCatId={setNewChCatId}
          setNewChTitle={setNewChTitle}
          setNewChType={setNewChType}
          setShowNewCat={setShowNewCat}
          setShowNewCh={setShowNewCh}
          showNewCat={showNewCat}
          showNewCh={showNewCh}
          uncategorized={uncategorized}
        />

        {/* ─── main area ────────────────────── */}
        <MainCol $mobileHidden={mobileSidebar}>
          {!ch && (
            <EmptyCenter>
              <span style={{ fontSize: 28 }}>📋</span>
              <span>Select a channel</span>
            </EmptyCenter>
          )}

          {ch && (
            <>
              {/* channel header */}
              <ChanHeader>
                <MobileBackButton
                  size="sm"
                  onClick={() => setMobileSidebar(true)}
                >
                  ←
                </MobileBackButton>
                <ChanIcon style={{ fontSize: 16 }}>
                  {ch.locked ? "🔒" : CHANNEL_ICONS[ch.channelType] || "#"}
                </ChanIcon>
                <ChanTitleBig>{ch.title}</ChanTitleBig>
                {ch.topic && (
                  <>
                    <Separator orientation="vertical" style={{ height: 16 }} />
                    <TopicText title={ch.topic}>{ch.topic}</TopicText>
                  </>
                )}
                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                  {ch.canManage && (
                    <>
                      <Button size="sm" onClick={() => modChMut.mutate({ id: ch.id, pinned: !ch.pinned })}>
                        {ch.pinned ? "Unpin" : "📌"}
                      </Button>
                      <Button size="sm" onClick={() => modChMut.mutate({ id: ch.id, locked: !ch.locked })}>
                        {ch.locked ? "🔓" : "🔒"}
                      </Button>
                      <Button size="sm" onClick={() => setShowSettings(true)}>
                        ⚙️
                      </Button>
                    </>
                  )}
                </div>
              </ChanHeader>

              {ch.slowModeSeconds > 0 && (
                <StatusText>
                  🐌 Slow mode: {ch.slowModeSeconds}s between messages
                </StatusText>
              )}

              {/* messages */}
              <BoardMessageList
                channel={ch}
                composeRef={composeRef}
                highlightReplyId={highlightReplyId}
                isMod={isMod}
                messageById={messageById}
                messages={messages}
                msgEndRef={msgEndRef}
                onDeleteMessage={setDeleteMessageTarget}
                onEditMessage={(message) => {
                  setEditingMessageTarget(message);
                  setEditingMessageText(message.content);
                }}
                onJumpToReply={jumpToReply}
                onReact={(msgId, emoji) => reactMut.mutate({ msgId, emoji })}
                onReplyTo={setReplyTo}
                onToggleEmojiPicker={(messageId) =>
                  setShowEmojiFor(showEmojiFor === messageId ? null : messageId)
                }
                onTogglePin={(id, pinned) => pinMsgMut.mutate({ id, pinned })}
                showEmojiFor={showEmojiFor}
                user={user}
              />

              {/* compose */}
              <BoardComposer
                attachUrl={attachUrl}
                channel={ch}
                composeRef={composeRef}
                isSending={sendMsgMut.isPending}
                msgText={msgText}
                onAttachUrlChange={setAttachUrl}
                onCancelReply={() => setReplyTo(null)}
                onJumpToReply={jumpToReply}
                onMsgTextChange={setMsgText}
                onSend={(payload) => sendMsgMut.mutate(payload)}
                replyTo={replyTo}
                setShowComposeEmoji={setShowComposeEmoji}
                showComposeEmoji={showComposeEmoji}
                user={user}
              />
            </>
          )}
        </MainCol>
      </Shell>

      {/* settings modal */}
      {showSettings && ch && (
        <BoardChannelSettings
          channel={ch}
          onClose={() => setShowSettings(false)}
        />
      )}

      <BoardManagementDialogs
        categoryManageTarget={categoryManageTarget}
        categoryRenameInput={categoryRenameInput}
        channelManageTarget={channelManageTarget}
        deleteCatMut={deleteCatMut}
        deleteChMut={deleteChMut}
        deleteMessageTarget={deleteMessageTarget}
        deleteMsgMut={deleteMsgMut}
        editMsgMut={editMsgMut}
        editingMessageTarget={editingMessageTarget}
        editingMessageText={editingMessageText}
        modChMut={modChMut}
        renameCatMut={renameCatMut}
        setCategoryManageTarget={setCategoryManageTarget}
        setCategoryRenameInput={setCategoryRenameInput}
        setChannelManageTarget={setChannelManageTarget}
        setDeleteMessageTarget={setDeleteMessageTarget}
        setEditingMessageTarget={setEditingMessageTarget}
        setEditingMessageText={setEditingMessageText}
      />
    </AppWindow>
  );
}
