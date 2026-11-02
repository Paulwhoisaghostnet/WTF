import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig, verifyNetwork } from "./config.mts";

dotenv.config({ path: process.env.WTF_ALEATORY_ENV_FILE, quiet: true });
const config = await verifyNetwork(readConfig());
const args = process.argv.slice(2);
const arg = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const { render, renderConfigFromEnv } = await import("../vendor/provider/render.mts");
const renderConfig = renderConfigFromEnv();
if (!renderConfig) throw new Error("Cloudflare rendering credentials are required");
const generator = arg("--generator");
const tokenId = arg("--token");
let input: Parameters<typeof render>[0];
if (generator || tokenId) {
  if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(generator ?? "") || !/^\d+$/.test(tokenId ?? "")) throw new Error("Provide --generator KT1... and --token integer together");
  const { pieceAt } = await import("../vendor/provider/provider.mts");
  const { resolveLibraries } = await import("../vendor/provider/libraries.mts");
  const { decodeParams } = await import("../vendor/src/lib/params.ts");
  const piece = await pieceAt(generator!, tokenId!);
  input = { code: piece.code, seed: piece.seed, params: decodeParams(piece.paramsSchema, piece.params), deps: await resolveLibraries(piece.libraries) };
} else {
  input = {
    seed: "wtfos-aleatory-provider-conformance-v1",
    code: `<!doctype html><html><body style="margin:0;background:#17211f"><canvas width="1000" height="1000"></canvas><script>
const c=document.querySelector('canvas').getContext('2d');
c.fillStyle='#17211f';c.fillRect(0,0,1000,1000);
for(let i=0;i<24;i++){c.fillStyle=['#90d2b5','#f5deb3','#ef8b67'][$alea.randInt(0,2)];c.beginPath();c.arc($alea.randInt(50,950),$alea.randInt(50,950),$alea.randInt(8,70),0,Math.PI*2);c.fill();}
fetch('https://example.com/wtfos-provider-network-probe').then(()=>{$alea.features({network:'allowed'});$alea.ready()}).catch(()=>{$alea.features({network:'blocked',fixture:'wtfOS provider conformance'});$alea.ready()});
</script></body></html>`,
  };
}
const first = await render(input, renderConfig);
const second = await render(input, renderConfig);
if (first.autoCaptured || second.autoCaptured) throw new Error("Artwork did not signal readiness; proof failed");
if (sha(first.png) !== sha(second.png) || JSON.stringify(first.features) !== JSON.stringify(second.features)) throw new Error("Repeated captures differ; proof failed");
if (!generator && first.features.network !== "blocked") throw new Error("Network isolation proof failed");
const directory = join(config.stateDir, "proofs", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(directory, { recursive: true, mode: 0o700 });
await writeFile(join(directory, "capture.png"), first.png);
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  network: config.network,
  generator: generator ?? null,
  tokenId: tokenId ?? null,
  sourceSha256: sha(input.code),
  pngSha256: sha(first.png),
  pngBytes: first.png.byteLength,
  browserMsUsed: [first.browserMsUsed ?? null, second.browserMsUsed ?? null],
  sameCaptureOnRepeat: true,
  features: first.features,
  signaledReadiness: true,
  chainWrites: false,
  captureFile: join(directory, "capture.png"),
};
const saveReport = () => writeFile(join(directory, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
await saveReport();
if (args.includes("--pin")) {
  if (generator) throw new Error("Pin proof uses our own diagnostic fixture, not another artist's token");
  if (!process.env.PINATA_JWT) throw new Error("Pinata credentials are required");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(first.png)], { type: "image/png" }), "wtfos-aleatory-provider-proof.png");
  form.append("pinataMetadata", JSON.stringify({ name: "wtfOS Aleatory provider infrastructure proof" }));
  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", { method: "POST", headers: { authorization: `Bearer ${process.env.PINATA_JWT}` }, body: form });
  if (!response.ok) throw new Error(`Pin proof failed: HTTP ${response.status}`);
  const result = await response.json() as { IpfsHash: string };
  if (!/^[a-zA-Z0-9]+$/.test(result.IpfsHash)) throw new Error("Invalid pin response");
  report.imageUri = `ipfs://${result.IpfsHash}`;
  await saveReport();
  const gateway = (process.env.ALEA_IPFS_GATEWAY || "https://ipfs.fileship.xyz").replace(/\/+$/, "");
  const retrieval = await fetch(`${gateway}/${result.IpfsHash}`);
  if (!retrieval.ok) throw new Error(`Pinned artifact retrieval failed: HTTP ${retrieval.status}`);
  const retrieved = new Uint8Array(await retrieval.arrayBuffer());
  if (sha(retrieved) !== sha(first.png)) throw new Error("Pinned bytes mismatch");
  report.gatewayVerified = true;
  await saveReport();
  const { buildPieceDocument } = await import("../vendor/provider/metadata.ts");
  const document = buildPieceDocument({
    generatorName: "wtfOS infrastructure proof (not minted)",
    description: "Diagnostic fixture for provider rendering, traits and IPFS delivery. No token exists for this document.",
    artist: config.operatorAddress, tokenId: 0,
    royalties: { decimals: 4, shares: {} },
    imageUri: report.imageUri as string, seed: input.seed,
    features: first.features, codeHash: sha(input.code),
  });
  const metadataResponse = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.PINATA_JWT}`, "content-type": "application/json" },
    body: JSON.stringify({ pinataContent: document, pinataMetadata: { name: "wtfOS Aleatory provider metadata proof" } }),
  });
  if (!metadataResponse.ok) throw new Error(`Metadata pin failed: HTTP ${metadataResponse.status}`);
  const metadata = await metadataResponse.json() as { IpfsHash: string };
  if (!/^[a-zA-Z0-9]+$/.test(metadata.IpfsHash)) throw new Error("Invalid metadata pin response");
  report.metadataUri = `ipfs://${metadata.IpfsHash}`;
  await saveReport();
  const metadataRetrieval = await fetch(`${gateway}/${metadata.IpfsHash}`);
  if (!metadataRetrieval.ok) throw new Error(`Metadata retrieval failed: HTTP ${metadataRetrieval.status}`);
  const retrievedDocument = await metadataRetrieval.json() as typeof document;
  const { isDeepStrictEqual } = await import("node:util");
  if (!isDeepStrictEqual(retrievedDocument, document)) throw new Error("Pinned metadata mismatch");
  report.metadataGatewayVerified = true;
}
await saveReport();
console.log(JSON.stringify(report, null, 2));
