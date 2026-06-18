/**
 * Pasta Protocol — bonding-curve pricing (Gnocchi open editions).
 *
 * Pure, dependency-free, integer-mutez math. The contract charges a flat unit price per mint call
 * derived from the current minted count (the curve steps between calls, not within a single call), so
 * `costForBatch` here matches `PastaOpenEditionFA2.open_mint` exactly for UI/preview parity.
 */
import type { BondingCurveConfig } from "./types";

function clampPrice(config: BondingCurveConfig, price: number): number {
  let result = price;
  if (typeof config.minimum_price === "number") result = Math.max(result, config.minimum_price);
  if (typeof config.maximum_price === "number") result = Math.min(result, config.maximum_price);
  return Math.max(0, Math.floor(result));
}

/** Unit price (mutez) when `minted` editions already exist. */
export function priceAtSupply(config: BondingCurveConfig, minted: number): number {
  const step = config.step_size && config.step_size > 0 ? Math.floor(config.step_size) : 1;
  const safeMinted = Number.isFinite(minted) && minted > 0 ? Math.floor(minted) : 0;
  const steps = Math.floor(safeMinted / step);
  return clampPrice(config, config.base_price + config.increment * steps);
}

/** Total cost (mutez) to mint `amount` editions starting from `minted` (flat unit price per call). */
export function costForBatch(config: BondingCurveConfig, minted: number, amount: number): number {
  const qty = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
  return priceAtSupply(config, minted) * qty;
}

export type PricingValidation = { ok: boolean; errors: string[] };

/** Structural validation of a bonding-curve config (mutez integers, non-negative base, sane clamps). */
export function validateBondingCurve(config: BondingCurveConfig): PricingValidation {
  const errors: string[] = [];
  if (!config || typeof config !== "object") return { ok: false, errors: ["config must be an object"] };
  if (!Number.isInteger(config.base_price) || config.base_price < 0) {
    errors.push("base_price must be a non-negative integer (mutez)");
  }
  if (!Number.isInteger(config.increment)) {
    errors.push("increment must be an integer (mutez, may be negative)");
  }
  if (config.minimum_price !== undefined && (!Number.isInteger(config.minimum_price) || config.minimum_price < 0)) {
    errors.push("minimum_price must be a non-negative integer when set");
  }
  if (config.maximum_price !== undefined && (!Number.isInteger(config.maximum_price) || config.maximum_price < 0)) {
    errors.push("maximum_price must be a non-negative integer when set");
  }
  if (
    config.minimum_price !== undefined &&
    config.maximum_price !== undefined &&
    config.minimum_price > config.maximum_price
  ) {
    errors.push("minimum_price cannot exceed maximum_price");
  }
  if (config.step_size !== undefined && (!Number.isInteger(config.step_size) || config.step_size < 1)) {
    errors.push("step_size must be a positive integer when set");
  }
  return { ok: errors.length === 0, errors };
}
