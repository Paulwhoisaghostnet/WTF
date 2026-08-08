import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMichelsonScriptCodeIdentity,
  assertMichelsonSemanticScriptCodeIdentity,
  canonicalMichelsonScriptCode,
  hashMichelsonSemanticScriptCode,
  hashMichelsonScriptCode,
} from "./pasta-michelson-script-identity";

const parameter = { prim: "parameter", args: [{ prim: "unit" }] };
const storage = { prim: "storage", args: [{ prim: "nat" }] };
const code = { prim: "code", args: [[{ prim: "CAR" }, { prim: "NIL", args: [{ prim: "operation" }] }, { prim: "PAIR" }]] };
const alphaView = {
  prim: "view",
  args: [{ string: "alpha" }, { prim: "unit" }, { prim: "nat" }, [{ prim: "CDR" }]],
};

test("canonical Michelson identity ignores protocol top-level section reordering", () => {
  const artifact = [storage, parameter, code, alphaView];
  const rpc = [alphaView, parameter, storage, code];
  assert.equal(hashMichelsonScriptCode(artifact), hashMichelsonScriptCode(rpc));
  assert.equal(assertMichelsonScriptCodeIdentity(rpc, artifact, "drift"), hashMichelsonScriptCode(artifact));
});

test("canonical Michelson identity ignores JSON object-key ordering only", () => {
  const reorderedParameter = { args: [{ args: [], prim: "unit" }], prim: "parameter" };
  const originalParameter = { prim: "parameter", args: [{ prim: "unit", args: [] }] };
  assert.equal(
    hashMichelsonScriptCode([originalParameter, storage, code]),
    hashMichelsonScriptCode([code, reorderedParameter, storage]),
  );
});

test("canonical Michelson identity preserves nested instruction ordering", () => {
  const mutatedCode = { prim: "code", args: [[{ prim: "NIL", args: [{ prim: "operation" }] }, { prim: "CAR" }, { prim: "PAIR" }]] };
  assert.throws(
    () => assertMichelsonScriptCodeIdentity([parameter, storage, mutatedCode], [parameter, storage, code], "instruction drift"),
    /instruction drift/,
  );
});

test("canonical Michelson identity rejects malformed and duplicate sections", () => {
  assert.throws(() => canonicalMichelsonScriptCode([parameter, storage]), /section array/);
  assert.throws(() => canonicalMichelsonScriptCode([parameter, parameter, storage, code]), /exactly one parameter/);
  assert.throws(() => canonicalMichelsonScriptCode([parameter, storage, code, alphaView, alphaView]), /must be unique/);
  assert.throws(
    () => canonicalMichelsonScriptCode([parameter, storage, code, { prim: "view", args: [{ string: "" }] }]),
    /empty name/,
  );
});

test("semantic Michelson identity accepts only typed timestamp protocol normalization", () => {
  const artifactCode = {
    prim: "code",
    args: [[
      { prim: "PUSH", args: [{ prim: "timestamp" }, { string: "1970-01-01T00:00:00Z" }] },
      { prim: "DROP" },
      { prim: "NIL", args: [{ prim: "operation" }] },
      { prim: "PAIR" },
    ]],
  };
  const rpcCode = {
    prim: "code",
    args: [[
      { prim: "PUSH", args: [{ prim: "timestamp" }, { int: "0" }] },
      { prim: "DROP" },
      { prim: "NIL", args: [{ prim: "operation" }] },
      { prim: "PAIR" },
    ]],
  };
  assert.notEqual(
    hashMichelsonScriptCode([parameter, storage, artifactCode]),
    hashMichelsonScriptCode([parameter, storage, rpcCode]),
  );
  assert.equal(
    assertMichelsonSemanticScriptCodeIdentity(
      [parameter, storage, rpcCode],
      [parameter, storage, artifactCode],
      "timestamp representation drift",
    ),
    hashMichelsonSemanticScriptCode([parameter, storage, artifactCode]),
  );
});

test("semantic Michelson identity rejects changed timestamps and untyped string/integer drift", () => {
  const scriptWithPush = (type: string, literal: Record<string, string>) => [
    parameter,
    storage,
    {
      prim: "code",
      args: [[
        { prim: "PUSH", args: [{ prim: type }, literal] },
        { prim: "DROP" },
        { prim: "NIL", args: [{ prim: "operation" }] },
        { prim: "PAIR" },
      ]],
    },
  ];
  assert.throws(
    () => assertMichelsonSemanticScriptCodeIdentity(
      scriptWithPush("timestamp", { int: "1" }),
      scriptWithPush("timestamp", { string: "1970-01-01T00:00:00Z" }),
      "changed timestamp",
    ),
    /changed timestamp/,
  );
  assert.throws(
    () => assertMichelsonSemanticScriptCodeIdentity(
      scriptWithPush("string", { int: "0" }),
      scriptWithPush("string", { string: "1970-01-01T00:00:00Z" }),
      "untyped representation drift",
    ),
    /untyped representation drift/,
  );
});
