// Public assets keep their URLs across deploys, so a visual revision needs a new cache key.
export const PAUL_ASSET_VERSION = "ghost-red-glasses-20261102";

export function paulAssetUrl(path: string): string {
  return `${path}?v=${PAUL_ASSET_VERSION}`;
}
