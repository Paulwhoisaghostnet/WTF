import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { config as dotenvConfig } from "dotenv";

const emptyModule = path.resolve(__dirname, "client/src/lib/empty-module.ts");
dotenvConfig({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
    "process.env": "{}",
    "process.versions": "{}",
  },
  resolve: {
    alias: [
      {
        find: /^react95$/,
        replacement: path.resolve(__dirname, "client/src/lib/react95-presentation.tsx"),
      },
      { find: "@", replacement: path.resolve(__dirname, "client/src") },
      { find: "@shared", replacement: path.resolve(__dirname, "shared") },
      // Taquito's http-utils imports Node-only modules; stub them for the browser
      { find: "https", replacement: emptyModule },
      { find: "http", replacement: emptyModule },
      { find: "stream", replacement: emptyModule },
      { find: "os", replacement: emptyModule },
      { find: "net", replacement: emptyModule },
      { find: "tls", replacement: emptyModule },
      { find: "fs", replacement: emptyModule },
      { find: "node:fs", replacement: emptyModule },
      { find: "crypto", replacement: emptyModule },
      { find: "node:crypto", replacement: emptyModule },
    ],
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    // Tezos wallet SDKs are intentionally isolated into lazy vendor chunks;
    // keep the warning budget above those known wallet-only bundles.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      external: [],
      output: {
        // Bump the asset namespace after deploys that may have cached a bad SPA
        // fallback for a hashed chunk URL at the edge/browser layer.
        entryFileNames: "assets/[name]-wtf2-[hash].js",
        chunkFileNames: "assets/[name]-wtf2-[hash].js",
        assetFileNames: "assets/[name]-wtf2-[hash][extname]",
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/wouter/")) {
            return "vendor-react";
          }
          if (id.includes("@tanstack/react-query")) {
            return "vendor-query";
          }
          if (id.includes("@tezos-x/")) return "vendor-octez";
          if (id.includes("@taquito/")) return "vendor-taquito";
          if (id.includes("@ecadlabs/") || id.includes("@airgap/")) return "vendor-beacon";
          if (id.includes("@walletconnect/")) return "vendor-walletconnect";
          if (
            id.includes("@stablelib/") ||
            id.includes("@noble/") ||
            id.includes("@scure/")
          ) {
            return "vendor-crypto";
          }
          if (id.includes("/react95/") || id.includes("/styled-components/")) {
            return "vendor-ui";
          }
          if (id.includes("/lucide-react/")) {
            return "vendor-icons";
          }
        },
      },
    },
  },
});
