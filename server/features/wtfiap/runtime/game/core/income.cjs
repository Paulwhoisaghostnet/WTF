/* Fixed base income plus the existing interest rule, shared by browser and CJS.
 * Owner instruction: "lets do 5 gold base income". Interest is calculated from
 * carried gold before either award is added. No starting balance is supplied.
 *
 * The state is ABInterest's unchanged receipt ledger; its stored resultingGold
 * includes interest only. The returned combined receipt includes base income.
 * Use this wrapper as the sole preparation-income award path from the beginning
 * of a match, and persist its combined resultingGold AND state atomically under
 * the expected revision. Interest-only histories are not retroactively granted
 * base income. The authoritative match reducer supplies the carried balance,
 * eligible preparation phase/round and player authorization. This module does
 * not choose first-round eligibility or change interest for treasure rounds.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./interest.cjs'));
  else root.ABIncome = factory(root.ABInterest);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Interest) {
  'use strict';
  if (!Interest) throw new Error('ABIncome requires ABInterest to be loaded first.');
  const BASE_ROUND_INCOME = 5;
  class IncomeError extends Error {
    constructor(code, message) { super(message); this.name = 'IncomeError'; this.code = code; }
  }
  function calculatePreparationIncome(carriedGold) {
    const interest = Interest.calculateInterest(carriedGold);
    const totalIncome = BASE_ROUND_INCOME + interest;
    const resultingGold = carriedGold + totalIncome;
    if (!Number.isSafeInteger(resultingGold)) {
      throw new IncomeError('ARITHMETIC_OVERFLOW', 'Combined income balance cannot be represented exactly.');
    }
    return Object.freeze({ carriedGold, baseIncome: BASE_ROUND_INCOME, interest, totalIncome, resultingGold });
  }
  function awardAtPreparationStart(state, action) {
    const award = Interest.awardAtPreparationStart(state, action);
    if (!award.ok) return award;
    try {
      const income = calculatePreparationIncome(award.receipt.carriedGold);
      const receipt = Object.freeze({ ...award.receipt, ...income });
      return Object.freeze({ ok: true, state: award.state, receipt });
    } catch (error) {
      if (!(error instanceof IncomeError)) throw error;
      // The dependency is pure. Rejecting the combined result leaves the caller's
      // original ledger eligible for a valid later command; no partial award.
      return { ok: false, state, receipt: null, error: { code: error.code, message: error.message } };
    }
  }
  return Object.freeze({ BASE_ROUND_INCOME, IncomeError, calculatePreparationIncome, awardAtPreparationStart,
    createLedger: Interest.createLedger, validate: Interest.validate, serialize: Interest.serialize, restore: Interest.restore });
});
