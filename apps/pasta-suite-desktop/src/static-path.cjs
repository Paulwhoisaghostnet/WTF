"use strict";

const path = require("node:path");

function resolveStaticPath(root, urlPath, pathApi = path) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(String(urlPath || "/").split("?")[0] || "/");
  } catch (_) {
    return null;
  }

  const normalized = pathApi.normalize(decodedPath);
  const relativeRequest = normalized.replace(/^[/\\]+/, "");
  if (relativeRequest === ".." || relativeRequest.startsWith(`..${pathApi.sep}`)) return null;

  const relativeFile = !relativeRequest || relativeRequest === "." ? "index.html" : relativeRequest;
  const fullPath = pathApi.resolve(root, relativeFile);
  const relativeToRoot = pathApi.relative(root, fullPath);
  if (
    relativeToRoot === ".." ||
    relativeToRoot.startsWith(`..${pathApi.sep}`) ||
    pathApi.isAbsolute(relativeToRoot)
  ) {
    return null;
  }
  return fullPath;
}

module.exports = { resolveStaticPath };
