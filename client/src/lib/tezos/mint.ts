import { trackContractActivity } from "./activity-ledger";
import { assertNetworkReadyForSend } from "./preflight";
import { getTezos } from "./wallet";
import { toNatString, type NatInput } from "./nat";

export type OpenEditionMintParams = {
  contractAddress: string;
  tokenId: NatInput;
  qty: NatInput;
  priceMutez: NatInput;
  walletAddress: string;
};

function toSafeMutezNumber(value: NatInput): number {
  const s = toNatString(value);
  if (s.length > 15) {
    throw new Error(`mutez value ${s} exceeds safe wallet-send range`);
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`mutez value ${s} is not a safe integer`);
  }
  return n;
}

export async function mintOpenEditionFromWtf(params: OpenEditionMintParams): Promise<string> {
  const contractAddress = params.contractAddress.trim();
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contractAddress)) {
    throw new Error("Mint contract must be a KT1 address");
  }

  const tokenId = toNatString(params.tokenId);
  const qty = toNatString(params.qty);
  const priceMutez = toSafeMutezNumber(params.priceMutez);
  const totalMutez = priceMutez * Number(qty);
  if (!Number.isSafeInteger(totalMutez) || totalMutez < 0) {
    throw new Error("Mint total exceeds safe wallet-send range");
  }

  return trackContractActivity(
    {
      module: "mint_portal",
      action: "mint_open_edition",
      contractAddress,
      entrypoint: "mint_editions",
      walletAddress: params.walletAddress,
      params: { tokenId, qty, priceMutez, totalMutez },
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op = await contract.methodsObject
        .mint_editions({
          token_id: tokenId,
          qty,
          to_: params.walletAddress,
        })
        .send({ amount: totalMutez, mutez: true });
      await op.confirmation(1);
      return op.opHash;
    }
  );
}
