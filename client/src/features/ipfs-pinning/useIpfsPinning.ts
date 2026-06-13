import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export type IpfsPinningOverview = {
  organ: "ipfs-pinning";
  role: {
    roles: string[];
    canUsePinning: boolean;
    hasPinCollectorRole: boolean;
    permissionKey: string;
    marketSku: string;
    legacyAliasSku: string;
  };
  prerequisites: {
    hasActivePdsRepo: boolean;
    hasWtfosSite: boolean;
    siteSuspended: boolean;
    spineEnabled: boolean;
  };
  pds: {
    repoDid: string | null;
    handle: string | null;
    pdsUrl: string | null;
    identityId: number | null;
    hasRepo: boolean;
  } | null;
  site: {
    id: number;
    host: string;
    status: string;
    activeDid: string | null;
    wtfosIdentityId: number | null;
    atprotoHandleClaimId: number | null;
    wellKnownUrl: string | null;
  } | null;
  subdomainRefs: Array<{ kind: "wtfos.me" | "wtf.tez"; host: string; grantId?: number }>;
  provider: {
    key: string;
    kind: string;
    health: string;
    enabled: boolean;
    storageRoot: string;
    hostedApiConfigured: boolean;
    pinataFallbackConfigured: boolean;
    lastCheckAt: string | null;
    lastError: string | null;
  };
  storage: {
    objectStorage: {
      configured: boolean;
      bucket: string | null;
      endpoint: string | null;
      region: string | null;
      uploadsProtected: boolean;
    } | null;
    s3Access: {
      ok: boolean;
      bucket: string | null;
      endpoint: string | null;
      error?: string;
    };
    storageBoxMirror: {
      configured: boolean;
      scope: string;
    };
  };
  quota: {
    usedBytes: number;
    quotaBytes: number;
    remainingBytes: number;
    jobs: number;
    pinnedJobs: number;
  };
  policies: Array<Record<string, any>>;
  manifests: Array<Record<string, any>>;
  jobs: Array<Record<string, any>>;
};

export type PinPolicyPayload = {
  scopeType: "wallet_full" | "wallet_collection" | "token" | "macaroni_drop" | "media_item" | "project_bundle" | "manual_upload";
  scopeRef?: string | null;
  walletAddress?: string | null;
  sourceChain?: string | null;
  includeExisting?: boolean;
  includeFuture?: boolean;
  publicDiscovery?: boolean;
  exclusions?: Record<string, unknown>;
};

export function useIpfsPinningOverview() {
  return useQuery({
    queryKey: ["ipfs-pinning", "overview"],
    queryFn: () => api.get<IpfsPinningOverview>("/api/ipfs-pinning/overview"),
    staleTime: 30_000,
  });
}

export function useSavePinPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PinPolicyPayload) =>
      api.post<{ overview: IpfsPinningOverview }>("/api/ipfs-pinning/policies", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ipfs-pinning"] });
      qc.invalidateQueries({ queryKey: ["porcupin"] });
    },
  });
}

export function useRetryPinningJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) =>
      api.post<{ ok: true }>(`/api/ipfs-pinning/jobs/${jobId}/retry`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ipfs-pinning"] });
    },
  });
}
