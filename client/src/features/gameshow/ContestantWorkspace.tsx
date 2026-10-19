import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { GAMESHOW_TOOLS, gameshowTool, type GameshowTool } from "@shared/gameshow-tools";
import { STAGE_REFRESH_INTERVAL_MS } from "@shared/gameshow";
import type { DesktopAppsResponse } from "@shared/desktop-apps";
import { evaluateBrowserRouteAccess } from "@shared/wtf-browser-route-access";
import { BROWSER_ROUTE_META } from "@shared/wtf-browser-routes";
import { findAdminSurfaceForPath } from "../admin-os/admin-surface-registry";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { presentationRouteHref, usePresentationShell } from "../../lib/presentation-shell";
import { ShowHelp, ShowNote, ShowSection, ShowToolbar } from "./show-desk-ui";

const ToolGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
  gap: 8px;
`;

const ToolCard = styled.article`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #fff);
  min-width: 0;
  button { margin-top: auto; max-width: 100%; white-space: normal; height: auto; }
`;

const essentials = ["wallets", "files", "studio", "paint", "domains", "pasta-protocol"];

/** Handoffs reuse the shell's canonical role, surface and app-availability policy. */
export function ContestantToolLinks({ toolIds }: { toolIds: readonly string[] }) {
  const { user } = useAuth();
  const presentation = usePresentationShell();
  const [, setLocation] = useLocation();
  const apps = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () => api.get<DesktopAppsResponse>("/api/apps/desktop"),
    enabled: !!user,
    refetchInterval: STAGE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const tools = [...new Set(toolIds)].map(gameshowTool).filter((tool): tool is GameshowTool => Boolean(tool));
  const unavailable = toolIds.filter((id) => !gameshowTool(id));

  return <>
    {unavailable.length > 0 && <ShowNote role="status">An assigned tool is no longer available in the show directory. Ask the host to update the task.</ShowNote>}
    <ToolGrid>{tools.map((tool) => {
      const access = evaluateBrowserRouteAccess(tool.route, BROWSER_ROUTE_META, {
        role: user?.roles ?? user?.role ?? null,
        accessSurfaceIds: user?.wtfOsAccess?.surfaceIds ?? [],
        apps: apps.data?.apps ?? {},
        findSurfaceForPath: findAdminSurfaceForPath,
      });
      const availabilityUnknown = Boolean(access.appKey && !apps.data?.apps);
      const blocked = availabilityUnknown
        ? apps.isError ? "Tool access could not be checked. Refresh the show and try again." : "Checking tool access…"
        : access.allowed ? null
          : access.reason === "app-disabled" ? "This app is not enabled for your account. Ask the host to provision your show tools."
            : access.reason === "role-denied" ? "This tool requires separate creator access. Ask the host about the assigned task."
              : "Your account cannot open this tool right now. Ask the host for help.";
      return <ToolCard key={tool.id} data-gameshow-tool={tool.id}>
        <h4>{tool.label}</h4>
        <p>{tool.description}</p>
        <ShowNote>{tool.handoff}</ShowNote>
        {tool.prerequisite && <ShowNote>{tool.prerequisite}</ShowNote>}
        {blocked && <ShowNote role="status">{blocked}</ShowNote>}
        <Button disabled={Boolean(blocked)} onClick={() => setLocation(presentationRouteHref(tool.route, presentation.host))}>Open {tool.label}</Button>
      </ToolCard>;
    })}</ToolGrid>
  </>;
}

export function ContestantWorkspace() {
  const headingId = useId();
  return <ShowSection aria-labelledby={headingId} data-testid="contestant-workspace">
    <ShowToolbar>
      <h3 id={headingId}>Your workspace</h3>
      <ShowHelp label="How to keep your show work">Use the assigned task tools, save an editable project and its finished export, then return to the round to submit the requested evidence. Opening a tool or saving a draft does not submit a response.</ShowHelp>
    </ShowToolbar>
    <p>Keep your files and projects here between rounds. Each task lists the tools selected by the host; the directory below stays available while you prepare.</p>
    <ShowNote>Broot drafts stay in this browser. Download your .broot project and finished image, then upload the files into a Studio project for storage in your account. Return to this desk to submit the evidence requested by the host.</ShowNote>
    <ContestantToolLinks toolIds={essentials} />
    <details>
      <summary>More creative & Pasta tools</summary>
      <ShowNote>Prepare and save projects in the existing tools. Check the task’s network and publishing instructions before any wallet action.</ShowNote>
      <ContestantToolLinks toolIds={GAMESHOW_TOOLS.filter((tool) => !essentials.includes(tool.id)).map((tool) => tool.id)} />
    </details>
  </ShowSection>;
}
