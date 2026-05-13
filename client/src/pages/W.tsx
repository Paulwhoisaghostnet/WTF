import { useEffect, useRef, useState } from "react";
import { Hourglass } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { WMessagesPanel } from "../features/w/messages/WMessagesPanel";
import { WSocialPanel } from "../features/w/social/WSocialPanel";
import { WTimelinePanel } from "../features/w/timeline/WTimelinePanel";
import type { WPostMediaAttachment, WView } from "../features/w/types";
import { useWDataQueries } from "../features/w/useWDataQueries";
import { useWMutations } from "../features/w/useWMutations";
import { WShell } from "../features/w/WShell";
import { useAuth } from "../lib/auth-context";

function normalizeXConversationId(id: string | null | undefined): string {
  return (id || "").replace(/^g/i, "");
}

function sameXConversationId(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeXConversationId(a);
  const right = normalizeXConversationId(b);
  return Boolean(left && right && left === right);
}

export function W() {
  const { user, hasPermission } = useAuth();
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [quoteOpenFor, setQuoteOpenFor] = useState<string | null>(null);
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, string>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [replySuccess, setReplySuccess] = useState<Record<string, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [actionSuccess, setActionSuccess] = useState<Record<string, string>>({});
  const [activeView, setActiveView] = useState<WView>("timeline");
  const [selectedOAuthTier, setSelectedOAuthTier] = useState("read");
  const [groupchatDraft, setGroupchatDraft] = useState("");
  const groupchatEndRef = useRef<HTMLDivElement>(null);
  const [postDraft, setPostDraft] = useState("");
  const [postMedia, setPostMedia] = useState<WPostMediaAttachment[]>([]);
  const [postStatus, setPostStatus] = useState("");
  const [platformDmStatus, setPlatformDmStatus] = useState("");
  const [selectedGroupchatId, setSelectedGroupchatId] = useState("");
  const [selectedAdminGroupchatIds, setSelectedAdminGroupchatIds] = useState<string[]>([]);
  const [manualGroupchatIds, setManualGroupchatIds] = useState("");
  const [streamHandlesDraft, setStreamHandlesDraft] = useState("");
  const [followTarget, setFollowTarget] = useState("");
  const [followStatus, setFollowStatus] = useState("");
  const [followListType, setFollowListType] = useState<"followers" | "following">("followers");
  const [followListRequested, setFollowListRequested] = useState(false);
  const [embeddedSpaceUrl, setEmbeddedSpaceUrl] = useState<string | null>(null);
  const [nightMode, setNightMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("w:night-mode");
    const nightDefaultApplied = window.localStorage.getItem("w:night-mode-default-v2") === "1";
    return !nightDefaultApplied || saved === null ? true : saved === "1";
  });
  const [oauthFlash, setOauthFlash] = useState<{
    kind: "ok" | "err";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("w:night-mode-default-v2", "1");
    window.localStorage.setItem("w:night-mode", nightMode ? "1" : "0");
  }, [nightMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const verified = params.get("verified");
    const err = params.get("error");
    if (!verified && !err) return;

    if (verified === "twitter_oauth2") {
      setOauthFlash({ kind: "ok", message: "X account connected to W." });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_session") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter verification failed: sign-in session was lost between start and callback. Disable cookie/SW blockers and try again.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_state") {
      setOauthFlash({
        kind: "err",
        message: "Twitter verification failed: OAuth state mismatch. Start the connect flow again in this tab.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_expired") {
      setOauthFlash({
        kind: "err",
        message: "Twitter verification timed out. Authorise within 10 minutes and try again.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_token") {
      setOauthFlash({
        kind: "err",
        message:
          "Twitter verification failed at token exchange. Check that the X Developer Portal callback URL exactly matches https://<site>/api/auth/twitter-oauth2/callback and that TWITTER_CLIENT_ID/TWITTER_CLIENT_SECRET belong to that app.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2_scope_missing") {
      const missing = params.get("missing") || "required W scopes";
      setOauthFlash({
        kind: "err",
        message:
          `X issued a token but did not grant: ${missing}. ` +
          "For Full W participation, open console.x.com → your app → User authentication settings and set App permissions to 'Read and write and Direct message', save, regenerate the OAuth2 Client ID/Secret if needed, then reconnect from W Settings.",
      });
      setActiveView("settings");
    } else if (err && err.startsWith("twitter_oauth2_me")) {
      const bucket = err.slice("twitter_oauth2_me".length).replace(/^_/, "");
      let hint = "Check server [auth] logs for the raw response body.";
      if (bucket === "401")
        hint =
          "X returned 401: token rejected. users.read was likely not among " +
          "the granted scopes — re-check the scopes checklist in the X " +
          "Developer Console.";
      else if (bucket === "402")
        hint =
          "X returned 402: Pay-Per-Use credits required. Activate the app " +
          "on the new plan in the Developer Console (Feb 6 2026 launch) " +
          "and confirm the $10 voucher / payment method.";
      else if (bucket === "403")
        hint =
          "X returned 403. The new Console is at console.x.com and " +
          "'Projects & Apps' is gone — apps are a flat list now. Usual " +
          "cause: User authentication settings were edited after the " +
          "Client ID/Secret were issued, so they're stale. Fix: open " +
          "console.x.com → your app → User authentication settings → " +
          "Save, then Keys and tokens → Regenerate OAuth 2.0 Client " +
          "ID + Secret, update server env, redeploy. Run the admin " +
          "self-test below to confirm v2 access before retrying.";
      else if (bucket === "429") hint = "X returned 429: rate limited, retry in a minute.";
      else if (bucket === "5xx") hint = "X returned 5xx: upstream X issue, retry later.";
      setOauthFlash({
        kind: "err",
        message: `Token OK but /users/me failed${bucket ? ` (HTTP ${bucket})` : ""}. ${hint}`,
      });
      setActiveView("settings");
    } else if (err && err.startsWith("twitter_oauth2_x_")) {
      const xCode = err.slice("twitter_oauth2_x_".length);
      setOauthFlash({
        kind: "err",
        message:
          `Twitter rejected the authorisation (${xCode || "unknown"}). ` +
          "Since X's Feb 6 2026 Pay-Per-Use launch, apps that were on the " +
          "legacy Free/Basic tier must be opted-in through the new " +
          "Developer Console and must have the requested scopes + callback " +
          "URL whitelisted before /i/oauth2/authorize will succeed. See " +
          "the Pay-Per-Use notice below.",
      });
      setActiveView("settings");
    } else if (err === "twitter_oauth2" || err === "twitter_oauth2_not_configured") {
      setOauthFlash({
        kind: "err",
        message: "Twitter verification failed. See server [auth] twitter oauth2 log entries for details.",
      });
      setActiveView("settings");
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const {
    timelineQuery,
    capabilities,
    canUseWAdminControls,
    followsSummaryQuery,
    followsListQuery,
    groupchatQuery,
    adminDmConversationsQuery,
    oauthDiagnosticsQuery,
    adminStreamRulesQuery,
    adminStreamStatusQuery,
    dmDiagnosticsQuery,
    spacesQuery,
  } = useWDataQueries({
    activeView,
    followListType,
    followListRequested,
    userRole: user?.role,
    hasPermission,
  });

  const { data, isLoading, isFetching, refetch } = timelineQuery;
  const {
    data: followsSummary,
    refetch: refetchFollowsSummary,
  } = followsSummaryQuery;
  const {
    data: followsList,
    error: followsListError,
    isFetching: followsListFetching,
    refetch: refetchFollowsList,
  } = followsListQuery;
  const {
    data: groupchat,
    isFetching: groupchatFetching,
    refetch: refetchGroupchat,
  } = groupchatQuery;
  const {
    data: adminDmConversations,
    error: adminDmConversationsError,
    isFetching: adminDmConversationsFetching,
    refetch: refetchAdminDmConversations,
  } = adminDmConversationsQuery;
  const {
    data: oauthDiagnostics,
    isFetching: oauthDiagnosticsFetching,
    error: oauthDiagnosticsError,
    refetch: refetchOauthDiagnostics,
  } = oauthDiagnosticsQuery;
  const {
    data: adminStreamRules,
    isFetching: adminStreamRulesFetching,
    refetch: refetchAdminStreamRules,
  } = adminStreamRulesQuery;
  const { data: adminStreamStatus, refetch: refetchAdminStreamStatus } = adminStreamStatusQuery;

  useEffect(() => {
    if (!adminStreamRules) return;
    setStreamHandlesDraft((adminStreamRules.manifestHandles || []).join(", "));
  }, [adminStreamRules?.manifestHandles?.join(",")]);

  const {
    data: dmDiagnostics,
    isFetching: dmDiagnosticsFetching,
    refetch: refetchDmDiagnostics,
  } = dmDiagnosticsQuery;

  const {
    data: spacesData,
    isFetching: spacesFetching,
    refetch: refetchSpaces,
  } = spacesQuery;

  useEffect(() => {
    const currentIds = adminDmConversations?.currentConversationIds?.length
      ? adminDmConversations.currentConversationIds
      : adminDmConversations?.currentConversationId
        ? [adminDmConversations.currentConversationId]
        : [];
    if (currentIds.length > 0) {
      setSelectedAdminGroupchatIds(currentIds);
    }
  }, [adminDmConversations?.currentConversationId, adminDmConversations?.currentConversationIds]);

  useEffect(() => {
    const chats = groupchat?.chats || [];
    const firstVisible = chats.find((chat) => chat.configured && chat.conversationId)?.conversationId || "";
    if (!selectedGroupchatId && firstVisible) {
      setSelectedGroupchatId(firstVisible);
    }
    if (
      selectedGroupchatId &&
      chats.length > 0 &&
      !chats.some((chat) => chat.conversationId === selectedGroupchatId)
    ) {
      setSelectedGroupchatId(firstVisible);
    }
  }, [groupchat?.chats, selectedGroupchatId]);

  const {
    selfTestMutation,
    replyMutation,
    engageMutation,
    groupchatMutation,
    postMutation,
    mediaUploadMutation,
    saveGroupchatMutation,
    saveStreamRulesMutation,
    followMutation,
  } = useWMutations({
    followListRequested,
    refetchTimeline: refetch,
    refetchGroupchat,
    refetchAdminDmConversations,
    refetchAdminStreamRules,
    refetchAdminStreamStatus,
    refetchFollowsSummary,
    refetchFollowsList,
    setReplyErrors,
    setReplySuccess,
    setReplyDrafts,
    setReplyOpenFor,
    setActionErrors,
    setActionSuccess,
    setQuoteOpenFor,
    setQuoteDrafts,
    setGroupchatDraft,
    setPostDraft,
    setPostMedia,
    setPostStatus,
    setPlatformDmStatus,
    setSelectedAdminGroupchatIds,
    setSelectedGroupchatId,
    setFollowStatus,
    setFollowTarget,
  });

  const posts = data?.timeline || [];
  const accounts = data?.accounts || [];
  const viewerCanReply = Boolean(data?.canReplyInline && user?.twitterVerified);
  const canPostInW = Boolean(
    capabilities?.capabilities.find((capability) => capability.key === "new_post")?.enabled
  );
  const canManageFollows = Boolean(
    capabilities?.capabilities.find((capability) => capability.key === "follows")?.enabled
  );
  const xProfile = followsSummary?.profile || null;
  const followsListErrorMessage = followsListError instanceof Error ? followsListError.message : "";
  const visibleGroupchats = groupchat?.chats?.length
    ? groupchat.chats
    : groupchat
      ? [
          {
            configured: groupchat.configured,
            conversationId: groupchat.conversationId || null,
            conversation: groupchat.conversation || null,
            messages: groupchat.messages || [],
            diagnostics: groupchat.diagnostics || null,
          },
        ]
      : [];
  const activeGroupchat =
    visibleGroupchats.find((chat) => chat.conversationId === selectedGroupchatId) ||
    visibleGroupchats.find((chat) => chat.configured) ||
    visibleGroupchats[0] ||
    null;
  const isOfficialGroupchat = (conversationId: string | null | undefined) =>
    Boolean(
      conversationId &&
        (capabilities?.groupchatIds || []).some((officialId) =>
          sameXConversationId(officialId, conversationId)
        )
    );
  const activeGroupchatParticipantLabel =
    activeGroupchat?.conversation?.participants
      ?.map((participant) => (participant.username ? `@${participant.username}` : participant.id))
      .slice(0, 5)
      .join(", ") || "";
  const activeGroupchatTitle = activeGroupchat
    ? isOfficialGroupchat(activeGroupchat.conversationId)
      ? "Official WTF Gameshow Group Chat"
      : activeGroupchat.conversation?.name ||
        activeGroupchatParticipantLabel ||
        activeGroupchat.conversationId ||
        "W group chat"
    : "Official WTF Gameshow Group Chat";
  const currentGroupchatIds = selectedAdminGroupchatIds.length
    ? selectedAdminGroupchatIds
    : adminDmConversations?.currentConversationIds?.length
      ? adminDmConversations.currentConversationIds
      : adminDmConversations?.currentConversationId
        ? [adminDmConversations.currentConversationId]
        : [];
  useEffect(() => {
    if (manualGroupchatIds || currentGroupchatIds.length > 0) return;
    setManualGroupchatIds("g1934373363226407162");
  }, [currentGroupchatIds.length, manualGroupchatIds]);

  const groupchatMessageCount = activeGroupchat?.messages?.length ?? 0;

  useEffect(() => {
    if (groupchatMessageCount > 0) {
      groupchatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [groupchatMessageCount, selectedGroupchatId]);

  if (isLoading) {
    return (
      <AppWindow title="W">
        <Hourglass size={32} />
      </AppWindow>
    );
  }

  const adminDmConversationsErrorMessage =
    adminDmConversationsError instanceof Error ? adminDmConversationsError.message : "";
  const navItems: Array<{ key: WView; label: string; count?: number }> = [
    { key: "timeline", label: "Home", count: posts.length },
    {
      key: "messages",
      label: "Messages",
      count: visibleGroupchats.reduce((total, chat) => total + (chat.messages?.length || 0), 0),
    },
    { key: "spaces", label: "Spaces" },
    { key: "settings", label: "Settings" },
  ];

  const activePanel =
    activeView === "timeline" ? (
      <WTimelinePanel
        accounts={accounts}
        actionErrors={actionErrors}
        actionSuccess={actionSuccess}
        canPostInW={canPostInW}
        diagnostics={data?.diagnostics}
        engageMutation={engageMutation}
        mediaUploadMutation={mediaUploadMutation}
        nightMode={nightMode}
        postDraft={postDraft}
        postMedia={postMedia}
        postMutation={postMutation}
        postStatus={postStatus}
        posts={posts}
        quoteDrafts={quoteDrafts}
        quoteOpenFor={quoteOpenFor}
        replyDrafts={replyDrafts}
        replyErrors={replyErrors}
        replyMutation={replyMutation}
        replyOpenFor={replyOpenFor}
        replySuccess={replySuccess}
        setActionErrors={setActionErrors}
        setPostDraft={setPostDraft}
        setPostStatus={setPostStatus}
        setQuoteDrafts={setQuoteDrafts}
        setQuoteOpenFor={setQuoteOpenFor}
        setReplyDrafts={setReplyDrafts}
        setReplyOpenFor={setReplyOpenFor}
        viewerCanReply={viewerCanReply}
      />
    ) : activeView === "messages" ? (
      <WMessagesPanel
        activeGroupchat={activeGroupchat}
        activeGroupchatTitle={activeGroupchatTitle}
        capabilities={capabilities}
        groupchat={groupchat}
        groupchatDraft={groupchatDraft}
        groupchatEndRef={groupchatEndRef}
        groupchatFetching={groupchatFetching}
        groupchatMutation={groupchatMutation}
        isOfficialGroupchat={isOfficialGroupchat}
        nightMode={nightMode}
        refetchGroupchat={refetchGroupchat}
        selectedGroupchatId={selectedGroupchatId}
        setGroupchatDraft={setGroupchatDraft}
        setSelectedGroupchatId={setSelectedGroupchatId}
        visibleGroupchats={visibleGroupchats}
      />
    ) : (
      <WSocialPanel
        accounts={accounts}
        activeView={activeView}
        adminDmConversations={adminDmConversations}
        adminDmConversationsErrorMessage={adminDmConversationsErrorMessage}
        adminDmConversationsFetching={adminDmConversationsFetching}
        adminStreamRules={adminStreamRules}
        adminStreamRulesFetching={adminStreamRulesFetching}
        adminStreamStatus={adminStreamStatus}
        canManageFollows={canManageFollows}
        canUseWAdminControls={canUseWAdminControls}
        capabilities={capabilities}
        currentGroupchatIds={currentGroupchatIds}
        dmDiagnostics={dmDiagnostics}
        dmDiagnosticsFetching={dmDiagnosticsFetching}
        embeddedSpaceUrl={embeddedSpaceUrl}
        followListRequested={followListRequested}
        followListType={followListType}
        followMutation={followMutation}
        followStatus={followStatus}
        followTarget={followTarget}
        followsList={followsList}
        followsListErrorMessage={followsListErrorMessage}
        followsListFetching={followsListFetching}
        manualGroupchatIds={manualGroupchatIds}
        nightMode={nightMode}
        oauthDiagnostics={oauthDiagnostics}
        oauthDiagnosticsError={oauthDiagnosticsError}
        oauthDiagnosticsFetching={oauthDiagnosticsFetching}
        platformDmStatus={platformDmStatus}
        refetchAdminDmConversations={refetchAdminDmConversations}
        refetchAdminStreamRules={refetchAdminStreamRules}
        refetchAdminStreamStatus={refetchAdminStreamStatus}
        refetchDmDiagnostics={refetchDmDiagnostics}
        refetchFollowsList={refetchFollowsList}
        refetchFollowsSummary={refetchFollowsSummary}
        refetchOauthDiagnostics={refetchOauthDiagnostics}
        refetchSpaces={refetchSpaces}
        saveGroupchatMutation={saveGroupchatMutation}
        saveStreamRulesMutation={saveStreamRulesMutation}
        selectedOAuthTier={selectedOAuthTier}
        selfTestMutation={selfTestMutation}
        setEmbeddedSpaceUrl={setEmbeddedSpaceUrl}
        setFollowListRequested={setFollowListRequested}
        setFollowListType={setFollowListType}
        setFollowTarget={setFollowTarget}
        setManualGroupchatIds={setManualGroupchatIds}
        setSelectedAdminGroupchatIds={setSelectedAdminGroupchatIds}
        setSelectedOAuthTier={setSelectedOAuthTier}
        setStreamHandlesDraft={setStreamHandlesDraft}
        spacesData={spacesData}
        spacesFetching={spacesFetching}
        streamHandlesDraft={streamHandlesDraft}
        xProfile={xProfile}
      />
    );

  return (
    <WShell
      accountsCount={accounts.length}
      activeView={activeView}
      diagnosticsMessage={data?.diagnostics?.message}
      isFetching={isFetching}
      navItems={navItems}
      nightMode={nightMode}
      oauthFlash={oauthFlash}
      postsCount={posts.length}
      refreshedAt={data?.refreshedAt}
      refetch={refetch}
      setActiveView={setActiveView}
      setNightMode={setNightMode}
      setOauthFlash={setOauthFlash}
      source={data?.source}
      xProfile={xProfile}
    >
      {activePanel}
    </WShell>
  );
}
