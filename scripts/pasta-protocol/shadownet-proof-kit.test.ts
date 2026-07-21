import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import test from "node:test";

import {
  deterministicJsonBytes,
  pinIpfsProofBytes,
  pinIpfsProofJson,
  resolveIpfsProofConfig,
} from "./shadownet-proof-kit";

const CID = "bafkreic26kagcnqlehjbf2nt6u5pqdl3os3wk3vpptabzhs4qkt2vmupba";

type ListeningServer = {
  server: Server;
  origin: string;
};

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<ListeningServer> {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
}

async function readRequest(request: IncomingMessage): Promise<Buffer<ArrayBuffer>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const result = Buffer.alloc(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    chunk.copy(result, offset);
    offset += chunk.byteLength;
  }
  return result;
}

test("deterministicJsonBytes sorts nested object keys without changing array order", () => {
  const first = {
    z: 2,
    nested: { beta: true, alpha: "one" },
    list: [{ y: 2, x: 1 }, "tail"],
    a: 1,
  };
  const second = {
    a: 1,
    list: [{ x: 1, y: 2 }, "tail"],
    nested: { alpha: "one", beta: true },
    z: 2,
  };

  const firstBytes = deterministicJsonBytes(first);
  const secondBytes = deterministicJsonBytes(second);

  assert.equal(Buffer.from(firstBytes).toString("utf8"), '{"a":1,"list":[{"x":1,"y":2},"tail"],"nested":{"alpha":"one","beta":true},"z":2}');
  assert.deepEqual(firstBytes, secondBytes);
});

test("pinIpfsProofBytes pins to Kubo and verifies exact bytes through an independent gateway", async () => {
  const payload = Buffer.from("pasta protocol local Kubo proof\n", "utf8");
  let pinRequests = 0;
  let gatewayRequests = 0;
  let pinRequestBody = Buffer.alloc(0);
  let pinAuthorization: string | undefined;
  let gatewayAuthorization: string | undefined;

  const kubo = await listen(async (request, response) => {
    pinRequests += 1;
    pinAuthorization = request.headers.authorization;
    pinRequestBody = await readRequest(request);
    const requestUrl = new URL(request.url || "/", "http://kubo.invalid");
    assert.equal(request.method, "POST");
    assert.equal(requestUrl.pathname, "/api/v0/add");
    assert.equal(requestUrl.searchParams.get("pin"), "true");
    assert.equal(requestUrl.searchParams.get("cid-version"), "1");
    assert.equal(requestUrl.searchParams.get("raw-leaves"), "true");
    assert.match(String(request.headers["content-type"] || ""), /^multipart\/form-data; boundary=/);
    response.setHeader("content-type", "application/json");
    response.end(`${JSON.stringify({ Name: "proof.txt", Hash: CID, Size: String(payload.length) })}\n`);
  });
  const gateway = await listen((request, response) => {
    gatewayRequests += 1;
    gatewayAuthorization = request.headers.authorization;
    assert.equal(request.url, `/ipfs/${CID}`);
    if (gatewayRequests === 1) {
      response.statusCode = 404;
      response.end("not propagated");
      return;
    }
    response.setHeader("content-type", "application/octet-stream");
    response.end(payload);
  });

  try {
    const result = await pinIpfsProofBytes({
      bytes: payload,
      fileName: "proof.txt",
      mimeType: "text/plain",
      options: {
        apiUrl: kubo.origin,
        localGatewayUrl: `${kubo.origin}/ipfs`,
        publicGatewayUrl: `${gateway.origin}/ipfs`,
        verifyAttempts: 2,
        verifyDelayMs: 1,
        requestTimeoutMs: 2_000,
      },
    });

    assert.equal(result.cid, CID);
    assert.equal(result.uri, `ipfs://${CID}`);
    assert.equal(result.localGatewayUrl, `${kubo.origin}/ipfs/${CID}`);
    assert.equal(result.publicGatewayUrl, `${gateway.origin}/ipfs/${CID}`);
    assert.equal(result.sha256, createHash("sha256").update(payload).digest("hex"));
    assert.equal(result.byteLength, payload.length);
    assert.equal(result.publicGatewayVerified, true);
    assert.equal(result.verificationAttempts, 2);
    assert.equal(pinRequests, 1);
    assert.equal(gatewayRequests, 2);
    assert.equal(pinAuthorization, undefined);
    assert.equal(gatewayAuthorization, undefined);
    assert.ok(pinRequestBody.includes(payload), "multipart upload should contain the exact payload bytes");
  } finally {
    await Promise.all([close(kubo.server), close(gateway.server)]);
  }
});

test("pinIpfsProofJson pins stable JSON bytes and rejects a mismatched public gateway response", async () => {
  const value = { z: "last", a: { y: 2, x: 1 } };
  const expected = deterministicJsonBytes(value);
  const kubo = await listen(async (request, response) => {
    const body = await readRequest(request);
    assert.ok(body.includes(Buffer.from(expected)), "multipart upload should contain deterministic JSON bytes");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ Hash: CID }));
  });
  const gateway = await listen((_request, response) => {
    response.statusCode = 200;
    response.end("not the pinned JSON");
  });

  try {
    await assert.rejects(
      pinIpfsProofJson({
        value,
        fileName: "metadata.json",
        options: {
          apiUrl: kubo.origin,
          localGatewayUrl: `${kubo.origin}/ipfs`,
          publicGatewayUrl: `${gateway.origin}/ipfs`,
          verifyAttempts: 1,
          requestTimeoutMs: 2_000,
        },
      }),
      /public IPFS gateway bytes differ.*expected SHA-256.*received/i,
    );
  } finally {
    await Promise.all([close(kubo.server), close(gateway.server)]);
  }
});

test("resolveIpfsProofConfig requires an independent public gateway and strips no credentials", () => {
  assert.throws(
    () => resolveIpfsProofConfig({ apiUrl: "http://user:secret@127.0.0.1:5001" }),
    /must not include credentials/,
  );
  assert.throws(
    () => resolveIpfsProofConfig({
      apiUrl: "http://127.0.0.1:5001",
      publicGatewayUrl: "http://127.0.0.1:5001/ipfs",
    }),
    /independent public gateway origin/,
  );
});

test("resolveIpfsProofConfig reads the local Kubo and gateway environment contract", () => {
  const names = [
    "PASTA_SHADOWNET_IPFS_API_URL",
    "PASTA_SHADOWNET_IPFS_LOCAL_GATEWAY",
    "PASTA_SHADOWNET_IPFS_GATEWAY",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.PASTA_SHADOWNET_IPFS_API_URL = "http://127.0.0.1:5001";
  process.env.PASTA_SHADOWNET_IPFS_LOCAL_GATEWAY = "http://127.0.0.1:8080/ipfs";
  process.env.PASTA_SHADOWNET_IPFS_GATEWAY = "https://ipfs.example.test/ipfs";
  try {
    const config = resolveIpfsProofConfig();
    assert.equal(config.apiUrl, "http://127.0.0.1:5001");
    assert.equal(config.localGatewayUrl, "http://127.0.0.1:8080/ipfs");
    assert.equal(config.publicGatewayUrl, "https://ipfs.example.test/ipfs");
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
