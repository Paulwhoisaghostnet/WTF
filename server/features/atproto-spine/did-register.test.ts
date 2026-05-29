import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDid,
  didWebForHost,
  buildDidWebDocument,
  didDocServesHandle,
  plcDirectories,
  mirrorPlcOperation,
  orderedPlcOpsForReplay,
} from "./did-register";

test("parseDid handles did:web apex + path forms", () => {
  const apex = parseDid("did:web:pds.wtfos.me");
  assert.equal(apex.method, "web");
  assert.equal(apex.didDocUrl, "https://pds.wtfos.me/.well-known/did.json");

  const path = parseDid("did:web:wtfos.me:repo:master");
  assert.equal(path.method, "web");
  assert.equal(path.didDocUrl, "https://wtfos.me/repo/master/did.json");
});

test("parseDid recognizes did:plc and rejects unknown methods", () => {
  assert.equal(parseDid("did:plc:abcdefghijklmnopqrstuvwx").method, "plc");
  assert.throws(() => parseDid("did:key:zabc"), /unsupported DID method/);
});

test("didWebForHost encodes host port and path segments", () => {
  assert.equal(didWebForHost("wtfos.me"), "did:web:wtfos.me");
  assert.equal(didWebForHost("localhost:3000"), "did:web:localhost%3A3000");
  assert.equal(didWebForHost("wtfos.me", "repo", "master"), "did:web:wtfos.me:repo:master");
});

test("buildDidWebDocument advertises the PDS service and handle", () => {
  const doc = buildDidWebDocument({
    did: "did:web:pds.wtfos.me",
    handle: "os.wtfos.me",
    pdsUrl: "https://pds.wtfos.me/",
    signingKeyMultibase: "zQ3shexampleexample",
  });
  assert.equal(doc.id, "did:web:pds.wtfos.me");
  assert.ok(didDocServesHandle(doc, "os.wtfos.me"));
  const services = doc.service as Array<Record<string, unknown>>;
  assert.equal(services[0].type, "AtprotoPersonalDataServer");
  assert.equal(services[0].serviceEndpoint, "https://pds.wtfos.me");
  assert.ok(Array.isArray(doc.verificationMethod));
});

test("plcDirectories includes the mirror only when configured", () => {
  assert.deepEqual(plcDirectories({}), ["https://plc.directory"]);
  const dual = plcDirectories({
    WTFOS_PLC_PRIMARY_URL: "https://plc.directory/",
    WTFOS_PLC_MIRROR_URL: "https://plc.wtfos.me/",
  });
  assert.deepEqual(dual, ["https://plc.directory", "https://plc.wtfos.me"]);
});

test("orderedPlcOpsForReplay keeps genesis-first order, unwraps audit entries, skips junk", () => {
  // Wrapped audit entries ({ operation, cid }) and a raw op, oldest->newest. Genesis is index 0.
  const log = [
    { operation: { type: "plc_operation", n: 0 }, cid: "g" },
    null,
    { type: "plc_operation", n: 1 },
    { operation: { type: "plc_tombstone", n: 2 } },
  ];
  const ops = orderedPlcOpsForReplay(log);
  assert.equal(ops.length, 3);
  assert.equal((ops[0] as { n: number }).n, 0); // genesis first
  assert.equal((ops[1] as { n: number }).n, 1);
  assert.equal((ops[2] as { n: number }).n, 2);
  assert.deepEqual(orderedPlcOpsForReplay([]), []);
});

test("mirrorPlcOperation fans out to each directory and reports per-directory results", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: URL | string, init?: RequestInit) => {
    calls.push(String(url));
    assert.equal(init?.method, "POST");
    const fail = String(url).includes("plc.wtfos.me");
    return { ok: !fail, status: fail ? 502 : 200 } as Response;
  }) as unknown as typeof fetch;

  const results = await mirrorPlcOperation({
    did: "did:plc:abcdefghijklmnopqrstuvwx",
    operation: { type: "plc_operation", sig: "x" },
    directories: ["https://plc.directory", "https://plc.wtfos.me"],
    fetchImpl: fakeFetch,
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[1].status, 502);
  assert.ok(calls[0].endsWith("/did:plc:abcdefghijklmnopqrstuvwx"));
});
