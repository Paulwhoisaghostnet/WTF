import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export type PorcupinStatus = {
  connected: boolean;
  remoteUrl?: string;
  health?: unknown;
  error?: string;
};

export function usePorcupinRemote() {
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ["porcupin", "status"],
    queryFn: () => api.get<PorcupinStatus>("/api/porcupin/status"),
    refetchInterval: 60_000,
  });

  const connectM = useMutation({
    mutationFn: (payload: { remoteUrl: string; authToken: string }) =>
      api.post("/api/porcupin/connect", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["porcupin"] }),
  });

  const eligibilityQ = useQuery({
    queryKey: ["porcupin", "premium-eligibility"],
    queryFn: () => api.get("/api/porcupin/premium/eligibility"),
    enabled: false,
  });

  return { statusQ, connectM, eligibilityQ };
}
