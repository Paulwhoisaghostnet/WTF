/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;

  // Tezos contract addresses are read at module load time by
  // `client/src/lib/tezos/marketplace.ts` and `barter.ts`. They MUST be
  // present in the environment Vite reads at `vite build` time, not just
  // at server runtime — Vite inlines the value into the JS bundle. If
  // these come back as empty strings on the deployed app, the symptom
  // is "VITE_*_CONTRACT_ADDRESS is not configured" warnings in the
  // browser console and disabled marketplace/barter actions, regardless
  // of what the server's `.env` contains. See WTF_APP_STRUCTURE_MAP.md
  // section 2 (build context warning) and section 10 (Plan D).
  readonly VITE_MARKETPLACE_CONTRACT_ADDRESS: string;
  readonly VITE_BARTER_CONTRACT_ADDRESS: string;
  readonly VITE_ETHERLINK_NETWORK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
