#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || {
  echo "Macaroni Companion requires Node.js 22 or newer." >&2
  exit 1
}
npm ci --omit=dev --ignore-scripts
mkdir -p data/private-assets data/private-uploads data/tmp data/private-assets/signed-operations secrets
chmod 700 data data/private-assets data/private-uploads data/tmp data/private-assets/signed-operations secrets
if [ ! -f secrets/master.key ]; then
  node -e 'require("node:fs").writeFileSync("secrets/master.key", require("node:crypto").randomBytes(32), {mode:0o600})'
fi
if [ ! -f secrets/admin.token ]; then
  node -e 'require("node:fs").writeFileSync("secrets/admin.token", require("node:crypto").randomBytes(32).toString("base64url"), {mode:0o600})'
fi
chmod 600 secrets/master.key secrets/admin.token
if [ ! -f .env ]; then
  cp .env.example .env
  node -e 'const fs=require("node:fs"),crypto=require("node:crypto");const p=".env";const digest=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("REPLACE_BY_INSTALLER",digest("contract/macaroni-v35.contract.json")).replace("REPLACE_STORAGE_BY_INSTALLER",digest("contract/macaroni-v35.storage.tz")).replace("REPLACE_TEMPLATE_BY_INSTALLER",digest("contract/macaroni-v35.template.json")),{mode:0o600})'
  chmod 600 .env
  echo "Created .env with the bundled contract, storage, and policy-template hashes. Replace URL/origin placeholders and read the required mempool disclosure in README.md."
fi
echo "Add the dedicated finalizer wallet's raw secret key to secrets/finalizer.key, then run: chmod 600 secrets/finalizer.key"
echo "Configure a creator-controlled/local RPC, IPFS, and HTTPS in .env. Run npm run doctor; start only after every check passes."
