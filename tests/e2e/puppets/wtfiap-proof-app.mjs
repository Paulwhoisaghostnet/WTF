import assert from 'node:assert/strict';
import { readFile, writeFile, unlink, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';

// Own the actual local app process rather than killing arbitrary processes by
// port or PID. The signer is a separate service and is never restarted here.
export async function startWtfiapProofApp({environmentPath,cwd=process.cwd()}){
  const env=JSON.parse(await readFile(environmentPath,'utf8')),baseURL='http://127.0.0.1:4330';
  assert.equal(String(env.PORT),'4330');assert.equal(new URL(env.WTF_E2E_LIVE_BASE_URL).origin,baseURL);
  assert.equal(env.WTFIAP_ESCROW_NETWORK,'shadownet');assert.equal(env.NODE_ENV,'development');
  assert.equal(new URL(env.DATABASE_URL).pathname,'/wtfiap_actor');assert(['localhost','127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname));
  const directory=path.dirname(environmentPath),pidFile=path.join(directory,'app.pid'),logFile=path.join(directory,'app.log'),evidence=[];
  let child,exited,log,logWrites=Promise.resolve();
  async function launch(){
    const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(4330,'127.0.0.1',()=>probe.close(resolve));});
    log=await open(logFile,'a',0o600);
    child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd,env:{...process.env,...env},detached:true,stdio:['ignore','pipe','pipe']});
    const startedAt=new Date().toISOString(),pid=child.pid;
    exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
    await writeFile(pidFile,String(pid)+'\n',{mode:0o600});
    await new Promise((resolve,reject)=>{
      let buffer='',ready=false;
      const output=chunk=>{logWrites=logWrites.then(()=>log.write(chunk));if(!ready){buffer+=chunk.toString();if(buffer.includes('wtfOS running on http://localhost:4330')){ready=true;buffer='';resolve();}}};
      child.stdout.on('data',output);child.stderr.on('data',output);
      child.once('error',reject);child.once('exit',()=>{if(!ready)reject(new Error('Local app exited before readiness; inspect its private app.log'));});
    });
    const response=await fetch(baseURL+'/api/auth/csrf-token');assert(response.ok);assert.equal(typeof(await response.json()).csrfToken,'string');
    evidence.push({event:'started',pid,startedAt,readyAt:new Date().toISOString()});
  }
  async function stop(){
    if(!child)return;
    if(child.exitCode===null&&child.signalCode===null)process.kill(-child.pid,'SIGTERM');const result=await exited;
    evidence.push({event:'stopped',pid:child.pid,...result,at:new Date().toISOString()});child=null;
    await logWrites;await log.close();await unlink(pidFile);assert.equal(result.code,0,'App must flush durable rooms and exit cleanly on SIGTERM');
  }
  try{await launch();}catch(error){await stop().catch(()=>{});throw error;}
  return {baseURL,evidence,restart:async()=>{await stop();await launch();return evidence.slice(-2);},close:stop};
}
