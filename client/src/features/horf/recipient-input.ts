import { ValidationResult, validateAddress } from "@taquito/utils";

export const HORF_RECIPIENT_LIMIT = 50;
const TEZOS_TRADER_ADDRESS = /^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$/;
const BURN_ADDRESS = "tz1burnburnburnburnburnburnburjAYjjX";

export type HorfRecipient = { address: string; amount: string };

export function assertTraderAddress(value: string): string {
  const address = value.trim();
  if (!TEZOS_TRADER_ADDRESS.test(address) || address === BURN_ADDRESS ||
      validateAddress(address) !== ValidationResult.VALID) {
    throw new Error(`Enter a valid Tezos trader wallet address: ${address || "(empty)"}`);
  }
  return address;
}

export function toAtomicHorseAmount(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) throw new Error("HORSE token precision is unavailable.");
  const amount = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount)) {
    throw new Error("Enter a positive $HORSE amount.");
  }
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) throw new Error(`$HORSE supports up to ${decimals} decimal places.`);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (raw <= 0n) throw new Error("$HORSE amount must be greater than zero.");
  return raw.toString();
}

export function formatHorseAmount(raw: string, decimals: number): string {
  const amount = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function csvFields(line: string): string[] {
  return line.split(",").map((field) => {
    const trimmed = field.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/""/g, '"').trim();
    }
    if (trimmed.includes('"')) throw new Error("CSV contains an unmatched quote.");
    return trimmed;
  });
}

export function parseHorseRecipientCsv(text: string, defaultAmount: string): HorfRecipient[] {
  const rows: HorfRecipient[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const fields = csvFields(line);
    if (fields.some((field) => !field)) throw new Error("CSV has an empty address or amount field.");
    if (fields[0].toLowerCase() === "address" && (fields.length === 1 || fields[1].toLowerCase() === "amount")) continue;
    const paired = fields.length % 2 === 0 && fields.every((field, index) =>
      index % 2 === 0 ? TEZOS_TRADER_ADDRESS.test(field) : /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(field)
    );
    if (paired) {
      for (let index = 0; index < fields.length; index += 2) {
        rows.push({ address: assertTraderAddress(fields[index]), amount: fields[index + 1] });
      }
    } else {
      for (const field of fields) rows.push({ address: assertTraderAddress(field), amount: defaultAmount });
    }
    if (rows.length > HORF_RECIPIENT_LIMIT) {
      throw new Error(`A $HORSE send can include up to ${HORF_RECIPIENT_LIMIT} recipient addresses.`);
    }
  }
  if (!rows.length) throw new Error("The CSV has no recipient addresses.");
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.address)) throw new Error(`The CSV repeats ${row.address}; use one row per recipient.`);
    seen.add(row.address);
  }
  return rows;
}

export function validateHorseRecipients(
  rows: HorfRecipient[],
  sender: string,
  decimals: number,
): Array<{ address: string; amountRaw: string }> {
  if (!rows.length) throw new Error("Add at least one recipient.");
  if (rows.length > HORF_RECIPIENT_LIMIT) {
    throw new Error(`A $HORSE send can include up to ${HORF_RECIPIENT_LIMIT} recipient addresses.`);
  }
  const seen = new Set<string>();
  return rows.map((row) => {
    const address = assertTraderAddress(row.address);
    if (address === sender) throw new Error("Remove your own wallet from the recipient list.");
    if (seen.has(address)) throw new Error(`Recipient ${address} appears more than once.`);
    seen.add(address);
    return { address, amountRaw: toAtomicHorseAmount(row.amount, decimals) };
  });
}
