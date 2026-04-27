import assert from "node:assert/strict";
import { test } from "node:test";

import {
  serializeClientErrorForSystemLog,
  shouldSkipClientSystemLog,
} from "./system-log";

test("serializes plain client error objects with message, stack, and details", () => {
  assert.deepEqual(
    serializeClientErrorForSystemLog({
      name: "ApiError",
      message: "Desktop settings failed",
      stack: "at DesktopSettings",
      status: 500,
      nested: { endpoint: "/api/desktop/settings" },
    }),
    {
      name: "ApiError",
      message: "Desktop settings failed",
      stack: "at DesktopSettings",
      details: {
        status: 500,
        nested: { endpoint: "/api/desktop/settings" },
      },
    }
  );
});

test("skips noisy Vite websocket client errors without hiding app failures", () => {
  assert.equal(
    shouldSkipClientSystemLog({
      eventType: "unhandled_rejection",
      message: "Cannot read properties of undefined (reading 'send')",
      error: { stack: "at Object.send (http://localhost:3000/@vite/client:438:7)" },
    }),
    true
  );

  assert.equal(
    shouldSkipClientSystemLog({
      eventType: "api_error",
      message: "Failed to save desktop settings",
      error: { stack: "at DesktopSettings" },
    }),
    false
  );
});
