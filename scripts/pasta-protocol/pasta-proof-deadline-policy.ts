import assert from "node:assert/strict";

// `datetime-local` is written by the proof runners at whole-minute resolution,
// while the interoperable RFC3339 form used by Tezos and browsers has a
// four-digit year. Keep every generated deadline inside that shared domain.
export const PASTA_DATETIME_LOCAL_RESOLUTION_MS = 60_000;
export const PASTA_RFC3339_FOUR_DIGIT_CEILING_ISO =
  "9999-12-31T23:59:00.000Z";
export const PASTA_RFC3339_FOUR_DIGIT_CEILING_MS = Date.parse(
  PASTA_RFC3339_FOUR_DIGIT_CEILING_ISO,
);

assert.ok(
  Number.isSafeInteger(PASTA_RFC3339_FOUR_DIGIT_CEILING_MS),
  "Pasta RFC3339 deadline ceiling must be a safe JavaScript timestamp",
);
assert.equal(
  new Date(PASTA_RFC3339_FOUR_DIGIT_CEILING_MS).toISOString(),
  PASTA_RFC3339_FOUR_DIGIT_CEILING_ISO,
  "Pasta RFC3339 deadline ceiling must round-trip through browser Date",
);

export function pastaDeadlineBeforeCeiling(wholeMinuteSlots: number): string {
  assert.ok(
    Number.isSafeInteger(wholeMinuteSlots) && wholeMinuteSlots >= 0,
    "Pasta deadline slot count must be a non-negative safe integer",
  );
  return new Date(
    PASTA_RFC3339_FOUR_DIGIT_CEILING_MS
      - wholeMinuteSlots * PASTA_DATETIME_LOCAL_RESOLUTION_MS,
  ).toISOString();
}

export function pastaRoundUpToDatetimeLocalMinute(durationMs: number): number {
  assert.ok(
    Number.isSafeInteger(durationMs) && durationMs > 0,
    "Pasta deadline duration must be a positive safe integer",
  );
  return Math.ceil(durationMs / PASTA_DATETIME_LOCAL_RESOLUTION_MS)
    * PASTA_DATETIME_LOCAL_RESOLUTION_MS;
}
