import { useId } from "react";
import styled from "styled-components";

const Breakdown = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;

  .receipt-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    width: fit-content;
    padding: 3px 6px;
    border: 1px solid var(--horf-line);
    border-radius: 7px;
    background: var(--horf-field);
    color: var(--horf-ink);
    cursor: help;
    font: 700 11px/1.1 var(--horf-font);
    text-transform: none;
    letter-spacing: normal;
  }

  .receipt-chip:focus-visible { outline: 2px solid var(--horf-focus); outline-offset: 2px; }
  .receipt-chip:is(:hover, :focus-visible)::after {
    content: attr(data-tooltip);
    position: absolute;
    z-index: 10;
    bottom: calc(100% + 6px);
    left: 0;
    width: max-content;
    max-width: min(280px, 75vw);
    padding: 7px 9px;
    border: 1px solid var(--horf-line);
    border-radius: 8px;
    background: var(--horf-surface);
    box-shadow: 0 8px 25px #0009;
    color: var(--horf-ink);
    font: 600 11px/1.35 var(--horf-font);
    white-space: normal;
  }
  .screen-reader-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
`;

export function HorfReceivedBreakdown({ gifts, trades }: { gifts?: number; trades?: number }) {
  const id = useId();
  const known = Number.isSafeInteger(gifts) && Number.isSafeInteger(trades) && gifts! >= 0 && trades! >= 0;
  if (!known) return null;
  return <Breakdown data-horf-received-breakdown aria-label="Received horse breakdown">
    <span className="receipt-chip" tabIndex={0} role="note" aria-label={`${gifts} gift horses received`} aria-describedby={`${id}-gift`} data-tooltip="Gift horses explicitly marked as gifts in Horf. No return ride is expected."><span aria-hidden="true">🎁</span>{gifts}</span>
    <span className="receipt-chip" tabIndex={0} role="note" aria-label={`${trades} trade horses received`} aria-describedby={`${id}-trade`} data-tooltip="Qualifying horse receipts not marked as gifts. This does not mean the return trade is complete."><span aria-hidden="true">🤝</span>{trades}</span>
    <span id={`${id}-gift`} className="screen-reader-only">Gift horses explicitly marked as gifts in Horf. No return ride is expected.</span>
    <span id={`${id}-trade`} className="screen-reader-only">Qualifying horse receipts not marked as gifts. This does not mean the return trade is complete.</span>
  </Breakdown>;
}
