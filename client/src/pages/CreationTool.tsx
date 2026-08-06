import { AppWindow } from "../components/layout/AppWindow";
import { CreationToolFrame } from "../features/creation-tools/CreationToolFrame";
import { usePastaFavicon } from "../features/pasta-protocol/pasta-favicon";
import { getCreationTool } from "../features/creation-tools/tool-registry";

export function CreationTool({ toolId }: { toolId: string }) {
  const tool = getCreationTool(toolId);
  usePastaFavicon(tool?.id);

  if (!tool) {
    return (
      <AppWindow title="Creation Tool">
        <p>Unknown creation tool: {toolId}</p>
      </AppWindow>
    );
  }

  return (
    <AppWindow title={tool.title}>
      <CreationToolFrame tool={tool} />
    </AppWindow>
  );
}
