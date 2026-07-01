import { WTF_USER_SITE_HOME_SLUG } from "@shared/wtf-user-sites";
import proofData from "@shared/pasta-shadownet-proof-contracts.json";
import type { ManifestPageSnapshot } from "./policy";

export type PastaWtfmeProofContract = {
  app: string;
  kind: string;
  title: string;
  contract: string;
  tokenId?: string;
  relationshipGroup: string;
  route: string;
  mintEntrypoint?: string;
  priceMutez?: string;
};

type PastaWtfmeNetwork = {
  key: "shadownet";
  label: string;
  chainId: string;
  rpcUrl: string;
  tzkt: string;
};

export const PASTA_WTFME_NETWORK = proofData.network as PastaWtfmeNetwork;
export const PASTA_WTFME_PROOF_CONTRACTS = proofData.contracts as readonly PastaWtfmeProofContract[];

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function proofAttrs(pageKind: string, contract?: PastaWtfmeProofContract): string {
  const attrs: Record<string, string> = {
    "data-pasta-hosted-page": pageKind,
    "data-pasta-network": PASTA_WTFME_NETWORK.key,
    "data-pasta-chain-id": PASTA_WTFME_NETWORK.chainId,
    "data-pasta-wallet-action": "connect",
  };
  if (contract) {
    attrs["data-pasta-app"] = contract.app;
    attrs["data-pasta-contract"] = contract.contract;
    attrs["data-pasta-relationship-group"] = contract.relationshipGroup;
    if (contract.tokenId) attrs["data-pasta-token-id"] = contract.tokenId;
    if (contract.mintEntrypoint) attrs["data-pasta-mint-entrypoint"] = contract.mintEntrypoint;
    if (contract.priceMutez) attrs["data-pasta-price-mutez"] = contract.priceMutez;
  }
  return Object.entries(attrs)
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(" ");
}

function explorerHref(contract: string): string {
  return `${PASTA_WTFME_NETWORK.tzkt}/${contract}`;
}

function pageFrame(pageKind: string, title: string, contract: PastaWtfmeProofContract | null, body: string): string {
  return `<main class="pasta-wtfme-page" ${proofAttrs(pageKind, contract ?? undefined)}>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #f8fafc; }
    .pasta-wtfme-page { min-height: 100vh; padding: 28px; display: grid; gap: 20px; align-content: start; }
    .pasta-wtfme-hero { display: grid; gap: 10px; max-width: 880px; }
    .pasta-wtfme-eyebrow { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; color: #334155; }
    h1 { margin: 0; font-size: 34px; line-height: 1.1; letter-spacing: 0; }
    p { margin: 0; line-height: 1.55; max-width: 74ch; }
    .pasta-wtfme-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); max-width: 980px; }
    .pasta-wtfme-card { border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; padding: 14px; display: grid; gap: 8px; }
    .pasta-wtfme-card h2 { margin: 0; font-size: 18px; line-height: 1.2; letter-spacing: 0; }
    .pasta-wtfme-card code, .pasta-wtfme-proof code { word-break: break-all; }
    .pasta-wtfme-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .pasta-wtfme-button { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 12px; border: 1px solid #0f172a; border-radius: 6px; background: #0f172a; color: #fff; font-weight: 700; text-decoration: none; }
    .pasta-wtfme-link { color: #0f766e; font-weight: 700; }
    .pasta-wtfme-proof { border-left: 3px solid #0f766e; padding-left: 12px; display: grid; gap: 6px; }
  </style>
  <section class="pasta-wtfme-hero">
    <p class="pasta-wtfme-eyebrow">Pasta Protocol on WTF.ME</p>
    <h1>${escapeHtml(title)}</h1>
    <p>WTF.ME hosted proof page for Pasta Protocol. This page is pinned to ${escapeHtml(
      PASTA_WTFME_NETWORK.label
    )} and chain id <code>${escapeHtml(PASTA_WTFME_NETWORK.chainId)}</code>; it must not be treated as mainnet.</p>
  </section>
  ${body}
</main>`;
}

function landingPage(): ManifestPageSnapshot {
  const cards = PASTA_WTFME_PROOF_CONTRACTS.map((contract) => {
    const token = contract.tokenId ? ` token ${escapeHtml(contract.tokenId)}` : "";
    const link = contract.route === "/" ? explorerHref(contract.contract) : contract.route;
    const linkLabel = contract.route === "/" ? "Open explorer" : `Open ${contract.kind} page`;
    return `<article class="pasta-wtfme-card" data-pasta-proof-card="${escapeHtml(contract.app)}">
      <h2>${escapeHtml(contract.title)}</h2>
      <p>${escapeHtml(contract.kind)}${token}</p>
      <p><code>${escapeHtml(contract.contract)}</code></p>
      <p>Relationship group: <code>${escapeHtml(contract.relationshipGroup)}</code></p>
      <a class="pasta-wtfme-link" href="${escapeHtml(link)}">${escapeHtml(linkLabel)}</a>
    </article>`;
  }).join("\n");
  return {
    slug: WTF_USER_SITE_HOME_SLUG,
    title: "Pasta Protocol Shadownet Proofs",
    html: pageFrame(
      "landing",
      "Pasta Protocol Shadownet Proofs",
      null,
      `<section class="pasta-wtfme-grid">${cards}</section>
  <section class="pasta-wtfme-proof">
    <p>Branding: <strong>Pasta Protocol</strong> served by <strong>WTF.ME</strong>.</p>
    <p>Wallet bridge marker: <button class="pasta-wtfme-button" type="button" data-pasta-wallet-action="connect">Connect wallet</button></p>
  </section>`
    ),
  };
}

function mintPage(): ManifestPageSnapshot {
  const contract = PASTA_WTFME_PROOF_CONTRACTS.find((item) => item.app === "gnocchi");
  if (!contract || !contract.mintEntrypoint) throw new Error("Missing Gnocchi mint proof contract");
  return {
    slug: "mint",
    title: contract.title,
    html: pageFrame(
      "mint",
      contract.title,
      contract,
      `<section class="pasta-wtfme-proof">
    <p>Mint route: <code>${escapeHtml(contract.mintEntrypoint)}</code></p>
    <p>Price: <code>${escapeHtml(contract.priceMutez)} mutez</code></p>
    <p>Contract: <code>${escapeHtml(contract.contract)}</code></p>
    <p>Token: <code>${escapeHtml(contract.tokenId)}</code></p>
    <p><a class="pasta-wtfme-link" href="${escapeHtml(explorerHref(contract.contract))}">View on Shadownet TzKT</a></p>
    <div class="pasta-wtfme-actions">
      <button class="pasta-wtfme-button" type="button" data-pasta-wallet-action="connect">Connect wallet</button>
      <button class="pasta-wtfme-button" type="button" data-pasta-purchase-action="mint">Mint on Shadownet</button>
    </div>
  </section>`
    ),
  };
}

function collectionPage(): ManifestPageSnapshot {
  const contract = PASTA_WTFME_PROOF_CONTRACTS.find((item) => item.app === "spaghetti");
  if (!contract) throw new Error("Missing Spaghetti collection proof contract");
  return {
    slug: "collection",
    title: contract.title,
    html: pageFrame(
      "collection",
      contract.title,
      contract,
      `<section class="pasta-wtfme-proof">
    <p>Collection contract: <code>${escapeHtml(contract.contract)}</code></p>
    <p>Featured token: <code>${escapeHtml(contract.tokenId)}</code></p>
    <p>Relationship group: <code>${escapeHtml(contract.relationshipGroup)}</code></p>
    <p><a class="pasta-wtfme-link" href="${escapeHtml(explorerHref(contract.contract))}">View on Shadownet TzKT</a></p>
    <div class="pasta-wtfme-actions">
      <a class="pasta-wtfme-button" href="/mint">Open mint page</a>
      <button class="pasta-wtfme-button" type="button" data-pasta-wallet-action="connect">Connect wallet</button>
    </div>
  </section>`
    ),
  };
}

export function buildPastaHostedPageSnapshots(): ManifestPageSnapshot[] {
  return [landingPage(), mintPage(), collectionPage()];
}

export function assertPastaHostedPageSnapshots(pages: readonly ManifestPageSnapshot[]): void {
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  for (const slug of [WTF_USER_SITE_HOME_SLUG, "mint", "collection"]) {
    if (!bySlug.has(slug)) throw new Error(`Missing Pasta hosted page slug: ${slug}`);
  }
  const allHtml = pages.map((page) => page.html).join("\n");
  for (const required of [
    "data-pasta-hosted-page=\"landing\"",
    "data-pasta-hosted-page=\"mint\"",
    "data-pasta-hosted-page=\"collection\"",
    "data-pasta-network=\"shadownet\"",
    `data-pasta-chain-id="${PASTA_WTFME_NETWORK.chainId}"`,
    "data-pasta-wallet-action=\"connect\"",
    "Pasta Protocol",
    "WTF.ME",
  ]) {
    if (!allHtml.includes(required)) throw new Error(`Missing Pasta hosted page marker: ${required}`);
  }
  for (const contract of PASTA_WTFME_PROOF_CONTRACTS) {
    if (!allHtml.includes(contract.contract)) throw new Error(`Missing Pasta proof contract: ${contract.contract}`);
    if (!allHtml.includes(contract.relationshipGroup)) {
      throw new Error(`Missing Pasta relationship group: ${contract.relationshipGroup}`);
    }
  }
}
