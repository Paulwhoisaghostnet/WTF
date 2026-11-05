import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { assertTraderAddress } from "./recipient-input";
import type { HorfPosseResponse } from "./social-types";

type SeasonRider = {
  address: string;
  name?: string | null;
  trades?: number;
  sent?: number;
  received?: number;
  giftHorsesReceived?: number;
  tradeHorsesReceived?: number;
  blacklisted?: boolean;
};
type SeasonResponse = { leaderboard?: SeasonRider[] };
type Offer = { ownerAddress?: string; ownerName?: string | null };
type OffersResponse = { offers?: Offer[] };

export type HorfTraderChoice = {
  address: string;
  name: string | null;
  trades: number | null;
  sent: number | null;
  received: number | null;
  giftHorsesReceived: number | null;
  tradeHorsesReceived: number | null;
  blacklisted: boolean;
};

export type HorfTraderChoices = {
  posse: HorfTraderChoice[];
  known: HorfTraderChoice[];
  isLoading: boolean;
  isError: boolean;
  posseUnavailable: boolean;
};

function validWallet(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return assertTraderAddress(value) === value; } catch { return false; }
}

function displayName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function choice(address: string, name: unknown, counts?: SeasonRider): HorfTraderChoice {
  return {
    address,
    name: displayName(name),
    trades: count(counts?.trades),
    sent: count(counts?.sent),
    received: count(counts?.received),
    giftHorsesReceived: count(counts?.giftHorsesReceived),
    tradeHorsesReceived: count(counts?.tradeHorsesReceived),
    blacklisted: counts?.blacklisted === true,
  };
}

/** The same public rider sources used by Find Other Traders, plus this wallet's posse. */
export function useHorfTraderChoices(ownerAddress: string | null, options?: { enabled?: boolean }): HorfTraderChoices {
  const enabled = options?.enabled !== false;
  const seasonQuery = useQuery({
    queryKey: ["horf", "known-traders", "all-time"],
    queryFn: () => api.get<SeasonResponse>("/api/horf/season?season=all-time"),
    enabled,
  });
  const offersQuery = useQuery({
    queryKey: ["horf", "known-traders", "open-range-offers"],
    queryFn: () => api.get<OffersResponse>("/api/horf/open-range/offers"),
    enabled,
  });
  const posseQuery = useQuery({
    queryKey: ["horf", "posse", ownerAddress],
    queryFn: () => api.get<HorfPosseResponse>(`/api/horf/posse?address=${encodeURIComponent(ownerAddress!)}`),
    enabled: enabled && Boolean(ownerAddress),
  });

  return useMemo(() => {
    const byAddress = new Map<string, HorfTraderChoice>();
    const riders = Array.isArray(seasonQuery.data?.leaderboard) ? seasonQuery.data.leaderboard : [];
    const offers = Array.isArray(offersQuery.data?.offers) ? offersQuery.data.offers : [];
    const partners = Array.isArray(posseQuery.data?.partners) ? posseQuery.data.partners : [];
    for (const rider of riders) {
      if (!validWallet(rider?.address)) continue;
      byAddress.set(rider.address, choice(rider.address, rider.name, rider));
    }
    for (const offer of offers) {
      if (!validWallet(offer?.ownerAddress)) continue;
      const existing = byAddress.get(offer.ownerAddress);
      if (existing) {
        if (!existing.name) existing.name = displayName(offer.ownerName);
      } else {
        byAddress.set(offer.ownerAddress, choice(offer.ownerAddress, offer.ownerName));
      }
    }
    const posse: HorfTraderChoice[] = [];
    for (const partner of partners) {
      if (!validWallet(partner?.address)) continue;
      const known = byAddress.get(partner.address);
      posse.push({ ...(known ?? choice(partner.address, null)), name: displayName(partner.nickname) ?? known?.name ?? null });
    }
    const sort = (a: HorfTraderChoice, b: HorfTraderChoice) => (a.name ?? a.address).localeCompare(b.name ?? b.address) || a.address.localeCompare(b.address);
    return {
      posse: posse.sort(sort),
      known: [...byAddress.values()].sort(sort),
      isLoading: enabled && (seasonQuery.isPending || offersQuery.isPending),
      isError: enabled && (seasonQuery.isError || offersQuery.isError),
      posseUnavailable: Boolean(enabled && ownerAddress && posseQuery.isError),
    };
  }, [enabled, ownerAddress, seasonQuery.data, seasonQuery.isPending, seasonQuery.isError, offersQuery.data, offersQuery.isPending, offersQuery.isError, posseQuery.data, posseQuery.isError]);
}

const Picker = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  margin-top: 7px;
  select {
    width: auto;
    min-width: min(100%, 170px);
    max-width: 100%;
    min-height: 38px;
    padding: 7px 9px;
    border: 1px solid var(--horf-line, #3d5148);
    border-radius: 8px;
    background: var(--horf-field, #24332d);
    color: var(--horf-ink, #f4ead6);
    font: 12px var(--horf-font, "Avenir Next", sans-serif);
  }
  select:focus-visible { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 2px; }
  small { color: var(--horf-muted, #b7b5a7); font-size: 11px; }
`;

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function horfTraderReceiptLabel(rider: HorfTraderChoice): string {
  if (rider.received === null) return "";
  const gifts = rider.giftHorsesReceived;
  const trades = rider.tradeHorsesReceived;
  if (gifts === null || trades === null || gifts + trades !== rider.received) return `received ${rider.received}`;
  return `received ${rider.received} (🎁 ${gifts} gift / 🤝 ${trades} trade)`;
}

function optionLabel(rider: HorfTraderChoice): string {
  const name = rider.name ? `${rider.name} · ` : "";
  const trades = rider.trades !== null ? ` · ${rider.trades} transfers` : "";
  const received = horfTraderReceiptLabel(rider);
  return `${name}${shortAddress(rider.address)}${trades}${received ? ` · ${received}` : ""}${rider.blacklisted ? " · blacklisted" : ""}`;
}

export function HorfKnownTraderPicker({ choices, onSelect, disabled = false, excludeAddress, label = "rider", showPosse = true, includeBlacklisted = false, posseDataAttribute, knownDataAttribute }: {
  choices: HorfTraderChoices;
  onSelect: (address: string, source: "posse" | "known") => void;
  disabled?: boolean;
  excludeAddress?: string | null;
  label?: string;
  showPosse?: boolean;
  includeBlacklisted?: boolean;
  posseDataAttribute?: string;
  knownDataAttribute?: string;
}) {
  const visible = (rider: HorfTraderChoice) => rider.address !== excludeAddress && (includeBlacklisted || !rider.blacklisted);
  const posse = choices.posse.filter(visible);
  const known = choices.known.filter(visible);
  const select = (address: string, source: "posse" | "known") => {
    if (!address) return;
    onSelect(address, source);
    logClientSystemEvent({
      eventType: source === "posse" ? "horf.posse.selected" : "horf.trader_picker.selected",
      message: source === "posse" ? "Horf posse trader selected" : "Known Horf trader selected",
      metadata: { address, source },
    });
  };
  const posseAttribute = posseDataAttribute ? { [posseDataAttribute]: "" } : {};
  const knownAttribute = knownDataAttribute ? { [knownDataAttribute]: "" } : {};
  return <Picker data-horf-known-trader-picker>
    {showPosse && <select {...posseAttribute} aria-label={`Choose ${label} from your posse`} value="" onChange={(event) => select(event.currentTarget.value, "posse")} disabled={disabled || !posse.length}>
      <option value="">{choices.posseUnavailable ? "Posse unavailable" : posse.length ? "Choose from posse…" : "No posse riders yet"}</option>
      {posse.map((rider) => <option key={rider.address} value={rider.address}>{optionLabel(rider)}</option>)}
    </select>}
    <select {...knownAttribute} aria-label={`Choose known ${label}`} value="" onChange={(event) => select(event.currentTarget.value, "known")} disabled={disabled || !known.length}>
      <option value="">{choices.isLoading && !known.length ? "Finding known riders…" : known.length ? "Choose known trader…" : "No known riders yet"}</option>
      {known.map((rider) => <option key={rider.address} value={rider.address}>{optionLabel(rider)}</option>)}
    </select>
    {choices.isError && <small role="status">Some rider lists are unavailable. You can type a wallet address.</small>}
  </Picker>;
}
