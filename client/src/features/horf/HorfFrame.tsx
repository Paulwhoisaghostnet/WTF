import { useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import styled from "styled-components";
import { WindowPathContext, useWindowManager } from "../../lib/window-context";
import { logClientSystemEvent } from "../../lib/system-log";

type HorfFrameProps = {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  walletAddress?: string | null;
  onConnectWallet?: () => Promise<void>;
  walletConnecting?: boolean;
};

const Frame = styled.div`
  @font-face {
    font-family: "Horf Fredoka";
    src: url("/fonts/wtfos-soft-system/Fredoka-latin.woff2") format("woff2");
    font-display: swap;
  }
  @font-face {
    font-family: "Horf Noto Sans";
    src: url("/fonts/wtfos-soft-system/NotoSans-latin.woff2") format("woff2");
    font-display: swap;
  }

  --horf-canvas: #101816;
  --horf-surface: #1b2723;
  --horf-elevated: #23332d;
  --horf-field: #24332d;
  --horf-deep: #0b1311;
  --horf-ink: #f4ead6;
  --horf-muted: #b7b5a7;
  --horf-line: #3d5148;
  --horf-control-line: #6d8777;
  --horf-coral: #ef9672;
  --horf-teal: #71b7a0;
  --horf-focus: #f0bd62;
  --horf-lilac: #c6b6f2;
  --horf-gold: #d8a34a;
  --horf-font: "Horf Noto Sans", "Avenir Next", sans-serif;
  --horf-display: "Horf Fredoka", "Avenir Next", sans-serif;

  display: grid;
  grid-template-columns: 10% minmax(0, 75%) 15%;
  width: 100%;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  background: var(--horf-canvas);
  color: var(--horf-ink);
  color-scheme: dark;
  font-family: var(--horf-font);
  font-size: 14px;
  line-height: 1.5;
  isolation: isolate;

  * { box-sizing: border-box; }
  button, input, select, textarea { font-family: inherit; }
  && input:not([type="checkbox"]):not([type="radio"]), && select, && textarea {
    border-color: var(--horf-control-line);
  }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: 3px solid var(--horf-focus);
    outline-offset: 3px;
  }
  [id] { scroll-margin-top: 76px; }

  @media (max-width: 1199px) {
    grid-template-columns: 74px minmax(0, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: 62px minmax(0, 1fr);
  }
`;

const SkipLink = styled.a`
  position: absolute;
  left: 12px;
  top: -100px;
  z-index: 100;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--horf-gold);
  color: var(--horf-deep);
  &:focus { top: 12px; }
`;

const Rail = styled.nav`
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 20px 10px 16px;
  background: var(--horf-deep);
  color: #f5f7f3;
  overflow-y: auto;
  border-right: 1px solid var(--horf-line);
  a { text-decoration: none; }
  .wtf-origin { display: block; margin: 0 2px 17px; padding: 9px 8px 10px; border: 1px solid var(--horf-line); border-radius: 12px; background: var(--horf-surface); color: var(--horf-ink); }
  .wtf-origin:hover { border-color: var(--horf-coral); background: var(--horf-elevated); }
  .wtf-mark { display: block; color: #fff; font: 800 27px/1 var(--horf-display); letter-spacing: -.055em; }
  .wtf-mark span { margin-left: 2px; color: var(--horf-coral); font-size: 12px; letter-spacing: -.02em; }
  .wtf-statement { display: block; margin-top: 5px; color: var(--horf-muted); font-size: 9px; line-height: 1.2; }
  .wtf-statement strong { display: block; margin-top: 2px; color: #fff; font-weight: 800; }
  .brand { display: flex; align-items: center; gap: 8px; padding: 4px 6px 24px; color: #fff; font: 700 clamp(22px, 2vw, 32px)/1 var(--horf-display); letter-spacing: -0.03em; }
  .brand img { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; object-position: center 38%; }
  .brand small { display: block; color: var(--horf-muted); font: 700 9px/1.1 var(--horf-font); letter-spacing: .08em; text-transform: uppercase; }
  .nav-caption { margin: 0 7px 8px; color: var(--horf-muted); font: 700 10px/1.2 var(--horf-font); letter-spacing: .08em; text-transform: uppercase; }
  .links { display: flex; flex-direction: column; gap: 3px; }
  .links a, .exit { display: flex; align-items: center; gap: 9px; min-height: 39px; padding: 8px 9px; border-radius: 9px; color: var(--horf-ink); font-weight: 700; font-size: 12px; line-height: 1.2; }
  .links a:hover, .exit:hover { background: var(--horf-elevated); color: #fff; }
  .links a[aria-current="page"] { background: var(--horf-gold); color: var(--horf-deep); }
  .nav-icon { flex: 0 0 20px; width: 20px; text-align: center; font-size: 16px; line-height: 1; }
  .spacer { flex: 1; min-height: 18px; }
  .exit { border-top: 1px solid var(--horf-line); border-radius: 0; padding-top: 15px; }

  @media (max-width: 1199px) {
    align-items: center;
    padding: 16px 5px 12px;
    .wtf-origin { width: 54px; margin: 0 0 12px; padding: 7px 3px 8px; text-align: center; }
    .wtf-mark { font-size: 20px; }
    .wtf-mark span { font-size: 9px; }
    .wtf-statement { font-size: 7px; line-height: 1.08; }
    .brand { padding: 1px 0 18px; }
    .brand img { width: 38px; height: 38px; }
    .brand span, .brand small, .nav-caption, .nav-label { display: none; }
    .links { width: 100%; align-items: center; }
    .links a, .exit { width: 48px; justify-content: center; padding: 8px 0; }
    .nav-icon { flex-basis: 22px; font-size: 18px; }
  }
  @media (max-width: 600px) { .wtf-origin { width: 52px; } }
`;

const Primary = styled.div`
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  background: var(--horf-canvas);
`;

const Topline = styled.header`
  position: sticky;
  top: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 58px;
  padding: 9px clamp(18px, 3vw, 42px);
  border-bottom: 1px solid var(--horf-line);
  background: color-mix(in srgb, var(--horf-canvas) 91%, var(--horf-surface));
  backdrop-filter: blur(14px);
  > div:first-child { min-width: 0; }
  h1 { margin: 0; color: var(--horf-ink); font: 700 15px/1.2 var(--horf-font); letter-spacing: -.02em; overflow-wrap: anywhere; }
  .micro { display: block; color: var(--horf-muted); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .top-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
  .wallet-state { display: inline-flex; align-items: center; gap: 7px; min-width: 0; padding: 6px 10px; border: 1px solid var(--horf-line); border-radius: 999px; background: var(--horf-surface); color: var(--horf-ink); font: 750 12px/1.25 var(--horf-font); white-space: nowrap; }
  .wallet-state::before { content: ""; width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: var(--horf-teal); }
  .wallet-state.offline::before { background: var(--horf-coral); }
  button { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 6px 10px; border: 1px solid var(--horf-line); border-radius: 999px; background: var(--horf-surface); color: var(--horf-ink); font-weight: 700; cursor: pointer; }
  .trail-updates { display: none; }
  @media (max-width: 1199px) { .trail-updates { display: inline-flex; } }
  @media (max-width: 700px) { flex-wrap: wrap; .top-actions { width: 100%; justify-content: space-between; } }
`;

const Body = styled.main`
  min-width: 0;
  min-height: calc(100% - 58px);
  > * { max-width: 100%; }
`;

const Aside = styled.aside<{ $open: boolean }>`
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  padding: 23px 14px 24px;
  background: var(--horf-surface);
  border-left: 1px solid var(--horf-line);
  color: var(--horf-ink);
  h2, h3 { margin: 0 0 8px; color: var(--horf-ink); font-family: var(--horf-display); line-height: 1.1; }
  h2 { font-size: 21px; }
  h3 { font-size: 17px; }
  p { margin: 0 0 12px; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  small { color: var(--horf-muted); font-size: 11px; }
  a { color: var(--horf-teal); overflow-wrap: anywhere; }
  .rail-kicker { display: block; margin-bottom: 12px; color: var(--horf-teal); font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
  .rail-close { display: none; margin-bottom: 15px; min-height: 36px; border: 0; background: transparent; color: var(--horf-ink); font-weight: 800; cursor: pointer; }
  @media (max-width: 1199px) {
    position: fixed;
    z-index: 45;
    top: 0;
    right: 0;
    width: min(355px, calc(100vw - 74px));
    height: 100dvh;
    padding: 20px;
    box-shadow: -12px 0 32px #0008;
    transform: translateX(${(p) => p.$open ? "0" : "100%"});
    visibility: ${(p) => p.$open ? "visible" : "hidden"};
    pointer-events: ${(p) => p.$open ? "auto" : "none"};
    transition: transform 220ms cubic-bezier(.22, 1, .36, 1), visibility 220ms;
    .rail-close { display: inline-flex; }
  }
  @media (max-width: 600px) { width: min(355px, calc(100vw - 62px)); }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const Backdrop = styled.button`
  display: none;
  @media (max-width: 1199px) {
    display: block;
    position: fixed;
    z-index: 40;
    inset: 0;
    padding: 0;
    border: 0;
    background: #0c1a1aa8;
    cursor: default;
  }
`;

const links = [
  { path: "/horf/race", label: "The race", icon: "🏁", section: "race" },
  { path: "/horf/traders", label: "Find Other Traders", icon: "🧭", section: "traders" },
  { path: "/horf/open-range", label: "Open Range", icon: "🐎", section: "range" },
  { path: "/horf/marshals-market", label: "Marshal’s Market", icon: "✦", section: "marshal" },
  { path: "/horf/outlaw-corral", label: "Outlaw Corral", icon: "↗", section: "outlaw" },
  { path: "/horf/stable", label: "My stable", icon: "♞", section: "stable" },
  { path: "/horf/send-horse", label: "Send $HORSE", icon: "◈", section: "horse" },
  { path: "/horf/horse-market", label: "HORSE Market", icon: "🪙", section: "horse-market" },
  { path: "/horf/haha-crp", label: "HAHA Awards", icon: "🏆", section: "haha" },
  { path: "/horf/gifts", label: "Gifts", icon: "♡", section: "gifts" },
  { path: "/horf/posse", label: "Posse", icon: "🤠", section: "posse" },
  { path: "/horf/info", label: "Is It a Horse?", icon: "?", section: "info" },
];

export function HorfFrame({ title, children, aside, walletAddress, onConnectWallet, walletConnecting = false }: HorfFrameProps) {
  const [location, navigate] = useLocation();
  const wm = useWindowManager();
  const pagePath = useContext(WindowPathContext);
  const [asideOpen, setAsideOpen] = useState(false);
  const primaryRef = useRef<HTMLDivElement>(null);
  const updatesButtonRef = useRef<HTMLButtonElement>(null);
  const asideCloseRef = useRef<HTMLButtonElement>(null);
  const openedOnce = useRef(false);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/horf";
  const season = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("season") : null;
  const ledgerSeason = season === "all-horse-search" || season === "all-seasons" ? "all-time" : season || "current-2026";
  const rangeSeason = season === "all-time" ? "all-horse-search" : season || "current-2026";

  useEffect(() => {
    document.title = `${title} · Horf`;
    if (pagePath) wm.setTitle(pagePath, title);
  }, [pagePath, title]);

  useEffect(() => { primaryRef.current?.scrollTo({ top: 0, behavior: "auto" }); }, [location]);

  useEffect(() => {
    if (!asideOpen) return;
    openedOnce.current = true;
    asideCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setAsideOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [asideOpen]);

  useEffect(() => {
    if (!asideOpen && openedOnce.current) updatesButtonRef.current?.focus();
  }, [asideOpen]);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1200px)");
    const onChange = () => { if (wide.matches) setAsideOpen(false); };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  function navigateTo(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const target = new URL(href, window.location.origin);
    logClientSystemEvent({ eventType: "horf.navigation.selected", message: "Horf trail selected", metadata: { destination: target.pathname, section: links.find((link) => link.path === target.pathname)?.section ?? null } });
    navigate(`${target.pathname}${target.search}`);
    setAsideOpen(false);
  }

  function openWtfHome(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    logClientSystemEvent({ eventType: "horf.wtf_home.opened", message: "WTF OS home opened from Horf" });
    setAsideOpen(false);
    navigate("/");
  }

  return <Frame data-horf-frame>
    <SkipLink href="#horf-main-content">Skip to horse trading content</SkipLink>
    <Rail data-horf-left-nav aria-label="Horf navigation" inert={asideOpen}>
      <a className="wtf-origin" data-horf-wtf-home href="/" onClick={openWtfHome} aria-label="Brought to you by wtfOS.app — visit WTF OS home" title="Visit wtfOS.app"><span className="wtf-mark" aria-hidden="true">WTF<span>OS</span></span><span className="wtf-statement">Brought to you by <strong>wtfOS.app</strong></span></a>
      <a className="brand" href={`/horf?season=${encodeURIComponent(ledgerSeason)}`} onClick={(event) => navigateTo(event, `/horf?season=${encodeURIComponent(ledgerSeason)}`)} aria-label="Horf home"><img src="/horf-art/horse-portrait-photo.jpg" alt="" /><span>HORF<small>Horse trading</small></span></a>
      <span className="nav-caption">The trails</span>
      <div className="links">{links.map((link) => {
        const linkSeason = link.section === "range" ? rangeSeason
          : link.section === "race" || link.section === "stable" || link.section === "traders" ? ledgerSeason : "current-2026";
        const href = `${link.path}?season=${encodeURIComponent(linkSeason)}`;
        return <a key={link.section} data-horf-nav={link.section} href={href} onClick={(event) => navigateTo(event, href)} aria-label={link.label} title={link.label} aria-current={pathname === link.path || (pathname === "/horf" && (walletAddress ? link.section === "stable" : link.section === "race")) || (link.section === "traders" && pathname.startsWith("/horf/traders/")) ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{link.icon}</span><span className="nav-label">{link.label}</span></a>;
      })}</div>
      <div className="spacer" />
      <a className="exit" href="/" aria-label="Back to WTF OS" title="Back to WTF OS"><span className="nav-icon" aria-hidden="true">↙</span><span className="nav-label">WTF OS</span></a>
    </Rail>
    <Primary data-horf-primary ref={primaryRef} inert={asideOpen}>
      <Topline><div><span className="micro">Tezos horse trading</span><h1>{title}</h1></div><div className="top-actions">
        {walletAddress ? <span data-horf-header-wallet className="wallet-state" title={walletAddress} aria-label={"Connected Tezos wallet " + walletAddress}>Wallet · {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</span>
          : onConnectWallet ? <button data-horf-header-wallet className="wallet-state offline" type="button" onClick={() => void onConnectWallet()} disabled={walletConnecting}>{walletConnecting ? "Connecting…" : "Connect wallet"}</button>
          : <span data-horf-header-wallet className="wallet-state offline">Wallet disconnected</span>}
        <button className="trail-updates" ref={updatesButtonRef} type="button" aria-controls="horf-context-rail" aria-expanded={asideOpen} onClick={() => { setAsideOpen(true); logClientSystemEvent({ eventType: "horf.context_rail.opened", message: "Horf trail updates opened" }); }}><span aria-hidden="true">✦</span>Trail updates</button>
      </div></Topline>
      <Body id="horf-main-content">{children}</Body>
    </Primary>
    {asideOpen && <Backdrop type="button" aria-label="Close trail updates" onClick={() => setAsideOpen(false)} />}
    <Aside id="horf-context-rail" data-horf-right-rail $open={asideOpen} aria-label="Horse trading updates and details">
      <button ref={asideCloseRef} className="rail-close" type="button" onClick={() => setAsideOpen(false)}>← Back to horses</button>
      <span className="rail-kicker">Live from the trail</span>
      {aside ?? <><h2>Keep your reins handy</h2><p>Race standings, horse details and trader notes appear here as you explore Horf.</p></>}
    </Aside>
  </Frame>;
}
