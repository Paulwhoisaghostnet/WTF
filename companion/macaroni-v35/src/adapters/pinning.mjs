import { openAsBlob } from "node:fs";
import path from "node:path";
import { verifyCar } from "../private-staging.mjs";

async function checkedCar(carPath, expectedCid) {
  const verified = await verifyCar(carPath, expectedCid);
  if (!verified.valid) throw new Error("CAR root does not match the precommitted CID");
  return openAsBlob(carPath, { type: "application/vnd.ipld.car" });
}

export class KuboCarPinningAdapter {
  constructor(apiUrl, publicGatewayUrl) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.publicGatewayUrl = publicGatewayUrl.replace(/\/$/, "");
  }
  async publishCommittedCar({ carPath, expectedCid }) {
    const body = new FormData();
    body.set("file", await checkedCar(carPath, expectedCid), path.basename(carPath));
    const response = await fetch(`${this.apiUrl}/api/v0/dag/import?pin-roots=true`, { method: "POST", body });
    const text = await response.text();
    if (!response.ok) throw new Error(`Kubo CAR import failed with HTTP ${response.status}`);
    if (!text.includes(expectedCid)) throw new Error("Kubo did not acknowledge the precommitted CAR root");
    return { cid: expectedCid };
  }

  async verifyPublishedCid(expectedCid) {
    const response = await fetch(`${this.apiUrl}/api/v0/pin/ls?arg=${encodeURIComponent(expectedCid)}&type=recursive`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(`Kubo recursive pin verification failed with HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.Keys?.[expectedCid]) throw new Error("Kubo does not report the committed CID as recursively pinned");
    return verifyGateway(this.publicGatewayUrl, expectedCid);
  }
}

export class ExternalCarPinningAdapter {
  constructor(url, token, publicGatewayUrl) {
    this.url = url;
    this.token = token;
    this.publicGatewayUrl = publicGatewayUrl.replace(/\/$/, "");
  }
  async publishCommittedCar({ carPath, expectedCid }) {
    const body = new FormData();
    body.set("file", await checkedCar(carPath, expectedCid), path.basename(carPath));
    body.set("expectedRoot", expectedCid);
    const response = await fetch(this.url, { method: "POST", headers: { authorization: `Bearer ${this.token}` }, body });
    if (!response.ok) throw new Error(`CAR provider failed with HTTP ${response.status}`);
    const result = await response.json();
    if (result.cid !== expectedCid) throw new Error("CAR provider returned a root that differs from the commitment");
    return { cid: expectedCid };
  }


  async verifyPublishedCid(expectedCid) {
    return verifyGateway(this.publicGatewayUrl, expectedCid);
  }
}

async function verifyGateway(baseUrl, expectedCid) {
  const normalized = String(baseUrl || "").replace(/\/+$/, "");
  const gatewayBases = [
    normalized,
    "https://ipfs.fileship.xyz",
    "https://nftstorage.link/ipfs",
    "https://w3s.link/ipfs",
    "https://gateway.pinata.cloud/ipfs",
    "https://dweb.link/ipfs",
    "https://cf-ipfs.com/ipfs",
    "https://ipfs.io/ipfs",
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  let lastStatus = 0;
  for (const gatewayBase of gatewayBases) {
    const directRoot = gatewayBase === "https://ipfs.fileship.xyz";
    const url = directRoot
      ? `${gatewayBase}/${encodeURIComponent(expectedCid)}`
      : `${gatewayBase.replace(/\/ipfs$/i, "")}/ipfs/${encodeURIComponent(expectedCid)}`;
    try {
      const response = await fetch(url, {
        headers: { range: "bytes=0-0" },
        redirect: "follow",
      });
      lastStatus = response.status;
      const available = response.ok || response.status === 206;
      await response.body?.cancel().catch(() => undefined);
      if (available) return { cid: expectedCid, public: true };
    } catch {
      // Continue through the independent public gateways.
    }
  }
  throw new Error(`Public IPFS gateways could not retrieve the committed CID${lastStatus ? ` (last HTTP ${lastStatus})` : ""}`);
}

export function createPinningAdapter(config) {
  if (config.adapter === "kubo") return new KuboCarPinningAdapter(config.kuboApi, config.publicGatewayUrl);
  if (config.adapter === "external-car") return new ExternalCarPinningAdapter(config.carUploadUrl, config.carUploadToken, config.publicGatewayUrl);
  throw new Error("No CAR-capable pinning adapter is configured");
}
