export type WtfOsCliEntryKind = "input" | "output" | "error" | "system";

export interface WtfOsCliEntry {
  id: string;
  kind: WtfOsCliEntryKind;
  text: string;
}

export type WtfOsCliThemeId = "phosphor" | "amber" | "ice" | "bloodmoon" | "tezos";

export interface WtfOsCliTheme {
  id: WtfOsCliThemeId;
  label: string;
  background: string;
  foreground: string;
  input: string;
  error: string;
  system: string;
  prompt: string;
  ansi?: {
    foreground: string;
    input: string;
    error: string;
    system: string;
    prompt: string;
  };
}

export interface WtfOsCliParsedCommand {
  name: string;
  args: string[];
  raw: string;
}

export interface WtfOsHealthResponse {
  ok: boolean;
  status?: string;
  version?: { commitRef?: string | null; packageVersion?: string | null };
  db?: { ok?: boolean; latencyMs?: number | null };
  chain?: { ok?: boolean; network?: string | null; tezosRpcUrl?: string | null };
  jobs?: {
    ok?: boolean;
    registered?: number | null;
    running?: number | null;
    recentErrors?: number | null;
    jobs?: Array<{
      name: string;
      running?: boolean;
      latestStatus?: string | null;
      latestFinishedAt?: string | null;
      nextRunAt?: string | null;
    }>;
  };
}

export interface WtfOsAccessManifest {
  ok: boolean;
  browserRoutes: Array<{ path: string; access: string; enabled?: boolean }>;
  apiRoutes: Array<{ method: string; path: string; access: string }>;
  mcp: { endpoint: string; scopes: Array<{ scope: string }> };
}

export interface WtfOsCliAccessibleRoute {
  path: string;
  title: string;
  auth: boolean;
}

export interface WtfOsCliBrowserRouteAccess {
  allowed: boolean;
  path: string;
  pattern?: string;
  reason?: string;
  message?: string;
  title?: string;
}

export interface WtfOsCliRemote {
  getHealth(): Promise<WtfOsHealthResponse>;
  getAccess(): Promise<WtfOsAccessManifest>;
  checkBrowserRoute(path: string): Promise<WtfOsCliBrowserRouteAccess>;
  listAccessibleBrowserRoutes(): Promise<WtfOsCliAccessibleRoute[]>;
}

export interface WtfOsCliCommandContext {
  remote: WtfOsCliRemote;
  /** Returns user-visible result text after attempting navigation. */
  navigate: (path: string) => string;
  setInterfaceMode?: (mode: "desktop" | "cli") => void;
  getInterfaceMode?: () => "desktop" | "cli";
  setTheme: (themeId: WtfOsCliThemeId) => void;
  getTheme: () => WtfOsCliThemeId;
  clearEntries: () => void;
  appendSystem: (text: string) => void;
  username: string | null;
  displayName: string | null;
  /** Extra command names appended to help output (browser-only extras, etc.). */
  extraHelpCommands?: readonly string[];
}

export interface WtfOsCliCommand {
  name: string;
  aliases?: readonly string[];
  summary: string;
  usage?: string;
  hidden?: boolean;
  run: (ctx: WtfOsCliCommandContext, args: string[]) => Promise<string> | string;
}

export type WtfOsInterfaceMode = "desktop" | "cli";

export const WTFOS_INTERFACE_MODE_KEY = "wtf:interface-mode" as const;
export const WTFOS_CLI_THEME_KEY = "wtf:cli-theme" as const;

export const WTFOS_CLI_DEFAULT_BASE_URL = "https://wtfos.app" as const;
