# Etherlink vs Standard EVM Chains

Etherlink is EVM-compatible but has unique characteristics developers must know.

## Native Currency
- **Etherlink**: XTZ (Tez), 18 decimals — same decimals as ETH, different symbol and economics

## Gas & Fees
- **EIP-1559 Supported**: Uses `max_fee_per_gas` field
- **No Priority Fees**: `max_priority_fee_per_gas` is ignored — sequencer uses first-come-first-served ordering
- **Fee Components**:
  - Execution fee: Varies with network throughput (minimum 1 gwei)
  - Inclusion fee: Covers data availability on Tezos L1
- Gas prices are typically very low (~$0.001 per ERC-20 transfer)
- No tips/priority fees needed

## Block Hashes
Block hashes are computed differently on Etherlink. You cannot verify block hashes solely from the block header. This affects:
- Light client implementations
- Block hash verification tools
- Contracts using `blockhash()` opcode

## Finality
- ~500ms for sequencer confirmation (sub-second)
- ~8 seconds for data posted to Tezos L1
- Full finality after Tezos L1 confirmation

## WebSockets
- Supported when running your own node with `--ws` flag
- `eth_subscribe` works for newBlockHeaders, logs, etc.
- Public RPC nodes do NOT expose WebSocket endpoints

## Solidity Version Support
- Solidity versions up to and including **0.8.24**

## Smart Contract Compatibility

Most Solidity/EVM contracts work unchanged. Watch for:
- Contracts relying on `PREVRANDAO` (may behave differently)
- Contracts verifying block hashes (computed differently)
- Contracts that depend on priority fee mechanics (ignored)

## Bridging

### Deposits (Tezos L1 → Etherlink)
- Initiated on Tezos L1
- Requires Tezos wallet/tooling
- Takes ~10-15 minutes

### Withdrawals (Etherlink → Tezos L1)
- Initiated on Etherlink (EVM transaction)
- Finalized on Tezos after challenge period
- Takes ~2 weeks (optimistic rollup challenge period)

## Best Practices

1. **Don't set priority fees** — they're ignored anyway
2. **Don't rely on block hashes** for verification
3. **Account for bridge delays** in UX design
4. **Test on Shadownet first** — it mirrors mainnet behavior
5. **Run your own node** for WebSocket subscriptions
6. **Use Solidity ^0.8.24 or below** — newer versions may have issues
