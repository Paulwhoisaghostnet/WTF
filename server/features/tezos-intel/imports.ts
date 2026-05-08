import type { TezosIntelSource } from "@shared/tezos-intel";

export const TEZOS_INTEL_IMPORT_COMMANDS = [
  "tsx scripts/import-intel-csv.ts <csv-dir> [--only=sales,mint_events]",
  "./scripts/pack-intel-csv.sh [source-dir] [output-path]",
  "node scripts/upload-intel-csv-to-supabase.mjs <archive>",
] as const;

export const TEZOS_INTEL_SOURCES: TezosIntelSource[] = [
  {
    name: "Guidance",
    sourcePath: "../Tezos analytics/Guidance",
    targetOwner: "scripts/import-intel-csv.ts",
    status: "reference",
    notes: "SQLite/archive guidance data remains importer reference material.",
  },
  {
    name: "Tezos-Intel",
    sourcePath: "../Tezos analytics/Tezos-Intel",
    targetOwner: "scripts/import-intel-csv.ts",
    status: "imported",
    notes: "CSV import path is already committed; this pass adds read-only feature APIs over the analytics tables.",
  },
  {
    name: "Objkt-Advisor",
    sourcePath: "../Tezos analytics/Objkt-Advisor",
    targetOwner: "server/features/tezos-intel/scoring.ts",
    status: "imported",
    notes: "Scoring model has been adapted into a pure WTF service over imported analytics rows.",
  },
  {
    name: "Tezos-Scout",
    sourcePath: "../Tezos analytics/Tezos-Scout",
    targetOwner: "server/features/tezos-intel/scout.ts",
    status: "imported",
    notes: "Creator read/compare shape has been adapted into WTF endpoints.",
  },
  {
    name: "tezpulse",
    sourcePath: "../Tezos analytics/tezpulse",
    targetOwner: "server/features/tezos-intel/market-map.ts",
    status: "imported",
    notes: "Market pulse summary is provided as a bounded, cached aggregate endpoint.",
  },
  {
    name: "wallet-constellations",
    sourcePath: "../Tezos analytics/wallet-constellations",
    targetOwner: "client/src/features/tezos-intel",
    status: "deferred",
    notes: "Visualization concept retained; no 3D/p5 bundle imported during this pass.",
  },
  {
    name: "web3 simulator",
    sourcePath: "../Tezos analytics/web3 simulator",
    targetOwner: ".agents/docs/archive/integrations/source-maps/tezos-intel-source-map.md",
    status: "deferred",
    notes: "Simulation app remains reference material until a current WTF product need exists.",
  },
  {
    name: "objkt-owned-editions-sorter",
    sourcePath: "../Tezos analytics/objkt-owned-editions-sorter",
    targetOwner: "extensions/objkt-owned-editions-sorter",
    status: "imported",
    notes: "Standalone browser extension copied as an independently packaged extension.",
  },
];

export function isTezosIntelEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.TEZOS_INTEL_API_ENABLED !== "false";
}
