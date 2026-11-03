import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { buyHorseOnObjktInHorf, type HorfObjktPurchase } from "../../lib/tezos/horf-horse-market";
import { toNatString } from "../../lib/tezos/nat";

type Stage = "preflight" | "preparing" | "wallet" | "confirming";
const Box = styled.div`
  margin: 17px 0 0; padding: 14px; border: 1px solid #ddbd80; border-radius: 12px;
  background: #fff6e7; color: #30291c;
  h3 { margin: 0 0 5px; color: #422a13; font: 700 18px/1.15 var(--horf-display, Georgia, serif); }
  p { margin: 6px 0; color: #614c35; font-size: 12px; line-height: 1.45; }
  button { width: 100%; min-height: 43px; margin: 8px 0 0; padding: 9px 12px; border: 1px solid #a55e1d; border-radius: 999px; background: #ffc46a; color: #33250e; cursor: pointer; font: 850 13px/1.2 var(--horf-font, sans-serif); }
  button:hover:not(:disabled) { background: #ffb84c; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  button:focus-visible, a:focus-visible { outline: 3px solid var(--horf-teal, #087e7a); outline-offset: 3px; }
  .error { color: #9e3d25; font-weight: 700; }
  .success { color: #245643; font-weight: 700; }
  a { color: #0b746c; }
`;

function formatXtz(raw: string): string {
  const mutez = BigInt(toNatString(raw));
  const fraction = (mutez % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "") || "0";
  return `${(mutez / 1_000_000n).toLocaleString()}.${fraction}`;
}

export function HorfObjktBuy({ tokenContract, tokenId, address, connectWallet, isConnecting }: {
  tokenContract: string; tokenId: string; address: string | null;
  connectWallet: () => Promise<void>; isConnecting: boolean;
}) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["horf", "objkt-xtz-asks", tokenContract, tokenId],
    queryFn: () => api.get<{ listings: HorfObjktPurchase[] }>(`/api/horf/horse-market/objkt-listings?tokenContract=${encodeURIComponent(tokenContract)}&tokenId=${encodeURIComponent(tokenId)}`),
    refetchOnWindowFocus: true,
  });
  const ask = query.data?.listings?.[0] ?? null;

  async function buy() {
    if (!address || !ask || stage) return;
    setError(null); setSuccess(null); setSubmitted(null);
    let submittedHash: string | null = null;
    try {
      const hash = await buyHorseOnObjktInHorf(address, ask, async () => {
        const result = await api.post<{ purchase: HorfObjktPurchase }>("/api/horf/horse-market/objkt-preflight", {
          marketplaceContract: ask.marketplaceContract, askId: ask.askId,
          tokenContract: ask.tokenContract, tokenId: ask.tokenId,
          sellerAddress: ask.sellerAddress, priceMutez: ask.priceMutez,
        });
        return result.purchase;
      }, {
        onStage: setStage,
        onSubmitted: (operationHash) => { submittedHash = operationHash; setSubmitted(operationHash); },
      });
      setSuccess("Objkt XTZ purchase confirmed. The Objkt contract handled this sale inside Horf.");
      setSubmitted(hash);
      logClientSystemEvent({ eventType: "horf.open_range.objkt_bought", message: "Horse bought with XTZ through Objkt from Horf Open Range", metadata: { tokenContract, tokenId, askId: ask.askId, opHash: hash } });
      await query.refetch();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Could not buy this horse on Objkt."}${submittedHash ? " The operation was submitted; check its explorer status before retrying." : ""}`);
    } finally { setStage(null); }
  }

  return <Box data-horf-open-range-objkt-buy>
    <h3>Objkt XTZ hitching post ↗</h3>
    <p>Buy one edition through Objkt’s Mainnet contract without leaving these horse papers. Your wallet pays XTZ and Tezos gas.</p>
    {query.isPending && <p role="status">Checking live Objkt asks…</p>}
    {query.isError && <p role="alert">Objkt asks are unavailable. Reopen this horse’s papers to try again.</p>}
    {ask && <><p>Current ask: <strong>{formatXtz(ask.priceMutez)} XTZ</strong> · {ask.amountLeft} available</p>
      {address ? <button data-horf-open-range-buy-xtz type="button" onClick={() => void buy()} disabled={stage !== null}>Buy for {formatXtz(ask.priceMutez)} XTZ</button>
        : <button type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet to buy"}</button>}
    </>}
    {!query.isPending && !query.isError && !ask && <p>No current XTZ ask is available for this horse.</p>}
    {stage && <p role="status" aria-live="polite">{stage === "preflight" ? "Checking wallet and Tezos Mainnet…" : stage === "preparing" ? "Confirming the Objkt ask against Mainnet…" : stage === "wallet" ? "Approve the XTZ purchase in your wallet…" : "Waiting for Tezos confirmation…"}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {success && <p className="success" role="status">{success}</p>}
    {submitted && <p><a href={`https://tzkt.io/${encodeURIComponent(submitted)}`} target="_blank" rel="noopener noreferrer">View Tezos operation ↗</a></p>}
  </Box>;
}
