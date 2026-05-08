import { trackContractActivity } from "./activity-ledger";
import { assertNetworkReadyForSend } from "./preflight";
import { getTezos } from "./wallet";

function requireCasinoContract(contractAddress: string | null | undefined): string {
  const trimmed = String(contractAddress || "").trim();
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    throw new Error("WTF Casino membership contract is not configured.");
  }
  return trimmed;
}

export async function purchaseCasinoMembership(params: {
  walletAddress: string;
  contractAddress: string | null;
  membershipRef: string;
  feeMutez: number;
}): Promise<string> {
  const contractAddress = requireCasinoContract(params.contractAddress);
  const feeMutez = Math.max(1, Math.floor(Number(params.feeMutez) || 0));
  const membershipRef = params.membershipRef.slice(0, 128);

  return trackContractActivity(
    {
      module: "casino",
      action: "purchase_membership",
      contractAddress,
      entrypoint: "purchase_membership",
      walletAddress: params.walletAddress,
      params: {
        membershipRef,
        feeMutez,
      },
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op = await contract.methodsObject
        .purchase_membership({ membership_ref: membershipRef })
        .send({ amount: feeMutez, mutez: true });
      await op.confirmation(1);
      return op.opHash;
    }
  );
}
