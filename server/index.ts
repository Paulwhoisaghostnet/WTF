import { createServer } from "http";
import { createApp } from "./app";
import { setupVite } from "./vite";
import { serveStatic } from "./static";
import { setupWebSocket } from "./websocket";

async function main() {
  const app = createApp();
  const server = createServer(app);

  setupWebSocket(server);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`WTF Gameshow running on http://localhost:${port}`);
  });
}

main().catch(console.error);
