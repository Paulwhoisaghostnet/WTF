// Run the actual privilege-drop entrypoint in an isolated existing app image.
// No host mounts, network, keys or application environment enter the fixture.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const image = process.argv[2];
assert.ok(image, "Pass the built app image ID to test.");
const entrypoint = readFileSync(new URL("../docker-entrypoint.sh", import.meta.url), "utf8");
const fixture = `
import json, os, pathlib, socket, stat, subprocess, threading
entrypoint = ${JSON.stringify(entrypoint)}
pathlib.Path('/tmp/candidate-entrypoint.sh').write_text(entrypoint)
directory='/run/wtf'
endpoint=directory+'/operator-signer.sock'
# GID985 is the observed production signer group; the container's node is1000.
os.makedirs(directory, mode=0o770)
os.chown(directory,0,985)
os.chmod(directory,0o770)
server=socket.socket(socket.AF_UNIX)
server.bind(endpoint)
os.chown(endpoint,0,985)
os.chmod(endpoint,0o660)
server.listen()
client="""const net=require('node:net');const s=net.connect('/run/wtf/operator-signer.sock');let body='';s.on('data',d=>body+=d);s.on('end',()=>console.log(JSON.stringify({uid:process.getuid(),groups:process.getgroups(),body})));s.on('error',e=>{console.error(e.code);process.exitCode=1;});"""
def probe(command):
    return subprocess.run(command, text=True, capture_output=True, env={**os.environ,'NODE_ENV':'test'})
before=probe(['gosu','node','node','-e',client])
assert before.returncode!=0 and 'EACCES' in before.stderr, before
def answer():
    connection,_=server.accept()
    connection.sendall(b'fixture-health-ok')
    connection.close()
def expect_access(command):
    worker=threading.Thread(target=answer,daemon=True)
    worker.start()
    result=probe(command)
    assert result.returncode==0, result
    observed=json.loads(result.stdout.strip())
    assert observed['uid']==1000 and 985 in observed['groups'] and observed['body']=='fixture-health-ok', observed
    worker.join()
    return observed
first=expect_access(['/bin/sh','/tmp/candidate-entrypoint.sh','node','-e',client])
second=expect_access(['/bin/sh','/tmp/candidate-entrypoint.sh','node','-e',client])
server.close()
os.unlink(endpoint)
server=socket.socket(socket.AF_UNIX)
server.bind(endpoint)
os.chown(endpoint,0,985)
os.chmod(endpoint,0o660)
server.listen()
recreated=expect_access(['gosu','node','node','-e',client])
unrelated=probe(['gosu','nobody','node','-e',client])
assert unrelated.returncode!=0 and 'EACCES' in unrelated.stderr, unrelated
assert stat.S_IMODE(os.stat(directory).st_mode)==0o770
assert stat.S_IMODE(os.stat(endpoint).st_mode)==0o660
print(json.dumps({'before':'EACCES','after':first,'idempotent':second,'recreatedSocket':recreated,'unrelatedUser':'EACCES','directoryMode':'0770','socketMode':'0660'}))
`;
const result = spawnSync("docker", ["run", "--rm", "--network", "none", "--entrypoint", "python3", "-i", image, "-"], { input: fixture, encoding: "utf8" });
assert.equal(result.status, 0, result.stderr || result.error?.message);
const proof = JSON.parse(result.stdout.trim());
console.log(JSON.stringify({ image, ...proof }, null, 2));
