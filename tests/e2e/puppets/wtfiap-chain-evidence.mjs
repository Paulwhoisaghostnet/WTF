import assert from 'node:assert/strict';
import { TezosToolkit } from '@taquito/taquito';
import { ParameterSchema } from '@taquito/michelson-encoder';

// Read-only proof of the exact transfer in an applied operation on the branch
// finalized by two successors. The indexer and wallet's success message are not
// payment authority. Manager fees are reported separately from the prize.
export async function verifyWtfiapTransfer({configuration,operationHash,inclusionLevel,currency,from,to,amountAtomic,toolkitFactory=rpc=>new TezosToolkit(rpc)}){
  assert.equal(configuration.network,'shadownet');assert.equal(configuration.chainId,'NetXsqzbfFenSTS');
  assert(['XTZ','WTF'].includes(currency));assert(/^(0|[1-9][0-9]*)$/.test(String(amountAtomic)));
  assert(Number.isSafeInteger(inclusionLevel)&&inclusionLevel>=0);
  const endpoints=configuration.rpcUrl.replace(/\/$/,'')==='https://tezos-shadownet.octez.io'
    ? [configuration.rpcUrl,'https://tcinfra.net/rpc/tezos/shadownet']:[configuration.rpcUrl];
  let failure;
  for(const rpcUrl of endpoints)try{
    const tezos=toolkitFactory(rpcUrl);assert.equal(await tezos.rpc.getChainId(),configuration.chainId);
    const finalHash=await tezos.rpc.getBlockHash({block:'head~2'}),finalHeader=await tezos.rpc.getBlockHeader({block:finalHash});
    assert(finalHeader.level>=inclusionLevel,'Wait for inclusion plus two successor blocks before verifying');
    const blockHash=await tezos.rpc.getBlockHash({block:`${finalHash}~${finalHeader.level-inclusionLevel}`});
    const block=await tezos.rpc.getBlock({block:blockHash});
    const operation=block.operations.flat().find(op=>op.hash===operationHash);assert(operation,'Operation is absent from the finalized inclusion branch');
    const transfers=[];let managerFees=0n;
    const tokenSchema=currency==='WTF'?new ParameterSchema((await tezos.rpc.getEntrypoints(configuration.wtfToken.contract,{block:blockHash})).entrypoints.transfer):null;
    for(const content of operation.contents){
      assert.equal(content.metadata?.operation_result?.status,'applied','Every manager content must be applied');
      managerFees+=BigInt(content.fee||0);
      const transactions=[content,...(content.metadata?.internal_operation_results||[])];
      for(const tx of transactions){
        if(tx.kind!=='transaction')continue;
        const status=tx.result?.status||tx.metadata?.operation_result?.status;assert.equal(status,'applied','Internal transfers must be applied');
        if(currency==='XTZ'&&tx.source===from&&tx.destination===to){transfers.push({from,to,amountAtomic:String(tx.amount),kind:tx===content?'external':'internal'});}
        if(currency==='WTF'&&tx.destination===configuration.wtfToken.contract&&tx.parameters?.entrypoint==='transfer'){
          const batches=tokenSchema.Execute(tx.parameters.value);
          for(const batch of batches)for(const item of batch.txs)if(batch.from_===from&&item.to_===to&&String(item.token_id)===configuration.wtfToken.tokenId)
            transfers.push({from,to,tokenContract:configuration.wtfToken.contract,tokenId:configuration.wtfToken.tokenId,amountAtomic:String(item.amount),kind:tx===content?'external':'internal'});
        }
      }
    }
    assert.equal(transfers.reduce((sum,tx)=>sum+BigInt(tx.amountAtomic),0n),BigInt(amountAtomic),'The finalized exact asset credit differs from the expected entry/refund/prize');
    assert(transfers.length>0,'An applied zero-value call alone does not prove an asset transfer');
    return {network:configuration.network,chainId:configuration.chainId,operationHash,blockHash,inclusionLevel,finalizedBlockHash:finalHash,finalizedLevel:finalHeader.level,currency,amountAtomic:String(amountAtomic),from,to,transfers,managerFeesMutez:managerFees.toString(),chainWrites:0};
  }catch(error){failure=error;}
  throw failure;
}
