import "dotenv/config";

import { TezosToolkit } from "@taquito/taquito";

import { PlatformWalletKeyring } from "../../extensions/wtf-operator-signer/src/keyring";
import { loadEnv } from "../../extensions/wtf-operator-signer/src/env";

const MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
const ARCADE_TREASURY_ID = "arcade-treasury";
const ARCADE_TREASURY_ADDRESS = "tz1T397DtvefNp62r1juJv6NeQ7qxc3fSWZZ";
const WTF_OS_ROOT_ADDRESS = "tz1c8FUJvTvtMLFT87mCwNGTnZVEZnQGPvyo";
const MAX_FUNDING_MUTEZ = 3_450_000;
const CONFIRMATION = "FUND_WTF_OS_ROOT_FOR_MARKETPLACE_V2";

const amountMutez = Number(
  process.env.WTF_MARKETPLACE_V2_FUNDING_MUTEZ ?? MAX_FUNDING_MUTEZ,
);
if (
  !Number.isSafeInteger(amountMutez) ||
  amountMutez < 1 ||
  amountMutez > MAX_FUNDING_MUTEZ
) {
  throw new Error(
    `WTF_MARKETPLACE_V2_FUNDING_MUTEZ must be between 1 and ${MAX_FUNDING_MUTEZ}`,
  );
}

const dryRun = process.argv.includes("--dry-run");
if (!dryRun && process.env.WTF_MARKETPLACE_V2_FUNDING_CONFIRM !== CONFIRMATION) {
  throw new Error(
    `Refusing live transfer without WTF_MARKETPLACE_V2_FUNDING_CONFIRM=${CONFIRMATION}`,
  );
}

const env = loadEnv();
const keyring = new PlatformWalletKeyring(env);
const { wallet, signer } = await keyring.getSigner(ARCADE_TREASURY_ID);
if (wallet.network !== "mainnet" || wallet.address !== ARCADE_TREASURY_ADDRESS) {
  throw new Error(
    `Refusing unexpected funding wallet ${wallet.address} on ${wallet.network}`,
  );
}

const tezos = new TezosToolkit("https://tezos-mainnet.octez.io/");
tezos.setProvider({ signer });
const chainId = await tezos.rpc.getChainId();
if (chainId !== MAINNET_CHAIN_ID || wallet.chainId !== MAINNET_CHAIN_ID) {
  throw new Error(
    `Refusing chain mismatch: RPC=${chainId}, wallet=${wallet.chainId ?? "missing"}`,
  );
}

const beforeMutez = (await tezos.tz.getBalance(wallet.address)).toFixed(0);
const resultBase = {
  network: "tezos-mainnet",
  chainId,
  fromWalletId: ARCADE_TREASURY_ID,
  from: wallet.address,
  toWalletId: "wtf-os-root",
  to: WTF_OS_ROOT_ADDRESS,
  amountMutez,
  beforeMutez,
};

if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, ...resultBase }, null, 2));
} else {
  const operation = await tezos.contract.transfer({
    to: WTF_OS_ROOT_ADDRESS,
    amount: amountMutez,
    mutez: true,
  });
  await operation.confirmation(1);
  console.log(
    JSON.stringify(
      {
        ok: true,
        ...resultBase,
        operationHash: operation.hash,
        afterMutez: (await tezos.tz.getBalance(wallet.address)).toFixed(0),
      },
      null,
      2,
    ),
  );
}
