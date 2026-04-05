import { getTezos } from "./wallet";
import {
  SPICY_ROUTER,
  WTZ_CONTRACT,
  WTZ_TOKEN_CONTRACT,
  WTZ_TOKEN_ID,
  type SpicyToken,
  convertToMutez,
} from "@shared/types";

function secondsFromNow(seconds: number): string {
  return String(Math.floor(Date.now() / 1000) + seconds);
}

function parseTag(tag: string): { contract: string; tokenId: string | null } {
  const [contract, tokenId] = tag.split(":");
  return { contract, tokenId: tokenId === "null" ? null : tokenId };
}

export interface SwapParams {
  fromToken: SpicyToken;
  toToken: SpicyToken;
  fromAmount: number;
  toAmount: number;
  slippage: number;
  userAddress: string;
}

export async function executeTokenToTokenSwap(
  params: SwapParams
): Promise<string> {
  const tezos = await getTezos();
  const from = parseTag(params.fromToken.tag);
  const to = parseTag(params.toToken.tag);

  const dexContract = await tezos.wallet.at(SPICY_ROUTER);
  const fromTokenContract = await tezos.wallet.at(from.contract);

  const input = convertToMutez(params.fromToken, params.fromAmount);
  const minOutput = convertToMutez(
    params.toToken,
    params.toAmount - (params.toAmount * params.slippage) / 100
  );

  const batch = tezos.wallet
    .batch()
    .withContractCall(
      fromTokenContract.methods.update_operators([
        {
          add_operator: {
            owner: params.userAddress,
            operator: SPICY_ROUTER,
            token_id: from.tokenId ?? 0,
          },
        },
      ])
    )
    .withContractCall(
      dexContract.methodsObject.swap_exact_for_tokens({
        _to: params.userAddress,
        amountIn: input,
        amountOutMin: minOutput,
        deadline: secondsFromNow(300),
        tokenIn: {
          fa2_address: from.contract,
          token_id: from.tokenId ?? null,
        },
        tokenOut: {
          fa2_address: to.contract,
          token_id: to.tokenId ?? null,
        },
      })
    )
    .withContractCall(
      fromTokenContract.methods.update_operators([
        {
          remove_operator: {
            owner: params.userAddress,
            operator: SPICY_ROUTER,
            token_id: from.tokenId ?? 0,
          },
        },
      ])
    );

  const op = await batch.send();
  await op.confirmation(1);
  return op.opHash;
}

async function getWtzSwapRatio(): Promise<number> {
  const tezos = await getTezos();
  const wtzContract = await tezos.wallet.at(WTZ_CONTRACT);
  const storage: any = await wtzContract.storage();
  const totalSupply = Number(storage.totalSupply ?? storage.total_supply ?? 0);
  const tezPool = Number(storage.tezPool ?? storage.tez_pool ?? 0);
  if (tezPool === 0) return 1;
  return totalSupply / tezPool;
}

export async function executeTezToTokenSwap(
  params: SwapParams
): Promise<string> {
  const tezos = await getTezos();
  const to = parseTag(params.toToken.tag);

  const dexContract = await tezos.wallet.at(SPICY_ROUTER);
  const wtzContract = await tezos.wallet.at(WTZ_CONTRACT);
  const wtzTokenContract = await tezos.wallet.at(WTZ_TOKEN_CONTRACT);

  const swapRatio = await getWtzSwapRatio();
  const inputMutez = convertToMutez(params.fromToken, params.fromAmount);
  const wtzAmount = Math.floor(swapRatio * inputMutez);

  const minOutput = convertToMutez(
    params.toToken,
    params.toAmount - (params.toAmount * params.slippage) / 100
  );

  const batch = tezos.wallet.batch();

  batch.withContractCall(wtzContract.methods.wrap([]), {
    amount: inputMutez,
    mutez: true,
  } as any);

  batch.withContractCall(
    wtzTokenContract.methods.update_operators([
      {
        add_operator: {
          owner: params.userAddress,
          operator: SPICY_ROUTER,
          token_id: WTZ_TOKEN_ID,
        },
      },
    ])
  );

  batch.withContractCall(
    dexContract.methodsObject.swap_exact_for_tokens({
      _to: params.userAddress,
      amountIn: Math.max(wtzAmount - 1, 0),
      amountOutMin: minOutput,
      deadline: secondsFromNow(300),
      tokenIn: {
        fa2_address: WTZ_TOKEN_CONTRACT,
        token_id: WTZ_TOKEN_ID,
      },
      tokenOut: {
        fa2_address: to.contract,
        token_id: to.tokenId ?? null,
      },
    })
  );

  batch.withContractCall(
    wtzTokenContract.methods.update_operators([
      {
        remove_operator: {
          owner: params.userAddress,
          operator: SPICY_ROUTER,
          token_id: WTZ_TOKEN_ID,
        },
      },
    ])
  );

  const op = await batch.send();
  await op.confirmation(1);
  return op.opHash;
}

export async function executeTokenToTezSwap(
  params: SwapParams
): Promise<string> {
  const tezos = await getTezos();
  const from = parseTag(params.fromToken.tag);

  const dexContract = await tezos.wallet.at(SPICY_ROUTER);
  const fromTokenContract = await tezos.wallet.at(from.contract);
  const wtzContract = await tezos.wallet.at(WTZ_CONTRACT);

  const swapRatio = await getWtzSwapRatio();
  const input = convertToMutez(params.fromToken, params.fromAmount);

  const wtzMinOutput = convertToMutez(
    params.toToken,
    swapRatio * params.toAmount -
      (swapRatio * params.toAmount * params.slippage) / 100
  );

  const batch = tezos.wallet.batch();

  batch.withContractCall(
    fromTokenContract.methods.update_operators([
      {
        add_operator: {
          owner: params.userAddress,
          operator: SPICY_ROUTER,
          token_id: from.tokenId ?? 0,
        },
      },
    ])
  );

  batch.withContractCall(
    dexContract.methodsObject.swap_exact_for_tokens({
      _to: params.userAddress,
      amountIn: input,
      amountOutMin: wtzMinOutput,
      deadline: secondsFromNow(300),
      tokenIn: {
        fa2_address: from.contract,
        token_id: from.tokenId ?? null,
      },
      tokenOut: {
        fa2_address: WTZ_TOKEN_CONTRACT,
        token_id: WTZ_TOKEN_ID,
      },
    })
  );

  batch.withContractCall(
    fromTokenContract.methods.update_operators([
      {
        remove_operator: {
          owner: params.userAddress,
          operator: SPICY_ROUTER,
          token_id: from.tokenId ?? 0,
        },
      },
    ])
  );

  batch.withContractCall(wtzContract.methods.unwrap(wtzMinOutput));

  const op = await batch.send();
  await op.confirmation(1);
  return op.opHash;
}

export async function executeSwap(params: SwapParams): Promise<string> {
  const isFromXtz = params.fromToken.symbol === "XTZ";
  const isToXtz = params.toToken.symbol === "XTZ";

  if (isFromXtz) return executeTezToTokenSwap(params);
  if (isToXtz) return executeTokenToTezSwap(params);
  return executeTokenToTokenSwap(params);
}
