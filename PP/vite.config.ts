import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
  },
  resolve: {
    alias: {
      process: fileURLToPath(new URL("./src/shims/process.cjs", import.meta.url)),
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      // Enable specific polyfills
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  server: { 
    port: 5173, 
    strictPort: true,
    headers: {
      // Enable SharedArrayBuffer for FFmpeg WASM while allowing Beacon SDK cross-origin requests
      // Using "credentialless" instead of "require-corp" to avoid blocking wallet connect
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless"
    }
  },
  // Optimize dependencies with WASM
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"]
  },
  // Build configuration for better chunking
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) {
            return "react-vendor";
          }

          if (id.includes("/node_modules/@ffmpeg/ffmpeg/") || id.includes("/node_modules/@ffmpeg/util/")) {
            return "ffmpeg-vendor";
          }

          if (id.includes("/node_modules/@radix-ui/")) {
            return "ui-vendor";
          }
        }
      }
    }
  }
});
