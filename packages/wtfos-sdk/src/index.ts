/**
 * @wtfos/sdk — typed client for the wtfOS AT Protocol AppView.
 *
 * Rebranded successor to the TZAT (tz2at) SDK. Read-only over the AppView REST API; pairs
 * with @wtfos/mcp (which exposes these reads as MCP tools).
 *
 * Builder exports (`./builder-cli`) describe CLI/Terminal obligations for wtfOS app authors.
 */
export { WtfosClient, WtfosError, type WtfosClientOptions } from "./client";
export type {
  AppviewRecord,
  ListRecordsResponse,
  ListRecordsFilters,
} from "./types";
export {
  WTFOS_CLI_BUILDER_DOCS,
  WTFOS_CLI_BUILDER_OBLIGATIONS,
  cliOpenHandlesForBrowserRoutes,
  type WtfOsCliBuilderChecklistItem,
  type WtfOsCliBuilderObligation,
} from "./builder-cli";
