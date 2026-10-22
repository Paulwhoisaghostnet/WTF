import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTypedScriptIdentity } from './script-identity';
const type={prim:'pair',args:[{prim:'string'},{prim:'pair',args:[{prim:'bool'},{prim:'nat'}]}]};
const script=(literal:any):any[]=>[{prim:'parameter',args:[{prim:'unit'}]},{prim:'storage',args:[{prim:'unit'}]},{prim:'code',args:[[{prim:'PUSH',args:[type,literal]},{prim:'DROP'}]]}];
const nested={prim:'Pair',args:[{string:'fixture'},{prim:'Pair',args:[{prim:'True'},{int:'1'}]}]};
test('typed PUSH binary Pair and protocol comb sequence compare equal without changing values or instructions',()=>{
  const comb=[{string:'fixture'},{prim:'True'},{int:'1'}];
  assertTypedScriptIdentity(script(comb),script(nested),'same typed value');
  assert.throws(()=>assertTypedScriptIdentity(script([{string:'fixture'},{prim:'False'},{int:'1'}]),script(nested),'changed value'));
  const changed=script(comb);changed[2].args[0][1]={prim:'DUP'} as any;
  assert.throws(()=>assertTypedScriptIdentity(changed,script(nested),'changed executable'));
});
test('non-PUSH Pair and array data retain distinct identities',()=>{
  const a=script(nested),b=script(nested);a[2].args[0].push({prim:'UNRELATED',args:[nested]} as any);b[2].args[0].push({prim:'UNRELATED',args:[[{string:'fixture'},{prim:'True'},{int:'1'}]]} as any);
  assert.throws(()=>assertTypedScriptIdentity(a,b,'untyped shape must not normalize'));
});
