import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/api";
import type { CollektSession } from "@shared/collekt";

export function useCollektSession() {
  return useQuery<CollektSession>({
    queryKey: ["/api/collekt/session"],
    queryFn: () => api.get<CollektSession>("/api/collekt/session"),
  });
}

export function buildCollektLaunchUrl(moduleUrl: string, origin: string) {
  const url = new URL("/wtf", moduleUrl);
  url.searchParams.set("wtfApi", origin);
  return url.toString();
}

export function getConfiguredCollektModuleUrl(session?: CollektSession) {
  return import.meta.env.VITE_COLLEKT_MODULE_URL || session?.gallery.moduleUrl || "";
}
