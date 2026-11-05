import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";

export type HorfOwnedHorse = {
  contract: string;
  tokenId: string;
  balance: string;
  name: string | null;
  image: string | null;
  artifactUri?: string | null;
  mime?: string | null;
  description?: string | null;
  creatorAddress?: string | null;
  mintedAt?: string | null;
  approvedForMarshalsMarket?: boolean;
  walletAddress?: string;
};

type HorsePage = {
  address: string;
  items: HorfOwnedHorse[];
  pagination: { hasMore: boolean; nextOffset: number };
};

function parseHorsePage(value: unknown, address: string): HorsePage {
  const page = value as Partial<HorsePage> | null;
  if (!page || page.address !== address || !Array.isArray(page.items) ||
      page.items.some((horse) => !horse || typeof horse.contract !== "string" ||
        typeof horse.tokenId !== "string" || typeof horse.balance !== "string" ||
        (horse.name != null && typeof horse.name !== "string")) ||
      !page.pagination || typeof page.pagination.hasMore !== "boolean" ||
      !Number.isSafeInteger(page.pagination.nextOffset) || page.pagination.nextOffset < 0) {
    throw new Error("Your horse list could not be read.");
  }
  return page as HorsePage;
}

function horseKey(horse: Pick<HorfOwnedHorse, "contract" | "tokenId">): string {
  return `${horse.contract}:${horse.tokenId}`;
}

function isOwned(balance: string): boolean {
  try { return BigInt(balance) > 0n; } catch { return false; }
}

const Picker = styled.div`
  min-width: 0;
  margin: 10px 0;
  label { display: block; margin: 0 0 6px; color: var(--horf-ink, #f4ead6); font: 750 13px/1.35 var(--horf-font, sans-serif); }
  input, select { display: block; width: 100%; min-height: 40px; margin: 0 0 7px; padding: 8px 10px; border: 1px solid var(--horf-line, #3d5148); border-radius: 9px; background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); font: 14px/1.3 var(--horf-font, sans-serif); }
  input:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid var(--horf-focus, #f0bd62); outline-offset: 2px; }
  button { min-height: 36px; padding: 6px 11px; border: 1px solid var(--horf-line, #3d5148); border-radius: 8px; background: var(--horf-elevated, #23332d); color: var(--horf-ink, #f4ead6); cursor: pointer; font: 750 12px/1.25 var(--horf-font, sans-serif); }
  button:disabled { opacity: .55; cursor: not-allowed; }
  p { margin: 5px 0 0; color: var(--horf-muted, #b7b5a7); font: 12px/1.45 var(--horf-font, sans-serif); }
`;

/** The same qualifying, currently owned horse selector used by HORF trade forms. */
export function HorfOwnedHorsePicker({ address, selected, onSelect, disabled = false, id, label = "Your horse", selectDataAttr, marshalApprovedOnly = false }: {
  address: string | null;
  selected: HorfOwnedHorse | null;
  onSelect: (horse: HorfOwnedHorse | null) => void;
  disabled?: boolean;
  id: string;
  label?: string;
  selectDataAttr?: `data-${string}`;
  marshalApprovedOnly?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["horf", "owned-qualifying-horses", address],
    queryFn: async ({ pageParam }) => parseHorsePage(
      await api.get<unknown>(`/api/horf/traders/${encodeURIComponent(address!)}/horses?offset=${pageParam}`), address!),
    initialPageParam: 0,
    getNextPageParam: (page) => page.pagination.hasMore ? page.pagination.nextOffset : undefined,
    enabled: Boolean(address),
    refetchOnWindowFocus: true,
  });
  const horses = useMemo(() => (query.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((horse) => isOwned(horse.balance) && (!marshalApprovedOnly || horse.approvedForMarshalsMarket === true))
    .map((horse) => ({ ...horse, walletAddress: address! })), [query.data, address, marshalApprovedOnly]);
  const selectedKey = selected && (!selected.walletAddress || selected.walletAddress === address) &&
    (!marshalApprovedOnly || selected.approvedForMarshalsMarket === true) ? horseKey(selected) : "";
  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return horses;
    return horses.filter((horse) => `${horse.name || ""} ${horse.contract} ${horse.tokenId}`.toLowerCase().includes(term));
  }, [filter, horses]);
  const options = selectedKey && selected && !shown.some((horse) => horseKey(horse) === selectedKey)
    ? [selected, ...shown] : shown;
  const selectAttrs = selectDataAttr ? { [selectDataAttr]: "" } : {};
  return <Picker data-horf-owned-horse-picker>
    <label htmlFor={`${id}-search`}>Find a horse in your wallet</label>
    <input id={`${id}-search`} type="search" value={filter} onChange={(event) => setFilter(event.currentTarget.value)} placeholder="Name, contract, token ID" disabled={!address || disabled} />
    <label htmlFor={id}>{label}</label>
    <select id={id} data-horf-owned-horse-select {...selectAttrs} value={selectedKey} onChange={(event) => {
      const horse = options.find((item) => horseKey(item) === event.currentTarget.value);
      onSelect(horse ?? null);
    }} disabled={!address || disabled}>
      <option value="">{!address ? "Connect wallet to see your horses" : query.isPending ? "Loading your horses…" : "Choose a horse"}</option>
      {options.map((horse) => <option key={horseKey(horse)} value={horseKey(horse)}>{horse.name || `Token #${horse.tokenId}`} · {horse.balance} owned{horse.approvedForMarshalsMarket ? " · Marshal approved" : ""}</option>)}
    </select>
    {query.hasNextPage && <button type="button" onClick={() => void query.fetchNextPage()} disabled={disabled || query.isFetchingNextPage}>{query.isFetchingNextPage ? "Loading…" : "More horses from this wallet"}</button>}
    {query.isError && <p role="alert">Horse list unavailable. <button type="button" onClick={() => void query.refetch()} disabled={disabled || query.isFetching}>Retry</button></p>}
    {address && !query.isPending && !query.isError && options.length === 0 && <p role="status">{query.hasNextPage ? "No matching horses on these pages. Load more to keep looking." : marshalApprovedOnly ? <>No Marshal-approved horses in this wallet. Submit one from <a href="/horf/stable">My Stable</a> for inspection. Marshals can review it at the <a href="/horf/inspection-desk">Inspection Desk</a>.</> : "No matching horse tokens in this wallet."}</p>}
    <p>{marshalApprovedOnly ? "Only currently owned horses that pass HORF’s test and have active Marshal approval appear here." : "Only currently owned tokens that pass HORF’s horse test appear here."}</p>
  </Picker>;
}
