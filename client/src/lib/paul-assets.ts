// Public assets keep their URLs across deploys, so a visual revision needs a new cache key.
export const PAUL_ASSET_VERSION = "ghost-portrait-20261103";

export function paulAssetUrl(path: string): string {
  return `${path}?v=${PAUL_ASSET_VERSION}`;
}
