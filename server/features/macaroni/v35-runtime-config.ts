const PINATA_V3_FILE_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";

function managedPinataJwt() {
  return String(
    process.env.MACARONI_V35_PINATA_JWT
    || process.env.WTFGAMESHOW_IPFS_JWT
    || process.env.WTF_GAMESHOW_IPFS_JWT
    || process.env.WTFGAMESHOW_PINATA_JWT
    || process.env.PINATA_JWT
    || process.env.PINATA_API_JWT
    || ""
  ).trim();
}

export function managedMacaroniV35CarPublisherConfig() {
  const endpoint = String(process.env.MACARONI_V35_CAR_UPLOAD_URL || "").trim();
  const token = String(process.env.MACARONI_V35_CAR_UPLOAD_TOKEN || "").trim();
  if (endpoint || token) {
    return endpoint && token
      ? { mode: "generic" as const, endpoint, token }
      : null;
  }
  const pinataToken = managedPinataJwt();
  return pinataToken
    ? { mode: "pinata_v3" as const, endpoint: PINATA_V3_FILE_UPLOAD_URL, token: pinataToken }
    : null;
}

export function managedMacaroniV35CarPublisherMode() {
  return managedMacaroniV35CarPublisherConfig()?.mode ?? null;
}
