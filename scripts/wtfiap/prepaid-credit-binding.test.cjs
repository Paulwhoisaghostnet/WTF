'use strict';
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { assertOrPinPrepaidBinding, FILE_NAME } = require('./prepaid-credit-binding.cjs');

const prepaid = { WTFIAP_OPEN_DUEL_MAINNET_ENABLED: '1', WTFIAP_OPEN_DUEL_MAINNET_PAYOUT_MODE: 'prepaid',
  WTFIAP_OPEN_DUEL_MAINNET_CONTRACT: 'KT1Tz9f3584SxyHLWeoPiHhFPxWMJmqQzTaL',
  WTFIAP_OPEN_DUEL_MAINNET_SCRIPT_HASH: '26ff7d8db669e2eeefcdeacb8bd38d113ff402a2afb3aed819ace25053161c2f' };

test('Mainnet prepaid credit permanently pins its usable open-seat contract until a compatible migration exists', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wtfiap-credit-binding-'));
  try {
    assert.deepEqual(assertOrPinPrepaidBinding({}, dir), { binding: null, pinned: false });
    assert.deepEqual(assertOrPinPrepaidBinding(prepaid, dir).binding,
      { network: 'mainnet', contract: prepaid.WTFIAP_OPEN_DUEL_MAINNET_CONTRACT,
        scriptHash: prepaid.WTFIAP_OPEN_DUEL_MAINNET_SCRIPT_HASH });
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, FILE_NAME), 'utf8')),
      assertOrPinPrepaidBinding(prepaid, dir).binding);
    assert.throws(() => assertOrPinPrepaidBinding({ ...prepaid, WTFIAP_OPEN_DUEL_MAINNET_ENABLED: '0' }, dir),
      /cannot be disabled or changed/);
    assert.throws(() => assertOrPinPrepaidBinding({ ...prepaid, WTFIAP_OPEN_DUEL_MAINNET_PAYOUT_MODE: 'auto' }, dir),
      /cannot be disabled or changed/);
    assert.throws(() => assertOrPinPrepaidBinding({ ...prepaid,
      WTFIAP_OPEN_DUEL_MAINNET_CONTRACT: 'KT19LxQyVRCJCrWM9ViPuprvSHbHd2nSy4GM' }, dir),
    /cannot be disabled or changed/);
    assert.throws(() => assertOrPinPrepaidBinding({ ...prepaid,
      WTFIAP_OPEN_DUEL_MAINNET_SCRIPT_HASH: '0'.repeat(64) }, dir), /approved contract and typed script hash/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
