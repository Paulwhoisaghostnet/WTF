/**
 * Thin singleton around the `/ws` WebSocket for Studio real-time events.
 *
 * Usage pattern:
 *   const socket = useStudioSocket(projectId);
 *   useEffect(() => socket.on(handleEvent), []);
 *   socket.openFile(fileId);
 *
 * The socket auto-reconnects with exponential backoff.  Several Studio
 * windows on the same desktop share one connection so the server only
 * tracks one session per browser tab.
 */

import { useEffect, useMemo, useRef } from "react";

export interface StudioSocketEvent {
  type: string;
  [key: string]: unknown;
}

type Listener = (event: StudioSocketEvent) => void;

class StudioSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pendingProjectJoin: number | null = null;
  private openedFileId: number | null = null;
  private reconnectDelay = 1000;
  private reconnectTimer: number | null = null;
  private connecting = false;

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (typeof window === "undefined") return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;
    this.connecting = true;
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener("open", () => {
      this.connecting = false;
      this.reconnectDelay = 1000;

      if (this.pendingProjectJoin != null) {
        this.send({ type: "studio_join_project", projectId: this.pendingProjectJoin });
        if (this.openedFileId != null) {
          this.send({ type: "studio_open_file", fileId: this.openedFileId });
        }
      }
    });

    this.ws.addEventListener("message", (ev) => {
      let parsed: StudioSocketEvent | null = null;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!parsed || typeof parsed.type !== "string") return;
      for (const listener of this.listeners) {
        try {
          listener(parsed);
        } catch {
          // A listener throwing should not break the pipeline for others.
        }
      }
    });

    this.ws.addEventListener("close", () => {
      this.connecting = false;
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.addEventListener("error", () => {
      // The `close` handler will fire too.
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15_000);
      this.connect();
    }, this.reconnectDelay);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  joinProject(projectId: number): void {
    if (this.pendingProjectJoin === projectId && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    if (this.pendingProjectJoin != null && this.pendingProjectJoin !== projectId) {
      this.send({ type: "studio_leave_project" });
    }
    this.pendingProjectJoin = projectId;
    this.openedFileId = null;
    this.connect();
    this.send({ type: "studio_join_project", projectId });
  }

  leaveProject(): void {
    if (this.pendingProjectJoin == null) return;
    this.send({ type: "studio_leave_project" });
    this.pendingProjectJoin = null;
    this.openedFileId = null;
  }

  openFile(fileId: number): void {
    this.openedFileId = fileId;
    this.send({ type: "studio_open_file", fileId });
  }

  closeFile(): void {
    if (this.openedFileId == null) return;
    this.send({ type: "studio_close_file" });
    this.openedFileId = null;
  }

  typing(): void {
    this.send({ type: "studio_typing" });
  }

  cursor(fileId: number, x: number, y: number): void {
    this.send({ type: "studio_cursor", fileId, x, y });
  }

  annotationPreview(fileId: number, kind: string, data: unknown): void {
    this.send({ type: "studio_annotation_preview", fileId, kind, data });
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch {
      // Ignored — next tick the connection will close and reconnect.
    }
  }
}

const singleton = new StudioSocketClient();

export interface StudioSocketHandle {
  subscribe: (listener: Listener) => () => void;
  openFile: (fileId: number) => void;
  closeFile: () => void;
  typing: () => void;
  cursor: (fileId: number, x: number, y: number) => void;
  annotationPreview: (fileId: number, kind: string, data: unknown) => void;
}

const handle: StudioSocketHandle = {
  subscribe: (listener: Listener) => singleton.subscribe(listener),
  openFile: (fileId: number) => singleton.openFile(fileId),
  closeFile: () => singleton.closeFile(),
  typing: () => singleton.typing(),
  cursor: (fileId: number, x: number, y: number) =>
    singleton.cursor(fileId, x, y),
  annotationPreview: (fileId: number, kind: string, data: unknown) =>
    singleton.annotationPreview(fileId, kind, data),
};

/**
 * React-friendly wrapper.  Joining/leaving a project is tied to component
 * lifecycle; listeners are tied to the caller's effect scope.  The returned
 * handle is a stable singleton reference so using it in effect dependency
 * arrays does not retrigger subscription loops.
 */
export function useStudioSocket(projectId: number | null): StudioSocketHandle {
  const projectRef = useRef<number | null>(null);

  useEffect(() => {
    if (projectId == null) return;
    projectRef.current = projectId;
    singleton.joinProject(projectId);
    return () => {
      if (projectRef.current === projectId) {
        singleton.leaveProject();
        projectRef.current = null;
      }
    };
  }, [projectId]);

  return useMemo(() => handle, []);
}
