// Local DB-only admission fixture. Existing keyring identities are read, never
// created, retargeted or signed; no unrelated app entitlements are granted.
import assert from 'node:assert/strict';
import { createHash, randomBytes, scrypt as scryptCb } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { require as tsxRequire } from 'tsx/cjs/api';
import { buildPuppetKeyringEnv } from './runtime.mjs';
import { PUPPET_ACTORS, puppetEmail } from './registry.mjs';

const ids=['bert','ernie','elmo','bigbird','thecount','snuffaluffagus','grover','cookiemonster'];
const scrypt=promisify(scryptCb), sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function main(){
  const url=new URL(process.env.DATABASE_URL),target=new URL(process.env.WTF_E2E_LIVE_BASE_URL),credentialsPath=process.env.WTF_E2E_PUPPET_CREDENTIALS_PATH;
  assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  assert.equal(url.pathname,'/wtfiap_actor','Use the separate disposable admission database');
  assert(['localhost','127.0.0.1','[::1]'].includes(target.hostname));
  assert(credentialsPath&&path.isAbsolute(credentialsPath),'Use an explicit isolated credential output');
  const env=await buildPuppetKeyringEnv();env.WTF_PLATFORM_KEYRING_CREATE_ENABLED=0;
  const module=tsxRequire('../../../extensions/wtf-operator-signer/src/keyring.ts',import.meta.url);
  const {PlatformWalletKeyring}=module.default||module,keyring=new PlatformWalletKeyring(env);
  const before=sha(await readFile(env.WTF_PLATFORM_KEYRING_PATH)),wallets=await keyring.listPublicWallets();
  const actors=ids.map(id=>{
    const actor=PUPPET_ACTORS.find(a=>a.id===id),wallet=wallets.find(w=>w.id===actor.walletId);
    assert(wallet&&wallet.network==='shadownet'&&wallet.chainId==='NetXsqzbfFenSTS','Existing proof identity must already be Shadownet');
    return {...actor,email:puppetEmail(actor),password:'wtfiap-e2e-'+randomBytes(32).toString('base64url'),walletAddress:wallet.address,publicKey:wallet.publicKey,chainId:wallet.chainId,did:wallet.did};
  });
  const pool=new pg.Pool({connectionString:url.href}),client=await pool.connect();
  try{
    assert.equal((await client.query('SELECT count(*)::int AS n FROM users')).rows[0].n,0,'Do not overwrite existing actors or credentials');
    await client.query('BEGIN');
    for(const actor of actors){
      const salt=randomBytes(16).toString('hex'),hash=(await scrypt(actor.password,salt,64)).toString('hex')+'.'+salt;
      const result=await client.query(`INSERT INTO users(username,email,display_name,role,password_hash,welcomed_to_wtf_os,welcomed_to_wtf_os_at,gm_welcome_utc_day,gm_welcome_last_seen_at)
        VALUES($1,$2,$3,$4,$5,true,now(),$6,now()) RETURNING id`,[actor.username,actor.email,actor.displayName,actor.role,hash,new Date().toISOString().slice(0,10)]);
      actor.userId=result.rows[0].id;
      await client.query('INSERT INTO user_wallets(user_id,wallet_address,is_primary) VALUES($1,$2,true)',[actor.userId,actor.walletAddress]);
    }
    assert.equal(sha(await readFile(env.WTF_PLATFORM_KEYRING_PATH)),before,'Read-only wallet identity lookup changed the keyring');
    await mkdir(path.dirname(credentialsPath),{recursive:true,mode:0o700});
    await writeFile(credentialsPath,JSON.stringify({version:1,generatedAt:new Date().toISOString(),targetBaseUrl:target.href,database:{host:url.host,hostname:url.hostname,port:url.port,database:'wtfiap_actor'},keyringPath:env.WTF_PLATFORM_KEYRING_PATH,rpcUrl:'https://tezos-shadownet.octez.io/',actors},null,2)+'\n',{mode:0o600,flag:'wx'});
    await client.query('COMMIT');
    console.log(JSON.stringify({ok:true,actorIds:ids,database:'wtfiap_actor',targetBaseUrl:target.href,credentialsPath,keyringUnchanged:true,chainWrites:0}));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
