$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$major = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($major -lt 22) { throw "Macaroni Companion requires Node.js 22 or newer." }
npm ci --omit=dev --ignore-scripts
New-Item -ItemType Directory -Force -Path "data/private-assets", "data/private-uploads", "data/tmp", "data/private-assets/signed-operations", "secrets" | Out-Null
if (-not (Test-Path "secrets/master.key")) {
  node -e "require('node:fs').writeFileSync('secrets/master.key', require('node:crypto').randomBytes(32), {mode: 0o600})"
}
if (-not (Test-Path "secrets/admin.token")) {
  node -e "require('node:fs').writeFileSync('secrets/admin.token', require('node:crypto').randomBytes(32).toString('base64url'), {mode: 0o600})"
}
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  node -e "const fs=require('node:fs'),crypto=require('node:crypto');const p='.env';const digest=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('REPLACE_BY_INSTALLER',digest('contract/macaroni-v35.contract.json')).replace('REPLACE_STORAGE_BY_INSTALLER',digest('contract/macaroni-v35.storage.tz')).replace('REPLACE_TEMPLATE_BY_INSTALLER',digest('contract/macaroni-v35.template.json')))"
  Write-Host "Created .env with the bundled contract, storage, and policy-template hashes. Replace URL/origin placeholders and read the required mempool disclosure in README.md."
}
icacls "secrets" /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null
Write-Host "Add the dedicated finalizer wallet's raw secret key to secrets/finalizer.key. Keep it out of every static export."
Write-Host "Configure a creator-controlled/local RPC, IPFS, and HTTPS in .env. Run npm run doctor; start only after every check passes."
