/* Two-human duel terms. The wallet escrow, not this quote, holds funds. */
'use strict';
const Tournament = require('./tournament.cjs');
const POLICY = 'winner-takes-pot';
function normalizeTerms(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Duel wager terms must be an object.');
  const fields = ['currency', 'entryFee', ...(input.network === undefined ? [] : ['network'])];
  if (Object.keys(input).length !== fields.length || !fields.every(field => Object.hasOwn(input, field)))
    throw new Error('Duel wager terms must contain only currency, entry fee and optional network.');
  const network = input.network;
  if (network !== undefined && !(['shadownet', 'mainnet'].includes(network) &&
    (input.currency !== 'WTF' || network === 'mainnet'))) throw new Error('Choose a supported Tezos network for this currency.');
  const base = Tournament.normalizeTerms({ currency: input.currency, entryFee: input.entryFee });
  return Object.freeze({ currency: base.currency, ...(network === undefined ? {} : { network }), decimals: base.decimals,
    entryFee: base.entryFee, entryAtomic: base.entryAtomic, payoutPolicy: POLICY });
}
function validateTerms(terms) {
  if (!terms || typeof terms !== 'object' || Array.isArray(terms) ||
    JSON.stringify(Object.keys(terms).sort()) !== JSON.stringify(['currency', ...(terms.network === undefined ? [] : ['network']), 'decimals', 'entryAtomic', 'entryFee', 'payoutPolicy'].sort()))
    throw new Error('Duel wager terms must be canonical.');
  const expected = normalizeTerms({ currency: terms.currency, ...(terms.network === undefined ? {} : { network: terms.network }), entryFee: terms.entryFee });
  if (Object.keys(expected).some(key => expected[key] !== terms[key])) throw new Error('Duel wager terms changed.');
  return true;
}
function quote(terms, entrantCount) {
  validateTerms(terms);
  if (!Number.isInteger(entrantCount) || entrantCount < 0 || entrantCount > 2) throw new Error('Duel quotes use at most two paying entrants.');
  return Object.freeze({ status: 'quoted-unfunded', currency: terms.currency, network: terms.network || (terms.currency === 'XTZ' ? 'shadownet' : 'mainnet'), entrantCount,
    entryAtomic: terms.entryAtomic, potAtomic: (BigInt(terms.entryAtomic) * BigInt(entrantCount)).toString(),
    payoutPolicy: POLICY });
}
module.exports = Object.freeze({ POLICY, normalizeTerms, validateTerms, quote });
