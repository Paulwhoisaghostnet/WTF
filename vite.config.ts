import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const emptyModule = path.resolve(__dirname, "client/src/lib/empty-module.ts");

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
    },
  },
});
