// Run with Node 22+ and OpenSSL: node <fixture> --package-root <desktop package> --output <receipt.json>
// Uses local HTTP/HTTPS fixtures only; generates and deletes its own temporary TLS key and certificate.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { parseArgs } from 'node:util';

const childConfig=process.argv[2]==='--child' ? JSON.parse(process.argv[3]) : null;
const options=childConfig ? {} : parseArgs({options:{'package-root':{type:'string'},output:{type:'string'}}}).values;
const packageRoot=childConfig?.packageRoot || options['package-root'];
if(!packageRoot) throw new Error('Pass --package-root pointing to an installed desktop package.');
const candidate=realpathSync(path.resolve(packageRoot));
const nodeBinary=process.execPath;
const payload=Buffer.from('WTF installer proxy and checksum compatibility fixture\n');
const checksum=createHash('sha256').update(payload).digest('hex');

if(process.argv[2]==='--child'){
  try {
    const config=childConfig;
    const rootRequire=createRequire(candidate+'/package.json');
    const builderRequire=createRequire(rootRequire.resolve('app-builder-lib/package.json'));
    const getEntry=builderRequire.resolve('@electron/get');
    const getRequire=createRequire(getEntry);
    const globalAgentPackage=getRequire('global-agent/package.json');
    assert.equal(globalAgentPackage.version,'4.1.3');
    const versions={electronBuilder:rootRequire('electron-builder/package.json').version,electronGet:getRequire('../../package.json').version,globalAgent:globalAgentPackage.version,node:process.versions.node};
    const getter=builderRequire('@electron/get');
    assert.equal(typeof getter.downloadArtifact,'function');
    assert.equal(typeof getter.ElectronDownloadCacheMode.WriteOnly,'number');
    let progressCalls=0;
    const download=async(name,sha=checksum)=>config.mode.startsWith('builder_') ? builderRequire('./out/util/electronGet.js').downloadElectronArtifactZip({ version:'43.8.3',platformName:'linux',arch:'arm64',artifactName:'electron',cacheDir:config.cache,electronDownload:{mirrorOptions:{resolveAssetURL:async()=>config.url},checksums:{'electron-v43.8.3-linux-arm64.zip':sha},downloadOptions:{quiet:true,retry:{limit:0}}} }) : getter.downloadArtifact({
      version:'9.9.9',artifactName:name,isGeneric:true,cacheRoot:config.cache,
      checksums:{[name]:sha},mirrorOptions:{resolveAssetURL:async()=>config.url},
      downloadOptions:{quiet:true,retry:{limit:0},getProgressCallback:()=>{progressCalls++;}},
    });
    if(config.mode==='untrusted_tls'){
      await assert.rejects(download('untrusted.bin'),e=>/SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE/.test(e.code));
      console.log(JSON.stringify({mode:config.mode,passed:true,tlsValidationRejectedUntrustedCertificate:true,...versions}));
    }else{
      const file=await download('fixture.bin');
      assert.deepEqual(readFileSync(file),payload);
      if(!config.mode.startsWith('builder_')) assert.ok(progressCalls>0);
      if(config.mode==='direct'){
        assert.equal(await download('fixture.bin'),file);
        await assert.rejects(download('mismatch.bin','0'.repeat(64)),/checksum/i);
      }
      if(config.mode!=='direct') assert.ok(global.GLOBAL_AGENT,'get3 proxy initialization must bootstrap global-agent4');
      console.log(JSON.stringify({mode:config.mode,passed:true,checksumVerified:true,progressCallbackObserved:config.mode.startsWith('builder_')?undefined:true,actualBuilderDownloadPath:config.mode.startsWith('builder_'),cacheReadAndChecksumRejection:config.mode==='direct',...versions}));
    }
    process.exit(0);
  }catch(error){ console.error(error.stack);process.exit(1); }
}else{
  const scratch=mkdtempSync(path.join(tmpdir(),'wtf-proxy-proof-'));
  const cert=path.join(scratch,'fixture-cert.pem');const key=path.join(scratch,'fixture-key.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
  let originHttp=0,originHttps=0,proxyHttp=0,proxyConnect=0;
  const sockets=new Set();
  const track=socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));};
  const respond=(req,res)=>{res.writeHead(200,{'content-type':'application/octet-stream','content-length':payload.length});res.end(payload);};
  const origin=http.createServer((req,res)=>{originHttp++;respond(req,res);});
  const secure=https.createServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{originHttps++;respond(req,res);});
  const proxy=http.createServer((req,res)=>{
    proxyHttp++;
    const target=new URL(req.url);assert.equal(target.hostname,'127.0.0.1');
    const forwarded=http.request(target,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    forwarded.on('error',e=>res.destroy(e));req.pipe(forwarded);
  });
  proxy.on('connect',(req,socket,head)=>{
    proxyConnect++;const [host,port]=req.url.split(':');assert.equal(host,'127.0.0.1');
    const upstream=net.connect(Number(port),host,()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
    track(upstream);upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
  });
  for(const server of [origin,secure,proxy]){server.on('connection',track);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));}
  const httpUrl=`http://127.0.0.1:${origin.address().port}/fixture.bin`;
  const httpsUrl=`https://127.0.0.1:${secure.address().port}/fixture.bin`;
  const proxyUrl=`http://127.0.0.1:${proxy.address().port}`;
  const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/proxy|NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS|ELECTRON_GET|GLOBAL_AGENT/i.test(key)));
  const cases=[
    {mode:'direct',url:httpUrl,env:{},expected:{originHttp:2,originHttps:0,proxyHttp:0,proxyConnect:0}},
    {mode:'http_proxy',url:httpUrl,env:{ELECTRON_GET_USE_PROXY:'1',GLOBAL_AGENT_HTTP_PROXY:proxyUrl},expected:{originHttp:1,originHttps:0,proxyHttp:1,proxyConnect:0}},
    {mode:'standard_http_proxy',url:httpUrl,env:{ELECTRON_GET_USE_PROXY:'1',HTTP_PROXY:proxyUrl},expected:{originHttp:1,originHttps:0,proxyHttp:1,proxyConnect:0}},
    {mode:'https_proxy',url:httpsUrl,env:{ELECTRON_GET_USE_PROXY:'1',GLOBAL_AGENT_HTTPS_PROXY:proxyUrl,NODE_EXTRA_CA_CERTS:cert},expected:{originHttp:0,originHttps:1,proxyHttp:0,proxyConnect:1}},
    {mode:'https_fallback_http_proxy',url:httpsUrl,env:{ELECTRON_GET_USE_PROXY:'1',GLOBAL_AGENT_HTTP_PROXY:proxyUrl,NODE_EXTRA_CA_CERTS:cert},expected:{originHttp:0,originHttps:1,proxyHttp:0,proxyConnect:1}},
    {mode:'no_proxy',url:httpUrl,env:{ELECTRON_GET_USE_PROXY:'1',GLOBAL_AGENT_HTTP_PROXY:proxyUrl,GLOBAL_AGENT_NO_PROXY:'127.0.0.1'},expected:{originHttp:1,originHttps:0,proxyHttp:0,proxyConnect:0}},
    {mode:'builder_http_proxy',url:httpUrl,env:{ELECTRON_GET_USE_PROXY:'1',HTTP_PROXY:proxyUrl},expected:{originHttp:1,originHttps:0,proxyHttp:1,proxyConnect:0}},
    {mode:'builder_https_proxy',url:httpsUrl,env:{ELECTRON_GET_USE_PROXY:'1',HTTPS_PROXY:proxyUrl,NODE_EXTRA_CA_CERTS:cert},expected:{originHttp:0,originHttps:1,proxyHttp:0,proxyConnect:1}},
    {mode:'untrusted_tls',url:httpsUrl,env:{ELECTRON_GET_USE_PROXY:'1',GLOBAL_AGENT_HTTPS_PROXY:proxyUrl},expected:{originHttp:0,originHttps:0,proxyHttp:0,proxyConnect:1}},
  ];
  const results=[];
  try{
    for(const test of cases){
      const before={originHttp,originHttps,proxyHttp,proxyConnect};
      const config={mode:test.mode,url:test.url,cache:path.join(scratch,test.mode),packageRoot:candidate};
      const output=await new Promise((resolve,reject)=>{
        const child=spawn(nodeBinary,[process.argv[1],'--child',JSON.stringify(config)],{env:{...cleanEnv,...test.env},stdio:['ignore','pipe','pipe']});
        let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
        child.on('close',code=>code===0?resolve(stdout):reject(new Error(`Fixture ${test.mode} failed: ${stderr}`)));child.on('error',reject);
      });
      const after={originHttp,originHttps,proxyHttp,proxyConnect};
      const observed=Object.fromEntries(Object.entries(after).map(([key,value])=>[key,value-before[key]]));
      assert.deepEqual(observed,test.expected,`${test.mode} must take the expected network path`);
      const result={...JSON.parse(output.trim().split('\n').at(-1)),observed};results.push(result);console.log(JSON.stringify(result));
    }
    const receipt={checkedAt:new Date().toISOString(),candidate:{electronBuilder:results[0].electronBuilder,electronGet:results[0].electronGet,globalAgent:results[0].globalAgent,node:results[0].node},testScope:'Local isolated fixtures, no production network or configuration',results};
    if(options.output) writeFileSync(options.output,JSON.stringify(receipt,null,2)+'\n');
  }finally{
    for(const socket of sockets)socket.destroy();for(const server of [origin,secure,proxy])server.close();
    rmSync(scratch,{recursive:true,force:true});
  }
}
