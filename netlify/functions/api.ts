import serverless from "serverless-http";
import type { Express } from "express";
import { createApp } from "../../server/app";

let expressApp: Express | undefined;
let initPromise: Promise<Express> | undefined;

async function getExpressApp(): Promise<Express> {
  if (expressApp) return expressApp;
  if (!initPromise) {
    initPromise = createApp()
      .then((app) => {
        expressApp = app;
        return app;
      })
      .catch((err) => {
        initPromise = undefined;
        throw err;
      });
  }
  return initPromise;
}

let wrappedHandler: ReturnType<typeof serverless> | undefined;

async function getHandler() {
  if (wrappedHandler) return wrappedHandler;
  const app = await getExpressApp();
  wrappedHandler = serverless(app, {
    basePath: "/.netlify/functions/api",
  });
  return wrappedHandler;
}

export const handler = async (event: unknown, context: unknown) => {
  try {
    const h = await getHandler();
    return await h(event as any, context as any);
  } catch (err) {
    console.error("[netlify/functions/api] fatal:", err);
    return {
      statusCode: 503,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "API failed to initialize",
        detail:
          process.env.NODE_ENV !== "production"
            ? String((err as Error)?.message || err)
            : "Check Netlify function logs, DATABASE_URL, and SESSION_SECRET.",
      }),
    };
  }
};
