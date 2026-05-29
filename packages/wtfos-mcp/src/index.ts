import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WtfosClient } from "@wtfos/sdk";
import { WTFOS_MCP_TOOLS } from "./tools";

/**
 * @wtfos/mcp — register wtfOS AppView tools on an MCP server. Rebranded successor to the
 * TZAT (tz2at) MCP. Tools are backed by @wtfos/sdk; the AppView base URL comes from
 * WTFOS_APPVIEW_URL (or pass a client explicitly).
 */

export { WTFOS_MCP_TOOLS, listRecordsTool, getRecordTool, type WtfosTool, type McpToolContent } from "./tools";

export interface RegisterOptions {
  client?: WtfosClient;
  baseUrl?: string;
}

export function resolveClient(options: RegisterOptions = {}): WtfosClient {
  if (options.client) return options.client;
  const baseUrl = options.baseUrl ?? process.env.WTFOS_APPVIEW_URL ?? "https://api.wtfos.app";
  return new WtfosClient({ baseUrl });
}

/** Register all wtfOS tools on an existing MCP server instance. */
export function registerWtfosTools(server: McpServer, options: RegisterOptions = {}): void {
  const client = resolveClient(options);
  for (const tool of WTFOS_MCP_TOOLS) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema,
      (async (args: Record<string, unknown>) => tool.handler(args, client)) as never,
    );
  }
}
