// Blank drop page template — the Studio generates and exports the real config.
// Preview in drop.html uses your in-progress studio draft when available.
window.DROP_CONFIG = {
  network: "shadownet",
  rpc: "https://rpc.shadownet.teztnets.com",
  contract: "",
  title: "Your Drop Title",
  description: "Describe your blind drop for collectors.",
  cover: "",
  gateway: "https://ipfs.io/ipfs/",
  theme: {
    name: "dark",
    accent: "",
    font: "",
    customCss: "",
  },
  blocks: [
    { type: "h", value: "How it works" },
    { type: "p", value: "Connect your wallet, pick a quantity, and mint. The contract assigns a random token from the remaining pool. No platform fee — mint payments go to the artist treasury." },
  ],
};
