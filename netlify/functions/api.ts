import serverless from "serverless-http";
import { createApp } from "../../server/app";

const app = createApp();

const handler = serverless(app, {
  basePath: "/.netlify/functions/api",
});

export { handler };
