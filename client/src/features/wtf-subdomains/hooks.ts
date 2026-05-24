import { useMutation, useQuery } from "@tanstack/react-query";
import {
  commitWtfDomainRegistration,
  fetchHackTezConfig,
  fetchMyWtfSubdomainGrants,
  fetchWalletRegistrarStatus,
  fetchWtfDomainChatConfig,
  fetchWtfDomainsRegistrarStatus,
  prepareWtfDomainRegistration,
  type PrepareRegistrarPayload,
} from "./api";

export function useMyWtfSubdomainGrants() {
  return useQuery({
    queryKey: ["wtf-subdomains", "my"],
    queryFn: fetchMyWtfSubdomainGrants,
  });
}

export function useWtfDomainsRegistrarStatus() {
  return useQuery({
    queryKey: ["wtf-subdomains", "registrar"],
    queryFn: fetchWtfDomainsRegistrarStatus,
  });
}

export function usePrepareWtfDomainRegistration() {
  return useMutation({
    mutationFn: (payload: PrepareRegistrarPayload) =>
      prepareWtfDomainRegistration(payload),
  });
}

export function useCommitWtfDomain() {
  return useMutation({
    mutationFn: (payload: PrepareRegistrarPayload) =>
      commitWtfDomainRegistration(payload),
  });
}

export function useWalletRegistrarStatus(address: string | null | undefined) {
  return useQuery({
    queryKey: ["wtf-subdomains", "registrar-status", address],
    queryFn: () => fetchWalletRegistrarStatus(address!),
    enabled: Boolean(address),
  });
}

export function useHackTezConfig() {
  return useQuery({
    queryKey: ["wtf-subdomains", "hack-tez"],
    queryFn: fetchHackTezConfig,
  });
}

export function useWtfDomainChatConfig() {
  return useQuery({
    queryKey: ["wtf-subdomains", "chat"],
    queryFn: fetchWtfDomainChatConfig,
  });
}
