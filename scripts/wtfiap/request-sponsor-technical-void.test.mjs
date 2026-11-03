import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSponsorTechnicalVoid } from './request-sponsor-technical-void.mjs';

test('sponsor technical-void maintenance requires a stopped authority and does not sign', async () => {
  const id = 'a'.repeat(64), calls = [];
  let running = true;
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'inspect')
      return JSON.stringify([{ Id: id, State: { Running: running, Restarting: false } }]);
    if (args.includes('ps')) return id + '\n';
    return '{"ok":true,"signed":false}\n';
  };
  await assert.rejects(requestSponsorTechnicalVoid({ roomCode: 'room',
    operatorId: 'operator', run }), /Stop the application/);
  assert.equal(calls.some(call => call.includes('run')), false);
  running = false; calls.length = 0;
  assert.match(await requestSponsorTechnicalVoid({ roomCode: 'room',
    operatorId: 'operator', run }), /"signed":false/);
  assert.deepEqual(calls.find(call => call.includes('run')),
    ['docker', 'compose', 'run', '--rm', '--no-deps', '-T', '--entrypoint',
      'npx', 'app', 'tsx', 'server/features/wtfiap/sponsor-technical-void-cli.ts',
      'room', 'operator', id]);
  assert.equal(calls.filter(call => call.includes('inspect')).length, 2);
});
