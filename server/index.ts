import { createServer, type Server } from "http";
import { createApp } from "./app";
import { setupVite } from "./vite";
import { serveStatic } from "./static";
import { setupWebSocket } from "./websocket";
import { startBackgroundJobs, stopBackgroundJobs } from "./lib/background-jobs";
import { logStartupDiagnostics, runRequiredStartupTasks } from "./lib/startup-tasks";
import { pool } from "./db";
import {
  flushSystemLog,
  installPgPoolSystemLogBridge,
  installSystemLogging,
  logSystemEvent,
} from "./lib/system-log";
import { startRuntimeMetrics } from "./lib/runtime-metrics";

installSystemLogging();
installPgPoolSystemLogBridge(pool);
startRuntimeMetrics();

async function listenForHttp(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "0.0.0.0");
  });
}

async function main() {
  logSystemEvent({
    source: "server",
    eventType: "startup_begin",
    severity: "info",
    message: "WTF server startup beginning",
    metadata: {
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV ?? null,
      port: process.env.PORT || "3000",
    },
  });

  const app = await createApp();
  const server = createServer(app);

  setupWebSocket(server);

  const serveBuiltAssets =
    process.env.NODE_ENV === "production" || process.env.WTFOS_STATIC_DEMO === "1";

  if (serveBuiltAssets) {
    serveStatic(app);
    if (process.env.NODE_ENV === "production") {
      await runRequiredStartupTasks();
      await startBackgroundJobs();
    }
  } else {
    await setupVite(app, server);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  await listenForHttp(server, port);
  console.log(`wtfOS running on http://localhost:${port}`);
  logSystemEvent({
    source: "server",
    eventType: "listening",
    severity: "info",
    message: `WTF server listening on ${port}`,
    metadata: {
      port,
      host: "0.0.0.0",
      nodeEnv: process.env.NODE_ENV ?? null,
    },
  });
  void logStartupDiagnostics();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] shutting down (${signal})...`);
    logSystemEvent({
      source: "server",
      eventType: "shutdown_begin",
      severity: "warn",
      message: `Server shutdown requested by ${signal}`,
      metadata: { signal },
    });
    stopBackgroundJobs();
    server.close(() => {
      logSystemEvent({
        source: "server",
        eventType: "shutdown_complete",
        severity: "info",
        message: "HTTP server closed",
        metadata: { signal },
      });
      flushSystemLog().finally(() => process.exit(0));
    });
    setTimeout(() => {
      logSystemEvent({
        source: "server",
        eventType: "shutdown_forced",
        severity: "fatal",
        message: "Forced shutdown timeout reached",
        metadata: { signal },
      });
      flushSystemLog().finally(() => process.exit(1));
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logSystemEvent({
    source: "server",
    eventType: "startup_failed",
    severity: "fatal",
    message: "WTF server startup failed",
    error,
  });
  console.error(error);
  flushSystemLog().finally(() => process.exit(1));
});
