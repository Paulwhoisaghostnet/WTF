import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sameWalletProviderNetwork } from "./wallet";

test("Octez Connect is the primary wallet path with valid featured wallet prefixes", () => {
  const source = readFileSync(new URL("./wallet.ts", import.meta.url), "utf8");
  const loaderSource = readFileSync(new URL("./loaders.ts", import.meta.url), "utf8");

  assert.match(source, /"kukai"/);
  assert.match(source, /"temple"/);
  assert.match(source, /"umami"/);
  assert.doesNotMatch(source, /"plenty"/);
  assert.doesNotMatch(source, /"ookjlbkiijinhpmnjffcofjonbfbgaoc"/);
  assert.match(source, /featuredWallets: OCTEZ_FEATURED_WALLETS/);
  assert.doesNotMatch(source, /wtf:enable-octez-connect/);
  assert.doesNotMatch(source, /isOctezConnectEnabled/);
  assert.match(source, /const octez = new OctezConnectAdapter\(\)/);
  assert.match(source, /return octez/);
  assert.match(source, /class OctezConnectTaquitoWalletProvider/);
  assert.match(source, /tezos\.setWalletProvider\(this\.getTaquitoWalletProvider\(\)\)/);
  assert.match(source, /requestOperation\(\{ operationDetails: params \}\)/);
  assert.match(source, /requestSignPayload/);
  assert.match(source, /octezSigningTypeForWatermark/);
  assert.match(source, /createTransferOperation/);
  assert.match(source, /createOriginationOperation/);
  assert.match(source, /createSetDelegateOperation/);
  assert.match(source, /createTransferTicketOperation/);
  assert.match(source, /createRegisterGlobalConstantOperation/);
  assert.match(source, /let adapterInitPromise:/);
  assert.match(source, /let connectPromise:/);
  assert.match(source, /type OctezNamedNetwork = "mainnet" \| "ghostnet" \| "shadownet"/);
  assert.match(source, /const AUTH_WALLET_NETWORK = "mainnet"/);
  assert.match(source, /const NAMED_WALLET_NETWORKS = new Set\(\["mainnet", "ghostnet", "shadownet"\]\)/);
  assert.match(source, /resolveAuthWalletConfig/);
  assert.match(source, /getRpcUrlForNetwork\(AUTH_WALLET_NETWORK\)/);
  assert.match(source, /export async function connectAuthWallet/);
  assert.match(source, /export async function signAuthPayload/);
  assert.match(source, /!NAMED_WALLET_NETWORKS\.has\(network\) && rpcUrl/);
  assert.match(source, /spec\.type = "custom"/);
  assert.match(source, /network: walletNetworkSpec\(network, rpcUrl\)/);
  assert.match(source, /enableMetrics: false/);
  assert.match(source, /preferredNetwork: preferredNetwork as any/);
  assert.match(source, /enableMetrics: false/);
  assert.match(source, /ACTIVE_ACCOUNT_SET/);
  assert.match(source, /subscribeToEvent/);
  assert.match(source, /preflightOctezExtensionHandshake/);
  assert.match(source, /WALLET_CONNECT_TIMEOUT_MS/);
  assert.match(source, /WALLET_PERMISSION_TIMEOUT_MS/);
  assert.match(source, /WALLET_SIGN_TIMEOUT_MS/);
  assert.match(source, /Wallet connection did not finish opening a provider/);
  assert.match(source, /Wallet signing did not finish/);
  assert.match(source, /NAMED_WALLET_NETWORKS/);
  assert.match(source, /spec\.type = "custom"/);
  assert.match(source, /clearWalletIndexedDbState/);
  assert.match(source, /WalletAccountMismatchError/);
  assert.match(source, /assertExpectedWalletAddress\(expectedAddress, address\);[\s\S]*await getTezos\(config\)/);
  assert.match(source, /export async function ensureWalletProviderForSend\([\s\S]*?const config = resolveWalletConfig\(options\);\s*const adapter = await ensureAdapter\(config\);/);
  assert.match(source, /WalletProviderPreflightError/);
  assert.match(source, /forcePermissions/);
  assert.match(source, /resetWalletConnectorState/);
  assert.doesNotMatch(source, /retrying via Beacon/);
  assert.doesNotMatch(source, /loadBeaconWallet/);
  assert.doesNotMatch(source, /BeaconLegacyAdapter/);
  assert.doesNotMatch(source, /BeaconWallet/);
  assert.doesNotMatch(source, /syncAccountToBeaconWallet/);
  assert.doesNotMatch(source, /providerName: "beacon"/);
  assert.match(source, /const perms = await this\.client\.requestPermissions\(\)/);
  assert.doesNotMatch(source, /if \(rpcUrl\) spec\.rpcUrl = rpcUrl/);
  assert.match(source, /\.\.\.getOctezWalletConnectOptions\(\)/);
  assert.match(loaderSource, /VITE_WALLETCONNECT_PROJECT_ID/);
  assert.match(loaderSource, /walletConnectOptions: \{ projectId \}/);
  assert.doesNotMatch(source, /removeAllPeers\(false\)/);
});

test("wallet session fixtures seed the accepted Octez provider", () => {
  const fixtureSources = [
    "../../../../tests/playwright/inventory/settings-subdomain-setup.spec.mjs",
    "../../../../tests/playwright/inventory/cobwebsaints-account.spec.mjs",
    "../../features/ux-lab/mock-wtf-lab.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  for (const source of fixtureSources) {
    assert.match(source, /"octez\.connect"/);
    assert.doesNotMatch(source, /providerName:\s*"beacon"/);
  }
});

test("Mainnet RPC fallback retains the Octez provider while the toolkit follows the RPC", () => {
  const primary = { network: "mainnet", rpcUrl: "https://tezos-mainnet.octez.io/" };
  const fallback = { network: "mainnet", rpcUrl: "https://tcinfra.net/rpc/tezos/mainnet" };
  const shadownet = { network: "shadownet", rpcUrl: "https://tezos-shadownet.octez.io/" };

  assert.equal(sameWalletProviderNetwork(primary, fallback), true);
  assert.equal(sameWalletProviderNetwork(primary, shadownet), false);
  assert.equal(sameWalletProviderNetwork(null, primary), false);
  const custom = { network: "custom-test", rpcUrl: "https://rpc-one.example/" };
  assert.equal(sameWalletProviderNetwork(custom, { ...custom }), true);
  assert.equal(sameWalletProviderNetwork(custom, { ...custom, rpcUrl: "https://rpc-two.example/" }), false);

  const source = readFileSync(new URL("./wallet.ts", import.meta.url), "utf8");
  const adapter = source.split("async function ensureAdapter(")[1]?.split("export async function getTezos(")[0];
  const toolkit = source.split("export async function getTezos(")[1]?.split("export async function withTezosRpcFallback(")[0];
  const activation = source.split("async function activateAdapterForSend(")[1]?.split("export async function ensureWalletProviderForSend(")[0];
  const connection = source.split("export async function connectWallet(")[1]?.split("export async function connectAuthWallet(")[0];
  assert.ok(adapter, "ensureAdapter remains present");
  assert.ok(toolkit, "getTezos remains present");
  assert.ok(activation, "activateAdapterForSend remains present");
  assert.ok(connection, "connectWallet remains present");
  assert.match(adapter, /sameWalletProviderNetwork\(currentAdapterConfig, config\)/);
  assert.match(adapter, /sameWalletProviderNetwork\(adapterInitConfig, config\)/);
  assert.match(toolkit, /sameWalletConfig\(tezosToolkitConfig, config\)/);
  assert.match(toolkit, /sameWalletProviderNetwork\(currentAdapterConfig, config\)/);
  assert.match(toolkit, /await currentAdapter\.setAsTaquitoProvider\(tezosToolkit\)/);
  assert.match(connection, /sameWalletProviderNetwork\(connectPromiseConfig, config\)/);
  assert.match(activation, /\(await adapter\.getActiveAccount\(\)\)\?\.address \?\? \(await requestPermissions\(\)\)/);
  assert.match(activation, /assertExpectedWalletAddress\(expectedAddress, address\);[\s\S]*?await adapter\.setAsTaquitoProvider\(toolkit\)/);
});

test("HORF horse send obtains a signer from Confirm before asynchronous eligibility reads", () => {
  const source = readFileSync(new URL("../../features/horf/HorfGifts.tsx", import.meta.url), "utf8");
  const sendStart = source.indexOf("async function sendHorse() {");
  const balanceStart = source.indexOf("const freshBalance = await readOwnedHorseBalance", sendStart);
  assert.ok(sendStart >= 0 && balanceStart > sendStart, "HORF horse send and balance preflight remain present");
  const beforeBalance = source.slice(sendStart, balanceStart);
  assert.match(beforeBalance, /await ensureWalletProviderForSend\(address,\s*\{\s*network:\s*"mainnet"\s*\}\)/);
  assert.equal(beforeBalance.match(/\bawait\s+[A-Za-z_$][\w$]*/)?.[0], "await ensureWalletProviderForSend");
});
