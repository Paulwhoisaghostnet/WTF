export type WellKnownPinDiscoveryBinding = {
  publicDiscoveryEnabled?: boolean | null;
  repoDid?: string | null;
  pinManifestRecordUri?: string | null;
};

const DID_RE = /^did:[a-z0-9]+:[^\s/]+$/i;

export function isWellKnownPinDiscoveryReady(binding: WellKnownPinDiscoveryBinding | null | undefined): boolean {
  if (!binding?.publicDiscoveryEnabled) return false;
  const repoDid = String(binding.repoDid || "").trim();
  const manifestUri = String(binding.pinManifestRecordUri || "").trim();
  if (!DID_RE.test(repoDid)) return false;
  const prefix = `at://${repoDid}/app.wtfos.media.pinManifest/`;
  return manifestUri.length > prefix.length && manifestUri.startsWith(prefix);
}
