import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionMetadata,
  buildCollectionPackage,
  buildSingleTokenPackage,
  buildTokenMetadata,
  CHEASE_PACKAGE_SCHEMA_VERSION,
  extractRelationshipMetadata,
  isCheaseCollectionPackage,
  isCheasePackage,
  isCheaseSingleTokenPackage,
  isPastaAppId,
  mergeRelationshipMetadata,
  RELATIONSHIP_METADATA_KEY,
  sanitizeRelationshipMetadata,
  validateCheasePackage,
  priceAtSupply,
  costForBatch,
  validateBondingCurve,
  buildBundleManifest,
  BUNDLE_MANIFEST_SCHEMA_VERSION,
  generateEditions,
  maxCombinations,
  traitAttributes,
  dnaOf,
  parseRecipientList,
  totalAllocation,
  isTezosAddress,
  parseTokenReferences,
  buildExhibitionMetadata,
  detectPastaContract,
  availableActions,
} from "./index";

test("sanitizeRelationshipMetadata drops blank and empty fields", () => {
  assert.equal(sanitizeRelationshipMetadata(undefined), undefined);
  assert.equal(sanitizeRelationshipMetadata({}), undefined);
  assert.equal(
    sanitizeRelationshipMetadata({ parent_contract: "   ", related_contracts: ["", "  "] }),
    undefined
  );
  assert.deepEqual(
    sanitizeRelationshipMetadata({
      parent_contract: " KT1Parent ",
      related_contracts: ["KT1A", " ", "KT1A", "KT1B"],
      ownership_chain: ["tz1Wallet", "KT1Parent"],
    }),
    {
      parent_contract: "KT1Parent",
      related_contracts: ["KT1A", "KT1B"],
      ownership_chain: ["tz1Wallet", "KT1Parent"],
    }
  );
});

test("mergeRelationshipMetadata embeds under the canonical key and round-trips", () => {
  const merged = mergeRelationshipMetadata(
    { name: "Token" } as Record<string, unknown>,
    { franchise_contract: "KT1Franchise" }
  );
  assert.equal(merged.name, "Token");
  assert.deepEqual(merged[RELATIONSHIP_METADATA_KEY], { franchise_contract: "KT1Franchise" });
  assert.deepEqual(extractRelationshipMetadata(merged), { franchise_contract: "KT1Franchise" });
});

test("mergeRelationshipMetadata omits the key when relationship is empty", () => {
  const merged = mergeRelationshipMetadata({ name: "Token" }, {});
  assert.equal(RELATIONSHIP_METADATA_KEY in merged, false);
  const stripped = mergeRelationshipMetadata(
    { name: "Token", [RELATIONSHIP_METADATA_KEY]: { parent_contract: "KT1Old" } },
    undefined
  );
  assert.equal(RELATIONSHIP_METADATA_KEY in stripped, false);
});

test("buildTokenMetadata mirrors the proven Macaroni field shape and omits undefined", () => {
  const meta = buildTokenMetadata({
    name: "My 1/1",
    description: "desc",
    symbol: "WTF",
    artifactUri: "ipfs://artifact",
    mimeType: "image/png",
    creators: ["tz1Creator", "tz1Creator"],
    tags: ["a", "a", "b"],
    attributes: [
      { name: "Color", value: "Red" },
      { name: "  ", value: "skip" },
    ],
    relationship: { parent_contract: "KT1Parent" },
  });
  assert.equal(meta.name, "My 1/1");
  assert.equal(meta.decimals, 0);
  assert.equal(meta.isBooleanAmount, false);
  assert.equal(meta.artifactUri, "ipfs://artifact");
  assert.equal(meta.displayUri, "ipfs://artifact");
  assert.equal(meta.thumbnailUri, "ipfs://artifact");
  assert.deepEqual(meta.formats, [{ uri: "ipfs://artifact", mimeType: "image/png" }]);
  assert.deepEqual(meta.creators, ["tz1Creator"]);
  assert.deepEqual(meta.tags, ["a", "b"]);
  assert.deepEqual(meta.attributes, [{ name: "Color", value: "Red" }]);
  assert.deepEqual(meta[RELATIONSHIP_METADATA_KEY], { parent_contract: "KT1Parent" });
  assert.equal("royalties" in meta, false);
});

test("buildCollectionMetadata defaults interfaces and embeds relationship", () => {
  const meta = buildCollectionMetadata({
    name: "Coll",
    imageUri: "ipfs://cover",
    relationship: { collection_group: "grp" },
  });
  assert.deepEqual(meta.interfaces, ["TZIP-012", "TZIP-016", "TZIP-021"]);
  assert.equal(meta.imageUri, "ipfs://cover");
  assert.deepEqual(meta[RELATIONSHIP_METADATA_KEY], { collection_group: "grp" });
});

test("isPastaAppId recognizes known apps only", () => {
  assert.equal(isPastaAppId("spaghetti"), true);
  assert.equal(isPastaAppId("colander"), true);
  assert.equal(isPastaAppId("macaroni"), true);
  assert.equal(isPastaAppId(42), false);
});

test("buildCollectionPackage normalizes items and tags", () => {
  const pkg = buildCollectionPackage({
    targetApp: "spaghetti",
    title: " My Collection ",
    coverImageUri: "ipfs://cover",
    items: [
      { name: " Token A ", tags: ["x", "x", "y"], artifactUri: " ipfs://a " },
      { name: "Token B", tokenId: 2 },
    ],
    relationship: { parent_contract: "KT1Parent" },
  });
  assert.equal(pkg.schemaVersion, CHEASE_PACKAGE_SCHEMA_VERSION);
  assert.equal(pkg.kind, "collection");
  assert.equal(pkg.title, "My Collection");
  assert.equal(pkg.items[0].name, "Token A");
  assert.deepEqual(pkg.items[0].tags, ["x", "y"]);
  assert.equal(pkg.items[0].artifactUri, "ipfs://a");
  assert.equal(pkg.items[1].tokenId, 2);
  assert.deepEqual(pkg.relationship, { parent_contract: "KT1Parent" });
  assert.equal(isCheaseCollectionPackage(pkg), true);
  assert.equal(isCheaseSingleTokenPackage(pkg), false);
});

test("buildSingleTokenPackage produces a valid single-token package", () => {
  const pkg = buildSingleTokenPackage({
    targetApp: "spaghetti",
    token: { name: "Solo", artifactUri: "ipfs://solo", mimeType: "image/png" },
  });
  assert.equal(pkg.kind, "single_token");
  assert.equal(pkg.token.name, "Solo");
  assert.equal(isCheaseSingleTokenPackage(pkg), true);
  assert.equal(isCheasePackage(pkg), true);
});

test("validateCheasePackage accepts well-formed packages", () => {
  const collection = buildCollectionPackage({
    targetApp: "spaghetti",
    title: "Valid",
    items: [{ name: "A" }],
  });
  assert.deepEqual(validateCheasePackage(collection), { ok: true, errors: [] });

  const single = buildSingleTokenPackage({ targetApp: "gnocchi", token: { name: "Solo" } });
  assert.deepEqual(validateCheasePackage(single), { ok: true, errors: [] });
});

test("validateCheasePackage rejects malformed packages with reasons", () => {
  assert.equal(validateCheasePackage(null).ok, false);

  const badVersion = validateCheasePackage({
    schemaVersion: "nope",
    kind: "collection",
    targetApp: "spaghetti",
    title: "T",
    items: [],
  });
  assert.equal(badVersion.ok, false);
  assert.ok(badVersion.errors.some((e) => e.includes("schemaVersion")));

  const macaroniPackage = validateCheasePackage({
    schemaVersion: CHEASE_PACKAGE_SCHEMA_VERSION,
    kind: "single_token",
    targetApp: "macaroni",
    token: { name: "x" },
  });
  assert.equal(macaroniPackage.ok, true);

  const badApp = validateCheasePackage({
    schemaVersion: CHEASE_PACKAGE_SCHEMA_VERSION,
    kind: "single_token",
    targetApp: "not-pasta",
    token: { name: "x" },
  });
  assert.equal(badApp.ok, false);
  assert.ok(badApp.errors.some((e) => e.includes("targetApp")));

  const badItems = validateCheasePackage({
    schemaVersion: CHEASE_PACKAGE_SCHEMA_VERSION,
    kind: "collection",
    targetApp: "spaghetti",
    title: "T",
    items: [{ name: "" }, { name: "ok", tokenId: "nope" }],
  });
  assert.equal(badItems.ok, false);
  assert.ok(badItems.errors.some((e) => e.includes("items[0]")));
  assert.ok(badItems.errors.some((e) => e.includes("items[1] tokenId")));
});

test("priceAtSupply steps the curve and clamps", () => {
  const flat = { base_price: 1_000_000, increment: 0 };
  assert.equal(priceAtSupply(flat, 0), 1_000_000);
  assert.equal(priceAtSupply(flat, 99), 1_000_000);

  const stepped = { base_price: 1_000_000, increment: 250_000, step_size: 5 };
  assert.equal(priceAtSupply(stepped, 0), 1_000_000);
  assert.equal(priceAtSupply(stepped, 4), 1_000_000);
  assert.equal(priceAtSupply(stepped, 5), 1_250_000);
  assert.equal(priceAtSupply(stepped, 10), 1_500_000);

  const declining = { base_price: 500_000, increment: -50_000, minimum_price: 100_000 };
  assert.equal(priceAtSupply(declining, 0), 500_000);
  assert.equal(priceAtSupply(declining, 100), 100_000); // clamped at minimum

  const capped = { base_price: 1_000_000, increment: 1_000_000, maximum_price: 3_000_000, step_size: 2 };
  assert.equal(priceAtSupply(capped, 6), 3_000_000); // clamped at maximum
});

test("costForBatch multiplies unit price by amount", () => {
  const stepped = { base_price: 1_000_000, increment: 250_000, step_size: 5 };
  assert.equal(costForBatch(stepped, 5, 3), 1_250_000 * 3);
  assert.equal(costForBatch(stepped, 5, 0), 0);
  assert.equal(costForBatch(stepped, 5, -2), 0);
});

test("validateBondingCurve rejects malformed configs", () => {
  assert.equal(validateBondingCurve({ base_price: 1_000_000, increment: 0 }).ok, true);
  assert.equal(validateBondingCurve({ base_price: -1, increment: 0 }).ok, false);
  assert.equal(validateBondingCurve({ base_price: 1.5, increment: 0 }).ok, false);
  assert.equal(
    validateBondingCurve({ base_price: 1000, increment: 0, minimum_price: 5000, maximum_price: 1000 }).ok,
    false
  );
  assert.equal(validateBondingCurve({ base_price: 1000, increment: 0, step_size: 0 }).ok, false);
});

test("buildBundleManifest cleans members and counts items", () => {
  const manifest = buildBundleManifest({
    name: "  Art Pack  ",
    description: " three pieces ",
    members: [
      { name: " Alpha ", uri: "ipfs://a", mimeType: "image/png" },
      { name: "", uri: "   " }, // dropped (nothing meaningful)
      { tokenContract: "KT1X", tokenId: 7, quantity: 2 },
    ],
    relationship: { parent_contract: " KT1P " },
  });
  assert.equal(manifest.schemaVersion, BUNDLE_MANIFEST_SCHEMA_VERSION);
  assert.equal(manifest.name, "Art Pack");
  assert.equal(manifest.description, "three pieces");
  assert.equal(manifest.mystery, false);
  assert.equal(manifest.itemCount, 2);
  assert.deepEqual(manifest.members, [
    { name: "Alpha", uri: "ipfs://a", mimeType: "image/png" },
    { tokenContract: "KT1X", tokenId: 7, quantity: 2 },
  ]);
  assert.deepEqual(manifest.relationship, { parent_contract: "KT1P" });

  const mystery = buildBundleManifest({ name: "", members: [], mystery: true });
  assert.equal(mystery.name, "Untitled Bundle");
  assert.equal(mystery.mystery, true);
  assert.equal(mystery.itemCount, 0);
  assert.equal("description" in mystery, false);
  assert.equal("relationship" in mystery, false);
});

const genLayers = [
  { name: "Background", variants: [{ value: "Blue" }, { value: "Red", weight: 3 }] },
  { name: "Eyes", variants: [{ value: "Open" }, { value: "Closed" }] },
];

test("generateEditions is deterministic for a given seed", () => {
  const a = generateEditions(genLayers, 10, "seed-1");
  const b = generateEditions(genLayers, 10, "seed-1");
  assert.deepEqual(a, b);
  assert.equal(a.length, 10);
  assert.equal(a[0].traits.length, 2);
  assert.equal(a[0].dna, dnaOf(a[0].traits));
  // A different seed should not produce an identical sequence (overwhelmingly likely).
  const c = generateEditions(genLayers, 10, "seed-2");
  assert.notDeepEqual(a, c);
});

test("generateEditions unique caps at available combinations and dedupes", () => {
  assert.equal(maxCombinations(genLayers), 4);
  const editions = generateEditions(genLayers, 50, "x", { unique: true });
  assert.equal(editions.length, 4); // only 2x2 = 4 distinct combos exist
  const dnas = new Set(editions.map((e) => e.dna));
  assert.equal(dnas.size, 4);
});

test("generateEditions handles empty layers and zero count", () => {
  assert.deepEqual(generateEditions([], 5, "s"), []);
  assert.deepEqual(generateEditions(genLayers, 0, "s"), []);
  assert.deepEqual(generateEditions([{ name: "Empty", variants: [] }], 5, "s"), []);
});

test("traitAttributes maps layer/value to TZIP-21 attributes", () => {
  const [edition] = generateEditions(genLayers, 1, "attrs");
  assert.deepEqual(traitAttributes(edition.traits), [
    { name: "Background", value: edition.traits[0].value },
    { name: "Eyes", value: edition.traits[1].value },
  ]);
});

const VALID_ADDR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const VALID_KT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

test("isTezosAddress accepts tz/KT and rejects junk", () => {
  assert.equal(isTezosAddress(VALID_ADDR), true);
  assert.equal(isTezosAddress(VALID_KT), true);
  assert.equal(isTezosAddress("tz1short"), false);
  assert.equal(isTezosAddress("0xabc"), false);
  assert.equal(isTezosAddress(""), false);
});

test("parseRecipientList parses addresses with optional amounts", () => {
  const res = parseRecipientList(`${VALID_ADDR}, 2\n${VALID_KT}`);
  assert.deepEqual(res.entries, [
    { recipient: VALID_ADDR, amount: 2 },
    { recipient: VALID_KT, amount: 1 },
  ]);
  assert.deepEqual(res.errors, []);
  assert.equal(totalAllocation(res.entries), 3);
});

test("parseRecipientList honors defaultAmount, skips comments/blanks", () => {
  const res = parseRecipientList(`# header\n\n${VALID_ADDR}`, 5);
  assert.deepEqual(res.entries, [{ recipient: VALID_ADDR, amount: 5 }]);
});

test("parseRecipientList reports bad address and bad amount lines", () => {
  const res = parseRecipientList(`not-addr, 1\n${VALID_ADDR}, 0\n${VALID_KT}, -3`);
  assert.equal(res.entries.length, 0);
  assert.equal(res.errors.length, 3);
  assert.equal(res.errors[0].line, 1);
});

test("parseRecipientList dedupes recipients keeping the last amount", () => {
  const res = parseRecipientList(`${VALID_ADDR}, 1\n${VALID_ADDR}, 9`);
  assert.deepEqual(res.entries, [{ recipient: VALID_ADDR, amount: 9 }]);
});

test("parseTokenReferences parses KT1 + token id and preserves order", () => {
  const res = parseTokenReferences(`# show\n${VALID_KT}, 7\n${VALID_KT}, 0`);
  assert.deepEqual(res.items, [
    { contract: VALID_KT, token_id: 7 },
    { contract: VALID_KT, token_id: 0 },
  ]);
  assert.deepEqual(res.errors, []);
});

test("parseTokenReferences rejects non-KT1 contracts and bad token ids", () => {
  const res = parseTokenReferences(`${VALID_ADDR}, 1\n${VALID_KT}, x`);
  assert.equal(res.items.length, 0);
  assert.equal(res.errors.length, 2);
});

test("parseTokenReferences drops exact duplicate references (first wins)", () => {
  const res = parseTokenReferences(`${VALID_KT}, 0\n${VALID_KT}, 0`);
  assert.deepEqual(res.items, [{ contract: VALID_KT, token_id: 0 }]);
});

test("buildExhibitionMetadata embeds ordered items + dedupes curators", () => {
  const meta = buildExhibitionMetadata({
    name: "Show",
    description: "d",
    statement: "s",
    curators: ["tz1a", "tz1a", "tz1b"],
    items: [
      { contract: VALID_KT, token_id: 0 },
      { contract: VALID_KT, token_id: 5 },
    ],
    revision: 1,
  }) as any;
  assert.equal(meta.name, "Show");
  assert.equal(meta.description, "d");
  assert.deepEqual(meta.interfaces, ["TZIP-016", "TZIP-021"]);
  assert.equal(meta.exhibition.itemCount, 2);
  assert.deepEqual(meta.exhibition.curators, ["tz1a", "tz1b"]);
  assert.deepEqual(meta.exhibition.items[0], { order: 0, contract: VALID_KT, tokenId: 0 });
  assert.equal(meta.exhibition.revision, 1);
});

test("buildExhibitionMetadata omits empty optional fields", () => {
  const meta = buildExhibitionMetadata({ name: "Bare", items: [] }) as any;
  assert.equal("description" in meta, false);
  assert.equal("imageUri" in meta, false);
  assert.equal("statement" in meta.exhibition, false);
  assert.equal("curators" in meta.exhibition, false);
  assert.equal("revision" in meta.exhibition, false);
});

const FA2_BASE = ["transfer", "update_operators", "balance_of", "mint", "burn"];

test("detectPastaContract identifies the standard collection", () => {
  const eps = [...FA2_BASE, "create_token", "add_minter", "remove_minter", "set_token_metadata"];
  assert.equal(detectPastaContract(eps)?.kind, "standard_collection");
});

test("detectPastaContract identifies all Macaroni contract generations over generic FA2", () => {
  const v1 = [...FA2_BASE, "set_stages", "set_allowlist", "set_paused", "reveal"];
  const v2 = [...FA2_BASE, "set_stages", "set_allowlist", "set_pause", "reveal", "replace_tokens_v2"];
  const v3 = [...FA2_BASE, "set_stages", "set_allowlist", "set_pause", "reveal_tokens_v3", "replace_tokens_v3", "finalize_inventory"];
  for (const entrypoints of [v1, v2, v3]) {
    const adapter = detectPastaContract(entrypoints)!;
    assert.equal(adapter.kind, "blind_mint_collection");
    const actions = availableActions(adapter, entrypoints);
    assert(actions.some((action) => action.id === "mint" && action.external === "macaroni"));
    assert(actions.some((action) => action.id === "reveal" && action.external === "macaroni"));
    assert(actions.some((action) => action.id === "set_stages" && action.external === "macaroni"));
  }
  assert(availableActions(detectPastaContract(v1)!, v1).some((action) => action.id === "set_paused"));
  assert(availableActions(detectPastaContract(v2)!, v2).some((action) => action.id === "set_pause"));
  const v3Reveal = availableActions(detectPastaContract(v3)!, v3).find((action) => action.id === "reveal");
  assert.equal(v3Reveal?.entrypoint, "reveal_tokens_v3");
  assert.equal(v3Reveal?.access, "admin");
});

test("detectPastaContract identifies the open edition over generic FA2", () => {
  const eps = [...FA2_BASE, "create_open_edition", "set_sale", "set_sale_active", "open_mint"];
  assert.equal(detectPastaContract(eps)?.kind, "open_edition_collection");
});

test("detectPastaContract identifies the collector-finalized generative collection", () => {
  const eps = [
    "transfer",
    "update_operators",
    "balance_of",
    "create_project",
    "reserve_iteration",
    "finalize_iteration",
    "cancel_expired_reservation",
    "set_project_active",
  ];
  const adapter = detectPastaContract(eps)!;
  assert.equal(adapter.kind, "generative_collection");
  assert(adapter.actions.some((action) => action.id === "reserve_iteration" && action.external === "rotini"));
  assert(adapter.actions.some((action) => action.id === "finalize_iteration" && action.external === "rotini"));
  assert(adapter.actions.some((action) => action.id === "cancel_expired_reservation" && !action.external));
  assert(adapter.actions.some((action) => action.id === "set_project_active"));
});

test("detectPastaContract identifies the Ravioli pack router", () => {
  const eps = [...FA2_BASE, "create_pack", "commit_recipe", "open_pack", "set_pack_contents"];
  assert.equal(detectPastaContract(eps)?.kind, "bundle_collection");
});

test("detectPastaContract identifies distribution over standard (both have create_token)", () => {
  const eps = [...FA2_BASE, "create_token", "set_allocations", "open_claim", "claim", "airdrop"];
  const adapter = detectPastaContract(eps)!;
  assert.equal(adapter.kind, "distribution");
  const claim = availableActions(adapter, eps).find((action) => action.id === "claim");
  assert.equal(claim?.access, "public");
  assert.deepEqual(claim?.inputs, [{ name: "token_id", label: "Token id", type: "nat" }]);
});

test("detectPastaContract identifies the exhibition registry (no FA2 transfer)", () => {
  const eps = ["add_curator", "remove_curator", "publish_revision", "set_current_revision"];
  assert.equal(detectPastaContract(eps)?.kind, "exhibition");
});

test("detectPastaContract falls back to generic FA2, then null", () => {
  assert.equal(detectPastaContract(["transfer", "balance_of", "update_operators"])?.kind, "generic_fa2");
  assert.equal(detectPastaContract(["totally", "unrelated"]), null);
});

test("availableActions only returns actions whose entrypoint exists", () => {
  const eps = ["transfer", "create_token", "mint"]; // no add_minter / burn / admin handoff
  const adapter = detectPastaContract(eps)!;
  const ids = availableActions(adapter, eps).map((a) => a.id);
  assert.deepEqual(ids.sort(), ["mint", "transfer"]);
});

test("fixed-edition adapters expose direct-sale management when the contract supports it", () => {
  const standardEntrypoints = [...FA2_BASE, "create_token", "set_sale", "set_sale_active", "buy"];
  const standard = detectPastaContract(standardEntrypoints)!;
  assert.deepEqual(
    availableActions(standard, standardEntrypoints).filter((action) => action.group === "sale").map((action) => action.id),
    ["set_sale", "set_sale_active"]
  );

  const bundleEntrypoints = [...FA2_BASE, "create_pack", "commit_recipe", "open_pack", "set_sale", "set_sale_active", "buy"];
  const bundle = detectPastaContract(bundleEntrypoints)!;
  assert.deepEqual(
    availableActions(bundle, bundleEntrypoints).filter((action) => action.group === "sale").map((action) => action.id),
    ["set_sale", "set_sale_active"]
  );
});

test("pack and open-edition adapters route their complete management stories", () => {
  const bundleEntrypoints = [...FA2_BASE, "create_pack", "commit_recipe", "open_pack", "set_pack_contents", "cancel_pack", "set_sale", "set_sale_active", "buy"];
  const bundleActions = availableActions(detectPastaContract(bundleEntrypoints)!, bundleEntrypoints);
  assert(bundleActions.some((action) => action.id === "open_pack" && action.external === "ravioli"));
  assert(bundleActions.some((action) => action.id === "set_pack_contents" && !action.external));
  assert(bundleActions.some((action) => action.id === "cancel_pack" && !action.external));

  const openEntrypoints = [...FA2_BASE, "create_open_edition", "set_sale", "set_sale_active", "open_mint"];
  const openActions = availableActions(detectPastaContract(openEntrypoints)!, openEntrypoints);
  assert(openActions.some((action) => action.id === "create_open_edition" && action.external === "gnocchi" && action.access === "admin"));
  assert(openActions.some((action) => action.id === "open_mint" && action.external === "gnocchi" && action.access === "public"));
  assert(openActions.some((action) => action.id === "set_sale" && action.external === "gnocchi"));
  assert(openActions.some((action) => action.id === "set_sale_active" && !action.external));
});
