#!/usr/bin/env node

const publicUrl = (
  process.env.KILN_PUBLIC_URL ||
  "https://kiln.wtfgameshow.app"
).replace(/\/+$/, "");

const protectedPath =
  process.env.KILN_PROTECTED_PROBE_PATH || "/api/kiln/workflow/run";

async function main() {
  const url = `${publicUrl}${protectedPath}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "wtf-deploy-kiln-auth-check",
    },
    body: JSON.stringify({
      source: "deploy-auth-check",
      dryRun: true,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    console.log(
      `[kiln-auth] protected mutation rejected unauthenticated request (${response.status})`
    );
    return;
  }

  const body = await response.text().catch(() => "");
  console.error(
    `[kiln-auth] ERROR: ${url} returned HTTP ${response.status}; expected 401/403 without an auth token.`
  );
  if (body) console.error(body.slice(0, 500));
  process.exit(1);
}

main().catch((error) => {
  console.error("[kiln-auth] ERROR:", error);
  process.exit(1);
});
