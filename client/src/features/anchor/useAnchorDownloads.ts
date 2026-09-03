import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export type AnchorDownload = {
  key: string;
  label: string;
  kind: "appliance" | "source";
  format: string;
  architecture: string;
  useCase: string;
  fileName: string;
  available: boolean;
  url: string | null;
  sha256: string | null;
};

export type AnchorDownloadManifest = {
  ok: true;
  product: "anchor";
  label: string;
  status: "beta";
  version: string;
  upstreamTag: string;
  upstreamCommit: string;
  repositoryUrl: string;
  maintainers: readonly string[];
  license: "AGPL-3.0-or-later";
  daemonImage: string;
  source: AnchorDownload;
  appliances: AnchorDownload[];
  summary: {
    sourceAvailable: boolean;
    applianceAvailable: boolean;
    availableApplianceCount: number;
  };
};

export function useAnchorDownloads() {
  return useQuery({
    queryKey: ["anchor", "downloads"],
    queryFn: () => api.get<AnchorDownloadManifest>("/api/anchor/downloads"),
  });
}
