import { sha256File } from "./producer";
import type { BackupProducer, BackupTargetResult } from "./targets/base";

export async function verifyLocalArtifact(
  artifact: BackupProducer
): Promise<Pick<BackupTargetResult, "sha256Match" | "bytes">> {
  const actual = await sha256File(artifact.filepath);
  return {
    bytes: artifact.bytes,
    sha256Match: actual === artifact.sha256,
  };
}
