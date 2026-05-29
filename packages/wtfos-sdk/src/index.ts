/**
 * @wtfos/sdk — typed client for the wtfOS AT Protocol AppView.
 *
 * Rebranded successor to the TZAT (tz2at) SDK. Read-only over the AppView REST API; pairs
 * with @wtfos/mcp (which exposes these reads as MCP tools).
 */
export { WtfosClient, WtfosError, type WtfosClientOptions } from "./client";
export type {
  AppviewRecord,
  ListRecordsResponse,
  ListRecordsFilters,
} from "./types";
