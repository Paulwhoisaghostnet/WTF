import { useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import styled from "styled-components";
import { WindowPathContext, useWindowManager } from "../../lib/window-context";
import { logClientSystemEvent } from "../../lib/system-log";

type HorfFrameProps = {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
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

  --horf-canvas: #edf1ef;
  --horf-ink: #142526;
  --horf-muted: #50625e;
  --horf-coral: #e26a45;
  --horf-teal: #087e7a;
  --horf-deep: #132326;
  --horf-surface: #fff;
  --horf-line: #d6ded8;
  --horf-lilac: #c6b6f2;
  --horf-gold: #f4b742;
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
  font-family: var(--horf-font);
  font-size: 14px;
  line-height: 1.5;
  isolation: isolate;

  * { box-sizing: border-box; }
  button, input, select, textarea { font-family: inherit; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: 3px solid var(--horf-teal);
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
  border-right: 1px solid #294446;
  a { text-decoration: none; }
  .brand { display: flex; align-items: center; gap: 8px; padding: 4px 6px 24px; color: #fff; font: 700 clamp(22px, 2vw, 32px)/1 var(--horf-display); letter-spacing: -0.03em; }
  .brand img { width: 34px; height: 34px; object-fit: contain; }
  .brand small { display: block; color: #a9c6be; font: 700 9px/1.1 var(--horf-font); letter-spacing: .08em; text-transform: uppercase; }
  .nav-caption { margin: 0 7px 8px; color: #a9c6be; font: 700 10px/1.2 var(--horf-font); letter-spacing: .08em; text-transform: uppercase; }
  .links { display: flex; flex-direction: column; gap: 3px; }
  .links a, .exit { display: flex; align-items: center; gap: 9px; min-height: 39px; padding: 8px 9px; border-radius: 9px; color: #dce9e4; font-weight: 700; font-size: 12px; line-height: 1.2; }
  .links a:hover, .exit:hover { background: #294446; color: #fff; }
  .links a[aria-current="page"] { background: var(--horf-coral); color: #211f1d; }
  .nav-icon { flex: 0 0 20px; width: 20px; text-align: center; font-size: 16px; line-height: 1; }
  .spacer { flex: 1; min-height: 18px; }
  .exit { border-top: 1px solid #365154; border-radius: 0; padding-top: 15px; }

  @media (max-width: 1199px) {
    align-items: center;
    padding: 16px 5px 12px;
    .brand { padding: 1px 0 18px; }
    .brand img { width: 38px; height: 38px; }
    .brand span, .brand small, .nav-caption, .nav-label { display: none; }
    .links { width: 100%; align-items: center; }
    .links a, .exit { width: 48px; justify-content: center; padding: 8px 0; }
    .nav-icon { flex-basis: 22px; font-size: 18px; }
  }
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
  background: color-mix(in srgb, var(--horf-canvas) 91%, white);
  backdrop-filter: blur(14px);
  h1 { margin: 0; color: var(--horf-ink); font: 700 15px/1.2 var(--horf-font); letter-spacing: -.02em; }
  .micro { display: block; color: var(--horf-muted); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  button { display: none; align-items: center; gap: 7px; min-height: 36px; padding: 6px 10px; border: 1px solid var(--horf-line); border-radius: 999px; background: #fff; color: var(--horf-ink); font-weight: 700; cursor: pointer; }
  @media (max-width: 1199px) { button { display: inline-flex; } }
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
  background: #f8faf8;
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
    box-shadow: -12px 0 32px #14252629;
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
  { href: "/horf#horf-race", label: "The race", icon: "🏁", section: "race" },
  { href: "/horf/open-range?season=current-2026", label: "Open Range", icon: "🐎", section: "range" },
  { href: "/horf#horf-marshals-market", label: "Marshal’s Market", icon: "✦", section: "marshal" },
  { href: "/horf#horf-outlaw-corral", label: "Outlaw Corral", icon: "↗", section: "outlaw" },
  { href: "/horf#horf-personal-stable", label: "My stable", icon: "♞", section: "stable" },
  { href: "/horf#horf-horse-send", label: "Send $HORSE", icon: "◈", section: "horse" },
  { href: "/horf#horf-gifts", label: "Gifts & posse", icon: "♡", section: "gifts" },
];

export function HorfFrame({ title, children, aside }: HorfFrameProps) {
  const [location, navigate] = useLocation();
  const wm = useWindowManager();
  const pagePath = useContext(WindowPathContext);
  const [asideOpen, setAsideOpen] = useState(false);
  const updatesButtonRef = useRef<HTMLButtonElement>(null);
  const asideCloseRef = useRef<HTMLButtonElement>(null);
  const openedOnce = useRef(false);
  const inRange = typeof window !== "undefined" && window.location.pathname.startsWith("/horf/open-range");
  const season = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("season") : null;

  useEffect(() => {
    document.title = `${title} · Horf`;
    if (pagePath) wm.setTitle(pagePath, title);
  }, [pagePath, title]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const timer = window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 80);
    return () => window.clearTimeout(timer);
  }, [location]);

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
    logClientSystemEvent({ eventType: "horf.navigation.selected", message: "Horf trail selected", metadata: { destination: target.pathname, section: target.hash.slice(1) || null } });
    if (target.pathname === window.location.pathname) {
      window.history.pushState(window.history.state, "", `${target.pathname}${target.search}${target.hash}`);
      if (target.hash) document.getElementById(target.hash.slice(1))?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    } else {
      navigate(`${target.pathname}${target.search}${target.hash}`);
    }
    setAsideOpen(false);
  }

  return <Frame data-horf-frame>
    <SkipLink href="#horf-main-content">Skip to horse trading content</SkipLink>
    <Rail data-horf-left-nav aria-label="Horf navigation" inert={asideOpen}>
      <a className="brand" href="/horf" onClick={(event) => navigateTo(event, "/horf")} aria-label="Horf home"><img src="/horf-art/galloping-horse.webp" alt="" /><span>HORF<small>Horse trading</small></span></a>
      <span className="nav-caption">The trails</span>
      <div className="links">{links.map((link) => {
        const href = link.section === "range" && season ? `/horf/open-range?season=${encodeURIComponent(season)}` : link.href;
        return <a key={link.section} href={href} onClick={(event) => navigateTo(event, href)} aria-label={link.label} title={link.label} aria-current={inRange ? link.section === "range" ? "page" : undefined : link.section === "race" ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{link.icon}</span><span className="nav-label">{link.label}</span></a>;
      })}</div>
      <div className="spacer" />
      <a className="exit" href="/" aria-label="Back to WTF OS" title="Back to WTF OS"><span className="nav-icon" aria-hidden="true">↙</span><span className="nav-label">WTF OS</span></a>
    </Rail>
    <Primary data-horf-primary inert={asideOpen}>
      <Topline><div><span className="micro">Tezos horse trading</span><h1>{title}</h1></div><button ref={updatesButtonRef} type="button" aria-controls="horf-context-rail" aria-expanded={asideOpen} onClick={() => { setAsideOpen(true); logClientSystemEvent({ eventType: "horf.context_rail.opened", message: "Horf trail updates opened" }); }}><span aria-hidden="true">✦</span>Trail updates</button></Topline>
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
