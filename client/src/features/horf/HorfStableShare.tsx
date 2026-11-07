import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { logClientSystemEvent } from "../../lib/system-log";
import { HorfReceivedBreakdown } from "./HorfReceivedBreakdown";

export type HorfShareStats = {
  trades: number;
  received: number;
  giftHorsesReceived?: number;
  tradeHorsesReceived?: number;
  sent: number;
  rank: number | null;
  uniqueReceived: number;
  sendingRiders: number;
  directReceived: number;
  waiting: number;
};

type StoryKey = "herd" | "return" | "race";
type Story = { key: StoryKey; title: string; metrics: string[]; draft: string; receivedBreakdown?: boolean };

const Trigger = styled.button`
  min-height: 40px;
  padding: 9px 15px;
  border: 1px solid var(--horf-gold);
  border-radius: 999px;
  background: var(--horf-gold);
  color: var(--horf-deep);
  cursor: pointer;
  font: 800 13px/1.2 var(--horf-font);
  &:disabled { cursor: not-allowed; opacity: .55; }
  &:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 3px; }
`;

const ShareDialog = styled.dialog`
  width: min(590px, calc(100vw - 24px));
  max-height: min(90vh, 820px);
  overflow: auto;
  padding: 0;
  border: 1px solid var(--horf-line);
  border-radius: 20px;
  background: var(--horf-surface);
  color: var(--horf-ink);
  box-shadow: 0 24px 90px #000a;
  font-family: var(--horf-font);
  &::backdrop { background: #07120fe3; backdrop-filter: blur(5px); }
  button:focus-visible, a:focus-visible, textarea:focus-visible, input:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 3px; }
  .head { display: flex; justify-content: space-between; align-items: start; gap: 14px; padding: 20px 22px 15px; border-bottom: 1px solid var(--horf-line); }
  .head small { color: var(--horf-gold); font: 800 11px/1.2 var(--horf-font); text-transform: uppercase; letter-spacing: .1em; }
  .head h2 { margin: 5px 0 0; font: 750 clamp(25px, 6vw, 32px)/1.05 var(--horf-display); }
  .head button { flex: 0 0 auto; width: 36px; height: 36px; border: 1px solid var(--horf-line); border-radius: 50%; background: var(--horf-field); color: var(--horf-ink); cursor: pointer; font-size: 20px; }
  .body { padding: 18px 22px 22px; }
  p { margin: 0 0 13px; color: var(--horf-muted); font-size: 13px; line-height: 1.5; }
  fieldset { display: grid; gap: 8px; margin: 0 0 17px; padding: 0; border: 0; }
  legend { margin-bottom: 9px; color: var(--horf-ink); font-weight: 800; font-size: 13px; }
  label.story { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; padding: 11px 13px; border: 1px solid var(--horf-line); border-radius: 12px; background: var(--horf-field); cursor: pointer; }
  label.story:has(input:checked) { border-color: var(--horf-gold); background: #382f21; }
  label.story input { margin: 3px 0 0; accent-color: var(--horf-gold); }
  label.story strong { display: block; margin-bottom: 2px; font-size: 14px; }
  label.story ul { display: flex; flex-wrap: wrap; gap: 2px 20px; margin: 4px 0 0; padding-left: 17px; color: var(--horf-muted); font-size: 12px; line-height: 1.45; }
  label.draft { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 800; }
  textarea { display: block; width: 100%; min-height: 112px; padding: 11px 13px; resize: vertical; border: 1px solid var(--horf-line); border-radius: 10px; background: var(--horf-field); color: var(--horf-ink); font: 14px/1.45 var(--horf-font); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 8px 13px; border: 1px solid var(--horf-line); border-radius: 999px; background: var(--horf-elevated); color: var(--horf-ink); font: 800 13px/1.2 var(--horf-font); text-decoration: none; }
  .actions a:hover { border-color: var(--horf-gold); }
  .actions a:first-child { border-color: var(--horf-gold); background: var(--horf-gold); color: var(--horf-deep); }
  .status { margin: 12px 0 0; color: var(--horf-teal); }
  .status[role="alert"] { color: #e6a18c; }
  @media (max-width: 480px) { .head { padding: 17px 16px 13px; } .body { padding: 16px; } }
`;

function shareUrl(address: string, seasonKey: string): string {
  const path = `/horf/traders/${encodeURIComponent(address)}?season=${encodeURIComponent(seasonKey)}&tab=received`;
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

function buildStories(seasonLabel: string, stats: HorfShareStats, url: string): Story[] {
  const answered = Math.max(0, stats.directReceived - stats.waiting);
  const reciprocation = stats.directReceived > 0
    ? `${Math.round(answered / stats.directReceived * 100)}%` : "N/A";
  const receivedSplit = Number.isSafeInteger(stats.giftHorsesReceived) && Number.isSafeInteger(stats.tradeHorsesReceived)
    ? ` 🎁 ${stats.giftHorsesReceived} gifts · 🤝 ${stats.tradeHorsesReceived} trade receipts.` : "";
  return [
    {
      key: "herd", title: "Herd roundup 🐎", receivedBreakdown: true,
      metrics: [`${stats.received} received editions`, `${stats.uniqueReceived} distinct horses`, `${stats.sendingRiders} sending riders`],
      draft: `🐎 My ${seasonLabel} roundup: ${stats.received} horse editions received.${receivedSplit} ${stats.uniqueReceived} distinct horses, from ${stats.sendingRiders} riders. See the herd on HORF: ${url}`,
    },
    {
      key: "return", title: "Return rides 🪢",
      metrics: [`${stats.directReceived} direct receipts`, `${answered} answered`, `${stats.waiting} waiting`, `${reciprocation} reciprocation`],
      draft: `🪢 ${seasonLabel} return rides: ${answered} of ${stats.directReceived} direct horse editions answered (${reciprocation}); ${stats.waiting} still waiting. See my received horses on HORF: ${url}`,
    },
    {
      key: "race", title: "Race report 🤠", receivedBreakdown: true,
      metrics: [`${stats.sent} sent`, `${stats.received} received`, `${stats.trades} outbound rides`, `${stats.rank ? `#${stats.rank} standing` : "Unranked"}`],
      draft: `🤠 ${seasonLabel} race report: ${stats.sent} horses sent, ${stats.received} received.${receivedSplit} ${stats.trades} outbound horse interactions${stats.rank ? `, #${stats.rank} on the board` : ""}. See my received horses on HORF: ${url}`,
    },
  ];
}

function intentUrl(platform: "x" | "bsky", draft: string): string {
  const url = new URL(platform === "x" ? "https://x.com/intent/tweet" : "https://bsky.app/intent/compose");
  url.searchParams.set("text", draft);
  return url.toString();
}

export function HorfStableShare({ address, seasonKey, seasonLabel, stats }: {
  address: string | null;
  seasonKey: string;
  seasonLabel: string;
  stats: HorfShareStats | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [storyKey, setStoryKey] = useState<StoryKey>("herd");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const url = address ? shareUrl(address, seasonKey) : "";
  const stories = useMemo(() => stats && address ? buildStories(seasonLabel, stats, url) : [], [address, seasonLabel, stats, url]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openShare() {
    if (!address || !stats) return;
    setStoryKey("herd");
    setDraft(stories[0]?.draft ?? "");
    setStatus(null);
    setOpen(true);
    logClientSystemEvent({ eventType: "horf.stable_share.opened", message: "Horf Stable share draft opened", metadata: { address, seasonKey } });
  }

  function selectStory(key: StoryKey) {
    setStoryKey(key);
    setDraft(stories.find((story) => story.key === key)?.draft ?? "");
    setStatus(null);
    logClientSystemEvent({ eventType: "horf.stable_share.story_selected", message: "Horf Stable share story selected", metadata: { address, seasonKey, story: key } });
  }

  function recordPlatform(platform: "x" | "bsky" | "objkt") {
    logClientSystemEvent({ eventType: "horf.stable_share.platform_opened", message: "Horf Stable share destination opened", metadata: { address, seasonKey, story: storyKey, platform } });
  }

  function copyForObjkt() {
    recordPlatform("objkt");
    if (!navigator.clipboard?.writeText) {
      setStatus({ text: "Objkt Social opened. Copy the draft above and paste it there.", error: true });
      return;
    }
    void navigator.clipboard.writeText(draft).then(
      () => setStatus({ text: "Draft copied. Paste it into Objkt Social.", error: false }),
      () => setStatus({ text: "Objkt Social opened. Copy the draft above and paste it there.", error: true }),
    );
  }

  return <>
    <Trigger ref={triggerRef} data-horf-share-open type="button" onClick={openShare} disabled={!address || !stats}>Share my herd &amp; stats ↗</Trigger>
    <ShareDialog ref={dialogRef} data-horf-share-dialog aria-labelledby="horf-share-title" onClose={() => { setOpen(false); triggerRef.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="head"><div><small>🐎 From your stable</small><h2 id="horf-share-title">Share the herd</h2></div><button type="button" aria-label="Close share dialog" onClick={() => setOpen(false)}>×</button></div>
      <div className="body">
        <p>Pick a story. The link opens every recognized horse you received {seasonKey === "all-time" ? "across all tracked seasons" : `in ${seasonLabel}`}, including ones you’ve sent on.</p>
        <fieldset><legend>Your story</legend>{stories.map((story) => <label className="story" key={story.key}>
          <input data-horf-share-story={story.key} type="radio" name="horf-share-story" value={story.key} checked={storyKey === story.key} onChange={() => selectStory(story.key)} />
          <span><strong>{story.title}</strong><ul>{story.metrics.map((metric) => <li key={metric}>{metric}</li>)}</ul>{story.receivedBreakdown && <HorfReceivedBreakdown gifts={stats?.giftHorsesReceived} trades={stats?.tradeHorsesReceived} />}</span>
        </label>)}</fieldset>
        <label className="draft" htmlFor="horf-share-draft">Your draft · edit before posting</label>
        <textarea id="horf-share-draft" data-horf-share-draft value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
        <div className="actions">
          <a data-horf-share-x href={intentUrl("x", draft)} target="_blank" rel="noopener noreferrer" onClick={() => recordPlatform("x")}>Open X draft ↗</a>
          <a data-horf-share-bsky href={intentUrl("bsky", draft)} target="_blank" rel="noopener noreferrer" onClick={() => recordPlatform("bsky")}>Open Bluesky draft ↗</a>
          <a data-horf-share-objkt href="https://objkt.com/social" target="_blank" rel="noopener noreferrer" onClick={copyForObjkt}>Copy draft &amp; open Objkt Social ↗</a>
        </div>
        <p className="status" role={status?.error ? "alert" : "status"} aria-live="polite">{status?.text || "Objkt Social opens its feed. Paste the copied draft into a new post."}</p>
      </div>
    </ShareDialog>
  </>;
}
