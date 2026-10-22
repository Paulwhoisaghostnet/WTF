import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ParameterSchema } from '@taquito/michelson-encoder';
import { verifyWtfiapTransfer } from './wtfiap-chain-evidence.mjs';
const configuration={network:'shadownet',chainId:'NetXsqzbfFenSTS',rpcUrl:'https://proof.invalid',escrowContract:'KT1NHQikB69AVHaNYvfdBvyx2RSHQk3uPzR3',wtfToken:{contract:'KT1U3isJU8p1rtfjZaEWa31FCSKNeLiuL7zg',tokenId:'0'}};
const from=configuration.escrowContract,to='tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM',operationHash='o'+'1'.repeat(50);
function fixture(internal){
  const content={kind:'transaction',source:to,destination:from,amount:'0',fee:'321',metadata:{operation_result:{status:'applied'},internal_operation_results:[internal]}};
  const pins=[],rpc={getChainId:async()=>configuration.chainId,getBlockHash:async({block})=>{pins.push(block);return block==='head~2'?'Bfinal':'Bincluded';},getBlockHeader:async()=>({level:12}),getBlock:async()=>({operations:[[{hash:operationHash,contents:[content]}]]})};
  return {content,pins,rpc,options:{configuration,operationHash,inclusionLevel:10,currency:'XTZ',from,to,amountAtomic:'10000',toolkitFactory:()=>({rpc})}};
}
test('exact XTZ credit comes from finalized applied transfer, separately from manager gas fee',async()=>{
  const f=fixture({kind:'transaction',source:from,destination:to,amount:'10000',result:{status:'applied'}});
  const proof=await verifyWtfiapTransfer(f.options);assert.equal(proof.amountAtomic,'10000');assert.equal(proof.managerFeesMutez,'321');assert.deepEqual(f.pins,['head~2','Bfinal~2']);
  await assert.rejects(verifyWtfiapTransfer({...f.options,amountAtomic:'9999'}),/differs/);
  f.content.metadata.internal_operation_results[0].result.status='backtracked';await assert.rejects(verifyWtfiapTransfer(f.options),/must be applied/);
});
test('exact WTF credit decodes the pinned FA2 transfer schema and checks token identity',async()=>{
  const artifact=JSON.parse(readFileSync('contracts/wtfiap-escrow/artifacts/dummy-wtf-contract.json','utf8'));
  const find=v=>v?.annots?.includes('%transfer')?v:Array.isArray(v)?v.map(find).find(Boolean):v?.args?.map(find).find(Boolean);
  const type=find(artifact),schema=new ParameterSchema(type);
  const f=fixture({kind:'transaction',source:from,destination:configuration.wtfToken.contract,amount:'0',parameters:{entrypoint:'transfer',value:schema.EncodeObject([{from_:from,txs:[{to_:to,token_id:'0',amount:'1000000'}]}])},result:{status:'applied'}});
  f.rpc.getEntrypoints=async(address,{block})=>{assert.equal(address,configuration.wtfToken.contract);assert.equal(block,'Bincluded');return{entrypoints:{transfer:type}};};
  const proof=await verifyWtfiapTransfer({...f.options,currency:'WTF',amountAtomic:'1000000'});assert.equal(proof.transfers[0].tokenId,'0');
  await assert.rejects(verifyWtfiapTransfer({...f.options,currency:'WTF',amountAtomic:'2000000'}),/differs/);
});
