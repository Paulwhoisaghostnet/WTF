import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useWallet } from "../../lib/wallet-context";

export interface MusicNft {
  id: string;
  tokenId: string;
  contract: string;
  title: string;
  artist: string;
  artifactUri: string;
  displayUri: string | null;
}


async function fetchWalletAudioNfts(walletAddress: string): Promise<MusicNft[]> {
  const tzktBase = import.meta.env.VITE_TZKT_BASE ?? "https://api.tzkt.io";
  const url = `${tzktBase}/v1/tokens/balances?account=${walletAddress}&token.metadata.formats.mimeType.in=audio/mpeg,audio/ogg,audio/wav,audio/flac&balance.gt=0&limit=100`;

  const resp = await fetch(url);
  if (!resp.ok) return [];

  const items: any[] = await resp.json();
  return items.map((item) => {
    const tokenId = String(item.token?.tokenId ?? "");
    const contract = item.token?.contract?.address ?? "";
    return {
      id: `${contract}:${tokenId}`,
      tokenId,
      contract,
      title: item.token?.metadata?.name ?? "Unknown",
      artist: item.token?.metadata?.creators?.[0] ?? item.token?.metadata?.artist ?? "Unknown",
      artifactUri: item.token?.metadata?.artifactUri ?? "",
      displayUri: item.token?.metadata?.displayUri ?? null,
    };
  }).filter((t) => t.artifactUri);
}

async function fetchMyMediaAudio() {
  return api.get<{ id: number; title: string; sourceUrl: string; playbackUrl?: string | null; mimeType: string }[]>(
    "/api/media/mine?category=audio"
  );
}

export function useMusicNfts() {
  const { address } = useWallet();

  return useQuery({
    queryKey: ["music", "nfts", address],
    queryFn: () => (address ? fetchWalletAudioNfts(address) : Promise.resolve([])),
    enabled: !!address,
    staleTime: 60_000,
  });
}

export function useMyMediaAudio() {
  return useQuery({
    queryKey: ["music", "media-audio"],
    queryFn: fetchMyMediaAudio,
    staleTime: 30_000,
  });
}
