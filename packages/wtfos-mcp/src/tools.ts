import { z } from "zod";
import type { WtfosClient, ListRecordsFilters } from "@wtfos/sdk";

/**
 * wtfOS MCP tool definitions (S3.3). Pure: each tool is an input schema + a handler that
 * calls @wtfos/sdk and returns MCP content. Kept separate from server registration so the
 * handlers are unit-testable with a mock client.
 */

export interface McpToolContent {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  /** MCP CallToolResult allows arbitrary extra fields. */
  [key: string]: unknown;
}

export interface WtfosTool<S extends z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: S;
  handler: (args: Record<string, unknown>, client: WtfosClient) => Promise<McpToolContent>;
}

function ok(value: unknown): McpToolContent {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string): McpToolContent {
  return { content: [{ type: "text", text: message }], isError: true };
}

export const listRecordsTool: WtfosTool<{
  collection: z.ZodOptional<z.ZodString>;
  did: z.ZodOptional<z.ZodString>;
  domain: z.ZodOptional<z.ZodString>;
  limit: z.ZodOptional<z.ZodNumber>;
  cursor: z.ZodOptional<z.ZodString>;
}> = {
  name: "wtfos_list_records",
  description:
    "List public wtfOS AT Protocol records (app.wtfos.* lexicons) from the AppView. Filter by collection, did, or domain (social/media/arcade/...).",
  inputSchema: {
    collection: z.string().optional(),
    did: z.string().optional(),
    domain: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    cursor: z.string().optional(),
  },
  handler: async (args, client) => {
    try {
      const page = await client.listRecords(args as ListRecordsFilters);
      return ok(page);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
};

export const getRecordTool: WtfosTool<{ uri: z.ZodString }> = {
  name: "wtfos_get_record",
  description: "Fetch a single wtfOS AppView record by its at:// URI.",
  inputSchema: { uri: z.string().describe("at:// URI of the record") },
  handler: async (args, client) => {
    try {
      const uri = String(args.uri);
      const record = await client.getRecord(uri);
      if (!record) return fail(`record not found: ${uri}`);
      return ok(record);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
};

export const WTFOS_MCP_TOOLS = [listRecordsTool, getRecordTool] as const;
