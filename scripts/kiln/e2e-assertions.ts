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
  const buyerDummyBalance = purchaseUsesDummyToken
    ? (BigInt(params.mintAmountWtfUnits) - BigInt(params.purchaseAmountWtfUnits)).toString()
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
      expected: params.purchaseAmountWtfUnits,
    });
  }

  return assertions;
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
