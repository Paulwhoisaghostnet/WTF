import { createServer } from "http";
import { createApp } from "./app";
import { setupVite } from "./vite";
import { serveStatic } from "./static";
import { setupWebSocket } from "./websocket";
import { startBackgroundJobs, stopBackgroundJobs } from "./lib/token-sync";

async function main() {
  const app = await createApp();
  const server = createServer(app);

  setupWebSocket(server);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
    startBackgroundJobs();
  } else {
    await setupVite(app, server);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`WTF Gameshow running on http://localhost:${port}`);
  });

  const shutdown = () => {
    console.log("[server] shutting down...");
    stopBackgroundJobs();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(console.error);
