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
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      // Taquito's http-utils imports Node-only modules; stub them for the browser
      https: emptyModule,
      http: emptyModule,
      stream: emptyModule,
      os: emptyModule,
      net: emptyModule,
      tls: emptyModule,
    },
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    rollupOptions: {
      external: [],
      output: {
        // Bump the asset namespace after deploys that may have cached a bad SPA
        // fallback for a hashed chunk URL at the edge/browser layer.
        entryFileNames: "assets/[name]-wtf2-[hash].js",
        chunkFileNames: "assets/[name]-wtf2-[hash].js",
        assetFileNames: "assets/[name]-wtf2-[hash][extname]",
      },
    },
  },
});
