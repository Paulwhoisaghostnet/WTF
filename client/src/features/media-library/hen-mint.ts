import { stringToBytes } from "@taquito/utils";
import { getNetwork } from "../../lib/tezos/loaders";
import { assertNetworkReadyForSend } from "../../lib/tezos/preflight";
import { trackContractActivity } from "../../lib/tezos/activity-ledger";
import { getTezos } from "../../lib/tezos/wallet";

export const HEN_MINTER_CONTRACT = "KT1Hkg5qeNhfwpKW4fXvq7HGZB9z2EnmCCA9";
export const TEZOS_MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
export const HEN_EXPLORER_URL = "https://tzkt.io";

const CID_V0_PATTERN = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;

export interface PreparedHenMint {
  artifactCid: string;
  artifactUri: string;
  metadataCid: string;
  metadataUri: string;
  name: string;
  description: string;
  fileName: string;
  mimeType: string;
  creator: string;
  editions: number;
  royalties: number;
}

export interface PrepareHenMintInput {
  artifact: Blob;
  fileName: string;
  mimeType: string;
  name: string;
  description: string;
  tags: string[];
  creator: string;
  editions: number;
  royalties: number;
  pinataJwt: string;
}

export interface HenMintRuntime {
  getNetwork: () => string;
  assertNetworkReadyForSend: (expectedAddress?: string) => Promise<void>;
  getTezos: () => Promise<any>;
  trackActivity: typeof trackContractActivity;
}

const defaultHenMintRuntime: HenMintRuntime = {
  getNetwork,
  assertNetworkReadyForSend,
  getTezos,
  trackActivity: trackContractActivity,
};

function requireCidV0(value: unknown): string {
  const cid = String(value || "").trim();
  if (!CID_V0_PATTERN.test(cid)) {
    throw new Error("Pinata did not return a CIDv0 (Qm…) hash required by the HEN contract.");
  }
  return cid;
}

function validateMintNumbers(editions: number, royalties: number) {
  if (!Number.isSafeInteger(editions) || editions < 1) {
    throw new Error("Editions must be a positive whole number.");
  }
  if (!Number.isSafeInteger(royalties) || royalties < 0 || royalties > 250) {
    throw new Error("HEN royalties must be between 0% and 25%.");
  }
}

export async function pinFileToIpfs(file: Blob, fileName: string, pinataJwt: string): Promise<string> {
  const credential = pinataJwt.trim();
  if (!credential) {
    throw new Error("Enter your Pinata JWT. It is used only for this preparation and is never saved by wtfOS.");
  }

  const body = new FormData();
  body.append("file", file, fileName);
  body.append("pinataMetadata", JSON.stringify({ name: fileName }));
  body.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${credential}` },
    body,
  });
  if (!response.ok) {
    throw new Error(`Pinata upload failed (HTTP ${response.status}). Check the JWT permissions and try again.`);
  }
  const payload = await response.json();
  return requireCidV0(payload?.IpfsHash);
}

export async function prepareHenMint(input: PrepareHenMintInput): Promise<PreparedHenMint> {
  validateMintNumbers(input.editions, input.royalties);
  if (!input.creator) throw new Error("Connect a wallet before preparing the mint.");
  if (!input.name.trim()) throw new Error("Enter a title for the token.");

  const artifactCid = await pinFileToIpfs(input.artifact, input.fileName, input.pinataJwt);
  const artifactUri = `ipfs://${artifactCid}`;
  const metadata = {
    name: input.name.trim(),
    description: input.description.trim(),
    tags: input.tags,
    symbol: "OBJKT",
    artifactUri,
    displayUri: artifactUri,
    thumbnailUri: artifactUri,
    creators: [input.creator],
    formats: [{ uri: artifactUri, mimeType: input.mimeType }],
    decimals: 0,
    isBooleanAmount: false,
    shouldPreferSymbol: false,
  };
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: "application/json" });
  const metadataCid = await pinFileToIpfs(metadataBlob, "metadata.json", input.pinataJwt);
  const metadataUri = `ipfs://${metadataCid}`;
  if (new TextEncoder().encode(metadataUri).byteLength !== 53) {
    throw new Error("HEN metadata URI must be exactly 53 bytes.");
  }

  return {
    artifactCid,
    artifactUri,
    metadataCid,
    metadataUri,
    name: input.name.trim(),
    description: input.description.trim(),
    fileName: input.fileName,
    mimeType: input.mimeType,
    creator: input.creator,
    editions: input.editions,
    royalties: input.royalties,
  };
}

export async function mintPreparedHen(
  prepared: PreparedHenMint,
  runtime: HenMintRuntime = defaultHenMintRuntime,
): Promise<{ opHash: string; explorerUrl: string }> {
  validateMintNumbers(prepared.editions, prepared.royalties);
  if (runtime.getNetwork() !== "mainnet") {
    throw new Error("HEN minting is Mainnet-only. Switch wtfOS to Mainnet before signing.");
  }
  await runtime.assertNetworkReadyForSend(prepared.creator);
  const tezos = await runtime.getTezos();
  const chainId = await tezos.rpc.getChainId();
  if (chainId !== TEZOS_MAINNET_CHAIN_ID) {
    throw new Error(`HEN mint blocked: wallet RPC is not Tezos Mainnet (${chainId}).`);
  }

  return runtime.trackActivity(
    {
      module: "media_library",
      action: "mint_hen",
      contractAddress: HEN_MINTER_CONTRACT,
      entrypoint: "mint_OBJKT",
      walletAddress: prepared.creator,
      params: {
        artifactCid: prepared.artifactCid,
        metadataCid: prepared.metadataCid,
        editions: prepared.editions,
        royalties: prepared.royalties,
      },
    },
    async () => {
      const contract = await tezos.wallet.at(HEN_MINTER_CONTRACT);
      const operation = await contract.methodsObject
        .mint_OBJKT({
          address: prepared.creator,
          amount: prepared.editions,
          metadata: stringToBytes(prepared.metadataUri),
          royalties: prepared.royalties,
        })
        .send();
      if (!operation?.opHash) {
        throw new Error("The wallet did not return an operation hash; the mint was not broadcast.");
      }
      await operation.confirmation(1);
      return {
        opHash: operation.opHash,
        explorerUrl: `${HEN_EXPLORER_URL}/${operation.opHash}`,
      };
    }
  );
}
