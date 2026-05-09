import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fallbackStudioStreamMime,
  isInlineSafeStudioMime,
  quoteStudioFilenameForHeader,
  safeStudioServeMimeType,
} from "./serve-mime";

describe("studio serve MIME helpers", () => {
  it("uses image MIME fallbacks for generated derivatives", () => {
    assert.equal(
      fallbackStudioStreamMime({
        kind: "preview",
        originalMimeType: "image/png",
        hasDerivative: true,
      }),
      "image/webp"
    );
    assert.equal(
      fallbackStudioStreamMime({
        kind: "thumbnail",
        originalMimeType: "video/mp4",
        hasDerivative: true,
      }),
      "image/webp"
    );
    assert.equal(
      fallbackStudioStreamMime({
        kind: "preview",
        originalMimeType: "video/mp4",
        hasDerivative: true,
      }),
      "image/jpeg"
    );
  });

  it("keeps originals on their stored MIME and blocks executable inline types", () => {
    assert.equal(
      fallbackStudioStreamMime({
        kind: "raw",
        originalMimeType: "image/jpeg",
        hasDerivative: false,
      }),
      "image/jpeg"
    );
    assert.equal(safeStudioServeMimeType("image/svg+xml"), "application/octet-stream");
    assert.equal(safeStudioServeMimeType("text/html"), "application/octet-stream");
    assert.equal(isInlineSafeStudioMime("image/webp"), true);
    assert.equal(isInlineSafeStudioMime("application/javascript"), false);
  });

  it("sanitizes filenames for content-disposition", () => {
    assert.equal(
      quoteStudioFilenameForHeader('rough "cut"\n.png'),
      'filename="rough _cut__.png"; filename*=UTF-8\'\'rough%20_cut__.png'
    );
  });
});
