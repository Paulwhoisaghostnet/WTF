import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const TAQUITO_VERSION = "25.0.0";
const OCTEZ_CONNECT_VERSION = "4.8.6";
const SHADOWNET_OCTEZ_RPC = "https://tezos-shadownet.octez.io/";
const MAINNET_OCTEZ_RPC = "https://tezos-mainnet.octez.io/";

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function dependencyVersion(pkg, name) {
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? pkg.overrides?.[name];
}

function lockVersion(lockPath, packageName) {
  const lock = readJson(lockPath);
  return lock.packages?.[`node_modules/${packageName}`]?.version;
}

test("Tezos wallet packages use the current U025/Octez Connect baseline", () => {
  const rootPackage = readJson("package.json");
  for (const packageName of [
    "@taquito/beacon-wallet",
    "@taquito/taquito",
    "@taquito/tzip12",
    "@taquito/tzip16",
    "@taquito/utils",
  ]) {
    assert.equal(dependencyVersion(rootPackage, packageName), `^${TAQUITO_VERSION}`);
  }
  assert.equal(dependencyVersion(rootPackage, "@tezos-x/octez.connect-sdk"), `^${OCTEZ_CONNECT_VERSION}`);

  for (const packageName of [
    "@taquito/http-utils",
    "@taquito/local-forging",
    "@taquito/michel-codec",
    "@taquito/michelson-encoder",
    "@taquito/rpc",
    "@taquito/signer",
    "@taquito/core",
  ]) {
    assert.equal(rootPackage.overrides?.[packageName], TAQUITO_VERSION);
  }

  const ppPackage = readJson("PP/package.json");
  assert.equal(dependencyVersion(ppPackage, "@taquito/taquito"), `^${TAQUITO_VERSION}`);
  assert.equal(dependencyVersion(ppPackage, "@taquito/utils"), `^${TAQUITO_VERSION}`);
  assert.equal(dependencyVersion(ppPackage, "@tezos-x/octez.connect-sdk"), `^${OCTEZ_CONNECT_VERSION}`);
  assert.equal(dependencyVersion(ppPackage, "@ecadlabs/beacon-types"), undefined);
  assert.equal(dependencyVersion(ppPackage, "@taquito/beacon-wallet"), undefined);

  const operatorPackage = readJson("extensions/wtf-operator-signer/package.json");
  assert.equal(dependencyVersion(operatorPackage, "@taquito/signer"), `^${TAQUITO_VERSION}`);
  assert.equal(dependencyVersion(operatorPackage, "@taquito/taquito"), `^${TAQUITO_VERSION}`);
});

test("Tezos lockfiles resolve the audited package versions", () => {
  assert.equal(lockVersion("package-lock.json", "@taquito/taquito"), TAQUITO_VERSION);
  assert.equal(lockVersion("package-lock.json", "@taquito/beacon-wallet"), TAQUITO_VERSION);
  assert.equal(lockVersion("package-lock.json", "@tezos-x/octez.connect-sdk"), OCTEZ_CONNECT_VERSION);

  assert.equal(lockVersion("PP/package-lock.json", "@taquito/taquito"), TAQUITO_VERSION);
  assert.equal(lockVersion("PP/package-lock.json", "@tezos-x/octez.connect-sdk"), OCTEZ_CONNECT_VERSION);
  assert.equal(lockVersion("PP/package-lock.json", "@ecadlabs/beacon-types"), undefined);
  assert.equal(lockVersion("PP/package-lock.json", "@taquito/beacon-wallet"), undefined);

  assert.equal(
    lockVersion("extensions/wtf-operator-signer/package-lock.json", "@taquito/taquito"),
    TAQUITO_VERSION
  );
  assert.equal(
    lockVersion("extensions/wtf-operator-signer/package-lock.json", "@taquito/signer"),
    TAQUITO_VERSION
  );
});

test("active wallet layers use Octez Connect transport instead of Beacon provider bridges", () => {
  const appWallet = readText("client/src/lib/tezos/wallet.ts");
  assert.match(appWallet, /class OctezConnectTaquitoWalletProvider/);
  assert.match(appWallet, /tezos\.setWalletProvider\(this\.getTaquitoWalletProvider\(\)\)/);
  assert.match(appWallet, /requestOperation\(\{ operationDetails: params \}\)/);
  assert.match(appWallet, /requestSignPayload/);
  assert.doesNotMatch(appWallet, /loadBeaconWallet/);
  assert.doesNotMatch(appWallet, /BeaconLegacyAdapter/);
  assert.doesNotMatch(appWallet, /BeaconWallet/);
  assert.doesNotMatch(appWallet, /syncAccountToBeaconWallet/);

  const ppWallet = readText("PP/src/features/tezos/walletService.ts");
  assert.match(ppWallet, /class OctezTaquitoWalletProvider/);
  assert.match(ppWallet, /new DAppClient/);
  assert.match(ppWallet, /requestOperation\(\{ operationDetails: params \}\)/);
  assert.doesNotMatch(ppWallet, /@ecadlabs/);
  assert.doesNotMatch(ppWallet, /@taquito\/beacon-wallet/);
  assert.doesNotMatch(ppWallet, /BeaconWallet/);
});

test("active Tezos defaults prefer Octez mainnet and Shadownet endpoints", () => {
  const deploySource = readText("contracts/wtf-subdomains/deploy.ts");
  assert.match(deploySource, new RegExp(SHADOWNET_OCTEZ_RPC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(deploySource, /rpc\.ghostnet\.teztnets\.com/);

  const domainBotConfig = readText("extensions/wtf-domain-bot/src/config.ts");
  assert.match(domainBotConfig, /optionalEnv\("TEZOS_NETWORK", "shadownet"\)/);
  assert.match(domainBotConfig, /rpcUrl: "https:\/\/tezos-shadownet\.octez\.io\/"/);

  const domainBotEnv = readText("extensions/wtf-domain-bot/.env.example");
  assert.match(domainBotEnv, /TEZOS_NETWORK=shadownet/);

  const contractFactory = readText("client/src/pages/ContractFactory.tsx");
  assert.match(contractFactory, /useState<Network>\("shadownet"\)/);
  assert.match(contractFactory, /Ghostnet \(legacy test\)/);

  const buybackRoute = readText("server/routes/buyback-windows.ts");
  assert.match(
    buybackRoute,
    /z\.enum\(\["shadownet", "ghostnet", "mainnet"\]\)\.default\("shadownet"\)/
  );

  const recaptureSchema = readText("shared/schema-recapture.ts");
  assert.match(
    recaptureSchema,
    /collectionContractNetworkEnum\("network"\)\.default\("shadownet"\)\.notNull\(\)/
  );

  const legacyPause = readText("scripts/marketplace-v2/legacy-marketplace-pause.ts");
  assert.match(legacyPause, new RegExp(MAINNET_OCTEZ_RPC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(legacyPause, /api\.tez\.ie/);
});

test("static Tezos browser bundles carry U025 support and no stale Taquito icon URL", () => {
  const vendorFiles = [
    "public/creation-tools/macaroni/vendor/tezos.js",
    "public/creation-tools/gnocchi/vendor/tezos.js",
    "public/creation-tools/lasagna/vendor/tezos.js",
    "public/creation-tools/penne/vendor/tezos.js",
    "public/creation-tools/ravioli/vendor/tezos.js",
    "public/creation-tools/rotini/vendor/tezos.js",
    "public/creation-tools/spaghetti/vendor/tezos.js",
  ];

  for (const filePath of vendorFiles) {
    const source = readText(filePath);
    assert.match(source, /PsUshuai9/);
    assert.match(source, new RegExp(TAQUITO_VERSION.replaceAll(".", "\\.")));
    assert.doesNotMatch(source, /version:[`"']24\.3\.0/);
  }

  const octezVendor = readText("public/creation-tools/macaroni/vendor/octez-connect.js");
  assert.match(octezVendor, /MacaroniOctezConnect/);
  assert.match(octezVendor, /getDAppClientInstance/);
  assert.match(octezVendor, /beacon-node-1\.octez\.io/);

  const particleAssetsDir = path.join(root, "public/creation-tools/particle-painter/assets");
  assert.ok(existsSync(particleAssetsDir), "Particle Painter production assets should be present");
  const particleBundle = readdirSync(particleAssetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(path.join(particleAssetsDir, name), "utf8"))
    .join("\n");
  assert.match(particleBundle, /PsUshuai9/);
  assert.match(particleBundle, new RegExp(TAQUITO_VERSION.replaceAll(".", "\\.")));
  assert.doesNotMatch(particleBundle, /version:[`"']24\.3\.0/);
  assert.doesNotMatch(particleBundle, /tezostaquito\.io/);
});
