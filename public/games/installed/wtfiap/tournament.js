/* Exact, prospective tournament terms and prize quotes; no funds are held here.
 *
 * Authority: the owner requested eight-player Party tournaments paying the top
 * three in the room currency. XTZ has six atomic decimals on Tezos L1; the
 * project's configured WTF FA2 token has eight. The owner approved a fixed
 * 50/35/15 percent split for first/second/third. The host provides the entry
 * fee. This module chooses no network, authenticates no deposit, and creates
 * no payment or claim.
 *
 * Rounding derivation: indivisible asset atoms require integer prizes. Floor
 * each exact share, then give remaining atoms to the largest fractional parts.
 * Moving an atom from a smaller remainder to a larger one cannot increase the
 * aggregate absolute rounding error. This conserves the quoted pot and minimizes
 * that error; equal remainders give the atom to the higher finishing place.
 * This rounding tie rule does not decide tied tournament standings.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABTournament = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CURRENCY_DECIMALS = Object.freeze({ XTZ: 6, WTF: 8 });
  const ROOM_SIZE = 8; // The existing owner-approved Party room contract.
  const PRIZE_PLACES = 3; // The owner's requested number of prize places.
  const PRIZE_PERCENTAGES = Object.freeze(['50', '35', '15']); // Owner-approved split.
  const ROUNDING_POLICY = 'largest-remainder-higher-place-ties';
  class TournamentError extends Error {
    constructor(code, message) { super(message); this.name = 'TournamentError'; this.code = code; }
  }
  function demand(condition, code, message) { if (!condition) throw new TournamentError(code, message); }
  function frozen(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) frozen(child);
      Object.freeze(value);
    }
    return value;
  }
  function record(value, fields) {
    demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_TERMS', 'Tournament terms must be an object.');
    demand(Object.keys(value).length === fields.length && fields.every(key => Object.prototype.hasOwnProperty.call(value, key)),
      'INVALID_FIELDS', 'Provide exactly: ' + fields.join(', ') + '.');
  }
  function gcd(a, b) { while (b !== 0n) { const next = a % b; a = b; b = next; } return a; }
  function decimal(value, label) {
    demand(typeof value === 'string' && /^[0-9]+(?:\.[0-9]+)?$/.test(value), 'INVALID_DECIMAL', label + ' must be an unsigned decimal string.');
    const [whole, fraction = ''] = value.split('.');
    const trimmed = fraction.replace(/0+$/, '');
    const denominator = 10n ** BigInt(trimmed.length);
    const numerator = BigInt(whole) * denominator + BigInt(trimmed || '0');
    return { numerator, denominator, text: BigInt(whole).toString() + (trimmed ? '.' + trimmed : '') };
  }
  function decimalsFor(currency) {
    demand(typeof currency === 'string' && Object.prototype.hasOwnProperty.call(CURRENCY_DECIMALS, currency), 'INVALID_CURRENCY', 'Choose XTZ or WTF.');
    return CURRENCY_DECIMALS[currency];
  }
  function formatAtomic(amountAtomic, currency) {
    const decimals = decimalsFor(currency);
    demand(typeof amountAtomic === 'string' && /^[0-9]+$/.test(amountAtomic), 'INVALID_ATOMIC_AMOUNT', 'Atomic amounts must be unsigned integer strings.');
    const amount = BigInt(amountAtomic), scale = 10n ** BigInt(decimals);
    const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return (amount / scale).toString() + (fraction ? '.' + fraction : '');
  }
  function normalizeTerms(input) {
    const suppliedSplit = input !== null && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, 'prizePercentages');
    record(input, suppliedSplit ? ['currency', 'entryFee', 'prizePercentages'] : ['currency', 'entryFee']);
    const decimals = decimalsFor(input.currency), fee = decimal(input.entryFee, 'Entry fee');
    demand(fee.numerator > 0n, 'INVALID_ENTRY_FEE', 'The entry fee must be positive.');
    const scaled = fee.numerator * (10n ** BigInt(decimals));
    demand(scaled % fee.denominator === 0n, 'ENTRY_PRECISION', input.currency + ' entry fees must represent whole asset atoms.');
    const requestedSplit = suppliedSplit ? input.prizePercentages : PRIZE_PERCENTAGES;
    demand(Array.isArray(requestedSplit) && requestedSplit.length === PRIZE_PLACES,
      'INVALID_PRIZE_COUNT', 'Provide a percentage for each of the three prize places.');
    const percentages = Array.from(requestedSplit, value => decimal(value, 'Prize percentage'));
    demand(percentages.every(value => value.numerator > 0n), 'INVALID_PRIZE_PERCENTAGE', 'Each of the three prize percentages must be positive.');
    const denominator = percentages.reduce((largest, value) => value.denominator > largest ? value.denominator : largest, 1n);
    demand(percentages.reduce((sum, value) => sum + value.numerator * (denominator / value.denominator), 0n) === 100n * denominator,
      'INVALID_PRIZE_TOTAL', 'The three prize percentages must total exactly 100.');
    demand(percentages.every((value, index) => value.text === PRIZE_PERCENTAGES[index]),
      'INVALID_PRIZE_POLICY', 'Tournament prizes are fixed at 50%, 35%, and 15% for first, second, and third.');
    const shares = percentages.map(value => {
      const shareDenominator = value.denominator * 100n, common = gcd(value.numerator, shareDenominator);
      return { numerator: (value.numerator / common).toString(), denominator: (shareDenominator / common).toString() };
    });
    return frozen({ currency: input.currency, decimals, entryFee: fee.text,
      entryAtomic: (scaled / fee.denominator).toString(), prizePercentages: percentages.map(value => value.text), shares });
  }
  function validateTerms(terms) {
    record(terms, ['currency', 'decimals', 'entryFee', 'entryAtomic', 'prizePercentages', 'shares']);
    const expected = normalizeTerms({ currency: terms.currency, entryFee: terms.entryFee, prizePercentages: terms.prizePercentages });
    demand(terms.decimals === expected.decimals && terms.entryFee === expected.entryFee && terms.entryAtomic === expected.entryAtomic &&
      Array.isArray(terms.shares) && terms.shares.length === PRIZE_PLACES && Array.from(terms.shares).every((share, index) =>
        share && typeof share === 'object' && !Array.isArray(share) && Object.keys(share).length === 2 &&
        Object.prototype.hasOwnProperty.call(share, 'numerator') && Object.prototype.hasOwnProperty.call(share, 'denominator') &&
        share.numerator === expected.shares[index].numerator && share.denominator === expected.shares[index].denominator) &&
      terms.prizePercentages.every((value, index) => value === expected.prizePercentages[index]),
    'NON_CANONICAL_TERMS', 'The quote requires canonical, unmodified normalized terms.');
    return true;
  }
  function quote(terms, entrantCount) {
    validateTerms(terms);
    demand(Number.isInteger(entrantCount) && entrantCount >= 0 && entrantCount <= ROOM_SIZE,
      'INVALID_ENTRANT_COUNT', 'The quoted entrant count must be a whole number from zero through the eight-seat Party capacity.');
    const pot = BigInt(terms.entryAtomic) * BigInt(entrantCount);
    const amounts = terms.shares.map((share, index) => {
      const denominator = BigInt(share.denominator), numerator = pot * BigInt(share.numerator);
      return { index, denominator, amount: numerator / denominator, remainder: numerator % denominator };
    });
    let remaining = pot - amounts.reduce((sum, value) => sum + value.amount, 0n);
    const order = [...amounts].sort((a, b) => {
      const left = a.remainder * b.denominator, right = b.remainder * a.denominator;
      return left === right ? a.index - b.index : left > right ? -1 : 1;
    });
    for (const prize of order) { if (remaining === 0n) break; prize.amount += 1n; remaining -= 1n; }
    return frozen({ status: 'quoted-unfunded', currency: terms.currency, entrantCount,
      entryAtomic: terms.entryAtomic, potAtomic: pot.toString(), roundingPolicy: ROUNDING_POLICY,
      prizes: amounts.map(prize => ({ place: prize.index + 1, percentage: terms.prizePercentages[prize.index], amountAtomic: prize.amount.toString() })) });
  }
  return Object.freeze({ CURRENCY_DECIMALS, ROOM_SIZE, PRIZE_PLACES, PRIZE_PERCENTAGES, ROUNDING_POLICY, TournamentError,
    normalizeTerms, validateTerms, quote, formatAtomic });
});
