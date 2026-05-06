import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  MenuBtn,
  MenuInput,
  MenuLabel,
  MenuOverlay,
  MenuRow,
  MenuSelect,
  MenuTitle,
  MenuTokenCard,
  MenuTokenGrid,
  TokenPreview,
  TokenPreviewFallback,
  TokenPreviewMedia,
} from "../TVChrome";
import type { PlayableToken, TokenSortMode } from "../types";
import { buildTvCacheUrl } from "../utils";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type QueryLike<TData> = {
  data?: TData;
  isError?: boolean;
  isLoading?: boolean;
};

type MutationLike<TVariables> = {
  isPending?: boolean;
  mutate: (variables: TVariables) => void;
};

type AddTokensScreenProps = {
  TOKENS_PER_PAGE: number;
  addVideoMutation: MutationLike<{ channelId: number; token: PlayableToken }>;
  playableSearch: string;
  playableSort: TokenSortMode;
  playableTokens: PlayableToken[];
  playableTokensQuery: QueryLike<{ items: PlayableToken[] }>;
  renderBackBtn: (label?: string) => ReactElement;
  selectedOwnChannelId: number | null;
  setPlayableSearch: StateSetter<string>;
  setPlayableSort: StateSetter<TokenSortMode>;
  setTokenPage: StateSetter<number>;
  tokenPage: number;
};

export function AddTokensScreen({
  TOKENS_PER_PAGE,
  addVideoMutation,
  playableSearch,
  playableSort,
  playableTokens,
  playableTokensQuery,
  renderBackBtn,
  selectedOwnChannelId,
  setPlayableSearch,
  setPlayableSort,
  setTokenPage,
  tokenPage,
}: AddTokensScreenProps) {
  const totalPages = Math.max(
    1,
    Math.ceil(playableTokens.length / TOKENS_PER_PAGE)
  );
  const pageTokens = playableTokens.slice(
    tokenPage * TOKENS_PER_PAGE,
    (tokenPage + 1) * TOKENS_PER_PAGE
  );
  const pageStart = tokenPage * TOKENS_PER_PAGE + 1;
  const pageEnd = Math.min(
    (tokenPage + 1) * TOKENS_PER_PAGE,
    playableTokens.length
  );

  return (
    <MenuOverlay>
      <MenuTitle>
        <span>ADD FROM TOKENS</span>
        {renderBackBtn("CREATOR")}
      </MenuTitle>
      <MenuRow style={{ marginBottom: 4, gap: 4, flexWrap: "wrap" }}>
        <MenuInput
          value={playableSearch}
          onChange={(e) => {
            setPlayableSearch(e.target.value);
            setTokenPage(0);
          }}
          placeholder="Search tokens..."
          style={{ fontSize: 11, flex: "1 1 120px" }}
        />
        <MenuSelect
          value={playableSort}
          onChange={(e) => {
            setPlayableSort(e.target.value as TokenSortMode);
            setTokenPage(0);
          }}
          style={{ minWidth: 80, maxWidth: 120, fontSize: 11 }}
        >
          <option value="recent">Newest</option>
          <option value="name-asc">A-Z</option>
          <option value="name-desc">Z-A</option>
          <option value="contract">Contract</option>
          <option value="mime">Type</option>
        </MenuSelect>
        <MenuLabel style={{ whiteSpace: "nowrap", fontSize: 11 }}>
          {playableTokens.length} tokens
        </MenuLabel>
      </MenuRow>

      {totalPages > 1 && (
        <MenuRow
          style={{
            marginBottom: 4,
            gap: 6,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <MenuBtn
            disabled={tokenPage === 0}
            onClick={() => setTokenPage((p) => Math.max(0, p - 1))}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            ◀ PREV
          </MenuBtn>
          <MenuLabel style={{ fontSize: 11, whiteSpace: "nowrap" }}>
            {pageStart}-{pageEnd} of {playableTokens.length} · page{" "}
            {tokenPage + 1}/{totalPages}
          </MenuLabel>
          <MenuBtn
            disabled={tokenPage >= totalPages - 1}
            onClick={() => setTokenPage((p) => Math.min(totalPages - 1, p + 1))}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            NEXT ▶
          </MenuBtn>
        </MenuRow>
      )}

      <MenuTokenGrid>
        {pageTokens.map((token) => {
          const tokenKey = `${token.tokenContract}:${token.tokenId}`;
          const previewUri = token.tokenThumbnail || token.sourceUri;
          const cachePreview = buildTvCacheUrl(previewUri);

          return (
            <MenuTokenCard
              key={tokenKey}
              onClick={() =>
                selectedOwnChannelId &&
                addVideoMutation.mutate({
                  channelId: selectedOwnChannelId,
                  token,
                })
              }
            >
              <TokenPreview>
                {previewUri ? (
                  <TokenPreviewMedia
                    src={cachePreview || previewUri}
                    alt={token.tokenName}
                    loading="lazy"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (cachePreview && el.dataset.direct !== "1") {
                        el.dataset.direct = "1";
                        el.src = previewUri;
                        return;
                      }
                      el.style.display = "none";
                    }}
                  />
                ) : (
                  <TokenPreviewFallback>NO PREVIEW</TokenPreviewFallback>
                )}
              </TokenPreview>
              <div
                style={{
                  fontWeight: "bold",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 11,
                }}
              >
                {token.tokenName}
              </div>
              <MenuBtn
                $accent
                disabled={!selectedOwnChannelId || addVideoMutation.isPending}
                style={{
                  marginTop: "auto",
                  width: "100%",
                  padding: "3px 6px",
                  fontSize: 10,
                }}
              >
                {addVideoMutation.isPending ? "..." : "+ ADD"}
              </MenuBtn>
            </MenuTokenCard>
          );
        })}
      </MenuTokenGrid>

      {totalPages > 1 && (
        <MenuRow
          style={{
            marginTop: 4,
            gap: 6,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <MenuBtn
            disabled={tokenPage === 0}
            onClick={() => setTokenPage((p) => Math.max(0, p - 1))}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            ◀ PREV
          </MenuBtn>
          <MenuLabel style={{ fontSize: 11, whiteSpace: "nowrap" }}>
            Page {tokenPage + 1}/{totalPages}
          </MenuLabel>
          <MenuBtn
            disabled={tokenPage >= totalPages - 1}
            onClick={() => setTokenPage((p) => Math.min(totalPages - 1, p + 1))}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            NEXT ▶
          </MenuBtn>
        </MenuRow>
      )}

      {playableTokens.length === 0 && (
        <MenuLabel style={{ marginTop: 8 }}>
          {playableTokensQuery.isLoading
            ? "Loading playable tokens..."
            : "No playable tokens found"}
        </MenuLabel>
      )}
      {playableTokensQuery.isError && (
        <MenuLabel style={{ color: "#ff6655", marginTop: 6 }}>
          Failed to load playable tokens. Please retry.
        </MenuLabel>
      )}
    </MenuOverlay>
  );
}
