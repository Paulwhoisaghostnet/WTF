import type { Dispatch, SetStateAction } from "react";
import { Button, Checkbox, GroupBox } from "react95";
import styled from "styled-components";
import type {
  TwitterOAuth2Diagnostics,
  TwitterOAuth2SelfTest,
  WAccount,
  WAdminDmConversationsResponse,
  WAdminStreamRulesResponse,
  WAdminStreamStatusResponse,
  WCapabilityResponse,
  WFollowsListResponse,
  WFollowsSummaryResponse,
  WSpacesResponse,
  WView,
} from "../types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type RefetchCallback = () => unknown;

type FollowMutation = {
  isPending: boolean;
  mutate: (payload: { action: "follow" | "unfollow"; target: string }) => void;
};

type SelfTestMutation = {
  isPending: boolean;
  data?: TwitterOAuth2SelfTest;
  error: unknown;
  mutate: () => void;
};

type SaveGroupchatMutation = {
  isPending: boolean;
  mutate: (conversationIds: string[]) => void;
};

type SaveStreamRulesMutation = {
  isPending: boolean;
  mutate: (handles: string[]) => void;
};

export type WSocialPanelProps = {
  accounts: WAccount[];
  activeView: WView;
  adminDmConversations?: WAdminDmConversationsResponse;
  adminDmConversationsErrorMessage: string;
  adminDmConversationsFetching: boolean;
  adminStreamRules?: WAdminStreamRulesResponse;
  adminStreamRulesFetching: boolean;
  adminStreamStatus?: WAdminStreamStatusResponse;
  canManageFollows: boolean;
  canUseWAdminControls: boolean;
  capabilities?: WCapabilityResponse;
  currentGroupchatIds: string[];
  dmDiagnostics?: any;
  dmDiagnosticsFetching: boolean;
  embeddedSpaceUrl: string | null;
  followListRequested: boolean;
  followListType: "followers" | "following";
  followMutation: FollowMutation;
  followStatus: string;
  followTarget: string;
  followsList?: WFollowsListResponse;
  followsListErrorMessage: string;
  followsListFetching: boolean;
  manualGroupchatIds: string;
  nightMode: boolean;
  oauthDiagnostics?: TwitterOAuth2Diagnostics;
  oauthDiagnosticsError: unknown;
  oauthDiagnosticsFetching: boolean;
  platformDmStatus: string;
  refetchAdminDmConversations: RefetchCallback;
  refetchAdminStreamRules: RefetchCallback;
  refetchAdminStreamStatus: RefetchCallback;
  refetchDmDiagnostics: RefetchCallback;
  refetchFollowsList: RefetchCallback;
  refetchFollowsSummary: RefetchCallback;
  refetchOauthDiagnostics: RefetchCallback;
  refetchSpaces: RefetchCallback;
  saveGroupchatMutation: SaveGroupchatMutation;
  saveStreamRulesMutation: SaveStreamRulesMutation;
  selectedOAuthTier: string;
  selfTestMutation: SelfTestMutation;
  setEmbeddedSpaceUrl: StateSetter<string | null>;
  setFollowListRequested: StateSetter<boolean>;
  setFollowListType: StateSetter<"followers" | "following">;
  setFollowTarget: StateSetter<string>;
  setManualGroupchatIds: StateSetter<string>;
  setSelectedAdminGroupchatIds: StateSetter<string[]>;
  setSelectedOAuthTier: StateSetter<string>;
  setStreamHandlesDraft: StateSetter<string>;
  spacesData?: WSpacesResponse;
  spacesFetching: boolean;
  streamHandlesDraft: string;
  xProfile: WFollowsSummaryResponse["profile"] | null;
};

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const Small = styled.span<{ $night?: boolean }>`
  font-size: 11px;
  color: ${({ $night }) => ($night ? "#b8c5da" : "#3c4956")};
`;

const AccountGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 6px;
`;

const AccountChip = styled.a<{ $night: boolean }>`
  display: inline-block;
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#182334" : "#f4f7fa")};
  padding: 5px 6px;
  font-size: 12px;
  color: ${({ $night }) => ($night ? "#9ec5ff" : "#0b4da6")};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const PostCard = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#2f425b" : "#aab5bf")};
  background: ${({ $night }) => ($night ? "#16181c" : "#ffffff")};
  margin-bottom: 10px;
  padding: 9px;
  box-shadow: ${({ $night }) =>
    $night ? "inset 0 0 0 1px #213146" : "inset 0 0 0 1px #e7eef5"};
`;

const PostHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CapabilityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 6px;
`;

const CapabilityCard = styled.div<{ $night: boolean; $enabled?: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night, $enabled }) =>
    $enabled ? ($night ? "#17321f" : "#e8f8e8") : $night ? "#182334" : "#f4f7fa"};
  color: ${({ $night }) => ($night ? "#e8f0fb" : "#10161e")};
  padding: 6px;
  font-size: 11px;

  strong,
  div {
    color: ${({ $night }) => ($night ? "#e8f0fb" : "#10161e")};
  }
`;

function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value || 0)
  );
}

export function WSocialPanel(props: WSocialPanelProps) {
  const {
    accounts,
    activeView,
    adminDmConversations,
    adminDmConversationsErrorMessage,
    adminDmConversationsFetching,
    adminStreamRules,
    adminStreamRulesFetching,
    adminStreamStatus,
    canManageFollows,
    canUseWAdminControls,
    capabilities,
    currentGroupchatIds,
    dmDiagnostics,
    dmDiagnosticsFetching,
    embeddedSpaceUrl,
    followListRequested,
    followListType,
    followMutation,
    followStatus,
    followTarget,
    followsList,
    followsListErrorMessage,
    followsListFetching,
    manualGroupchatIds,
    nightMode,
    oauthDiagnostics,
    oauthDiagnosticsError,
    oauthDiagnosticsFetching,
    platformDmStatus,
    refetchAdminDmConversations,
    refetchAdminStreamRules,
    refetchAdminStreamStatus,
    refetchDmDiagnostics,
    refetchFollowsList,
    refetchFollowsSummary,
    refetchOauthDiagnostics,
    refetchSpaces,
    saveGroupchatMutation,
    saveStreamRulesMutation,
    selectedOAuthTier,
    selfTestMutation,
    setEmbeddedSpaceUrl,
    setFollowListRequested,
    setFollowListType,
    setFollowTarget,
    setManualGroupchatIds,
    setSelectedAdminGroupchatIds,
    setSelectedOAuthTier,
    setStreamHandlesDraft,
    spacesData,
    spacesFetching,
    streamHandlesDraft,
    xProfile,
  } = props;

  const oauthConnectUrl = `/api/auth/twitter-oauth2?tier=${encodeURIComponent(selectedOAuthTier)}&returnTo=w`;
  const selectedTier = capabilities?.tiers.find((tier) => tier.key === selectedOAuthTier);

  if (activeView === "spaces") {
    return (
      <GroupBox label="X Spaces" style={{ marginBottom: 10 }}>
        <Row style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Small $night={nightMode}>
              Browse, schedule, and join X Spaces. Live Spaces can be listened to right here in W.
            </Small>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button
              size="sm"
              onClick={() =>
                window.open("https://x.com/i/spaces/create", "_blank", "noopener,noreferrer,width=600,height=700")
              }
            >
              Schedule Space
            </Button>
            <Button size="sm" disabled={spacesFetching} onClick={() => refetchSpaces()}>
              {spacesFetching ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </Row>
        {!capabilities?.connected && !capabilities?.platformAccountConfigured && (
          <p style={{ fontSize: 11, color: nightMode ? "#ffb7b7" : "#8a1f1f", margin: "8px 0 0" }}>
            Connect X in Settings to browse Spaces.
          </p>
        )}
        {spacesData?.spacesError && (
          <p style={{ fontSize: 11, color: nightMode ? "#ff9f9f" : "#900", margin: "8px 0 0" }}>
            {spacesData.spacesError}
          </p>
        )}
        {(spacesData?.spaces || []).length === 0 &&
          (capabilities?.connected || capabilities?.platformAccountConfigured) &&
          !spacesFetching &&
          !spacesData?.spacesError && (
            <p style={{ fontSize: 11, color: nightMode ? "#b8c5da" : "#3c4956", margin: "8px 0 0" }}>
              No live or scheduled Spaces found for @{spacesData?.creatorHandle || "wtf_gameshow"}.
            </p>
          )}

        {embeddedSpaceUrl && (
          <div style={{ marginTop: 8, border: `1px solid ${nightMode ? "#4c6788" : "#9cabbb"}`, borderRadius: 4 }}>
            <Row style={{ padding: "4px 8px", background: nightMode ? "#1a2a3f" : "#e8e8e8" }}>
              <Small $night={nightMode}>Listening to Space</Small>
              <Button size="sm" onClick={() => setEmbeddedSpaceUrl(null)}>
                Close
              </Button>
            </Row>
            <iframe
              src={embeddedSpaceUrl}
              title="X Space"
              style={{ width: "100%", height: 480, border: "none", background: nightMode ? "#0d1726" : "#fff" }}
              allow="microphone; autoplay"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          </div>
        )}

        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {(spacesData?.spaces || []).map((space) => (
            <PostCard key={space.id} $night={nightMode}>
              <PostHead>
                <div>
                  <strong>{space.title || "Untitled Space"}</strong>
                  <br />
                  <Small $night={nightMode}>
                    {space.state === "live"
                      ? "🔴 LIVE"
                      : space.state === "scheduled"
                        ? "📅 Scheduled"
                        : space.state || "Unknown"}
                    {space.scheduledStart ? ` · ${new Date(space.scheduledStart).toLocaleString()}` : ""}
                    {space.participantCount > 0 ? ` · ${space.participantCount} listeners` : ""}
                  </Small>
                </div>
              </PostHead>
              <Row style={{ marginTop: 8, gap: 6 }}>
                {space.state === "live" && (
                  <Button size="sm" onClick={() => setEmbeddedSpaceUrl(space.url)}>
                    Listen in W
                  </Button>
                )}
                <Button size="sm" onClick={() => window.open(space.url, "_blank", "noopener,noreferrer")}>
                  {space.state === "live" ? "Open on X" : "View on X"}
                </Button>
              </Row>
            </PostCard>
          ))}
        </div>
      </GroupBox>
    );
  }

  if (activeView !== "settings") return null;

  return (
    <>
      <GroupBox label="X Connection" style={{ marginBottom: 10 }}>
        <Row style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Small $night={nightMode}>
              Default account: <strong>@{capabilities?.defaultAccountHandle || "wtf_gameshow"}</strong>
              {" · "}
              OAuth2: <strong>{capabilities?.connected ? "connected" : "not connected"}</strong>
              {" · "}
              Platform DM bridge:{" "}
              <strong>{capabilities?.platformAccountConfigured ? "configured" : "missing token"}</strong>
            </Small>
            {selectedTier && (
              <p style={{ fontSize: 11, margin: "6px 0 0" }}>
                {selectedTier.description} Enables: {selectedTier.enables.join(", ")}.
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(capabilities?.tiers || []).map((tier) => (
              <Button
                key={tier.key}
                size="sm"
                active={selectedOAuthTier === tier.key}
                onClick={() => setSelectedOAuthTier(tier.key)}
              >
                {tier.label}
              </Button>
            ))}
            <Button
              size="sm"
              disabled={!capabilities?.oauth2Configured}
              onClick={() => {
                window.location.href = oauthConnectUrl;
              }}
            >
              Connect OAuth2
            </Button>
          </div>
        </Row>
        <CapabilityGrid style={{ marginTop: 8 }}>
          {(capabilities?.capabilities || []).map((capability) => (
            <CapabilityCard
              key={capability.key}
              $night={nightMode}
              $enabled={capability.enabled}
              title={capability.note || capability.scopes.join(", ")}
            >
              <strong>{capability.enabled ? "Enabled" : capability.available ? "Optional" : "Unavailable"}</strong>
              {" · "}
              {capability.label}
              {capability.note ? <div style={{ marginTop: 3 }}>{capability.note}</div> : null}
            </CapabilityCard>
          ))}
        </CapabilityGrid>
      </GroupBox>

      <GroupBox label="Followers" style={{ marginBottom: 10 }}>
        <Row style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Small $night={nightMode}>
              {xProfile ? (
                <>
                  @{xProfile.username || "connected"} has <strong>{formatCount(xProfile.followersCount)}</strong>{" "}
                  followers and follows <strong>{formatCount(xProfile.followingCount)}</strong> accounts.
                </>
              ) : (
                "Connect X read access to show your avatar and follower counts in the W header."
              )}
            </Small>
            <p style={{ fontSize: 11, margin: "6px 0 0" }}>
              Full follower/following lists are requested only from Settings and may require X Enterprise.
              Follow/unfollow uses user-context OAuth with <code>follows.write</code>.
            </p>
          </div>
          <Button size="sm" disabled={!capabilities?.connected} onClick={() => refetchFollowsSummary()}>
            Refresh Counts
          </Button>
        </Row>
        <Row style={{ marginTop: 8 }}>
          <input
            value={followTarget}
            onChange={(e) => setFollowTarget(e.target.value)}
            placeholder="X username or user id"
            style={{ flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 12 }}
          />
          <Button
            size="sm"
            disabled={!canManageFollows || !followTarget.trim() || followMutation.isPending}
            onClick={() => followMutation.mutate({ action: "follow", target: followTarget.trim() })}
          >
            Follow
          </Button>
          <Button
            size="sm"
            disabled={!canManageFollows || !followTarget.trim() || followMutation.isPending}
            onClick={() => followMutation.mutate({ action: "unfollow", target: followTarget.trim() })}
          >
            Unfollow
          </Button>
        </Row>
        {!canManageFollows && (
          <Small $night={nightMode}>Reconnect with Timeline actions to enable follow/unfollow.</Small>
        )}
        {followStatus && (
          <p style={{ fontSize: 11, color: nightMode ? "#d7e5f7" : "#273747", margin: "6px 0 0" }}>
            {followStatus}
          </p>
        )}
        <Row style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button
              size="sm"
              active={followListType === "followers"}
              onClick={() => {
                setFollowListType("followers");
                setFollowListRequested(true);
              }}
            >
              Load Followers
            </Button>
            <Button
              size="sm"
              active={followListType === "following"}
              onClick={() => {
                setFollowListType("following");
                setFollowListRequested(true);
              }}
            >
              Load Following
            </Button>
          </div>
          {followListRequested && (
            <Button size="sm" disabled={followsListFetching} onClick={() => refetchFollowsList()}>
              {followsListFetching ? "Loading..." : "Refresh List"}
            </Button>
          )}
        </Row>
        {followsListErrorMessage && (
          <p style={{ fontSize: 11, color: nightMode ? "#ffb7b7" : "#8a1f1f", margin: "6px 0 0" }}>
            {followsListErrorMessage}
          </p>
        )}
        {followListRequested && !followsListErrorMessage && (
          <div style={{ marginTop: 8 }}>
            <Small $night={nightMode}>
              Showing {followsList?.users.length || 0} {followListType}.
              {followsList?.nextToken ? " More results are available from X pagination." : ""}
            </Small>
            <AccountGrid style={{ marginTop: 6 }}>
              {(followsList?.users || []).map((followUser) => (
                <AccountChip
                  key={followUser.id}
                  $night={nightMode}
                  href={`https://x.com/${followUser.username || followUser.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {followUser.name || followUser.username || followUser.id}
                  {followUser.username ? ` @${followUser.username}` : ""}
                  <br />
                  {formatCount(followUser.followersCount)} followers
                </AccountChip>
              ))}
            </AccountGrid>
          </div>
        )}
      </GroupBox>

      {canUseWAdminControls && (
        <GroupBox label="W Admin Settings" style={{ marginBottom: 10 }}>
          <GroupBox label="X OAuth2 Diagnostics" style={{ marginBottom: 8 }}>
            <Row style={{ alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <Small $night={nightMode}>
                  Compare these values to the X Developer Portal app settings. The callback URL must match byte-for-byte;
                  the Client ID must belong to the same app; the requested scopes must be enabled on the app.
                </Small>
              </div>
              <Button size="sm" disabled={oauthDiagnosticsFetching} onClick={() => refetchOauthDiagnostics()}>
                {oauthDiagnosticsFetching ? "Checking..." : "Refresh"}
              </Button>
            </Row>
            {oauthDiagnosticsError ? (
              <Small $night={nightMode}>
                {oauthDiagnosticsError instanceof Error ? oauthDiagnosticsError.message : "Diagnostics unavailable."}
              </Small>
            ) : oauthDiagnostics ? (
              <div style={{ fontSize: 11, display: "grid", gap: 4 }}>
                <div>
                  <strong>Redirect URI (register on X):</strong> <code>{oauthDiagnostics.redirectUri}</code>
                  {oauthDiagnostics.configuredRedirectOverride ? (
                    <span> (from TWITTER_OAUTH2_REDIRECT_URI override)</span>
                  ) : (
                    <span> (derived from PUBLIC_SITE_URL)</span>
                  )}
                </div>
                <div>
                  <strong>Public site URL:</strong>{" "}
                  <code>{oauthDiagnostics.publicSiteUrl || "(unset — fix this)"}</code>
                </div>
                <div>
                  <strong>TWITTER_CLIENT_ID:</strong>{" "}
                  {oauthDiagnostics.clientIdConfigured ? (
                    <code>…{oauthDiagnostics.clientIdLast4 || "????"}</code>
                  ) : (
                    <span>not configured</span>
                  )}
                  {" · "}
                  <strong>TWITTER_CLIENT_SECRET:</strong>{" "}
                  {oauthDiagnostics.clientSecretConfigured ? "configured" : "not configured"}
                </div>
                {oauthDiagnostics.clientKind ? (
                  <div>
                    <strong>Client kind:</strong> <code>{oauthDiagnostics.clientKind}</code>
                    {oauthDiagnostics.clientKind === "confidential" && !oauthDiagnostics.clientSecretConfigured
                      ? " (confidential clients require TWITTER_CLIENT_SECRET)"
                      : ""}
                    {oauthDiagnostics.clientKind === "public" && oauthDiagnostics.clientSecretConfigured
                      ? " (public / native clients must NOT send client_secret)"
                      : ""}
                  </div>
                ) : null}
                <div>
                  <strong>Profile link scopes:</strong> <code>{oauthDiagnostics.profileScopes.join(" ")}</code>
                </div>
                {Object.entries(oauthDiagnostics.tiers).map(([tier, scopes]) => (
                  <div key={tier}>
                    <strong>W tier "{tier}" scopes:</strong> <code>{scopes.join(" ")}</code>
                  </div>
                ))}
                <div>
                  <strong>Authorize endpoint:</strong> <code>{oauthDiagnostics.authorizeEndpoint}</code>
                </div>
                <div>
                  <strong>Token endpoint:</strong> <code>{oauthDiagnostics.tokenEndpoint}</code>
                </div>
                {oauthDiagnostics.apiPlan ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 8,
                      border: "1px solid #c0c0c0",
                      background: nightMode ? "#2a2a2a" : "#fffbea",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>X API Pay-Per-Use notice (Feb 6, 2026)</div>
                    <div style={{ marginBottom: 4 }}>{oauthDiagnostics.apiPlan.notice}</div>
                    <div style={{ marginBottom: 4 }}>{oauthDiagnostics.apiPlan.permissionsNote}</div>
                    {oauthDiagnostics.apiPlan.fixOrder && oauthDiagnostics.apiPlan.fixOrder.length > 0 ? (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>403 recovery checklist</div>
                        <ol style={{ paddingLeft: 18, margin: 0 }}>
                          {oauthDiagnostics.apiPlan.fixOrder.map((step, idx) => (
                            <li key={idx} style={{ marginBottom: 3 }}>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a href={oauthDiagnostics.apiPlan.consoleUrl} target="_blank" rel="noopener noreferrer">
                        Open new X Console (Pay-Per-Use)
                      </a>
                      {oauthDiagnostics.apiPlan.legacyPortalUrl ? (
                        <a href={oauthDiagnostics.apiPlan.legacyPortalUrl} target="_blank" rel="noopener noreferrer">
                          Legacy portal (pre-2026 apps)
                        </a>
                      ) : null}
                      <a href={oauthDiagnostics.apiPlan.pricingUrl} target="_blank" rel="noopener noreferrer">
                        Pay-Per-Use pricing
                      </a>
                      <a href={oauthDiagnostics.apiPlan.scopesUrl} target="_blank" rel="noopener noreferrer">
                        OAuth 2.0 scopes reference
                      </a>
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: `1px dashed ${nightMode ? "#4c6788" : "#c0c0c0"}`,
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Live v2 self-test (app-only Bearer) + Cache Status
                      </div>
                      <Small $night={nightMode} style={{ display: "block", marginBottom: 6 }}>
                        Calls /2/users/by/username/X with the server's X_BEARER_TOKEN / TWITTER_BEARER_TOKEN. Timeline
                        now uses DB cache first (credit-efficient) — live fetch only on manual refresh. See diagnostics
                        below for cache age.
                      </Small>
                      <Button size="sm" disabled={selfTestMutation.isPending} onClick={() => selfTestMutation.mutate()}>
                        {selfTestMutation.isPending ? "Running…" : "Run self-test"}
                      </Button>
                      {selfTestMutation.data ? (
                        <div style={{ marginTop: 8, fontSize: 11 }}>
                          <div>
                            <strong>Configured:</strong> {selfTestMutation.data.configured ? "yes" : "no"}
                          </div>
                          {typeof selfTestMutation.data.status === "number" ? (
                            <div>
                              <strong>Status:</strong> <code>{selfTestMutation.data.status}</code>{" "}
                              {selfTestMutation.data.ok ? "OK" : "FAIL"}
                            </div>
                          ) : null}
                          {selfTestMutation.data.probeUrl ? (
                            <div>
                              <strong>Probe:</strong> <code>{selfTestMutation.data.probeUrl}</code>
                            </div>
                          ) : null}
                          {selfTestMutation.data.interpretation ? (
                            <div style={{ marginTop: 4 }}>{selfTestMutation.data.interpretation}</div>
                          ) : null}
                          {selfTestMutation.data.message ? (
                            <div style={{ marginTop: 4 }}>{selfTestMutation.data.message}</div>
                          ) : null}
                          {selfTestMutation.data.bodyRaw ? (
                            <pre
                              style={{
                                marginTop: 4,
                                padding: 6,
                                background: nightMode ? "#0d1726" : "#f3f3f3",
                                border: "1px solid #c0c0c0",
                                overflowX: "auto",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                fontSize: 10,
                              }}
                            >
                              {selfTestMutation.data.bodyRaw}
                            </pre>
                          ) : null}
                        </div>
                      ) : null}
                      {selfTestMutation.error ? (
                        <div style={{ marginTop: 6, color: "#b94a48" }}>
                          {selfTestMutation.error instanceof Error
                            ? selfTestMutation.error.message
                            : "Self-test failed"}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <Small $night={nightMode}>{oauthDiagnosticsFetching ? "Loading…" : "No diagnostics yet."}</Small>
            )}
          </GroupBox>

          <GroupBox label="DM Diagnostics" style={{ marginBottom: 8 }}>
            <Row style={{ alignItems: "center", marginBottom: 8 }}>
              <Small $night={nightMode} style={{ flex: 1 }}>
                Tests platform token, DM endpoint, and groupchat access. Click to run.
              </Small>
              <Button size="sm" disabled={dmDiagnosticsFetching} onClick={() => refetchDmDiagnostics()}>
                {dmDiagnosticsFetching ? "Running..." : "Run DM Diagnostics"}
              </Button>
            </Row>

            {dmDiagnosticsFetching && <Small $night={nightMode}>Testing X API access...</Small>}

            {dmDiagnostics?.error ? (
              <div
                style={{
                  color: "#ff6b6b",
                  fontSize: 12,
                  padding: 8,
                  background: nightMode ? "#3a2525" : "#ffe6e6",
                  borderRadius: 4,
                }}
              >
                {dmDiagnostics.error}
                {dmDiagnostics.details && <div style={{ marginTop: 4, opacity: 0.8 }}>{dmDiagnostics.details}</div>}
              </div>
            ) : dmDiagnostics ? (
              <>
                <Small $night={nightMode} style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>
                  Platform: {dmDiagnostics.platform?.source || "unknown"} • Handle: @
                  {dmDiagnostics.platform?.handle || "unknown"}
                  {dmDiagnostics.platform?.reason && ` • Reason: ${dmDiagnostics.platform.reason}`}
                </Small>

                {dmDiagnostics.tests?.platformToken && (
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 11,
                      padding: 6,
                      background: nightMode ? "#1f2a1f" : "#e6ffe6",
                      borderRadius: 4,
                    }}
                  >
                    <strong>Platform Token Test:</strong>{" "}
                    {dmDiagnostics.tests.platformToken.ok
                      ? `✅ @${dmDiagnostics.tests.platformToken.username || "connected"}`
                      : `❌ ${dmDiagnostics.tests.platformToken.error || dmDiagnostics.tests.platformToken.status}`}
                  </div>
                )}

                {dmDiagnostics.tests?.personalDmEndpoint && (
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 11,
                      padding: 6,
                      background: nightMode ? "#1f2a1f" : "#e6ffe6",
                      borderRadius: 4,
                    }}
                  >
                    <strong>Personal DM endpoint:</strong>{" "}
                    disabled by W groupchat-only policy.
                  </div>
                )}

                {dmDiagnostics.xaa && (
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 11,
                      padding: 6,
                      background: nightMode ? "#1a1f2e" : "#f5f5f5",
                      borderRadius: 4,
                    }}
                  >
                    <strong>XAA groupchat stream:</strong>{" "}
                    {!dmDiagnostics.xaa.enabled
                      ? "disabled"
                      : dmDiagnostics.xaa.connected
                        ? "connected"
                        : dmDiagnostics.xaa.reconnecting
                          ? "connecting/backoff"
                          : "idle"}
                    {" · events "}
                    {dmDiagnostics.xaa.eventsReceived || 0}
                    {" · chat "}
                    {dmDiagnostics.xaa.chatEventsReceived || 0}
                    {" · hydrates "}
                    {dmDiagnostics.xaa.hydrateRuns || 0}
                    {dmDiagnostics.xaa.lastError ? ` · last error: ${dmDiagnostics.xaa.lastError}` : ""}
                  </div>
                )}

                {dmDiagnostics.xUsage?.features && (
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 11,
                      padding: 6,
                      background: nightMode ? "#1a241f" : "#f4fbf6",
                      borderRadius: 4,
                    }}
                  >
                    <strong>X usage budget:</strong>{" "}
                    {dmDiagnostics.xUsage.month}{" "}
                    {dmDiagnostics.xUsage.features
                      .map((row: any) =>
                        `${String(row.feature).replace(/_/g, " ")} $${Number(row.estimatedUsd || 0).toFixed(2)}/$${Number(row.hardUsd || 0).toFixed(2)}`
                      )
                      .join(" · ")}
                  </div>
                )}

                {Object.keys(dmDiagnostics.tests || {}).some((k) => k.startsWith("groupchat_")) && (
                  <div style={{ marginTop: 8 }}>
                    <strong>Groupchat Tests:</strong>
                    <pre
                      style={{
                        fontSize: 10,
                        background: nightMode ? "#1a1f2e" : "#f5f5f5",
                        padding: 8,
                        borderRadius: 4,
                        overflow: "auto",
                        maxHeight: 140,
                        marginTop: 4,
                      }}
                    >
                      {JSON.stringify(
                        Object.fromEntries(
                          Object.entries(dmDiagnostics.tests || {}).filter(([k]) => k.startsWith("groupchat_"))
                        ),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}

                {dmDiagnostics.env && (
                  <Small $night={nightMode} style={{ marginTop: 8, display: "block", opacity: 0.8, fontSize: 11 }}>
                    Env: token via {dmDiagnostics.env.tokenSource || "unknown"} •{" "}
                    {dmDiagnostics.env.hasDefaultHandle ? "✅ default handle" : "❌ no handle"} •{" "}
                    {dmDiagnostics.groupchatIds?.length > 0
                      ? `${dmDiagnostics.groupchatIds.length} configured chats`
                      : "no chats configured"}
                  </Small>
                )}
              </>
            ) : (
              <Small $night={nightMode}>Click "Run DM Diagnostics" above to test X DM connectivity.</Small>
            )}
          </GroupBox>

          <GroupBox label="Public Gameshow Chat Mirror" style={{ marginBottom: 8 }}>
            {!capabilities?.connected ? (
              <Small $night={nightMode}>Admins must connect X OAuth2 in W settings before selecting visible chats.</Small>
            ) : (
              <>
                <Row style={{ marginBottom: 6 }}>
                  <Small $night={nightMode}>
                    Select only the official WTF Gameshow groupchat. Saved chats in this section are visible to every W
                    user.
                    {adminDmConversations?.diagnostics ? ` ${adminDmConversations.diagnostics}` : ""}
                    {adminDmConversationsErrorMessage ? ` ${adminDmConversationsErrorMessage}` : ""}
                  </Small>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button
                      size="sm"
                      disabled={saveGroupchatMutation.isPending || currentGroupchatIds.length === 0}
                      onClick={() => saveGroupchatMutation.mutate(currentGroupchatIds)}
                    >
                      {saveGroupchatMutation.isPending ? "Saving..." : "Save Chats"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={adminDmConversationsFetching}
                      onClick={() => refetchAdminDmConversations()}
                    >
                      {adminDmConversationsFetching ? "Loading..." : "Refresh List"}
                    </Button>
                    <Button size="sm" disabled={dmDiagnosticsFetching} onClick={() => refetchDmDiagnostics()}>
                      {dmDiagnosticsFetching ? "Testing..." : "Run DM Diagnostics"}
                    </Button>
                  </div>
                </Row>
                <div style={{ display: "grid", gap: 5, marginBottom: 6 }}>
                  <Row>
                    <input
                      value={manualGroupchatIds}
                      onChange={(e) => setManualGroupchatIds(e.target.value)}
                      placeholder="Official public group DM conversation ID only"
                      style={{ flex: 1, minWidth: 260, fontFamily: "inherit", fontSize: 12 }}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        const ids = Array.from(
                          new Set(
                            manualGroupchatIds
                              .split(/[,\s]+/)
                              .map((id) => id.trim())
                              .filter(Boolean)
                          )
                        );
                        setSelectedAdminGroupchatIds(ids);
                      }}
                    >
                      Use IDs
                    </Button>
                  </Row>
                  {(adminDmConversations?.conversations || []).map((conversation) => {
                    const participantLabel =
                      conversation.participants
                        .map((participant) => (participant.username ? `@${participant.username}` : participant.id))
                        .slice(0, 5)
                        .join(", ") || `${conversation.participantCount} participants`;
                    const label = conversation.name || participantLabel || conversation.id;
                    const checked = currentGroupchatIds.includes(conversation.id);
                    return (
                      <Checkbox
                        key={conversation.id}
                        label={`${checked ? "* " : ""}${label} · ${conversation.participantCount} users`}
                        checked={checked}
                        onChange={() => {
                          setSelectedAdminGroupchatIds((current) =>
                            current.includes(conversation.id)
                              ? current.filter((id) => id !== conversation.id)
                              : [...current, conversation.id]
                          );
                        }}
                      />
                    );
                  })}
                  {(adminDmConversations?.conversations.length || 0) === 0 && (
                    <Small $night={nightMode}>No group DM conversations loaded yet.</Small>
                  )}
                  {adminDmConversations?.discoveryError && (
                    <Small
                      $night={nightMode}
                      style={{ color: nightMode ? "#ff9f9f" : "#900", display: "block", marginTop: 6 }}
                    >
                      {adminDmConversations.discoveryError}
                    </Small>
                  )}
                  {adminDmConversations?.totalDiscovered != null && (
                    <Small $night={nightMode} style={{ display: "block", marginTop: 4, opacity: 0.7 }}>
                      {adminDmConversations.totalDiscovered} configured groupchat(s) known locally
                    </Small>
                  )}
                </div>
                <Small $night={nightMode}>
                  Current: <strong>{currentGroupchatIds.join(", ") || "not selected"}</strong>
                </Small>
              </>
            )}
          </GroupBox>
          <GroupBox label="Timeline — X Filtered Stream" style={{ marginBottom: 8 }}>
            <Small $night={nightMode} style={{ display: "block", marginBottom: 6 }}>
              W derives the{" "}
              <a href="https://docs.x.com/x-api/posts/filtered-stream/quickstart" target="_blank" rel="noopener noreferrer">
                filtered stream
              </a>{" "}
              rules from verified WTF users' X handles; matching posts persist to DB and appear on the timeline. Use app bearer (<code>X_BEARER_TOKEN</code>)
              or platform OAuth when bearer is unavailable. Server allowlist handles come from <code>W_TIMELINE_STREAM_HANDLES_FILE</code>.
              Recent search is recovery-only and disabled during normal operation.
            </Small>
            {adminStreamStatus && (
              <div style={{ fontSize: 11, marginBottom: 8, opacity: nightMode ? 0.92 : 0.95 }}>
                <div>
                  <strong>Stream:</strong>{" "}
                  {!adminStreamStatus.enabled
                    ? "disabled (W_TIMELINE_STREAM_ENABLED=0)"
                    : adminStreamStatus.connected
                      ? "connected"
                      : adminStreamStatus.reconnecting
                        ? "connecting/backoff…"
                        : "idle/disconnected"}
                  {" · "}
                  <strong>Posts received:</strong> {adminStreamStatus.postsReceived ?? 0}
                  {" · "}
                  <strong>Rule handles:</strong> {adminStreamStatus.lastRuleHandleCount ?? 0}
                  {adminStreamStatus.lastEventAtIso ? (
                    <>
                      {" · "}
                      <strong>Last event:</strong> {adminStreamStatus.lastEventAtIso}
                    </>
                  ) : null}
                </div>
                {!adminStreamStatus.bearerConfigured ? (
                  <div style={{ color: nightMode ? "#ffbf7a" : "#a44" }}>Configure bearer or platform X OAuth token.</div>
                ) : null}
                {adminStreamStatus.lastError ? (
                  <div style={{ color: nightMode ? "#ff9f9f" : "#900" }}>Last error: {adminStreamStatus.lastError}</div>
                ) : null}
                {adminStreamStatus.lastRuleSyncAtIso ? (
                  <div>
                    <strong>Last rule sync:</strong> {adminStreamStatus.lastRuleSyncAtIso}
                    {adminStreamStatus.lastRuleSyncReason ? ` (${adminStreamStatus.lastRuleSyncReason})` : ""}
                  </div>
                ) : null}
              </div>
            )}
            {adminStreamRules?.handleSources ? (
              <Small $night={nightMode} style={{ display: "block", marginBottom: 6 }}>
                Sources: verified users {adminStreamRules.handleSources.eligibleCount}, server file{" "}
                {adminStreamRules.handleSources.fileCount}
                {adminStreamRules.handleSources.fileMissing ? " (missing)" : ""}, legacy settings{" "}
                {adminStreamRules.handleSources.settingsCount}. File: <code>{adminStreamRules.handleSources.filePath}</code>
                {adminStreamRules.handleSources.fileError ? ` — ${adminStreamRules.handleSources.fileError}` : ""}
              </Small>
            ) : null}
            <textarea
              rows={3}
              value={streamHandlesDraft}
              readOnly
              onChange={() => {}}
              placeholder="Derived from verified WTF users plus the server handles file"
              style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 12, marginBottom: 6 }}
            />
            <Row style={{ flexWrap: "wrap", gap: 6 }}>
              <Button
                size="sm"
                disabled={saveStreamRulesMutation.isPending}
                onClick={() => {
                  saveStreamRulesMutation.mutate([]);
                }}
              >
                {saveStreamRulesMutation.isPending ? "Syncing…" : "Rebuild & sync stream rules"}
              </Button>
              <Button size="sm" disabled={adminStreamRulesFetching} onClick={() => void refetchAdminStreamRules()}>
                {adminStreamRulesFetching ? "Loading…" : "Reload from server"}
              </Button>
              <Button size="sm" onClick={() => void refetchAdminStreamStatus()}>
                Refresh status
              </Button>
            </Row>
            {platformDmStatus && <Small $night={nightMode} style={{ display: "block", marginTop: 6 }}>{platformDmStatus}</Small>}
            {adminStreamRules?.xRulesError ? (
              <Small $night={nightMode} style={{ color: nightMode ? "#ffbf7a" : "#a44", display: "block", marginTop: 6 }}>
                Rules API: {adminStreamRules.xRulesError}
              </Small>
            ) : null}
            {adminStreamRules && adminStreamRules.managedRulesOnX.length > 0 ? (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 11 }}>
                  {adminStreamRules.managedRulesOnX.length} active rule chunk(s) on X
                </summary>
                <div style={{ fontSize: 10, marginTop: 4, maxHeight: 120, overflow: "auto", fontFamily: "monospace" }}>
                  {adminStreamRules.managedRulesOnX.map((r) => (
                    <div key={r.id} style={{ marginBottom: 4 }}>
                      {r.tag || r.id}: {r.value.length > 200 ? `${r.value.slice(0, 200)}…` : r.value}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </GroupBox>
        </GroupBox>
      )}

      <GroupBox label="Connected Accounts" style={{ marginBottom: 10 }}>
        <AccountGrid>
          {accounts.map((account) => (
            <AccountChip
              $night={nightMode}
              key={`${account.userId}-${account.twitterHandle}`}
              href={account.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open @${account.twitterHandle} on X`}
            >
              {(account.displayName || account.username) + " "}@{account.twitterHandle}
            </AccountChip>
          ))}
          {accounts.length === 0 && <Small $night={nightMode}>No verified connected X accounts available yet.</Small>}
        </AccountGrid>
      </GroupBox>
    </>
  );
}
