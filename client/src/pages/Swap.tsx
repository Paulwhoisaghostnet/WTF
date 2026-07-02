import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  GroupBox,
  TextInput,
  Select,
  Hourglass,
  Separator,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiNotice } from "../components/wtfos-ui";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";
import { usePresentationShell } from "../lib/presentation-shell";
import { executeSwap, type SwapParams } from "../lib/tezos/dex";
import {
  type SpicyToken,
  type SpicyPool,
  getPoolByTags,
  rawToBalance,
  DEFAULT_SWAP_FROM,
  DEFAULT_SWAP_TO,
  XTZ_TAG,
} from "@shared/types";

function swapRegionAttrs(region: string): any {
  return { "data-swap-region": region };
}

const SwapContainer = styled.div`
  max-width: 420px;
  margin: 0 auto;
  display: grid;
  gap: var(--wtf-space-2, 8px);

  &[data-swap-presentation-host="gamma"] {
    max-width: 680px;
    background: #070706;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    gap: 12px;
    padding: 2px;
  }

  &[data-swap-presentation-host="gamma"],
  &[data-swap-presentation-host="gamma"] * {
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  &[data-swap-presentation-host="gamma"] [data-swap-region] {
    background-image: none !important;
    box-shadow: none !important;
    border-color: rgba(242, 234, 217, 0.16) !important;
    border-width: 1px !important;
    border-radius: 6px !important;
  }

  &[data-swap-presentation-host="gamma"] :where(fieldset, [data-swap-region="health"], [data-swap-region="info-panel"], [data-swap-region="status"], [data-swap-region="error"], [data-swap-region="route-link"], [data-swap-region="footer-note"]) {
    background: #11110f !important;
    color: #f2ead9 !important;
  }

  &[data-swap-presentation-host="gamma"] :where(legend, strong, label, span, p) {
    color: #f2ead9 !important;
  }

  &[data-swap-presentation-host="gamma"] :where(input, select) {
    background: #070706 !important;
    color: #f2ead9 !important;
    border: 1px solid rgba(242, 234, 217, 0.2) !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-swap-presentation-host="gamma"] :where(button) {
    background: transparent !important;
    color: #f2ead9 !important;
    border-color: rgba(0, 210, 255, 0.42) !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-swap-presentation-host="gamma"] :where(button:hover, button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible) {
    border-color: #00d2ff !important;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }

  &[data-swap-presentation-host="gamma"] [data-swap-region="slippage-button"][data-swap-active="true"],
  &[data-swap-presentation-host="gamma"] [data-swap-region="submit-button"] {
    color: #00d2ff !important;
    border-color: #00d2ff !important;
  }

  &[data-swap-presentation-host="gamma"] [data-swap-region="health"][data-swap-online="true"] {
    border-color: #d6ff3f !important;
  }

  &[data-swap-presentation-host="gamma"] [data-swap-region="error"] {
    border-color: rgba(255, 107, 95, 0.62) !important;
    color: #ff6b5f !important;
  }

  &[data-swap-presentation-host="gamma"] a {
    color: #00d2ff !important;
  }
`;

const TokenRow = styled.div.attrs(swapRegionAttrs("token-row"))`
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-bottom: 8px;
`;

const TokenInfo = styled.div.attrs(swapRegionAttrs("token-info"))`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
`;

const TokenIcon = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--wtf-app-border, #808080);
`;

const InfoRow = styled.div.attrs(swapRegionAttrs("info-row"))`
  display: flex;
  justify-content: space-between;
  gap: var(--wtf-space-2, 8px);
  font-size: var(--wtf-type-caption, 13px);
  padding: 3px 0;
  color: var(--wtf-app-text, #111);

  span:last-child {
    font-weight: 700;
    text-align: right;
  }
`;

const StatusText = styled.p.attrs<{ $error?: boolean }>((p) =>
  swapRegionAttrs(p.$error ? "error" : "status")
)`
  font-size: var(--wtf-type-body, 14px);
  line-height: 1.4;
  color: ${(p) =>
    p.$error ? "var(--wtf-app-danger, #b42318)" : "var(--wtf-app-info, #175cd3)"};
  margin: 6px 0;
`;

const SwapArrow = styled.button.attrs(swapRegionAttrs("direction-button"))`
  display: inline-flex;
  justify-self: center;
  justify-content: center;
  align-items: center;
  width: 40px;
  min-width: 40px;
  min-height: 40px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  color: var(--wtf-app-text, #111);
  background: var(--wtf-app-control-bg, #ffffff);
  border: 1px solid var(--wtf-app-control-border, #808080);

  &:hover {
    color: var(--wtf-app-link, #000080);
    border-color: var(--wtf-app-link, #000080);
  }
`;

const RouteLink = styled.a.attrs(swapRegionAttrs("route-link"))`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: stretch;
  min-height: 32px;
  padding: 4px 6px;
  text-align: center;
  font-size: var(--wtf-type-caption, 13px);
  margin-top: 6px;
  color: var(--wtf-app-link, #000080);
  text-decoration: underline;
`;

const SwapPanel = styled.div`
  display: grid;
  gap: 8px;
`;

const Footnote = styled.p.attrs(swapRegionAttrs("footer-note"))`
  margin-top: 8px;
  text-align: center;
`;

const DEFAULT_SLIPPAGE = 1;

function useTokenList() {
  return useQuery({
    queryKey: ["dex", "tokens"],
    queryFn: () => api.get<SpicyToken[]>("/api/dex/tokens"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

function usePoolList() {
  return useQuery({
    queryKey: ["dex", "pools"],
    queryFn: () => api.get<SpicyPool[]>("/api/dex/pools"),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

function useCounterparts(tag: string | undefined) {
  return useQuery({
    queryKey: ["dex", "counterparts", tag],
    queryFn: () =>
      api.get<SpicyToken[]>(`/api/dex/counterparts/${encodeURIComponent(tag!)}`),
    enabled: !!tag,
    staleTime: 30_000,
  });
}

function useDexHealth() {
  return useQuery({
    queryKey: ["dex", "health"],
    queryFn: () =>
      api.get<{
        spicyswap: boolean;
        totalPools: number;
        activePools: number;
        activeTokens: number;
      }>("/api/dex/health"),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

function calculateSwapOutput(
  pool: SpicyPool,
  fromTag: string,
  inputAmount: number
): { output: number; rate: number; impact: number } {
  if (!pool || inputAmount <= 0) return { output: 0, rate: 0, impact: 0 };

  const isFromReserveFrom = pool.fromToken.tag === fromTag;
  const reserveIn = isFromReserveFrom ? pool.reserveFrom : pool.reserveTo;
  const reserveOut = isFromReserveFrom ? pool.reserveTo : pool.reserveFrom;

  if (reserveIn <= 0 || reserveOut <= 0) return { output: 0, rate: 0, impact: 0 };

  const fee = 0.998;
  const inputWithFee = inputAmount * fee;
  const output = (reserveOut * inputWithFee) / (reserveIn + inputWithFee);
  const spotRate = reserveOut / reserveIn;
  const executionRate = output / inputAmount;
  const impact = ((spotRate - executionRate) / spotRate) * 100;

  return { output, rate: reserveIn / reserveOut, impact: Math.max(0, impact) };
}

function build3RouteUrl(from: SpicyToken, to: SpicyToken, amount?: number): string {
  const base = "https://3route.io/swap";
  const fromPart = from.symbol === "XTZ" ? "XTZ" : from.symbol;
  const toPart = to.symbol === "XTZ" ? "XTZ" : to.symbol;
  return `${base}?from=${fromPart}&to=${toPart}${amount ? `&amount=${amount}` : ""}`;
}

export function Swap() {
  const presentation = usePresentationShell();
  const { address, connect } = useWallet();
  const { data: rawTokens, isLoading: tokensLoading } = useTokenList();
  const { data: rawPools, isLoading: poolsLoading } = usePoolList();
  const { data: health } = useDexHealth();
  const tokens = Array.isArray(rawTokens) ? rawTokens : [];
  const pools = Array.isArray(rawPools) ? rawPools : [];

  const [fromToken, setFromToken] = useState<SpicyToken>(DEFAULT_SWAP_FROM);
  const [toToken, setToToken] = useState<SpicyToken>(DEFAULT_SWAP_TO);
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [swapping, setSwapping] = useState(false);

  const { data: rawCounterparts } = useCounterparts(fromToken?.tag);
  const counterparts = Array.isArray(rawCounterparts) ? rawCounterparts : [];

  const allTokenOptions = useMemo(() => {
    const xtz: SpicyToken = {
      ...DEFAULT_SWAP_FROM,
      derivedXtz: 1,
      derivedUsd: tokens.find((t) => t.tag === XTZ_TAG)?.derivedUsd ?? 0,
    };
    const all = [xtz, ...tokens.filter((t) => t.tag !== XTZ_TAG)];
    return all.map((t) => ({
      label: `${t.symbol} — ${t.name}`,
      value: t.tag,
      token: t,
    }));
  }, [tokens]);

  const toTokenOptions = useMemo(() => {
    if (!counterparts || counterparts.length === 0) return allTokenOptions;
    const counterpartTags = new Set(counterparts.map((t) => t.tag));
    const filtered = allTokenOptions.filter(
      (o) => counterpartTags.has(o.value) && o.value !== fromToken.tag,
    );
    if (filtered.length === 0) return allTokenOptions;
    return filtered;
  }, [counterparts, allTokenOptions, fromToken.tag]);

  const currentPool = useMemo(() => {
    if (!fromToken || !toToken) return undefined;
    return getPoolByTags(pools, fromToken.tag, toToken.tag);
  }, [pools, fromToken, toToken]);

  const fromAmountNum = useMemo(() => {
    const n = parseFloat(fromAmount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [fromAmount]);

  const swapCalc = useMemo(() => {
    if (!currentPool || fromAmountNum <= 0)
      return { output: 0, rate: 0, impact: 0 };
    return calculateSwapOutput(currentPool, fromToken.tag, fromAmountNum);
  }, [currentPool, fromToken, fromAmountNum]);

  const toAmount = swapCalc.output;

  const selectToken = useCallback(
    (direction: "from" | "to", tag: string) => {
      const opt = allTokenOptions.find((o) => o.value === tag);
      if (!opt) return;
      if (direction === "from") {
        if (tag === toToken.tag) setToToken(fromToken);
        setFromToken(opt.token);
      } else {
        if (tag === fromToken.tag) setFromToken(toToken);
        setToToken(opt.token);
      }
    },
    [allTokenOptions, fromToken, toToken],
  );

  const flipTokens = useCallback(() => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount("");
  }, [fromToken, toToken]);

  useEffect(() => {
    if (!tokens || tokens.length === 0) return;
    const wtfToken = allTokenOptions.find(
      (t) => t.token.symbol === "WTF" || t.value === DEFAULT_SWAP_TO.tag,
    );
    if (wtfToken && toToken.derivedXtz === 0 && wtfToken.token.derivedXtz !== 0) {
      setToToken(wtfToken.token);
    }
  }, [tokens, allTokenOptions, toToken.derivedXtz]);

  useEffect(() => {
    if (counterparts && counterparts.length > 0 && !currentPool) {
      const bestCounterpart = counterparts[0];
      if (bestCounterpart.tag !== fromToken.tag) {
        setToToken(bestCounterpart);
      }
    }
  }, [counterparts, currentPool, fromToken.tag]);

  const handleSwap = async () => {
    if (!address) {
      await connect();
      return;
    }
    if (fromAmountNum <= 0) {
      setError("Enter an amount");
      return;
    }
    if (!currentPool) {
      setError("No liquidity pool found for this pair");
      return;
    }

    setError("");
    setStatus("Preparing swap...");
    setSwapping(true);

    try {
      const params: SwapParams = {
        fromToken,
        toToken,
        fromAmount: fromAmountNum,
        toAmount,
        slippage,
        userAddress: address,
      };
      setStatus("Confirm the transaction in your wallet...");
      const opHash = await executeSwap(params);
      setStatus(`Swap confirmed! Operation: ${opHash.slice(0, 12)}...`);
      setFromAmount("");
    } catch (err: any) {
      setError(err?.message || "Swap failed");
      setStatus("");
    } finally {
      setSwapping(false);
    }
  };

  const loading = tokensLoading || poolsLoading;

  return (
    <AppWindow title="Token Swap">
      <SwapContainer
        data-swap-presentation-host={presentation.host}
        data-swap-surface="swap"
        data-swap-region="surface"
      >
        {health && (
          <UiNotice
            tone={health.spicyswap ? "success" : "danger"}
            data-swap-region="health"
            data-swap-online={health.spicyswap ? "true" : "false"}
          >
            {health.spicyswap
              ? `SpicySwap online — ${health.activePools} active pools, ${health.activeTokens} tokens`
              : "SpicySwap API unreachable — swap may not work"}
          </UiNotice>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }} data-swap-region="loading">
            <Hourglass size={32} />
            <p style={{ fontSize: "var(--wtf-type-body, 14px)", marginTop: 8 }}>Loading pools...</p>
          </div>
        ) : (
          <>
            <SwapPanel data-swap-region="from-panel">
              <GroupBox label="From">
                <TokenRow>
                  <div style={{ flex: 1 }}>
                    <Select
                      value={fromToken.tag}
                      onChange={(e: any) => selectToken("from", e.value)}
                      options={allTokenOptions}
                      width="100%"
                      data-swap-region="from-token-select"
                    />
                  </div>
                </TokenRow>
                <TokenInfo>
                  {fromToken.img && (
                    <TokenIcon
                      src={fromToken.img.replace(
                        "ipfs://",
                        "https://gateway.pinata.cloud/ipfs/",
                      )}
                      alt={fromToken.symbol}
                      onError={(e: any) => {
                        e.target.style.display = "none";
                      }}
                    />
                  )}
                  <span style={{ fontWeight: "bold", fontSize: "var(--wtf-type-body, 14px)" }}>
                    {fromToken.symbol}
                  </span>
                  {fromToken.totalLiquidityXtz > 0 && (
                    <span data-wtf-caption="true">
                      Liq: {fromToken.totalLiquidityXtz.toFixed(0)} XTZ
                    </span>
                  )}
                </TokenInfo>
                <TextInput
                  value={fromAmount}
                  onChange={(e: any) => setFromAmount(e.target.value)}
                  placeholder="0.0"
                  fullWidth
                  type="number"
                  data-swap-region="amount-input"
                  aria-label="Swap from amount"
                />
              </GroupBox>
            </SwapPanel>

            <SwapArrow
              type="button"
              onClick={flipTokens}
              title="Swap direction"
              aria-label="Swap from and to tokens"
              data-compact-control="true"
            >
              &#8597;
            </SwapArrow>

            <SwapPanel data-swap-region="to-panel">
              <GroupBox label={`To${counterparts ? ` (${toTokenOptions.length} available)` : ""}`}>
                <TokenRow>
                  <div style={{ flex: 1 }}>
                    <Select
                      value={toToken.tag}
                      onChange={(e: any) => selectToken("to", e.value)}
                      options={toTokenOptions}
                      width="100%"
                      data-swap-region="to-token-select"
                    />
                  </div>
                </TokenRow>
                <TokenInfo>
                  {toToken.img && (
                    <TokenIcon
                      src={toToken.img.replace(
                        "ipfs://",
                        "https://gateway.pinata.cloud/ipfs/",
                      )}
                      alt={toToken.symbol}
                      onError={(e: any) => {
                        e.target.style.display = "none";
                      }}
                    />
                  )}
                  <span style={{ fontWeight: "bold", fontSize: "var(--wtf-type-body, 14px)" }}>
                    {toToken.symbol}
                  </span>
                  {toToken.totalLiquidityXtz > 0 && (
                    <span data-wtf-caption="true">
                      Liq: {toToken.totalLiquidityXtz.toFixed(0)} XTZ
                    </span>
                  )}
                </TokenInfo>
                <TextInput
                  value={
                    toAmount > 0
                      ? rawToBalance(
                          Math.floor(toAmount * 10 ** toToken.decimals),
                          toToken.decimals,
                        ).toFixed(Math.min(toToken.decimals, 6))
                      : ""
                  }
                  readOnly
                  placeholder="0.0"
                  fullWidth
                  data-swap-region="quote-output"
                  aria-label="Swap quoted output"
                />
              </GroupBox>
            </SwapPanel>

            <Separator style={{ margin: "8px 0" }} />

            <GroupBox label="Slippage Tolerance" data-swap-region="slippage-panel">
              <div style={{ display: "flex", gap: 4 }}>
                {[0.5, 1, 2, 5].map((s) => (
                  <UiButton
                    key={s}
                    size="sm"
                    active={slippage === s}
                    uiVariant={slippage === s ? "primary" : "default"}
                    onClick={() => setSlippage(s)}
                    data-swap-region="slippage-button"
                    data-swap-active={slippage === s ? "true" : "false"}
                  >
                    {s}%
                  </UiButton>
                ))}
              </div>
            </GroupBox>

            {currentPool && fromAmountNum > 0 && (
              <GroupBox label="Swap Info" style={{ marginTop: 8 }} data-swap-region="info-panel">
                <InfoRow>
                  <span>Rate</span>
                  <span>
                    {swapCalc.rate > 0 ? swapCalc.rate.toFixed(6) : "—"}{" "}
                    {fromToken.symbol} / {toToken.symbol}
                  </span>
                </InfoRow>
                <InfoRow>
                  <span>Price Impact</span>
                  <span
                    style={{
                      color:
                        swapCalc.impact > 5
                          ? "var(--wtf-app-danger, #b42318)"
                          : "inherit",
                    }}
                  >
                    {swapCalc.impact.toFixed(2)}%
                  </span>
                </InfoRow>
                <InfoRow>
                  <span>Slippage</span>
                  <span>{slippage}%</span>
                </InfoRow>
                <InfoRow>
                  <span>Min. Received</span>
                  <span>
                    {(toAmount - (toAmount * slippage) / 100).toFixed(
                      Math.min(toToken.decimals, 6),
                    )}{" "}
                    {toToken.symbol}
                  </span>
                </InfoRow>
              </GroupBox>
            )}

            {!currentPool && fromToken.tag && toToken.tag && (
              <StatusText>
                No direct pool for {fromToken.symbol}/{toToken.symbol}.
                Try 3Route for multi-hop routing.
              </StatusText>
            )}

            {swapCalc.impact > 25 && (
              <StatusText $error>
                Warning: High price impact ({swapCalc.impact.toFixed(1)}%). A
                large portion of your trade may be lost.
              </StatusText>
            )}

            {swapCalc.impact > 3 && fromAmountNum > 0 && currentPool && (
              <RouteLink
                href={build3RouteUrl(fromToken, toToken, fromAmountNum)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Compare price on 3Route (multi-DEX aggregator, 0% fees)
              </RouteLink>
            )}

            {error && <StatusText $error>{error}</StatusText>}
            {status && <StatusText>{status}</StatusText>}

            <UiButton
              fullWidth
              uiVariant="primary"
              style={{ marginTop: 8 }}
              disabled={swapping || (!!address && (fromAmountNum <= 0 || !currentPool))}
              onClick={handleSwap}
              data-swap-region="submit-button"
            >
              {swapping ? (
                <>
                  <Hourglass size={16} /> Swapping...
                </>
              ) : !address ? (
                "Connect Wallet"
              ) : !currentPool ? (
                "No Pool Available"
              ) : (
                "Swap via SpicySwap"
              )}
            </UiButton>

            <RouteLink
              href={build3RouteUrl(fromToken, toToken, fromAmountNum || undefined)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: 4 }}
            >
              Open in 3Route for best execution across 8 DEXes
            </RouteLink>

            <Footnote className="wtf-caption">
              Direct swap via SpicySwap. For larger trades, 3Route aggregates
              across SpicySwap, QuipuSwap, Plenty, Vortex, Sirius, and more
              for up to 50% better execution.
            </Footnote>
          </>
        )}
      </SwapContainer>
    </AppWindow>
  );
}
