import { getTezos } from "./wallet";
import { trackContractActivity } from "./activity-ledger";
import { toNatString, type NatInput } from "./nat";
import { assertNetworkReadyForSend } from "./preflight";
import { getClientWtfToken } from "./wtf-token";

export async function transferWtf(
  fromAddress: string,
  toAddress: string,
  amount: NatInput
): Promise<string> {
  const wtfToken = getClientWtfToken();
  return trackContractActivity(
    {
      module: "token",
      action: "transfer_wtf",
      contractAddress: wtfToken.contract,
      entrypoint: "transfer",
      walletAddress: fromAddress,
      params: { fromAddress, toAddress, amount: String(amount) },
    },
    async () => {
      await assertNetworkReadyForSend(fromAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(wtfToken.contract);

      const op = await contract.methodsObject
        .transfer([
          {
            from_: fromAddress,
            txs: [
              {
                to_: toAddress,
                token_id: toNatString(wtfToken.tokenId),
                amount: toNatString(amount),
              },
            ],
          },
        ])
        .send();

      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function batchTransferWtf(
  fromAddress: string,
  transfers: Array<{ to: string; amount: NatInput }>
): Promise<string> {
  const wtfToken = getClientWtfToken();
  return trackContractActivity(
    {
      module: "token",
      action: "batch_transfer_wtf",
      contractAddress: wtfToken.contract,
      entrypoint: "transfer",
      walletAddress: fromAddress,
      params: {
        fromAddress,
        transfers: transfers.map((t) => ({ to: t.to, amount: String(t.amount) })),
      },
    },
    async () => {
      await assertNetworkReadyForSend(fromAddress);
      const tezos = await getTezos();
      const contract = await tezos.wallet.at(wtfToken.contract);

      const txs = transfers.map((t) => ({
        to_: t.to,
        token_id: toNatString(wtfToken.tokenId),
        amount: toNatString(t.amount),
      }));

      const op = await contract.methodsObject
        .transfer([{ from_: fromAddress, txs }])
        .send();

      await op.confirmation(1);
      return op.opHash;
    }
  );
}

export async function getWtfBalance(address: string): Promise<string> {
  const wtfToken = getClientWtfToken();
  const tezos = await getTezos();
  const contract = await tezos.wallet.at(wtfToken.contract);

  const storage: any = await contract.storage();
  const balance = await storage.ledger.get({
    0: address,
    1: wtfToken.tokenId,
  });

  return balance?.toString() || "0";
}
