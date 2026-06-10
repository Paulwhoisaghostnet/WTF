import { useMutation, useQuery } from "@tanstack/react-query";
import {
  claimWtfUserSite,
  commitWtfDomainRegistration,
  createWtfUserSitePage,
  deleteWtfUserSitePage,
  fetchMyMediaLibraryForSite,
  fetchMyWtfUserSite,
  fetchHackTezConfig,
  fetchMyWtfSubdomainGrants,
  fetchWalletRegistrarStatus,
  fetchWtfDomainChatConfig,
  fetchWtfDomainsRegistrarStatus,
  publishWtfUserSite,
  prepareWtfDomainRegistration,
  rollbackWtfUserSite,
  saveWtfUserSitePage,
  updateWtfUserSiteAssets,
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

export function useMyWtfUserSite() {
  return useQuery({
    queryKey: ["wtf-user-sites", "my"],
    queryFn: fetchMyWtfUserSite,
  });
}

export function useClaimWtfUserSite() {
  return useMutation({ mutationFn: claimWtfUserSite });
}

export function useSaveWtfUserSitePage() {
  return useMutation({ mutationFn: saveWtfUserSitePage });
}

export function useCreateWtfUserSitePage() {
  return useMutation({ mutationFn: createWtfUserSitePage });
}

export function useDeleteWtfUserSitePage() {
  return useMutation({ mutationFn: deleteWtfUserSitePage });
}

export function useUpdateWtfUserSiteAssets() {
  return useMutation({ mutationFn: updateWtfUserSiteAssets });
}

export function usePublishWtfUserSite() {
  return useMutation({ mutationFn: publishWtfUserSite });
}

export function useRollbackWtfUserSite() {
  return useMutation({ mutationFn: rollbackWtfUserSite });
}

export function useMyMediaLibraryForSite(enabled: boolean) {
  return useQuery({
    queryKey: ["wtf-user-sites", "media-library"],
    queryFn: fetchMyMediaLibraryForSite,
    enabled,
  });
}
