// Blank drop page template — the Studio generates and exports the real config.
// Preview in drop.html uses your in-progress studio draft when available.
window.DROP_CONFIG = {
  network: "shadownet",
  rpc: "https://tezos-shadownet.octez.io/",
  contract: "",
  contractVersion: "macaroni-v1",
  title: "Your Drop Title",
  description: "Describe your blind drop for collectors.",
  cover: "",
  gateway: "https://ipfs.fileship.xyz/",
  theme: {
    name: "dark",
    accent: "",
    font: "",
    customCss: "",
  },
  tokenSummary: {
    tokenCount: 0,
    editionCount: 0,
    hasMultiEditions: false,
  },
  tokens: [],
  reveal: {
    mode: "instant",
    delayDays: 0,
    placeholderPool: [],
  },
  minterRoyalties: {
    enabled: false,
    decimals: 4,
    bps: 0,
    percent: 0,
    mode: "first_minter",
    updater: "",
    updateEndpoint: "",
    updateStrategy: "none",
    metadataSource: "fetch_visible_and_final_token_metadata_then_patch_royalties",
    lock: "first_mint_sync",
  },
  blocks: [
    { type: "h", value: "How it works" },
    { type: "p", value: "Connect your wallet, pick a quantity, and mint. The contract assigns a random token from the remaining pool. No platform fee — mint payments go to the artist treasury." },
  ],
};
