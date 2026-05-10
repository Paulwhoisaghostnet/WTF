import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Select,
  Hourglass,
  Separator,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";
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

const SwapContainer = styled.div`
  max-width: 420px;
  margin: 0 auto;
`;

const TokenRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-bottom: 8px;
`;

const TokenInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
`;

const TokenIcon = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #808080;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 2px 0;
`;

const StatusText = styled.p<{ $error?: boolean }>`
  font-size: 12px;
  color: ${(p) => (p.$error ? "red" : "#000080")};
  margin: 6px 0;
`;

const SwapArrow = styled.div`
  display: flex;
  justify-content: center;
  padding: 4px 0;
  font-size: 18px;
  cursor: pointer;
  user-select: none;

  &:hover {
    color: #000080;
  }
`;

const HealthBanner = styled.div<{ $ok: boolean }>`
  font-size: 10px;
  padding: 4px 8px;
  margin-bottom: 8px;
  background: ${(p) => (p.$ok ? "#e8ffe8" : "#ffe8e8")};
  border: 1px solid ${(p) => (p.$ok ? "#008000" : "#cc0000")};
`;

const RouteLink = styled.a`
  display: block;
  text-align: center;
  font-size: 11px;
  margin-top: 6px;
  color: #000080;
  text-decoration: underline;
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
      <SwapContainer>
        {health && (
          <HealthBanner $ok={health.spicyswap}>
            {health.spicyswap
              ? `SpicySwap online — ${health.activePools} active pools, ${health.activeTokens} tokens`
              : "SpicySwap API unreachable — swap may not work"}
          </HealthBanner>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Hourglass size={32} />
            <p style={{ fontSize: 12, marginTop: 8 }}>Loading pools...</p>
          </div>
        ) : (
          <>
            <GroupBox label="From">
              <TokenRow>
                <div style={{ flex: 1 }}>
                  <Select
                    value={fromToken.tag}
                    onChange={(e: any) => selectToken("from", e.value)}
                    options={allTokenOptions}
                    width="100%"
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
                <span style={{ fontWeight: "bold", fontSize: 12 }}>
                  {fromToken.symbol}
                </span>
                {fromToken.totalLiquidityXtz > 0 && (
                  <span style={{ fontSize: 10, color: "#666" }}>
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
              />
            </GroupBox>

            <SwapArrow onClick={flipTokens} title="Swap direction">
              &#8597;
            </SwapArrow>

            <GroupBox label={`To${counterparts ? ` (${toTokenOptions.length} available)` : ""}`}>
              <TokenRow>
                <div style={{ flex: 1 }}>
                  <Select
                    value={toToken.tag}
                    onChange={(e: any) => selectToken("to", e.value)}
                    options={toTokenOptions}
                    width="100%"
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
                <span style={{ fontWeight: "bold", fontSize: 12 }}>
                  {toToken.symbol}
                </span>
                {toToken.totalLiquidityXtz > 0 && (
                  <span style={{ fontSize: 10, color: "#666" }}>
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
              />
            </GroupBox>

            <Separator style={{ margin: "8px 0" }} />

            <GroupBox label="Slippage Tolerance">
              <div style={{ display: "flex", gap: 4 }}>
                {[0.5, 1, 2, 5].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    active={slippage === s}
                    onClick={() => setSlippage(s)}
                  >
                    {s}%
                  </Button>
                ))}
              </div>
            </GroupBox>

            {currentPool && fromAmountNum > 0 && (
              <GroupBox label="Swap Info" style={{ marginTop: 8 }}>
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
                      color: swapCalc.impact > 5 ? "red" : "inherit",
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

            <Button
              fullWidth
              style={{ marginTop: 8 }}
              disabled={swapping || (!!address && (fromAmountNum <= 0 || !currentPool))}
              onClick={handleSwap}
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
            </Button>

            <RouteLink
              href={build3RouteUrl(fromToken, toToken, fromAmountNum || undefined)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: 4 }}
            >
              Open in 3Route for best execution across 8 DEXes
            </RouteLink>

            <p
              style={{
                fontSize: 10,
                color: "#808080",
                marginTop: 8,
                textAlign: "center",
              }}
            >
              Direct swap via SpicySwap. For larger trades, 3Route aggregates
              across SpicySwap, QuipuSwap, Plenty, Vortex, Sirius, and more
              for up to 50% better execution.
            </p>
          </>
        )}
      </SwapContainer>
    </AppWindow>
  );
}
