import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePlan, type HostPlan } from './execute-shadownet-plan';
const actor='tz1fixture-recipient';
const plan: HostPlan={schemaVersion:1,network:'shadownet',chainId:'NetXsqzbfFenSTS',rpcUrl:'https://tezos-shadownet.octez.io/',planId:'measured-fixture',source:{walletId:'root',address:'tz1fixture-root'},approvedRecipients:[actor],dummyToken:{address:'KT1fixture',tokenId:'0',artifactPath:'exact-artifact.json',artifactSha256:'ab'.repeat(32)},actions:[{key:'native',kind:'native-topup',recipient:actor,targetBalanceMutez:'22512',authority:{priorOperationHash:'public-measured-operation'}},{key:'token',kind:'dummy-mint',recipients:[{address:actor,amountAtomic:'1000000'}],authority:{entryAtomic:'1000000',rooms:1}}]};
test('public funding plan binds Shadownet, approved recipients, exact integers and amount authority',()=>{
 validatePlan(plan);
 assert.throws(()=>validatePlan({...plan,network:'mainnet' as any}));
 assert.throws(()=>validatePlan({...plan,chainId:'NetXdQprcVkpaWU'}));
 assert.throws(()=>validatePlan({...plan,rpcUrl:'https://user:secret@example.invalid'}));
 assert.throws(()=>validatePlan({...plan,approvedRecipients:[actor,actor]}));
 assert.throws(()=>validatePlan({...plan,actions:[{...plan.actions[0],recipient:'tz1unapproved'} as any]}));
 assert.throws(()=>validatePlan({...plan,actions:[{...plan.actions[0],targetBalanceMutez:'1.2'} as any]}));
 assert.throws(()=>validatePlan({...plan,actions:[{...plan.actions[0],targetBalanceMutez:'9007199254740993'} as any]}));
 assert.throws(()=>validatePlan({...plan,actions:[{...plan.actions[0],authority:null} as any]}));
 assert.throws(()=>validatePlan({...plan,actions:[plan.actions[0],plan.actions[0]]}));
 assert.throws(()=>validatePlan({...plan,actions:[{...plan.actions[1],recipients:[{address:'tz1unapproved',amountAtomic:'1000000'}]} as any]}));
});
