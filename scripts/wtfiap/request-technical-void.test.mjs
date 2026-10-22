import test from 'node:test';
import assert from 'node:assert/strict';
import { requestTechnicalVoid } from './request-technical-void.mjs';

test('technical-void wrapper requires a stopped app and never starts a second authority', async () => {
  const id='a'.repeat(64), calls=[];let running=true;
  const run=async(command,args)=>{calls.push([command,...args]);
    if(args[0]==='inspect')return JSON.stringify([{Id:id,State:{Running:running,Restarting:false}}]);
    if(args.includes('ps'))return id+'\n';
    return '{"ok":true,"signed":false}\n';};
  await assert.rejects(requestTechnicalVoid({roomCode:'room',operatorId:'operator',run}),/Stop the application/);
  assert.equal(calls.some(c=>c.includes('run')),false);
  running=false;calls.length=0;
  assert.match(await requestTechnicalVoid({roomCode:'room',operatorId:'operator',run}),/"signed":false/);
  const helper=calls.find(c=>c.includes('run'));
  assert.deepEqual(helper,['docker','compose','run','--rm','--no-deps','-T','--entrypoint','npx','app','tsx','server/features/wtfiap/technical-void-cli.ts','room','operator',id]);
  assert.equal(calls.filter(c=>c.includes('inspect')).length,2);
});
