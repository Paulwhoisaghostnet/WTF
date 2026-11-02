/* Canonical sponsor prize plan. This module describes awards; it never treats
 * a quoted prize as escrowed. Funding and claims require a verified contract. */
'use strict';
const { createHash } = require('node:crypto');
const PLACES = Object.freeze([1, 2, 3]);
const DECIMALS = Object.freeze({ XTZ: 6, WTF: 8 });
const FA2_ADDRESS = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const WALLET_ADDRESS = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;

function exactAmount(value, currency) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new Error(`${currency} prize must be a nonnegative decimal string.`);
  const [whole, fraction = ''] = value.split('.');
  const decimals = DECIMALS[currency];
  if (fraction.length > decimals) throw new Error(`${currency} prize exceeds token precision.`);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'))).toString();
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide a sponsor prize plan.');
  const keys = ['mode', 'places', 'tokens', 'minimumHumans', 'entry', ...(input.pickCounts === undefined ? [] : ['pickCounts'])];
  if (Object.keys(input).length !== keys.length || !keys.every(key => Object.hasOwn(input, key)))
    throw new Error('Sponsor prize plan contains unsupported fields.');
  if (!['fixed', 'random', 'pick'].includes(input.mode)) throw new Error('Choose fixed, random, or place-order prize selection.');
  if (!Array.isArray(input.places) || input.places.length < 1 || input.places.length > PLACES.length)
    throw new Error('Provide one, two, or three ordered prize places.');
  if (!Number.isSafeInteger(input.minimumHumans) || input.minimumHumans < input.places.length || input.minimumHumans > 8)
    throw new Error('The sponsor minimum must cover every prize place and fit the eight-seat tournament.');
  const places = input.places.map((award, index) => {
    if (!award || typeof award !== 'object' || Array.isArray(award) ||
      Object.keys(award).sort().join() !== 'place,poolWeight,wtf,xtz' || award.place !== PLACES[index] ||
      !/^(0|[1-9]\d*)$/.test(award.poolWeight))
      throw new Error('Place awards must be ordered and include XTZ, WTF and entry-pool weight.');
    const xtzAtomic = exactAmount(award.xtz, 'XTZ'), wtfAtomic = exactAmount(award.wtf, 'WTF');
    if (BigInt(xtzAtomic) % 10000n !== 0n || BigInt(wtfAtomic) % 1000000n !== 0n)
      throw new Error('Sponsored XTZ and WTF awards use 0.01 increments in their own currency.');
    return Object.freeze({ place: award.place, xtzAtomic,
      wtfAtomic, poolWeight: award.poolWeight });
  });
  const entry = input.entry;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
    Object.keys(entry).sort().join() !== 'currency,designatedWallet,fee,poolShare' ||
    !['FREE', 'XTZ', 'WTF'].includes(entry.currency) ||
    typeof entry.poolShare !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(entry.poolShare))
    throw new Error('Choose free entry or an XTZ/WTF fee and its prize-pool share.');
  const [whole, fraction = ''] = entry.poolShare.split('.');
  const denominator = 100n * 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole) * 10n ** BigInt(fraction.length) + BigInt(fraction || '0');
  if (numerator > denominator) throw new Error('Entry prize-pool share cannot exceed the whole entry fee.');
  let entryAtomic = '0';
  if (entry.currency === 'FREE') {
    if (entry.fee !== '0' || entry.poolShare !== '0' || entry.designatedWallet !== null)
      throw new Error('Free entry has no fee, payout share or designated wallet.');
  } else {
    entryAtomic = exactAmount(entry.fee, entry.currency);
    if (BigInt(entryAtomic) === 0n || BigInt(entryAtomic) % 10n ** BigInt(DECIMALS[entry.currency] - 2) !== 0n)
      throw new Error('A paid entry must be a positive multiple of 0.01 in its chosen currency.');
    if (numerator < denominator && !WALLET_ADDRESS.test(entry.designatedWallet))
      throw new Error('A designated Tezos wallet is required when entry fees are shared outside the prize pool.');
    if (entry.designatedWallet !== null && !WALLET_ADDRESS.test(entry.designatedWallet))
      throw new Error('The designated fee wallet must be a Tezos wallet address.');
    if (numerator > 0n && places.every(award => BigInt(award.poolWeight) === 0n))
      throw new Error('Give prize places weights when entry fees fund the prize pool.');
  }
  const normalizedEntry = Object.freeze({ currency: entry.currency, entryAtomic,
    poolNumerator: numerator.toString(), poolDenominator: denominator.toString(),
    designatedWallet: entry.designatedWallet });
  if (!Array.isArray(input.tokens)) throw new Error('Provide an FA2 prize list.');
  const tokens = input.tokens.map((lot, index) => {
    const expected = ['contract', 'tokenId', 'amount', ...(input.mode === 'fixed' ? ['place'] : [])];
    if (!lot || typeof lot !== 'object' || Array.isArray(lot) ||
      Object.keys(lot).length !== expected.length || !expected.every(key => Object.hasOwn(lot, key)) ||
      !FA2_ADDRESS.test(lot.contract) || !/^(0|[1-9]\d*)$/.test(lot.tokenId) ||
      !/^[1-9]\d*$/.test(lot.amount) || (input.mode === 'fixed' && !places.some(award => award.place === lot.place)))
      throw new Error(`FA2 prize lot ${index + 1} has invalid contract, token, amount, or place.`);
    return Object.freeze({ contract: lot.contract, tokenId: lot.tokenId, amount: lot.amount,
      ...(input.mode === 'fixed' ? { place: lot.place } : {}) });
  });
  let pickCounts;
  if (input.mode === 'fixed') {
    if (input.pickCounts !== undefined) throw new Error('Fixed prizes already assign each FA2 lot to a place.');
  } else {
    if (!Array.isArray(input.pickCounts) || input.pickCounts.length !== places.length ||
      !input.pickCounts.every(count => Number.isSafeInteger(count) && count >= 0) ||
      input.pickCounts.reduce((sum, count) => sum + count, 0) !== tokens.length)
      throw new Error('Prize pick counts must allocate every FA2 lot across the funded places.');
    pickCounts = Object.freeze([...input.pickCounts]);
  }
  const xtzAtomic = places.reduce((sum, award) => sum + BigInt(award.xtzAtomic), 0n);
  const wtfAtomic = places.reduce((sum, award) => sum + BigInt(award.wtfAtomic), 0n);
  if (xtzAtomic === 0n && wtfAtomic === 0n && tokens.length === 0)
    throw new Error('A sponsor must provide at least one prize.');
  return Object.freeze({ mode: input.mode, minimumHumans: input.minimumHumans,
    entry: normalizedEntry, places: Object.freeze(places), tokens: Object.freeze(tokens),
    ...(pickCounts ? { pickCounts } : {}), deposit: Object.freeze({ xtzAtomic: xtzAtomic.toString(), wtfAtomic: wtfAtomic.toString() }) });
}

function randomAllocation(plan, revealedSeed) {
  if (plan.mode !== 'random') throw new Error('Only random prize plans use a seeded allocation.');
  if (typeof revealedSeed !== 'string' || !/^[a-f0-9]{64}$/.test(revealedSeed))
    throw new Error('Use the revealed 32-byte room seed.');
  const remaining = plan.tokens.map((lot, index) => ({ lot, index }));
  const assigned = [];
  for (const place of plan.places.map(award => award.place)) {
    for (let pick = 0; pick < plan.pickCounts[place - 1]; pick++) {
      const size = BigInt(remaining.length);
      const sampleSpace = 1n << 256n;
      const upper = sampleSpace - sampleSpace % size;
      let attempt = 0n;
      let value;
      do {
        value = BigInt('0x' + createHash('sha256').update(`colilseum-sponsor-v1:${revealedSeed}:${assigned.length}:${attempt}`).digest('hex'));
        attempt++;
      } while (value >= upper);
      const [chosen] = remaining.splice(Number(value % size), 1);
      assigned.push(Object.freeze({ place, index: chosen.index, ...chosen.lot }));
    }
  }
  return Object.freeze(assigned);
}

module.exports = Object.freeze({ PLACES, normalize, exactAmount, randomAllocation });
