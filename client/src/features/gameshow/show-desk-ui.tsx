import { useId, useState } from "react";
import styled from "styled-components";

export const ShowDeskSurface = styled.section`
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-body, 15px);
  line-height: 1.45;
  overflow-wrap: anywhere;

  h2, h3, h4, p { margin: 0; }
  h2 { font-size: 20px; }
  h3 { font-size: 17px; }
  h4 { font-size: 15px; }
  button { min-height: var(--wtf-control-min-height, 34px); }
  :where(button, a, input, textarea, summary):focus-visible {
    outline: 2px solid var(--wtf-app-primary, #000080);
    outline-offset: 2px;
  }

  &[data-gameshow-presentation-host="gamma"] {
    color: var(--gamma-milk, #f2ead9);
    background: var(--gamma-panel, #11110f);
    border-color: var(--gamma-line, rgba(242, 234, 217, .18));
    border-radius: 6px;
    box-shadow: none;
    background-image: none;
    --wtf-app-surface: var(--gamma-ink, #070706);
    --wtf-app-surface-raised: var(--gamma-panel, #11110f);
    --wtf-app-text: var(--gamma-milk, #f2ead9);
    --wtf-app-muted-text: var(--gamma-muted, #c3bcad);
    --wtf-app-border: var(--gamma-line, rgba(242, 234, 217, .18));
    --wtf-app-primary: var(--gamma-cyan, #00d2ff);
  }
`;

export const ShowToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
`;

export const ShowActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

export const ShowNote = styled.p`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
`;

export const ShowSection = styled.section`
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--wtf-app-border, #808080);
  min-width: 0;
`;

const HelpContainer = styled.span`
  display: inline-flex;
  position: relative;
  vertical-align: middle;
  button {
    width: var(--wtf-control-min-height, 34px);
    border: 1px solid var(--wtf-app-border, #808080);
    background: var(--wtf-app-surface-raised, #fff);
    color: inherit;
    cursor: help;
    font: inherit;
  }
  [role="tooltip"] {
    position: absolute;
    z-index: 5;
    top: calc(100% + 4px);
    right: 0;
    width: min(280px, 65vw);
    padding: 8px;
    background: var(--wtf-app-surface-raised, #fff);
    color: var(--wtf-app-text, #111);
    border: 1px solid var(--wtf-app-border, #808080);
    font-size: var(--wtf-type-caption, 13px);
    font-weight: normal;
  }
`;

/** Hover, keyboard focus, and touch share the same explanation. Escape dismisses it. */
export function ShowHelp({ label, children }: { label: string; children: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <HelpContainer onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
      >?</button>
      {open && <span id={id} role="tooltip">{children}</span>}
    </HelpContainer>
  );
}
