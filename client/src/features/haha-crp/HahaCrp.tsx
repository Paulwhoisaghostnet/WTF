import { useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api, fetchWithCsrf } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { WindowPathContext } from "../../lib/window-context";
import { assertTraderAddress } from "../horf/recipient-input";
import { useHorfWallet } from "../horf/useHorfWallet";

type HahaCategory = { id: string; label: string; description?: string; icon?: string };
type HahaSeason = { key: string; label: string; startsAt: string; endsAt: string | null; status: string };
type HahaPrize = { horse: number; xtz: number };
type SeasonResponse = {
  season: HahaSeason;
  categories: HahaCategory[];
  prizes: { first: HahaPrize; runnerUp: HahaPrize };
  fundingStatus: "unfunded" | "funded";
};
type NomineeStanding = { address: string; name: string | null; count: number; rank: number };
type StandingsResponse = {
  season: HahaSeason;
  categories: Array<{ id: string; label: string; nominees: NomineeStanding[] }>;
};
type MineResponse = {
  address: string;
  nominations: Array<{ id: number; categoryId: string; nomineeAddress: string; nomineeDisplayName: string | null; note: string | null; createdAt: string; updatedAt: string }>;
};
type KnownTrader = { address: string; name: string | null };
type TraderSeasonResponse = { leaderboard?: Array<{ address: string; name: string | null }> };
type TraderOffersResponse = { offers?: Array<{ ownerAddress: string }> };

const Shell = styled.section`
  @font-face { font-family: "HAHA Fredoka"; src: url("/fonts/wtfos-soft-system/Fredoka-latin.woff2") format("woff2"); font-display: swap; }
  @font-face { font-family: "HAHA Noto Sans"; src: url("/fonts/wtfos-soft-system/NotoSans-latin.woff2") format("woff2"); font-display: swap; }
  --haha-ink: #17312e;
  --haha-muted: #526962;
  --haha-green: #174d42;
  --haha-coral: #e86946;
  --haha-line: #c8dcd2;
  --haha-gold: #f3b44d;
  --haha-font: "HAHA Noto Sans", "Avenir Next", sans-serif;
  --haha-display: "HAHA Fredoka", "Avenir Next", sans-serif;
  display: block;
  min-width: 0;
  padding: clamp(18px, 3cqw, 34px);
  border-radius: 18px;
  background: #f3f7f1;
  color: var(--haha-ink);
  font: 14px/1.5 var(--haha-font);
  container-type: inline-size;
  * { box-sizing: border-box; }
  a { color: #16685c; font-weight: 800; text-underline-offset: 3px; }
  button, input, select, textarea { font: inherit; }
  button, a, input, select, textarea { -webkit-tap-highlight-color: transparent; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid #087e7a; outline-offset: 3px; }
  h1, h2, h3, p { margin-top: 0; }
  p { color: var(--haha-muted); }

  .hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: start; margin-bottom: 19px; }
  .eyebrow { display: block; margin-bottom: 8px; color: #0e7667; font-size: 11px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }
  h1 { margin-bottom: 8px; font: 750 clamp(36px, 6cqw, 60px)/1 var(--haha-display); letter-spacing: -.04em; }
  .hero p { max-width: 68ch; margin-bottom: 0; font-size: 15px; }
  .hero-mark { display: grid; place-items: center; width: clamp(70px, 10cqw, 112px); aspect-ratio: 1; border: 2px solid #bf7b44; border-radius: 50%; background: #f8ca81; color: #533825; box-shadow: 0 9px 0 #e9ba75; font-size: clamp(35px, 5cqw, 60px); transform: rotate(-10deg); }
  .season-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 19px; }
  .pill { display: inline-flex; align-items: center; min-height: 31px; padding: 5px 10px; border: 1px solid #bad3c6; border-radius: 999px; background: #fff; color: #214e43; font-size: 11px; font-weight: 800; }
  .pill.open { border-color: #8cc3a4; background: #e7f5e9; }
  .prizes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 12px; }
  .prize { min-width: 0; padding: 17px 18px; border: 1px solid #315d50; border-radius: 14px; background: #153c34; color: #fff; }
  .prize.runner { border-color: #d99c56; background: #6d472e; }
  .prize small { display: block; margin-bottom: 7px; color: #f5c57d; font-size: 11px; font-weight: 850; letter-spacing: .09em; text-transform: uppercase; }
  .prize strong { display: block; font: 750 clamp(23px, 3cqw, 33px)/1.12 var(--haha-display); overflow-wrap: anywhere; }
  .prize span { display: block; margin-top: 6px; color: #dcece4; font-size: 12px; }
  .funding { margin: 0 0 20px; padding: 12px 14px; border: 1px solid #e2c89c; border-radius: 11px; background: #fff6e6; color: #654829; font-size: 12px; line-height: 1.5; }
  .funding.funded { border-color: #a3d1b6; background: #e9f7ed; color: #27533d; }
  .funding strong { color: inherit; }
  .work { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr); gap: 15px; align-items: start; }
  .panel { min-width: 0; padding: clamp(16px, 2cqw, 22px); border: 1px solid var(--haha-line); border-radius: 15px; background: #fff; box-shadow: 0 9px 22px #1540380b; }
  .panel h2 { margin-bottom: 7px; font: 750 clamp(22px, 3cqw, 31px)/1.1 var(--haha-display); }
  .panel > p { margin-bottom: 15px; font-size: 12px; }
  .form-grid { display: grid; gap: 13px; }
  label { display: block; margin-bottom: 5px; color: #24473d; font-size: 12px; font-weight: 800; }
  input, select, textarea { display: block; width: 100%; min-width: 0; min-height: 42px; padding: 9px 11px; border: 1px solid #a8c5b7; border-radius: 9px; background: #fff; color: var(--haha-ink); }
  textarea { min-height: 83px; resize: vertical; }
  .field-help { margin: 5px 0 0; font-size: 11px; line-height: 1.4; }
  .button-row { display: flex; flex-wrap: wrap; gap: 8px; }
  button { min-height: 40px; padding: 8px 14px; border: 1px solid var(--haha-green); border-radius: 9px; background: var(--haha-green); color: #fff; font-weight: 800; cursor: pointer; }
  button:hover:not(:disabled) { background: #216652; }
  button.secondary { border-color: #b8d3c2; background: #f4faf5; color: #244b3e; }
  button.secondary:hover:not(:disabled) { background: #e7f4eb; }
  button.primary { border-color: #c45136; background: var(--haha-coral); color: #fff; }
  button.primary:hover:not(:disabled) { background: #d65c3e; }
  button.remove { min-height: 32px; padding: 5px 8px; border-color: #dfb5aa; background: #fff5f2; color: #854733; font-size: 11px; }
  button.remove:hover:not(:disabled) { background: #ffe9e3; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .wallet-status, .message { margin: 0 0 14px; padding: 11px 13px; border: 1px solid #b9d9c6; border-radius: 10px; background: #edfaf0; color: #285346; font-size: 12px; }
  .wallet-status.alert, .message.error { border-color: #e4ad9e; background: #fff2ef; color: #743c30; }
  .wallet-status button { margin: 7px 0 0; }
  .message { margin: 12px 0 0; }
  .known { display: grid; gap: 4px; }
  .known p { margin: 0; font-size: 11px; }
  .chosen-list { display: grid; gap: 7px; margin: 8px 0 0; padding: 0; list-style: none; }
  .chosen { display: flex; justify-content: space-between; gap: 9px; align-items: center; padding: 9px 10px; border: 1px solid #d4e2d7; border-radius: 9px; background: #f7faf6; }
  .chosen strong, .chosen small { display: block; overflow-wrap: anywhere; }
  .chosen strong { font-size: 12px; }
  .chosen small { margin-top: 2px; color: #62766e; font-size: 11px; }
  .mine { margin-top: 16px; padding-top: 14px; border-top: 1px solid #dce8de; }
  .mine h3 { margin-bottom: 8px; font: 750 18px/1.2 var(--haha-display); }
  .mine ul { margin: 0; padding-left: 19px; }
  .mine li { margin-bottom: 6px; color: #476158; font-size: 11px; }
  .standings-head { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
  .standings-head button { flex: none; min-height: 33px; padding: 5px 8px; font-size: 11px; }
  .standings { display: grid; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
  .standing { display: grid; grid-template-columns: 35px minmax(0, 1fr) auto; gap: 9px; align-items: center; padding: 10px; border: 1px solid #dce8df; border-radius: 10px; background: #f8fbf7; }
  .standing.top { border-color: #e5bc7c; background: #fff6e6; }
  .standing .rank { display: grid; place-items: center; width: 33px; height: 33px; border-radius: 50%; background: #dcebe0; color: #1b5340; font-weight: 850; }
  .standing.top .rank { background: #f3bf67; color: #5a381c; }
  .standing strong, .standing small { display: block; overflow-wrap: anywhere; }
  .standing strong { color: #183e35; font-size: 12px; }
  .standing small { color: #6a7a72; font-size: 10px; }
  .standing .count { color: #235e4d; font-size: 13px; font-weight: 850; white-space: nowrap; }
  .empty { margin: 13px 0 0; color: #60736a; font-size: 12px; }
  .footer { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-top: 19px; padding-top: 13px; border-top: 1px solid #cddfd3; font-size: 12px; }
  @container (max-width: 800px) { .work { grid-template-columns: 1fr; } }
  @container (max-width: 560px) { .hero { grid-template-columns: 1fr; } .hero-mark { display: none; } .prizes { grid-template-columns: 1fr; } }
`;

function shortAddress(address: string): string {
  return address.length > 20 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function readPrefill(path: string): { category: string; nominee: string } {
  const params = new URLSearchParams(path.split("?")[1]?.split("#")[0] || "");
  return {
    category: (params.get("category") || "").trim(),
    nominee: (params.get("nominee") || "").trim(),
  };
}

function formatSeasonDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function HahaCrp() {
  const windowPath = useContext(WindowPathContext);
  const path = windowPath || (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "");
  const prefill = useMemo(() => readPrefill(path), [path]);
  const appliedPrefill = useRef<string | null>(null);
  const { address, isGuest, isConnecting, walletError, guestSessionLoading, localWalletAddress, connectWallet } = useHorfWallet();
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState(prefill.category);
  const [nomineeAddress, setNomineeAddress] = useState(prefill.nominee);
  const [note, setNote] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  const seasonQuery = useQuery({
    queryKey: ["haha-crp", "season"],
    queryFn: () => api.get<SeasonResponse>("/api/haha-crp/season"),
    refetchOnWindowFocus: true,
  });
  const season = seasonQuery.data?.season;
  const categories = Array.isArray(seasonQuery.data?.categories) ? seasonQuery.data.categories : [];
  const prizes = seasonQuery.data?.prizes;
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const seasonKey = season?.key;

  const standingsQuery = useQuery({
    queryKey: ["haha-crp", "standings", seasonKey],
    queryFn: () => api.get<StandingsResponse>(`/api/haha-crp/standings?season=${encodeURIComponent(seasonKey!)}`),
    enabled: Boolean(seasonKey),
    refetchOnWindowFocus: true,
  });
  const mineQuery = useQuery({
    queryKey: ["haha-crp", "mine", address],
    queryFn: () => api.get<MineResponse>(`/api/haha-crp/mine?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
    refetchOnWindowFocus: true,
  });
  const myNominations = Array.isArray(mineQuery.data?.nominations) ? mineQuery.data.nominations : [];
  const categoryNominations = myNominations.filter((item) => item.categoryId === categoryId);
  const knownSeasonQuery = useQuery({
    queryKey: ["haha-crp", "known-traders-season"],
    queryFn: () => api.get<TraderSeasonResponse>("/api/horf/season?season=current-2026"),
  });
  const knownOffersQuery = useQuery({
    queryKey: ["haha-crp", "known-traders-offers"],
    queryFn: () => api.get<TraderOffersResponse>("/api/horf/open-range/offers"),
  });
  const knownTraders = useMemo<KnownTrader[]>(() => {
    const byAddress = new Map<string, KnownTrader>();
    for (const rider of knownSeasonQuery.data?.leaderboard || []) {
      if (rider?.address) byAddress.set(rider.address, { address: rider.address, name: rider.name || null });
    }
    for (const offer of knownOffersQuery.data?.offers || []) {
      if (offer?.ownerAddress && !byAddress.has(offer.ownerAddress)) byAddress.set(offer.ownerAddress, { address: offer.ownerAddress, name: null });
    }
    return [...byAddress.values()].filter((rider) => rider.address !== address).sort((a, b) =>
      (a.name || a.address).localeCompare(b.name || b.address));
  }, [knownOffersQuery.data?.offers, knownSeasonQuery.data?.leaderboard, address]);
  let validNominee: string | null = null;
  try { validNominee = assertTraderAddress(nomineeAddress); } catch { /* The field stays editable until a valid wallet is entered. */ }
  const duplicateNominee = Boolean(validNominee && categoryNominations.some((item) => item.nomineeAddress === validNominee));
  // The owner specified up to three distinct wallet nominations per category.
  const categoryFull = categoryNominations.length >= 3;

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!address || !validNominee || !categoryId) throw new Error("Choose a category and enter a valid Tezos wallet.");
      return api.post<{ nomination: MineResponse["nominations"][number] }>("/api/haha-crp/nominations", {
        nominatorAddress: address,
        categoryId,
        nomineeAddress: validNominee,
        nomineeDisplayName: knownTraders.find((rider) => rider.address === validNominee)?.name || null,
        note: note.trim(),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["haha-crp", "mine", address] }),
        queryClient.invalidateQueries({ queryKey: ["haha-crp", "standings", seasonKey] }),
      ]);
      setSuccess(`Your ${selectedCategory?.label || "HAHA"} nomination is on the honor roll.`);
      logClientSystemEvent({ eventType: "haha.crp.nomination.submitted", message: "HAHA CRP nomination submitted", metadata: { categoryId, nomineeAddress: validNominee } });
      setNomineeAddress("");
      setNote("");
    },
  });
  const removeMutation = useMutation({
    mutationFn: async (nominationId: number) => {
      if (!address) throw new Error("Connect your wallet to remove a nomination.");
      const response = await fetchWithCsrf(`/api/haha-crp/nominations/${nominationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nominatorAddress: address }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not remove this nomination.");
      }
      return nominationId;
    },
    onSuccess: async (nominationId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["haha-crp", "mine", address] }),
        queryClient.invalidateQueries({ queryKey: ["haha-crp", "standings", seasonKey] }),
      ]);
      setSuccess("Your nomination was removed from the honor roll.");
      logClientSystemEvent({ eventType: "haha.crp.nomination.removed", message: "HAHA CRP nomination removed", metadata: { nominationId, categoryId } });
    },
  });

  useEffect(() => {
    if (appliedPrefill.current === path) return;
    appliedPrefill.current = path;
    setCategoryId(prefill.category);
    setNomineeAddress(prefill.nominee);
    setSuccess(null);
  }, [path, prefill.category, prefill.nominee]);

  useEffect(() => {
    if (!categoryId && categories.length) setCategoryId(categories[0].id);
  }, [categoryId, categories]);

  function chooseCategory(nextId: string) {
    setCategoryId(nextId);
    setSuccess(null);
    setNomineeAddress("");
    setNote("");
    logClientSystemEvent({ eventType: "haha.crp.category.selected", message: "HAHA CRP category selected", metadata: { categoryId: nextId } });
  }

  function submitNomination(event: FormEvent) {
    event.preventDefault();
    if (season?.status !== "open" || !address || !mineQuery.isSuccess || !validNominee || validNominee === address || duplicateNominee || categoryFull || !categoryId) return;
    setSuccess(null);
    submitMutation.mutate();
  }

  const selectedStandings = standingsQuery.data?.categories.find((item) => item.id === categoryId);
  const nominationOpen = season?.status === "open";
  const reserveFunded = seasonQuery.data?.fundingStatus === "funded";
  const fullSlateHorse = prizes ? categories.length * (prizes.first.horse + 2 * prizes.runnerUp.horse) : 0;
  const fullSlateXtz = prizes ? categories.length * (prizes.first.xtz + 2 * prizes.runnerUp.xtz) : 0;

  return <Shell data-haha-crp data-haha-crp-season={seasonKey || "loading"} aria-label="HAHA horse trading community awards">
    <header className="hero">
      <div><span className="eyebrow">Horse Art Horsetrading Association · HAHA</span><h1>Tip your hat to the herd 🤠</h1><p>Nominate the traders, artists, and Tezos neighbors who make horse trading worth the ride. Pick a category, find their wallet, and put their name on the honor roll.</p></div>
      <div className="hero-mark" aria-hidden="true">🐎</div>
    </header>

    {seasonQuery.isPending && <div className="wallet-status" role="status">Rounding up this season’s HAHA awards…</div>}
    {seasonQuery.isError && <div className="message error" role="alert">The HAHA award categories are unavailable. <button className="secondary" type="button" onClick={() => void seasonQuery.refetch()}>Retry award categories</button></div>}
    {season && <div className="season-strip" data-haha-season><span className={`pill${nominationOpen ? " open" : ""}`}>{season.label} · {nominationOpen ? "nominations open" : "nominations closed"}</span><span className="pill">{categories.length} award categories</span><span className="pill">Opened {formatSeasonDate(season.startsAt)}</span><span className="pill">{season.endsAt ? `Closes ${formatSeasonDate(season.endsAt)}` : "Closing date to be announced"}</span></div>}

    {prizes && <div className="prizes" data-haha-prizes>
      <div className="prize"><small>First in each category 🏆</small><strong>{prizes.first.horse} $HORSE + {prizes.first.xtz} tez</strong><span>For the nominee with the most eligible nominations.</span></div>
      <div className="prize runner"><small>Second and third in each category 🐎</small><strong>{prizes.runnerUp.horse} $HORSE + {prizes.runnerUp.xtz} tez</strong><span>Each of the next two nominees receives this award.</span></div>
    </div>}
    {season && <div className={`funding${reserveFunded ? " funded" : ""}`} data-haha-funding-status role="status"><strong>{reserveFunded ? "Prize reserve verified." : "Prize reserve pending."}</strong> {reserveFunded ? "The HAHA award reserve is marked funded. Final rankings and payout instructions will follow the season close." : "These are announced award amounts. The HORSE and tez reserve has not been funded or verified yet, and no payout is available to claim."} {prizes && <>A full three-place slate across {categories.length} categories totals <strong>{fullSlateHorse.toLocaleString()} HORSE and {fullSlateXtz} tez</strong>.</>}</div>}

    <div className="work">
      <section className="panel" data-haha-nomination-panel aria-labelledby="haha-nominate-heading">
        <span className="eyebrow">Up to three riders per category</span><h2 id="haha-nominate-heading">Nominate a good horseperson</h2><p>Each verified wallet may nominate up to three different Tezos wallets in each HAHA category. Your wallet proof ties every pick to one rider.</p>
        {!address && <div className="wallet-status" role="status">{guestSessionLoading ? "Checking for your saved wallet proof…" : localWalletAddress ? `Wallet ${shortAddress(localWalletAddress)} is connected locally. Verify it to nominate.` : "Connect and verify a Tezos wallet to nominate. A WTF OS sign-in is optional."}<div><button data-haha-wallet-connect type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : isGuest ? "Connect and verify wallet" : "Connect Tezos wallet"}</button></div></div>}
        {address && <div className="wallet-status" data-haha-wallet-verified role="status">Rider verified: <strong>{shortAddress(address)}</strong> · Tezos Mainnet</div>}
        {walletError && <div className="wallet-status alert" role="alert">{walletError}</div>}
        <form className="form-grid" onSubmit={submitNomination}>
          <div><label htmlFor="haha-category">HAHA category</label><select id="haha-category" data-haha-category-select value={selectedCategory ? categoryId : ""} onChange={(event) => chooseCategory(event.currentTarget.value)} disabled={!categories.length}>
            <option value="">Choose one horse trading category…</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>{selectedCategory?.description && <p className="field-help">{selectedCategory.description}</p>}</div>
          <div><label htmlFor="haha-nominee-address">Nominee’s Tezos wallet address</label><input id="haha-nominee-address" data-haha-nominee-address value={nomineeAddress} onChange={(event) => { setNomineeAddress(event.currentTarget.value); setSuccess(null); }} placeholder="tz1…" disabled={!address || !nominationOpen || categoryFull} /><p className="field-help">Enter a wallet directly, or choose a rider Horf already knows below.</p></div>
          <div className="known"><label htmlFor="haha-known-trader">Choose a known Horf trader (optional)</label><select id="haha-known-trader" data-haha-known-trader-select value={knownTraders.some((rider) => rider.address === nomineeAddress) ? nomineeAddress : ""} onChange={(event) => { setNomineeAddress(event.currentTarget.value); setSuccess(null); }} disabled={!address || !nominationOpen || categoryFull}>
            <option value="">Select a rider from the trail…</option>{knownTraders.map((rider) => <option key={rider.address} value={rider.address}>{rider.name ? `${rider.name} · ` : ""}{shortAddress(rider.address)}</option>)}
          </select>{!knownTraders.length && (knownSeasonQuery.isPending || knownOffersQuery.isPending) && <p>Rounding up known riders…</p>}{!knownTraders.length && !knownSeasonQuery.isPending && !knownOffersQuery.isPending && <p>Enter a Tezos wallet above to nominate anyone.</p>}</div>
          <div><label htmlFor="haha-note">Why this rider? (optional)</label><textarea id="haha-note" data-haha-nomination-note value={note} onChange={(event) => setNote(event.currentTarget.value)} placeholder="Tell the herd what they did for horse trading, art, or HAHA." /></div>
          {selectedCategory && <div className="wallet-status" data-haha-category-quota>{categoryNominations.length} of 3 nominations used for {selectedCategory.label}. {categoryFull ? "Remove a pick below to nominate another rider." : "Each nominee must have a different wallet."}</div>}
          {nomineeAddress.trim() && !validNominee && <div className="message error" role="alert">Enter a valid Tezos wallet address.</div>}
          {validNominee === address && <div className="message error" role="alert">Choose another rider’s wallet for this award.</div>}
          {duplicateNominee && <div className="message error" role="alert">You have already nominated this wallet in this category.</div>}
          <div className="button-row"><button data-haha-submit type="submit" className="primary" disabled={!address || !mineQuery.isSuccess || !nominationOpen || !selectedCategory || !validNominee || validNominee === address || duplicateNominee || categoryFull || submitMutation.isPending}>{submitMutation.isPending ? "Putting up the honor sign…" : "Submit HAHA nomination"}</button></div>
        </form>
        {submitMutation.isError && <div className="message error" role="alert">{submitMutation.error instanceof Error ? submitMutation.error.message : "Your nomination could not be saved. Try again."}</div>}
        {removeMutation.isError && <div className="message error" role="alert">{removeMutation.error instanceof Error ? removeMutation.error.message : "Your nomination could not be removed. Try again."}</div>}
        {success && <div className="message" data-haha-nomination-success role="status">{success} 🐎</div>}
        {address && selectedCategory && <div className="mine" data-haha-my-nominations><h3>Your picks for {selectedCategory.label}</h3>{mineQuery.isPending ? <p>Reading your honor roll…</p> : mineQuery.isError ? <p>Your past nominations are unavailable. <button type="button" className="secondary" onClick={() => void mineQuery.refetch()}>Retry your nominations</button></p> : categoryNominations.length ? <ul className="chosen-list">{categoryNominations.map((item) => <li className="chosen" key={item.id} data-haha-my-nomination><div><strong>{item.nomineeDisplayName || shortAddress(item.nomineeAddress)}</strong><small>{item.nomineeAddress}</small></div><button data-haha-remove-nomination className="remove" type="button" onClick={() => removeMutation.mutate(item.id)} disabled={removeMutation.isPending || !nominationOpen} aria-label={`Remove ${item.nomineeDisplayName || shortAddress(item.nomineeAddress)} nomination`}>Remove</button></li>)}</ul> : <p>No picks in this category yet. Your first can lead the pack.</p>}</div>}
      </section>

      <aside className="panel" data-haha-standings aria-labelledby="haha-standings-heading"><div className="standings-head"><div><span className="eyebrow">The community race board 🏁</span><h2 id="haha-standings-heading">Who’s out in front?</h2></div><button className="secondary" data-haha-standings-refresh type="button" onClick={() => void standingsQuery.refetch()} disabled={!seasonKey || standingsQuery.isFetching}>Refresh</button></div><p>{selectedCategory ? `${selectedCategory.label} · ranked by distinct wallet nominations` : "Choose a category to watch its nominees race."} Rankings may change until this season closes.</p>
        {standingsQuery.isPending && seasonKey && <p className="empty" role="status">Counting the nominations…</p>}
        {standingsQuery.isError && <div className="message error" role="alert">The race board is unavailable. <button className="secondary" type="button" onClick={() => void standingsQuery.refetch()}>Retry standings</button></div>}
        {selectedCategory && selectedStandings && !standingsQuery.isError && (selectedStandings.nominees.length ? <ol className="standings">{selectedStandings.nominees.map((nominee) => <li className={`standing${nominee.rank === 1 ? " top" : ""}`} key={nominee.address} data-haha-standing><span className="rank">{nominee.rank}</span><div><strong>{nominee.name || shortAddress(nominee.address)}</strong><small>{nominee.address}</small></div><span className="count">{nominee.count} {nominee.count === 1 ? "nomination" : "nominations"}</span></li>)}</ol> : <p className="empty">No horses out of the gate in this category yet. Your nomination could be first.</p>)}
      </aside>
    </div>
    <footer className="footer"><a href="/horf/traders">Find other horse traders ↗</a><a href={isGuest ? `/login?return=${encodeURIComponent("/crp-nominate")}` : "/crp-nominate"}>{isGuest ? "Sign in for Tezos CRP nominations ↗" : "Visit Tezos CRP nominations ↗"}</a><span>Each verified wallet may name up to three distinct riders in every HAHA category.</span></footer>
  </Shell>;
}
