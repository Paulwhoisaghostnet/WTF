import { createHash } from "node:crypto";

export const JSDOS_VERSION = "8.3.20";
const JSDOS_BASE_URL = `https://v8.js-dos.com/8.xx/${JSDOS_VERSION}`;

export const JSDOS_ASSETS = [
  {
    rel: "js-dos.js",
    url: `${JSDOS_BASE_URL}/js-dos.js`,
    sha256: "d6316862834616fb120e21616b88bab6b09c1f1a4dd6eaf2b6efa83b346cfa64",
  },
  {
    rel: "js-dos.css",
    url: `${JSDOS_BASE_URL}/js-dos.css`,
    sha256: "fe68ac9154aff78ec3904cacaa6d680003cc7f112debb3f0157ed4b534f91023",
  },
  {
    rel: "emulators/emulators.js",
    url: `${JSDOS_BASE_URL}/emulators/emulators.js`,
    sha256: "9637c08567c44c4ab1de982008a0710180f5e3ab84b05745fad3fcec945e97c8",
  },
  {
    rel: "emulators/wdosbox.js",
    url: `${JSDOS_BASE_URL}/emulators/wdosbox.js`,
    sha256: "d727efe319d99ceebf4cc8f4e6b392ed0bbb687e4e1878e1261d2f04d9e7b0ba",
  },
  {
    rel: "emulators/wdosbox.wasm",
    url: `${JSDOS_BASE_URL}/emulators/wdosbox.wasm`,
    sha256: "6c3e68a2669cbde5a2b9c920e64248b15c23b38c0b6080814aff0542676b6e98",
  },
  {
    rel: "emulators/wlibzip.js",
    url: `${JSDOS_BASE_URL}/emulators/wlibzip.js`,
    sha256: "c19d0ce2ed8f686637e4abe54b374142c4d8092aa4471fd8153f97abf6436a88",
  },
  {
    rel: "emulators/wlibzip.wasm",
    url: `${JSDOS_BASE_URL}/emulators/wlibzip.wasm`,
    sha256: "cff5e8e1600ba7c589e43966613956060b4696924355714faf6b28e4c35db48f",
  },
];

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function verifyAssetIntegrity(buffer, expectedSha256, rel = "asset") {
  const actual = sha256(buffer);
  if (actual !== expectedSha256) {
    throw new Error(
      `${rel} checksum mismatch: expected ${expectedSha256}, got ${actual}`
    );
  }
  return true;
}
