import serverless from "serverless-http";
import type { Express } from "express";
import { createApp } from "../../server/app";

let expressApp: Express | undefined;
let initPromise: Promise<Express> | undefined;

async function getExpressApp(): Promise<Express> {
  if (expressApp) return expressApp;
  if (!initPromise) {
    initPromise = createApp().then((app) => {
      expressApp = app;
      return app;
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
  const h = await getHandler();
  return h(event as any, context as any);
};
