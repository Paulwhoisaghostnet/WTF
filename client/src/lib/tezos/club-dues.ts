import { trackContractActivity } from "./activity-ledger";
import { assertNetworkReadyForSend } from "./preflight";
import { getTezos } from "./wallet";

function requireDuesContract(contractAddress: string | null | undefined): string {
  const trimmed = String(contractAddress || "").trim();
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    throw new Error("Club dues contract is not live yet.");
  }
  return trimmed;
}

export async function payClubDues(params: {
  walletAddress: string;
  contractAddress: string | null;
  paymentRef: string;
  months: number;
  amountMutez: number;
}): Promise<string> {
  const contractAddress = requireDuesContract(params.contractAddress);
  const months = Math.max(1, Math.floor(Number(params.months) || 1));
  const amountMutez = Math.max(1, Math.floor(Number(params.amountMutez) || 0));
  const paymentRef = params.paymentRef.slice(0, 128);

  return trackContractActivity(
    {
      module: "club-dues",
      action: "pay_dues",
      contractAddress,
      entrypoint: "pay_dues",
      walletAddress: params.walletAddress,
      params: { paymentRef, months, amountMutez },
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op = await contract.methodsObject
        .pay_dues({ payment_ref: paymentRef, months })
        .send({ amount: amountMutez, mutez: true });
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function payClubMembership(params: {
  walletAddress: string;
  contractAddress: string | null;
  paymentRef: string;
  periods: number;
  tierId?: number;
  action?: 0 | 1 | 2;
  amountMutez: number;
}): Promise<string> {
  const contractAddress = requireDuesContract(params.contractAddress);
  const periods = Math.max(1, Math.floor(Number(params.periods) || 1));
  const tierId = Math.max(0, Math.floor(Number(params.tierId) || 0));
  const action = Math.max(0, Math.min(2, Math.floor(Number(params.action) || 0))) as
    | 0
    | 1
    | 2;
  const amountMutez = Math.max(1, Math.floor(Number(params.amountMutez) || 0));
  const paymentRef = params.paymentRef.slice(0, 128);

  return trackContractActivity(
    {
      module: "club-dues",
      action: "pay_membership",
      contractAddress,
      entrypoint: "pay_membership",
      walletAddress: params.walletAddress,
      params: { paymentRef, periods, tierId, action, amountMutez },
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(contractAddress);
      const op = await contract.methodsObject
        .pay_membership({
          payment_ref: paymentRef,
          periods,
          tier_id: tierId,
          action,
        })
        .send({ amount: amountMutez, mutez: true });
      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function originateClubDuesContract(params: {
  walletAddress: string;
  code: unknown;
  init: unknown;
}): Promise<{ opHash: string; contractAddress: string | null }> {
  return trackContractActivity(
    {
      module: "club-dues",
      action: "originate_contract",
      walletAddress: params.walletAddress,
      params: { template: "wtf-club-dues-v1" },
    },
    async () => {
      await assertNetworkReadyForSend(params.walletAddress);
      const tezos = await getTezos();
      const op = await tezos.wallet.originate({
        code: params.code as any,
        init: params.init as any,
      } as any).send();
      await op.confirmation(1);
      const originated = await op.contract().catch(() => null);
      return {
        opHash: op.opHash,
        contractAddress: originated?.address ?? null,
      };
    }
  );
}
