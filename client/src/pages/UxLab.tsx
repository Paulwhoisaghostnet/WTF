import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { CollectionWorkspace } from "../features/ux-lab/CollectionWorkspace";
import { usePresentationShell } from "../lib/presentation-shell";

const Shell = styled.div`
  min-width: 0;

  &[data-ux-lab-presentation-host="gamma"] {
    padding: 16px;
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-ux-lab-presentation-host="gamma"],
  &[data-ux-lab-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-ux-lab-presentation-host="gamma"] [data-ux-lab-region] {
    background-image: none;
    border-radius: 6px;
  }

  &[data-ux-lab-presentation-host="gamma"] :where(fieldset, [data-ux-lab-region="workspace"]) {
    color: #f2ead9;
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.18);
  }

  &[data-ux-lab-presentation-host="gamma"] :where(button) {
    color: #f2ead9;
    background: #070706;
    border: 1px solid rgba(0, 210, 255, 0.54);
    border-radius: 6px;
  }

  &[data-ux-lab-presentation-host="gamma"] :where(button:hover, button:focus-visible) {
    color: #070706;
    background: #00d2ff;
    outline: 2px solid #00d2ff;
    outline-offset: 2px;
  }
`;

export function UxLab() {
  const presentation = usePresentationShell();

  return (
    <AppWindow title="UX Lab">
      <Shell
        data-ux-lab-surface="collection-workspace"
        data-ux-lab-presentation-host={presentation.host}
        data-ux-lab-region="workspace"
      >
        <CollectionWorkspace defaultTab={1} showQuickLinks surface="portfolio" />
      </Shell>
    </AppWindow>
  );
}
