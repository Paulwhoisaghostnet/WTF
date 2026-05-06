import { useEffect, useState } from "react";
import type { PetTool } from "../DesktopPetTypes";

type ToolCursorPosition = {
  x: number;
  y: number;
  visible: boolean;
};

interface DesktopPetToolCursorArgs {
  enabled: boolean;
  careOpen: boolean;
}

export function useDesktopPetToolCursor({
  enabled,
  careOpen,
}: DesktopPetToolCursorArgs) {
  const [activeTool, setActiveTool] = useState<PetTool>(null);
  const [toolCursorPosition, setToolCursorPosition] = useState<ToolCursorPosition>({
    x: 0,
    y: 0,
    visible: false,
  });

  useEffect(() => {
    if (enabled) return;
    setActiveTool(null);
  }, [enabled]);

  useEffect(() => {
    if (!careOpen) setActiveTool(null);
  }, [careOpen]);

  useEffect(() => {
    if (!activeTool) {
      setToolCursorPosition((prev) => ({ ...prev, visible: false }));
      return;
    }

    const root = document.documentElement;
    root.setAttribute("data-wtf-hamster-care-tool", activeTool);
    const style = document.createElement("style");
    style.setAttribute("data-wtf-hamster-care-tool-style", activeTool);
    style.textContent = `
      html[data-wtf-hamster-care-tool] body,
      html[data-wtf-hamster-care-tool] body * {
        cursor: none !important;
      }
      html[data-wtf-hamster-care-tool] [data-desktop-cursor] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    const move = (event: PointerEvent) => {
      setToolCursorPosition({
        x: event.clientX,
        y: event.clientY,
        visible: true,
      });
    };
    const hide = () => {
      setToolCursorPosition((prev) => ({ ...prev, visible: false }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", move, true);
    window.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move, true);
      window.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
      style.remove();
      if (root.getAttribute("data-wtf-hamster-care-tool") === activeTool) {
        root.removeAttribute("data-wtf-hamster-care-tool");
      }
    };
  }, [activeTool]);

  return {
    activeTool,
    setActiveTool,
    toolCursorPosition,
  };
}
