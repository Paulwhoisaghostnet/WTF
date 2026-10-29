"use strict";

function isSameOrigin(value, baseUrl) {
  try {
    return Boolean(baseUrl) && new URL(value).origin === new URL(baseUrl).origin;
  } catch (_) {
    return false;
  }
}

function isTrustedMutation(headers, baseUrl) {
  if (!baseUrl) return false;
  const origin = new URL(baseUrl);
  return headers.host === origin.host && headers.origin === origin.origin;
}

module.exports = { isSameOrigin, isTrustedMutation };
