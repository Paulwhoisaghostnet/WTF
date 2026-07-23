export type KilnAssertionKind = "storage" | "balance" | "big_map";

export type KilnAssertion = {
  id: string;
  kind: KilnAssertionKind;
  contractId: string;
  targetContractAddress?: string;
  afterStep: string;
  description: string;
  path?: string;
  bigMap?: string;
  key?: unknown;
  expected?: unknown;
  expectedMutez?: string;
};

export type InAppMarketAssertionParams = {
  dummyWtfAddress: string;
  paymentTokenAddress?: string;
  marketAddress: string;
  walletAAddress: string;
  walletBAddress: string;
  mintAmountWtfUnits: string;
  purchaseAmountWtfUnits: string;
  purchaseStepLabel: string;
  expectedVersion?: string;
  initialBuyerWtfUnits?: string;
  initialTreasuryWtfUnits?: string;
  purchaseDebitsBuyer?: boolean;
};

export type InAppRedemptionAssertionParams = {
  dummyWtfAddress: string;
  redemptionAddress: string;
  walletAAddress: string;
  walletBAddress: string;
  expectedAdminAddress?: string;
  expectedIssuerAddress?: string;
  fundedAmountWtfUnits: string;
  claimedAmountWtfUnits: string;
  expectedBuyerWtfUnits?: string;
  finalStepLabel: string;
};

export type MarketplaceV2AssertionParams = {
  dummyWtfAddress: string;
  sampleFa2Address: string;
  marketAddress: string;
  walletAAddress: string;
  walletBAddress: string;
  finalStepLabel: string;
  expectedBuyerWtfUnits: string;
  expectedBuyerSampleFa2Units: string;
};

export type WtfXtzExchangeAssertionParams = {
  wtfTokenAddress: string;
  exchangeAddress: string;
  walletAAddress: string;
  walletBAddress: string;
  finalStepLabel: string;
  expectedExchangeBalanceMutez: string;
  expectedOwnerWtfUnits: string;
  expectedBuyerWtfUnits: string;
};

export const REQUIRED_KILN_ASSERTION_KINDS: KilnAssertionKind[] = [
  "storage",
  "balance",
  "big_map",
];

function normalizeKind(value: unknown): KilnAssertionKind | null {
  const raw = String(value ?? "").toLowerCase().replace(/-/g, "_");
  if (raw === "storage") return "storage";
  if (raw === "balance") return "balance";
  if (raw === "big_map" || raw === "bigmap") return "big_map";
  return null;
}

function truthy(value: unknown): boolean {
  return (
    value === true ||
    value === "true" ||
    value === "1" ||
    value === "passed" ||
    value === "success" ||
    value === "ok"
  );
}

function assertionPassed(entry: any): boolean {
  return truthy(entry?.passed ?? entry?.ok ?? entry?.success ?? entry?.status ?? entry?.result);
}

function collectAssertionEntries(value: unknown, entries: any[] = []): any[] {
  if (!value || typeof value !== "object") return entries;
  if (Array.isArray(value)) {
    for (const item of value) collectAssertionEntries(item, entries);
    return entries;
  }

  const record = value as Record<string, unknown>;
  const directKind = normalizeKind(record.kind ?? record.type ?? record.assertionKind);
  if (directKind) entries.push(record);

  for (const [key, child] of Object.entries(record)) {
    if (key === "assertions" && Array.isArray(child)) {
      entries.push(...child);
      for (const item of child) collectAssertionEntries(item, entries);
    } else if (child && typeof child === "object") {
      collectAssertionEntries(child, entries);
    }
  }

  return entries;
}

export function buildInAppMarketAssertions(params: InAppMarketAssertionParams): KilnAssertion[] {
  const paymentTokenAddress = params.paymentTokenAddress ?? params.dummyWtfAddress;
  const purchaseUsesDummyToken = paymentTokenAddress === params.dummyWtfAddress;
  const initialBuyerWtfUnits = BigInt(params.initialBuyerWtfUnits ?? "0");
  const initialTreasuryWtfUnits = BigInt(params.initialTreasuryWtfUnits ?? "0");
  const purchaseDebit = params.purchaseDebitsBuyer === false ? 0n : BigInt(params.purchaseAmountWtfUnits);
  const buyerDummyBalance = purchaseUsesDummyToken
    ? (
        initialBuyerWtfUnits +
        BigInt(params.mintAmountWtfUnits) -
        purchaseDebit
      ).toString()
    : params.mintAmountWtfUnits;

  const assertions: KilnAssertion[] = [
    {
      id: "in_app_market_token_address_storage",
      kind: "storage",
      contractId: "in_app_market",
      afterStep: params.purchaseStepLabel,
      description: "Market storage keeps the expected WTF FA2 token contract.",
      path: "wtf_token_address",
      expected: paymentTokenAddress,
    },
    {
      id: "in_app_market_treasury_storage",
      kind: "storage",
      contractId: "in_app_market",
      afterStep: params.purchaseStepLabel,
      description: "Market storage keeps wallet A as the treasury.",
      path: "treasury",
      expected: params.walletAAddress,
    },
    {
      id: "in_app_market_zero_xtz_balance",
      kind: "balance",
      contractId: "in_app_market",
      afterStep: params.purchaseStepLabel,
      description: "The market contract must not retain XTZ after a WTF-only purchase.",
      expectedMutez: "0",
    },
    {
      id: "buyer_dummy_wtf_ledger_big_map",
      kind: "big_map",
      contractId: "dummy_wtf",
      afterStep: params.purchaseStepLabel,
      description: purchaseUsesDummyToken
        ? "Buyer ledger balance reflects mint minus purchase amount."
        : "Buyer ledger balance reflects the fresh dummy mint used for deterministic big-map proof.",
      bigMap: "ledger",
      key: params.walletBAddress,
      expected: buyerDummyBalance,
    },
  ];

  if (purchaseUsesDummyToken) {
    assertions.splice(3, 0, {
      id: "treasury_dummy_wtf_ledger_big_map",
      kind: "big_map",
      contractId: "dummy_wtf",
      afterStep: params.purchaseStepLabel,
      description: "Treasury receives the purchased WTF amount in the FA2 ledger big map.",
      bigMap: "ledger",
      key: params.walletAAddress,
      expected: (initialTreasuryWtfUnits + BigInt(params.purchaseAmountWtfUnits)).toString(),
    });
  }

  if (params.expectedVersion) {
    assertions.unshift({
      id: "in_app_market_version_storage",
      kind: "storage",
      contractId: "in_app_market",
      afterStep: params.purchaseStepLabel,
      description: "Market storage reports the expected contract version.",
      path: "version",
      expected: params.expectedVersion,
    });
  }

  return assertions;
}

export function buildInAppRedemptionAssertions(
  params: InAppRedemptionAssertionParams,
): KilnAssertion[] {
  const remainingEscrow = (
    BigInt(params.fundedAmountWtfUnits) - BigInt(params.claimedAmountWtfUnits)
  ).toString();
  return [
    {
      id: "redemption_escrow_version_storage",
      kind: "storage",
      contractId: "redemption_escrow",
      afterStep: params.finalStepLabel,
      description: "Redemption escrow storage reports the role-separated V2 contract.",
      path: "version",
      expected: "wtf-in-app-redemption-escrow-v2",
    },
    {
      id: "redemption_escrow_admin_storage",
      kind: "storage",
      contractId: "redemption_escrow",
      afterStep: params.finalStepLabel,
      description: "Redemption escrow storage keeps the cold administration wallet.",
      path: "admin",
      expected: params.expectedAdminAddress ?? params.walletAAddress,
    },
    {
      id: "redemption_escrow_issuer_storage",
      kind: "storage",
      contractId: "redemption_escrow",
      afterStep: params.finalStepLabel,
      description: "Redemption escrow storage keeps the operational reward issuer wallet.",
      path: "issuer",
      expected: params.expectedIssuerAddress ?? params.walletBAddress,
    },
    {
      id: "redemption_escrow_token_address_storage",
      kind: "storage",
      contractId: "redemption_escrow",
      afterStep: params.finalStepLabel,
      description: "Redemption escrow storage keeps the expected WTF FA2 token contract.",
      path: "wtf_token_address",
      expected: params.dummyWtfAddress,
    },
    {
      id: "redemption_escrow_balance_storage",
      kind: "storage",
      contractId: "redemption_escrow",
      afterStep: params.finalStepLabel,
      description: "Redemption escrow accounting tracks funded minus claimed WTF.",
      path: "escrow_balance_wtf",
      expected: remainingEscrow,
    },
    {
      id: "redemption_escrow_reserved_storage",
      kind: "storage",
      contractId: "redemption_escrow",
      afterStep: params.finalStepLabel,
      description: "All redemption reservations are clear after claim and cancellation.",
      path: "reserved_wtf",
      expected: "0",
    },
    {
      id: "redemption_escrow_zero_xtz_balance",
      kind: "balance",
      contractId: "redemption_escrow",
      afterStep: params.finalStepLabel,
      description: "The redemption escrow must not retain XTZ.",
      expectedMutez: "0",
    },
    {
      id: "buyer_redeemed_wtf_ledger_big_map",
      kind: "big_map",
      contractId: "dummy_wtf",
      afterStep: params.finalStepLabel,
      description: "Buyer receives the claimed WTF redemption amount.",
      bigMap: "ledger",
      key: params.walletBAddress,
      expected: params.expectedBuyerWtfUnits ?? params.claimedAmountWtfUnits,
    },
  ];
}

export function buildMarketplaceV2Assertions(
  params: MarketplaceV2AssertionParams,
): KilnAssertion[] {
  return [
    {
      id: "marketplace_v2_wtf_token_address_storage",
      kind: "storage",
      contractId: "marketplace_v2",
      afterStep: params.finalStepLabel,
      description: "Marketplace V2 storage keeps the shadownet WTF FA2 token contract.",
      path: "wtf_token_address",
      expected: params.dummyWtfAddress,
    },
    {
      id: "marketplace_v2_unpaused_storage",
      kind: "storage",
      contractId: "marketplace_v2",
      afterStep: params.finalStepLabel,
      description: "Marketplace V2 is unpaused after the emergency pause/unpause exercise.",
      path: "paused",
      expected: false,
    },
    {
      id: "marketplace_v2_zero_xtz_balance",
      kind: "balance",
      contractId: "marketplace_v2",
      afterStep: params.finalStepLabel,
      description: "Marketplace V2 must not retain XTZ after WTF-only flows.",
      expectedMutez: "0",
    },
    {
      id: "buyer_dummy_wtf_ledger_big_map",
      kind: "big_map",
      contractId: "dummy_wtf",
      afterStep: params.finalStepLabel,
      description: "Buyer balance reflects listing payment plus refunded cancelled offer.",
      bigMap: "ledger",
      key: params.walletBAddress,
      expected: params.expectedBuyerWtfUnits,
    },
    {
      id: "buyer_sample_fa2_ledger_big_map",
      kind: "big_map",
      contractId: "sample_fa2",
      afterStep: params.finalStepLabel,
      description: "Buyer owns exactly the bought and accepted sample FA2 editions.",
      bigMap: "ledger",
      key: params.walletBAddress,
      expected: params.expectedBuyerSampleFa2Units,
    },
  ];
}

export function buildWtfXtzExchangeAssertions(
  params: WtfXtzExchangeAssertionParams,
): KilnAssertion[] {
  return [
    {
      id: "wtf_xtz_exchange_token_address_storage",
      kind: "storage",
      contractId: "wtf_xtz_exchange",
      afterStep: params.finalStepLabel,
      description: "Exchange storage keeps the expected WTF FA2 token contract.",
      path: "wtf_token_address",
      expected: params.wtfTokenAddress,
    },
    {
      id: "wtf_xtz_exchange_unpaused_storage",
      kind: "storage",
      contractId: "wtf_xtz_exchange",
      afterStep: params.finalStepLabel,
      description: "Exchange remains unpaused after the swap/cancel proof.",
      path: "paused",
      expected: false,
    },
    {
      id: "wtf_xtz_exchange_balance_after_cancel",
      kind: "balance",
      contractId: "wtf_xtz_exchange",
      afterStep: params.finalStepLabel,
      description: "Exchange balance equals the expected remaining escrow after final cancellation.",
      expectedMutez: params.expectedExchangeBalanceMutez,
    },
    {
      id: "owner_wtf_token_ledger_big_map",
      kind: "big_map",
      contractId: "wtf_token",
      afterStep: params.finalStepLabel,
      description: "Listing owner receives the filled WTF amount.",
      bigMap: "ledger",
      key: params.walletAAddress,
      expected: params.expectedOwnerWtfUnits,
    },
    {
      id: "buyer_wtf_token_ledger_big_map",
      kind: "big_map",
      contractId: "wtf_token",
      afterStep: params.finalStepLabel,
      description: "Buyer retains the minted WTF minus successful fills.",
      bigMap: "ledger",
      key: params.walletBAddress,
      expected: params.expectedBuyerWtfUnits,
    },
  ];
}

export function summarizeKilnAssertionResult(
  response: unknown,
  requiredKinds: KilnAssertionKind[] = REQUIRED_KILN_ASSERTION_KINDS,
): {
  ok: boolean;
  passedKinds: KilnAssertionKind[];
  missingKinds: KilnAssertionKind[];
  assertionCount: number;
} {
  const entries = collectAssertionEntries(response);
  const passedKinds = new Set<KilnAssertionKind>();

  for (const entry of entries) {
    const kind = normalizeKind(entry?.kind ?? entry?.type ?? entry?.assertionKind);
    if (kind && assertionPassed(entry)) passedKinds.add(kind);
  }

  const summary = (response as any)?.assertionSummary ?? (response as any)?.assertionsSummary;
  if (summary && typeof summary === "object") {
    for (const kind of requiredKinds) {
      if (truthy((summary as Record<string, unknown>)[kind])) passedKinds.add(kind);
      if (kind === "big_map" && truthy((summary as Record<string, unknown>).bigMap)) {
        passedKinds.add(kind);
      }
    }
  }

  const missingKinds = requiredKinds.filter((kind) => !passedKinds.has(kind));
  return {
    ok: missingKinds.length === 0,
    passedKinds: requiredKinds.filter((kind) => passedKinds.has(kind)),
    missingKinds,
    assertionCount: entries.length,
  };
}
