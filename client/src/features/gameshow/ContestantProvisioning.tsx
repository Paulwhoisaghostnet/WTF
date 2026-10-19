import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, GroupBox } from "react95";
import { GAMESHOW_TOOL_OPTIONS, type GameshowToolAppKey, type GameshowProvisioningResult } from "@shared/gameshow-provisioning";
import type { GameshowStageSnapshot } from "@shared/gameshow";
import { api } from "../../lib/api";
import { ProductionActions, ProductionCard, ProductionStack } from "./production-ui";
import { useGameshowConnection } from "./useGameshowStage";

export function ContestantProvisioning({ show, disabled }: { show: GameshowStageSnapshot; disabled: boolean }) {
  const online = useGameshowConnection();
  const [appKeys, setAppKeys] = useState<GameshowToolAppKey[]>([]);
  const [results, setResults] = useState<Record<number, GameshowProvisioningResult>>({});
  const setup = useMutation({ networkMode: "always", mutationFn: (userId: number) => api.post<GameshowProvisioningResult>(`/api/gameshow/seasons/${show.season.id}/contestants/${userId}/provision`, { appKeys }),
    onSuccess: result => setResults(previous => ({ ...previous, [result.userId]: result })),
  });
  return <GroupBox label="Prepare contestant workspace"><ProductionStack>
    <p>Give an enrolled contestant the gameplay role and the tools needed for your show. Existing roles and purchases are preserved. These grants remain until an operator revokes them through the normal access controls.</p>
    <fieldset><legend>Tool access to grant</legend><ProductionActions>{GAMESHOW_TOOL_OPTIONS.map(tool => <label key={tool.appKey} style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={appKeys.includes(tool.appKey)} onChange={event => setAppKeys(previous => event.target.checked ? [...previous, tool.appKey] : previous.filter(key => key !== tool.appKey))} />{tool.label}</label>)}</ProductionActions></fieldset>
    <small>With no tools selected, prepare the contestant gameplay role only. Pasta includes scoped Macaroni creator access; it does not grant administrative control.</small>
    {show.contestants.filter(contestant => ["active", "reserve"].includes(contestant.status)).map(contestant => <ProductionCard key={contestant.userId}><ProductionStack>
      <ProductionActions><strong>{contestant.displayName || contestant.username} · {contestant.status}</strong><Button disabled={disabled || !online || setup.isPending || show.season.status === "completed"} onClick={() => setup.mutate(contestant.userId)}>{setup.isPending && setup.variables === contestant.userId ? "Preparing…" : `Prepare tools for ${contestant.username}`}</Button></ProductionActions>
      {results[contestant.userId] && <p role="status">Workspace prepared. {results[contestant.userId].tools.map(tool => `${GAMESHOW_TOOL_OPTIONS.find(option => option.appKey === tool.appKey)?.label}: ${tool.globallyAvailable ? "access granted" : "granted, but disabled by the administrator"}`).join(" · ")} Ask the contestant to refresh the desktop to load updated access.</p>}
    </ProductionStack></ProductionCard>)}
    {setup.isError && <p role="alert">{setup.error.message}</p>}
    {show.contestants.every(contestant => !["active", "reserve"].includes(contestant.status)) && <p>Enroll an active or reserve contestant above before preparing tools.</p>}
  </ProductionStack></GroupBox>;
}
