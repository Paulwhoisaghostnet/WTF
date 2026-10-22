import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
export async function requestTechnicalVoid({ roomCode, operatorId, run = async (command, args) => (await exec(command, args)).stdout }) {
  if (!roomCode || !operatorId) throw new Error('Provide the exact room code and private operator identity.');
  const containers = String(await run('docker', ['compose', 'ps', '--all', '--quiet', 'app'])).trim().split(/\s+/).filter(Boolean);
  if (containers.length !== 1 || !/^[a-f0-9]{64}$/.test(containers[0])) throw new Error('Require exactly one identifiable stopped application container.');
  const id = containers[0];
  const assertStopped = async () => {
    const inspected = JSON.parse(await run('docker', ['inspect', id]));
    if (inspected.length !== 1 || inspected[0].Id !== id || inspected[0].State?.Running !== false || inspected[0].State?.Restarting !== false)
      throw new Error('Stop the application before requesting a technical void; no second authority will be started.');
  };
  await assertStopped();
  // The helper acquires the same exclusive database gate as deployment. It
  // reads persisted state directly and never constructs a live Party server.
  const output = await run('docker', ['compose', 'run', '--rm', '--no-deps', '-T', '--entrypoint', 'npx', 'app',
    'tsx', 'server/features/wtfiap/technical-void-cli.ts', roomCode, operatorId, id]);
  await assertStopped();
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [roomCode, operatorId, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Usage: node scripts/wtfiap/request-technical-void.mjs <room-code> <operator-identity>');
  requestTechnicalVoid({ roomCode, operatorId }).then(output => process.stdout.write(output)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
