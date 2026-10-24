/* Two-human duel terms. The wallet escrow, not this quote, holds funds. */
'use strict';
const Tournament = require('./tournament.cjs');
const POLICY = 'winner-takes-pot';
function normalizeTerms(input) {
  const base = Tournament.normalizeTerms(input);
  return Object.freeze({ currency: base.currency, decimals: base.decimals,
    entryFee: base.entryFee, entryAtomic: base.entryAtomic, payoutPolicy: POLICY });
}
function validateTerms(terms) {
  if (!terms || typeof terms !== 'object' || Array.isArray(terms) ||
    JSON.stringify(Object.keys(terms).sort()) !== JSON.stringify(['currency', 'decimals', 'entryAtomic', 'entryFee', 'payoutPolicy'].sort()))
    throw new Error('Duel wager terms must be canonical.');
  const expected = normalizeTerms({ currency: terms.currency, entryFee: terms.entryFee });
  if (Object.keys(expected).some(key => expected[key] !== terms[key])) throw new Error('Duel wager terms changed.');
  return true;
}
function quote(terms, entrantCount) {
  validateTerms(terms);
  if (!Number.isInteger(entrantCount) || entrantCount < 0 || entrantCount > 2) throw new Error('Duel quotes use at most two paying entrants.');
  return Object.freeze({ status: 'quoted-unfunded', currency: terms.currency, entrantCount,
    entryAtomic: terms.entryAtomic, potAtomic: (BigInt(terms.entryAtomic) * BigInt(entrantCount)).toString(),
    payoutPolicy: POLICY });
}
module.exports = Object.freeze({ POLICY, normalizeTerms, validateTerms, quote });
