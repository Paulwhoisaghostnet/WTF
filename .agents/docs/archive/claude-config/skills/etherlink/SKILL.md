---
name: etherlink
description: "Etherlink blockchain interaction — EVM-compatible L2 on Tezos. Supports mainnet and shadownet testnet via MCP server. Use for balance checks, transactions, smart contracts, token operations, and understanding Etherlink-specific EVM differences."
tags: [blockchain, evm, tezos, l2, web3, etherlink, mcp]
version: 1.0.0
source: "https://github.com/efekucuk/etherlink-skill"
---

# Etherlink Skill

Interact with [Etherlink](https://etherlink.com), an EVM-compatible L2 built on Tezos.

## Quick Start

### 1. MCP Server (if configured)

The Etherlink MCP server provides direct chain interaction tools. If available, use these tools:

**Read Operations:**
- `get_balance` — Get XTZ balance for an address
- `get_block` — Get block by number or hash
- `get_transaction` — Get transaction details
- `get_transaction_receipt` — Get transaction receipt
- `call_contract` — Call a view function
- `get_logs` — Query event logs
- `get_token_balance` — Get ERC20 token balance
- `get_token_info` — Get ERC20 token metadata

**Write Operations (require PRIVATE_KEY):**
- `send_transaction` — Send XTZ
- `transfer_token` — Transfer ERC20 tokens
- `deploy_contract` — Deploy a contract
- `write_contract` — Call a state-changing function

**Utility:**
- `estimate_gas` — Estimate gas for a transaction
- `get_gas_price` — Get current gas price
- `encode_function_data` — Encode contract call data
- `decode_function_result` — Decode contract return data

### 2. Select Network

Use network name or chain ID:
- **Mainnet**: `etherlink` or `42793`
- **Testnet**: `etherlink-shadownet` or `127823`

## Networks

| Network | Chain ID | RPC | Explorer |
|---------|----------|-----|----------|
| Etherlink Mainnet | 42793 (`0xA729`) | https://node.mainnet.etherlink.com | https://explorer.etherlink.com |
| Etherlink Shadownet | 127823 (`0x1F34F`) | https://node.shadownet.etherlink.com | https://shadownet.explorer.etherlink.com |

- **Relay (Mainnet):** `https://relay.mainnet.etherlink.com`
- **Relay (Shadownet):** `https://relay.shadownet.etherlink.com`
- **Faucet (Shadownet):** https://shadownet.faucet.etherlink.com
- **Native Currency:** XTZ (18 decimals)
- **EVM Version:** Osaka
- **Wallet Derivation:** `m/44'/60'/0'/0`

## Common Operations

### Check Balance
```
Get balance for 0x... on etherlink
```

### Send Transaction
```
Send 0.1 XTZ to 0x... on etherlink
```

### Read Contract
```
Call balanceOf on contract 0x... for address 0x... on etherlink
```

### Get Block Info
```
Get latest block on etherlink
```

## Etherlink-Specific EVM Differences

### Fee Structure
- **EIP-1559 Supported**: Uses `max_fee_per_gas`
- **No Priority Fees**: `max_priority_fee_per_gas` is ignored — sequencer uses first-come-first-served ordering
- **Fee Components**:
  - Execution fee: Varies with network throughput (minimum 1 gwei)
  - Inclusion fee: Covers data availability on Tezos L1
- Gas prices are typically very low (~$0.001 per ERC-20 transfer)

### Block Hashes
Block hashes are computed differently on Etherlink. You cannot verify block hashes solely from the block header. This affects light client implementations and block hash verification tools.

### Finality
- ~500ms for sequencer confirmation
- ~8 seconds for data posted to Tezos L1
- Full finality after Tezos confirmation

### WebSockets
- Supported when running your own node with `--ws` flag
- Public RPC nodes don't expose WebSocket endpoints publicly

### Smart Contract Compatibility
Most Solidity/EVM contracts work unchanged. Watch for:
- Contracts relying on `PREVRANDAO` (may behave differently)
- Contracts verifying block hashes
- Contracts that depend on priority fee mechanics
- Solidity versions up to and including 0.8.24

### Best Practices
1. **Don't set priority fees** — they're ignored
2. **Don't rely on block hashes** for verification
3. **Account for bridge delays** in UX (deposits ~10-15min, withdrawals ~2 weeks)
4. **Test on Shadownet first** — it mirrors mainnet behavior
5. **Rate limit awareness** — 1000 req/min on public RPC

## Tezos L1 Bridge

Etherlink bridges to Tezos L1 for deposits/withdrawals.

- **Deposits (Tezos → Etherlink):** Initiated on Tezos L1, requires Tezos tooling, ~10-15 minutes
- **Withdrawals (Etherlink → Tezos):** Initiated on Etherlink (EVM tx), finalized on Tezos after challenge period, ~2 weeks (optimistic rollup)

## Contract Deployment & Verification

Deploy with Foundry:
```bash
forge script script/Deploy.s.sol \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url $VERIFIER_URL
```

Verify existing contract:
```bash
forge verify-contract <ADDRESS> <CONTRACT_NAME> \
  --chain-id $CHAIN_ID \
  --verifier blockscout \
  --verifier-url $VERIFIER_URL
```

## Troubleshooting

**"Unsupported network"**: Use correct network name (`etherlink`, `etherlink-shadownet`) or chain ID.

**Rate limited**: Public RPC has 1000 req/min limit. Back off and retry.

**Transaction failed**: Check balance, use legacy tx format if EIP-1559 causes issues, check for contract reverts.

## Resources

- [Etherlink Docs](https://docs.etherlink.com/)
- [Block Explorer (Mainnet)](https://explorer.etherlink.com)
- [Block Explorer (Shadownet)](https://shadownet.explorer.etherlink.com)
- [Faucet](https://shadownet.faucet.etherlink.com)

## Reference Files

See `references/` for detailed docs:
- `references/networks.md` — Full network config and MetaMask setup
- `references/differences.md` — Etherlink vs standard EVM differences
- `references/mcp-setup.md` — MCP server installation and configuration
- `references/endpoint-support.md` — Supported JSON-RPC methods
