import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { queryClient } from "../../lib/query-client";

export type DesktopClientEventPayload = {
  eventType: string;
  objectId: string;
  objectKind: string;
  action: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type DesktopEventSender = (payload: DesktopClientEventPayload) => Promise<unknown>;

export function createDesktopEventQueue(
  send: DesktopEventSender,
  currentUserId?: () => number | null,
) {
  let previous: Promise<unknown> = Promise.resolve();
  return (payload: DesktopClientEventPayload): Promise<unknown> => {
    const ownerId = currentUserId?.();
    // Inventory restoration can emit every owned artifact at once. Preserve event
    // order while keeping those writes from filling all HTTP/1 connection slots
    // ahead of app modules and show reads (the measured cold-desktop failure).
    const delivery = previous.then(() => {
      if (currentUserId && (ownerId === null || currentUserId() !== ownerId)) {
        throw new Error("Desktop event cancelled because the signed-in account changed.");
      }
      return send(payload);
    });
    previous = delivery.catch(() => undefined);
    return delivery;
  };
}

const deliverDesktopEvent = createDesktopEventQueue(
  (payload) => api.post<{ ok: true }>("/api/desktop/events", payload),
  () => queryClient.getQueryData<{ id: number } | null>(["auth", "user"])?.id ?? null,
);

export function reportDesktopClientEvent(payload: DesktopClientEventPayload): void {
  void deliverDesktopEvent(payload).catch((error) => {
    logClientSystemEvent({
      eventType: "api_error",
      severity: "warn",
      message: "Desktop interaction event could not be recorded.",
      metadata: { path: "/api/desktop/events", desktopEventType: payload.eventType },
      error,
    });
  });
}
