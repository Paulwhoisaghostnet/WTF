import { useMutation, useQuery } from "@tanstack/react-query";
import {
  fetchMyWtfSubdomainGrants,
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

export function useWtfDomainChatConfig() {
  return useQuery({
    queryKey: ["wtf-subdomains", "chat"],
    queryFn: fetchWtfDomainChatConfig,
  });
}
