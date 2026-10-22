import express, { type RequestHandler } from "express";
import { maxHeaderSize } from "node:http";
import { z } from "zod";

// Preserve the application's existing 10 MiB JSON allowance: Game Studio
// accepts multi-megabyte source files/base64 assets and the API portal forwards
// opaque JSON to each operation's own validator. Keep MCP independent of a
// broader JSON_BODY_LIMIT override, including when Express pre-parses its body.
export const MCP_MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024;
// Every counted JSON array element/object member needs at least two wire bytes
// (e.g. 0, or []); nested containers cannot be denser. This SDK-wide ceiling
// preserves opaque API bodies. Typed collections below enforce their existing
// domain limits *before* Zod can allocate an error for every invalid member.
export const MCP_MAX_TOOL_INPUT_ELEMENTS = Math.floor(MCP_MAX_REQUEST_BODY_BYTES / 2);
// The API bridge sends parameters back to this Node HTTP server. The request
// target shares Node's maxHeaderSize budget. Even an empty query key/value
// costs '=' plus its '&' separator, so no usable forwarded map can exceed
// this bound (real paths, names, values and headers consume more bytes).
export const MCP_MAX_API_PARAMETERS = Math.floor((maxHeaderSize + 1) / 2);

export function createMcpJsonParser(): RequestHandler {
  const parse = express.json({ limit: MCP_MAX_REQUEST_BODY_BYTES });
  return (req, res, next) => parse(req, res, (error) => {
    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "MCP request exceeds the 10 MiB JSON body limit" });
      return;
    }
    next(error);
  });
}

function rejectCollection(context: z.RefinementCtx, message: string) {
  context.addIssue({ code: z.ZodIssueCode.custom, message, fatal: true });
  return z.NEVER;
}

export function mcpBoundedArray<T extends z.ZodTypeAny>(item: T, maximum: number, minimum?: number) {
  const array = z.array(item).max(maximum);
  return z.preprocess((value, context) => {
    if (Array.isArray(value) && value.length > maximum) {
      return rejectCollection(context, `Array exceeds the maximum of ${maximum} entries`);
    }
    return value;
  }, minimum === undefined ? array : array.min(minimum));
}

// Fail on the first invalid primitive, rather than allowing z.record's union
// validator to accumulate several issues per attacker-controlled key. The
// transport-derived member bound also prevents valid maps from generating an
// unbounded number of asynchronous per-member union-validation promises.
export const McpPrimitiveRecordSchema = z.preprocess((value, context) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    let count = 0;
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      if (++count > MCP_MAX_API_PARAMETERS) {
        return rejectCollection(context, `Record exceeds the maximum of ${MCP_MAX_API_PARAMETERS} request-target parameters`);
      }
      const entry = (value as Record<string, unknown>)[key];
      if (typeof entry !== "string" && typeof entry !== "boolean" &&
          !(typeof entry === "number" && Number.isFinite(entry))) {
        return rejectCollection(context, "Record values must be strings, finite numbers, or booleans");
      }
    }
  }
  return value;
}, z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])));

export function mcpBoundedRecord<T extends z.ZodTypeAny>(item: T, maximum: number) {
  return z.preprocess((value, context) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      let count = 0;
      for (const key in value) {
        if (Object.hasOwn(value, key) && ++count > maximum) {
          return rejectCollection(context, `Record exceeds the maximum of ${maximum} entries`);
        }
      }
    }
    return value;
  }, z.record(z.string(), item));
}
