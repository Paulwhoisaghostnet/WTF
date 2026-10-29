import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, link, mkdir, open, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { RECOVERY_VERSION, regenerateEntropyChain } from "./protocol.mjs";

const MAGIC_V1 = Buffer.from("MACV35E1");
const MAGIC_V2 = Buffer.from("MACV35E2");

async function keyFromFile(filePath) {
  const bytes = await readFile(filePath);
  if (bytes.byteLength < 32) throw new Error("master key file must contain at least 32 bytes");
  return createHash("sha256").update(bytes).digest();
}

function sha256Tap(hash) {
  return new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
}

export async function encryptPrivateStream(input) {
  const key = await keyFromFile(input.masterKeyFile);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const hash = createHash("sha256");
  await mkdir(path.dirname(input.destinationPath), { recursive: true, mode: 0o700 });
  const partial = `${input.destinationPath}.partial-${randomUUID()}`;
  try {
    await writeFile(partial, Buffer.concat([MAGIC_V2, iv]), { flag: "wx", mode: 0o600 });
    await pipeline(
      input.source,
      sha256Tap(hash),
      cipher,
      createWriteStream(partial, { flags: "a", mode: 0o600 })
    );
    await appendFile(partial, cipher.getAuthTag());
    await link(partial, input.destinationPath);
    return {
      encryptedPath: input.destinationPath,
      keyVersion: input.keyVersion,
      plaintextSha256: hash.digest("hex"),
    };
  } finally {
    await unlink(partial).catch(() => undefined);
  }
}

export async function encryptPrivateFile(input) {
  return encryptPrivateStream({ ...input, source: createReadStream(input.sourcePath) });
}

export async function decryptPrivateFileToPath(input) {
  const key = await keyFromFile(input.masterKeyFile);
  const info = await stat(input.encryptedPath);
  if (info.size < MAGIC_V2.length + 12 + 16) throw new Error("invalid encrypted private asset");
  const handle = await open(input.encryptedPath, "r");
  let header;
  let tag;
  try {
    header = Buffer.alloc(MAGIC_V2.length + 12);
    tag = Buffer.alloc(16);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, info.size - tag.length);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, MAGIC_V2.length).equals(MAGIC_V2)) throw new Error("invalid encrypted private asset");
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC_V2.length));
  decipher.setAuthTag(tag);
  await mkdir(path.dirname(input.destinationPath), { recursive: true, mode: 0o700 });
  const partial = `${input.destinationPath}.partial-${randomUUID()}`;
  try {
    await pipeline(
      createReadStream(input.encryptedPath, {
        start: MAGIC_V2.length + 12,
        end: info.size - 17,
      }),
      decipher,
      createWriteStream(partial, { flags: "wx", mode: 0o600 })
    );
    await link(partial, input.destinationPath);
    return { plaintextPath: input.destinationPath };
  } finally {
    await unlink(partial).catch(() => undefined);
  }
}

export async function encryptPrivateBytes(input) {
  const key = await keyFromFile(input.masterKeyFile);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(input.plaintext);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const payload = Buffer.concat([MAGIC_V1, iv, cipher.getAuthTag(), ciphertext]);
  await mkdir(path.dirname(input.destinationPath), { recursive: true, mode: 0o700 });
  await writeFile(input.destinationPath, payload, { flag: "wx", mode: 0o600 });
  return {
    encryptedPath: input.destinationPath,
    keyVersion: input.keyVersion,
    plaintextSha256: createHash("sha256").update(plaintext).digest("hex"),
  };
}

export async function decryptPrivateFile(input) {
  const key = await keyFromFile(input.masterKeyFile);
  const payload = await readFile(input.encryptedPath);
  if (payload.subarray(0, MAGIC_V1.length).equals(MAGIC_V1)) {
    const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(8, 20));
    decipher.setAuthTag(payload.subarray(20, 36));
    return Buffer.concat([decipher.update(payload.subarray(36)), decipher.final()]);
  }
  if (payload.subarray(0, MAGIC_V2.length).equals(MAGIC_V2)) {
    const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(8, 20));
    decipher.setAuthTag(payload.subarray(payload.length - 16));
    return Buffer.concat([decipher.update(payload.subarray(20, payload.length - 16)), decipher.final()]);
  }
  throw new Error("invalid encrypted private asset");
}

export function generateEntropyChain(physicalSupply, random = randomBytes) {
  if (!Number.isSafeInteger(physicalSupply) || physicalSupply < 1) throw new Error("physical supply must be fixed first");
  const seed = random(32);
  if (seed.byteLength !== 32) throw new Error("CSPRNG must return 32 bytes");
  return { seed, ...regenerateEntropyChain({ seed, length: physicalSupply }) };
}

export async function encryptEntropyForKeyring(input) {
  return encryptPrivateBytes({
    plaintext: Buffer.from(JSON.stringify({
      recoveryVersion: input.chain.recoveryVersion,
      seed: input.chain.seed.toString("base64url"),
      publicHead: input.chain.publicHead,
      chainLength: input.chain.chainLength,
    })),
    destinationPath: path.join(input.privateAssetDir, `${input.dropRef}.entropy.enc`),
    masterKeyFile: input.masterKeyFile,
    keyVersion: input.keyVersion,
  });
}

export async function recoverEntropyFromKeyring(input) {
  const decoded = JSON.parse((await decryptPrivateFile({
    encryptedPath: input.encryptedPath,
    masterKeyFile: input.masterKeyFile,
  })).toString("utf8"));
  const seed = Buffer.from(decoded.seed || "", "base64url");
  const regenerated = regenerateEntropyChain({ seed, length: decoded.chainLength });
  if (decoded.recoveryVersion !== RECOVERY_VERSION
    || decoded.publicHead !== input.expectedHead
    || decoded.chainLength !== input.expectedLength
    || regenerated.publicHead !== input.expectedHead) {
    throw new Error("Encrypted entropy recovery does not match the committed public head and length");
  }
  return { seed, ...regenerated };
}

export async function encryptJsonFile(input) {
  return encryptPrivateBytes({
    plaintext: Buffer.from(JSON.stringify(input.value)),
    destinationPath: input.destinationPath,
    masterKeyFile: input.masterKeyFile,
    keyVersion: input.keyVersion,
  });
}

export async function decryptJsonFile(input) {
  return JSON.parse((await decryptPrivateFile(input)).toString("utf8"));
}

export async function removePrivateFile(filePath) {
  await rm(filePath, { force: true });
}
