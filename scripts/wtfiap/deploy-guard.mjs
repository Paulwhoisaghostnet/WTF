import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import rules from '../../server/features/wtfiap/rules.cjs';

export const DEPLOY_GATE = 'wtfiap-deployment-gate';
export function hasVerifiedTechnicalVoid(record) {
  const proof = record.technicalVoid;
  const chain = record.chain;
  return record.status === 'voided' && chain?.status === 'voided' && proof &&
    proof.reasonHash === rules.hashValue(proof.reason) && proof.evidenceHash === rules.hashValue(proof.evidence) &&
    chain.voidReasonHash === proof.reasonHash && chain.voidEvidenceHash === proof.evidenceHash &&
    proof.evidence?.roomId === record.roomId && proof.evidence?.rulesHash === record.rulesHash &&
    record.intents?.some(intent => intent.kind === 'void_room' && intent.status === 'applied' &&
      intent.appliedAtBlock && intent.params?.room_id === record.roomId &&
      intent.params?.reason_hash === proof.reasonHash && intent.params?.evidence_hash === proof.evidenceHash);
}
export function assertFundingCompatibility(records, locks, incomingRules) {
  const byCode = new Map(records.map(record => [record.roomCode, record]));
  for (const lock of locks) {
    const record = byCode.get(lock.roomCode);
    if (!record?.hasLock) throw new Error(`Funded game ${lock.roomCode} has no matching durable escrow binding; reconcile it before deployment.`);
    if (record.rulesHash !== lock.rulesHash) throw new Error(`Funded game ${lock.roomCode} has inconsistent rules commitments.`);
  }
  for (const record of records.filter(record => record.hasLock)) {
    const terminal = record.status === 'settled' && record.hasFinalResult || hasVerifiedTechnicalVoid(record);
    if (record.rulesHash !== incomingRules && !terminal) {
      throw new Error(`Funded game ${record.roomCode} still needs its pinned rules; finish or explicitly resolve it before this incompatible deployment.`);
    }
  }
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks = []; child.stdout.on('data', chunk => chunks.push(chunk));
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(Buffer.concat(chunks).toString('utf8')) : reject(new Error(`${command} failed (${code})`)));
  });
}

async function acquireSnapshot() {
  const child = spawn('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-qAt', '-U', 'wtf', '-d', 'wtf', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  const exited = new Promise(resolve => child.once('exit', resolve));
  const snapshot = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Deployment database gate closed before verification (${code})`)));
    lines.on('line', line => {
      if (line.startsWith('WTFIAP_SNAPSHOT:')) {
        try { resolve(JSON.parse(line.slice('WTFIAP_SNAPSHOT:'.length))); } catch (error) { reject(error); }
      }
    });
  });
  child.stdin.write(`SELECT pg_advisory_lock(hashtextextended('${DEPLOY_GATE}',0));
SELECT 'WTFIAP_SNAPSHOT:' || COALESCE(jsonb_agg(jsonb_build_object(
 'roomCode',room_code,'hasLock',jsonb_typeof(document->'lock')='object',
 'rulesHash',document->'config'->>'rulesHash','status',document->>'status',
 'hasFinalResult',jsonb_typeof(document->'finalResult')='object',
 'roomId',document->>'roomId','technicalVoid',document->'technicalVoid',
 'chain',document->'chain','intents',document->'intents')),'[]'::jsonb)::text
FROM wtfiap_funded_rooms;
`);
  const release = async () => { lines.close(); child.stdin.end('\\q\n'); await exited; };
  try { return { records: await snapshot, release }; }
  catch (error) { await release(); throw error; }
}

export async function guardedReplacement({ incomingRules, acquire, readLocks, replace }) {
  const lease = await acquire();
  try { assertFundingCompatibility(lease.records, await readLocks(), incomingRules); return await replace(); }
  finally { await lease.release(); }
}

async function main() {
  const separator = process.argv.indexOf('--');
  const [command, ...args] = separator < 0 ? [] : process.argv.slice(separator + 1);
  if (!command) throw new Error('Usage: node scripts/wtfiap/deploy-guard.mjs -- <replacement command>');
  const incomingRules = rules.getRuntimeRulesHash();
  await guardedReplacement({ incomingRules, acquire: acquireSnapshot,
    readLocks: async () => JSON.parse(await capture('docker', ['compose', 'run', '--rm', '--no-deps', '--entrypoint', 'node', 'app', 'scripts/wtfiap/read-funding-locks.cjs'])),
    replace: async () => {
      console.log(`[wtfiap-deploy] Funded-room compatibility verified for rules ${incomingRules}; admission gate held during replacement.`);
      await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit' });
        child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`App replacement failed (${code})`)));
      });
    },
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`[wtfiap-deploy] ${error.message}`); process.exitCode = 1; });
}
