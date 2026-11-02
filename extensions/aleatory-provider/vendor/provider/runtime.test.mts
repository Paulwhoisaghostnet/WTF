import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TezosToolkit, type Signer } from "@taquito/taquito";
import { render } from "./render.mts";
import { configureHeartbeatObserver, heartbeat, type Beat } from "./heartbeat.ts";

// These tests never load a dotenv file or use a real signing/pinning credential.
process.env.ALEA_AGENT_SK = "";
process.env.PINATA_JWT = "";
process.env.ALEA_SITE_URL = "";
process.env.ALEA_PROVIDER_ADDRESS = "KT1DGd6RcA9zKErjLurg9JGQ8txNCLoFHkmv";

const snapshot = {
    success: true,
    result: {
        screenshot: Buffer.from("local-test-png").toString("base64"),
        content:
            '<html data-alea-features="{&quot;Palette&quot;:&quot;Copper&quot;}" ' +
            'data-alea-auto-captured="0"></html>',
    },
};
const json = (value: unknown) => Response.json(value);

test("render sends the self-contained document with all browser requests rejected", async () => {
    const originalFetch = globalThis.fetch;
    let request: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
        request = JSON.parse(String(init?.body));
        return json(snapshot);
    };
    try {
        const result = await render(
            { code: "<html><head></head><body><script>$alea.ready()</script></body></html>", seed: "test-seed" },
            { accountId: "test-account", apiToken: "test-token" },
        );
        assert.deepEqual(request?.rejectRequestPattern, [".*"]);
        assert.match(String(request?.html), /connect-src 'none'/);
        assert.ok(!String(request?.html).includes("test-token"));
        assert.deepEqual(result.features, { Palette: "Copper" });
        assert.equal(result.autoCaptured, false);
        assert.equal(Buffer.from(result.png).toString(), "local-test-png");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("render reports valid Cloudflare browser milliseconds without inventing missing usage", async () => {
    const originalFetch = globalThis.fetch;
    try {
        for (const [header, expected] of [
            ["1234", 1234], ["0", 0], [" 12.5 ", 12.5],
            [undefined, undefined], ["", undefined], ["unavailable", undefined],
            ["Infinity", undefined], ["-1", undefined],
        ] as const) {
            for (const format of ["json", "image"]) {
                globalThis.fetch = async () => {
                    const headers = new Headers();
                    if (header !== undefined) headers.set("X-Browser-Ms-Used", header);
                    return format === "json"
                        ? Response.json(snapshot, { headers })
                        : new Response("local-test-png", { headers });
                };
                const result = await render(
                    { code: "<script>$alea.ready()</script>", seed: "test-seed" },
                    { accountId: "test-account", apiToken: "test-token" },
                );
                assert.equal(result.browserMsUsed, expected);
                assert.equal(Object.hasOwn(result, "browserMsUsed"), expected !== undefined);
                assert.equal(Buffer.from(result.png).toString(), "local-test-png");
                assert.deepEqual(result.features, format === "json" ? { Palette: "Copper" } : {});
                assert.equal(result.autoCaptured, false);
            }
        }
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("injected custody publishes without requesting or exporting a secret key", async () => {
    process.env.CF_ACCOUNT_ID = "test-account";
    process.env.CF_API_TOKEN = "test-token";
    const { configureRuntimeAdapters, runtimeConfiguration, handle } = await import("./provider.mts");
    assert.deepEqual(runtimeConfiguration(), { signer: false, pinning: false });

    const agent = "tz1burnburnburnburnburnburnburjAYjjX";
    let publicKeyReads = 0;
    const signer: Signer = {
        publicKeyHash: async () => { publicKeyReads++; return agent; },
        publicKey: async () => { throw new Error("A revealed test account needs no reveal"); },
        secretKey: async () => { throw new Error("Custody secrets must not be extracted"); },
        sign: async () => { throw new Error("This local test must not sign a transaction"); },
    };
    configureRuntimeAdapters({ signer });
    assert.deepEqual(runtimeConfiguration(), { signer: true, pinning: false });

    const rpcDescriptor = Object.getOwnPropertyDescriptor(TezosToolkit.prototype, "rpc")!;
    const contractDescriptor = Object.getOwnPropertyDescriptor(TezosToolkit.prototype, "contract")!;
    const originalFetch = globalThis.fetch;
    const imageCid = "Qm" + "a".repeat(44);
    const metadataCid = "Qm" + "b".repeat(44);
    let published = false;
    let confirmationRead = false;
    let pinnedDocument: Record<string, unknown> | undefined;
    Object.defineProperty(TezosToolkit.prototype, "rpc", {
        configurable: true,
        get: () => ({ getManagerKey: async (address: string) => {
            assert.equal(address, agent);
            return "already-revealed-public-key";
        } }),
    });
    Object.defineProperty(TezosToolkit.prototype, "contract", {
        configurable: true,
        get: () => ({ at: async (address: string) => {
            assert.equal(address, "KT1RXwgJuhByMw1eK2JP6FekXF7ZeexdspHw");
            return { methodsObject: { set_token_metadata: (value: { token_id: string; metadata_uri: string }) => {
                assert.equal(value.token_id, "7");
                assert.equal(Buffer.from(value.metadata_uri, "hex").toString(), `ipfs://${metadataCid}`);
                return { send: async () => {
                    published = true;
                    return { hash: "local-test-operation", confirmation: async () => { confirmationRead = true; } };
                } };
            } } };
        } }),
    });
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("/browser-rendering/snapshot")) return json(snapshot);
        if (url.endsWith("/pinFileToIPFS")) return json({ IpfsHash: imageCid });
        if (url.endsWith("/pinJSONToIPFS")) {
            pinnedDocument = JSON.parse(String(init?.body)).pinataContent;
            return json({ IpfsHash: metadataCid });
        }
        assert.ok(url.endsWith(imageCid) || url.endsWith(metadataCid), `Unexpected local fixture URL: ${url}`);
        return new Response("local gateway fixture");
    };
    try {
        const hash = await handle({
            generator: "KT1RXwgJuhByMw1eK2JP6FekXF7ZeexdspHw", tokenId: "7",
            seed: "local-test-seed", params: "", code: "<script>$alea.ready()</script>",
            codeUri: "", libraries: [], artist: agent, generatorName: "Local fixture",
            description: "", tags: [], royalties: {}, codeHash: "a".repeat(64), paramsSchema: [],
        });
        assert.equal(hash, "local-test-operation");
        assert.ok(publicKeyReads > 0);
        assert.ok(published && confirmationRead);
        assert.equal(pinnedDocument?.aleaProvider, process.env.ALEA_PROVIDER_ADDRESS);
        assert.throws(() => configureRuntimeAdapters({ signer }), /already in use/);
    } finally {
        globalThis.fetch = originalFetch;
        Object.defineProperty(TezosToolkit.prototype, "rpc", rpcDescriptor);
        Object.defineProperty(TezosToolkit.prototype, "contract", contractDescriptor);
    }
});

test("local heartbeat works without a remote URL and receives an immutable copy", () => {
    let observed: Readonly<Beat> | undefined;
    configureHeartbeatObserver((beat) => { observed = beat; });
    const input: Beat = { status: "up", msg: "rendering", ping: 12 };
    heartbeat(undefined)(input);
    assert.deepEqual(observed, input);
    assert.notEqual(observed, input);
    assert.ok(Object.isFrozen(observed));
    configureHeartbeatObserver(undefined);
});

test("failure state survives module reload under the operator state directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "alea-provider-state-test-"));
    process.env.ALEA_STATE_DIR = dir;
    try {
        const first = await import(new URL("./stuck.mts?state-test-first", import.meta.url).href) as typeof import("./stuck.mts");
        const key = first.keyFor("local-fixture", "0");
        first.recordFailure(key, "local fixture failure");
        const saved = JSON.parse(await readFile(join(dir, "stuck.json"), "utf8"));
        assert.equal(saved[key].attempts, 1);
        const reloaded = await import(new URL("./stuck.mts?state-test-reload", import.meta.url).href) as typeof import("./stuck.mts");
        assert.equal(reloaded.recordFailure(key, "second local failure").attempts, 2);
        reloaded.recordSuccess(key);
        assert.deepEqual(JSON.parse(await readFile(join(dir, "stuck.json"), "utf8")), {});
    } finally {
        delete process.env.ALEA_STATE_DIR;
        await rm(dir, { recursive: true, force: true });
    }
});
