import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface PorcupinConnection {
  id: number;
  remoteUrl: string;
  status: string;
  lastCheckAt: string | null;
  createdAt: string;
}

export interface PorcupinStatus {
  connected: boolean;
  status?: string;
  remote?: Record<string, unknown>;
}

export interface PorcupinEligibility {
  wtfBalanceOk: boolean;
  membershipCardOk: boolean;
  duesActiveOk: boolean;
  eligible: boolean;
  wtfBalance: number;
  notes: string[];
}

export function usePorcupinConnection() {
  return useQuery({
    queryKey: ["porcupin", "connection"],
    queryFn: () => api.get<PorcupinConnection | null>("/api/porcupin/connection"),
  });
}

export function usePorcupinStatus() {
  return useQuery({
    queryKey: ["porcupin", "status"],
    queryFn: () => api.get<PorcupinStatus>("/api/porcupin/status"),
    staleTime: 30_000,
  });
}

export function usePorcupinEligibility() {
  return useQuery({
    queryKey: ["porcupin", "eligibility"],
    queryFn: () => api.get<PorcupinEligibility>("/api/porcupin/premium-eligibility"),
    staleTime: 60_000,
  });
}

export function useConnectPorcupin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { remoteUrl: string; authToken: string }) =>
      api.post<{ ok: boolean; id: number }>("/api/porcupin/connect", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["porcupin"] });
    },
  });
}

export function useDisconnectPorcupin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete("/api/porcupin/connection"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["porcupin"] });
    },
  });
}
