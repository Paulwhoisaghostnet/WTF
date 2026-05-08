---
name: etherlink-api
description: "Etherlink blockchain API reference for Shadownet and Mainnet. Use when querying on-chain data, reading contract state, fetching transactions, tokens, or addresses from Etherlink (Tezos EVM L2). Covers Blockscout v2 REST API, etherscan-compatible v1 API, and JSON-RPC endpoints."
metadata:
  version: "1.1.0"
  author: MochiMinds
---

# Etherlink API Reference

Complete API guide for Etherlink — a Tezos EVM L2 chain. Covers three API layers:
1. **Blockscout v2 REST API** — rich, paginated endpoints for blocks, transactions, addresses, tokens, contracts
2. **Etherscan-compatible v1 API** — legacy format compatible with ethers.js and standard EVM tooling
3. **JSON-RPC** — standard Ethereum RPC for direct chain interaction

## When to Use This Skill

Use this skill when you need to:
- Query on-chain data from Etherlink (balances, transactions, tokens, contracts)
- Build API integrations that read from Etherlink's block explorer
- Configure wallet connections for Etherlink networks
- Verify deployed contracts on the Etherlink explorer
- Build indexers or event listeners for Etherlink contracts

## Network Configuration

### Shadownet (Testnet)
| Field | Value |
|-------|-------|
| Chain ID | 127823 (`0x1F34F`) |
| RPC | `https://node.shadownet.etherlink.com` |
| Explorer | `https://shadownet.explorer.etherlink.com` |
| API v2 Base | `https://shadownet.explorer.etherlink.com/api/v2` |
| API v1 Base | `https://shadownet.explorer.etherlink.com/api` |
| Faucet | `https://shadownet.faucet.etherlink.com/` |
| Native Token | XTZ (18 decimals) |
| Block Time | ~4.6 seconds (approximate) |
| Rate Limit | ~1000 requests/minute (approximate) |

### Mainnet
| Field | Value |
|-------|-------|
| Chain ID | 42793 |
| RPC | `https://node.mainnet.etherlink.com` |
| Explorer | `https://explorer.etherlink.com` |
| API v2 Base | `https://explorer.etherlink.com/api/v2` |
| API v1 Base | `https://explorer.etherlink.com/api` |

### Network Switching Pattern

Use environment variables to switch between networks:

```typescript
const NETWORKS = {
  shadownet: {
    chainId: 127823,
    rpc: "https://node.shadownet.etherlink.com",
    apiV2: "https://shadownet.explorer.etherlink.com/api/v2",
    apiV1: "https://shadownet.explorer.etherlink.com/api",
    explorer: "https://shadownet.explorer.etherlink.com",
  },
  mainnet: {
    chainId: 42793,
    rpc: "https://node.mainnet.etherlink.com",
    apiV2: "https://explorer.etherlink.com/api/v2",
    apiV1: "https://explorer.etherlink.com/api",
    explorer: "https://explorer.etherlink.com",
  },
} as const;

const network = process.env.NEXT_PUBLIC_ETHERLINK_NETWORK === "mainnet" ? "mainnet" : "shadownet";
const config = NETWORKS[network];
```

---

## Blockscout v2 REST API

Base URL: use `config.apiV2` from the network switching pattern above.

All list endpoints return `{ "items": [...], "next_page_params": {...} | null }`.
Paginate by passing `next_page_params` values as query parameters.

### Network Stats

```
GET /stats
```
Returns network overview:
- `total_blocks`, `total_transactions`, `total_addresses`
- `average_block_time` (milliseconds)
- `gas_prices` (slow, average, fast in Gwei)
- `transactions_today`, `gas_used_today`
- `coin_price`, `market_cap`, `tvl`
- `network_utilization_percentage`

### Blocks

```
GET /main-page/blocks               # Recent blocks (array, no pagination)
GET /blocks                          # Paginated block list
GET /blocks/{number_or_hash}         # Single block details
GET /blocks/{number}/transactions    # Transactions within a specific block
```

Block fields: `hash`, `height`, `parent_hash`, `timestamp`, `gas_used`, `gas_limit`, `base_fee_per_gas`, `transactions_count`, `miner` (object), `size`, `type`

### Transactions

```
GET /main-page/transactions              # Recent transactions (array)
GET /transactions                         # Paginated list
GET /transactions/{hash}                  # Single transaction
GET /transactions/{hash}/internal-transactions
GET /transactions/{hash}/logs
GET /transactions/{hash}/token-transfers
GET /transactions/{hash}/state-changes    # State diff for a transaction
```

Transaction fields: `hash`, `status` ("ok"), `result` ("success"), `method`, `block_number`, `timestamp`, `from` (object), `to` (object), `value`, `gas_used`, `gas_price`, `fee`, `decoded_input`, `confirmations`, `transaction_types`, `token_transfers`

### Addresses

```
GET /addresses/{hash}                     # Address info
GET /addresses/{hash}/transactions        # Transaction history
GET /addresses/{hash}/token-transfers     # Token transfers
GET /addresses/{hash}/tokens              # Tokens held
GET /addresses/{hash}/internal-transactions
GET /addresses/{hash}/logs
GET /addresses/{hash}/coin-balance-history
GET /addresses/{hash}/counters            # Transaction/token counters
```

Address fields: `hash`, `coin_balance` (wei string — divide by 1e18 for XTZ), `is_contract`, `is_verified`, `name`, `creation_transaction_hash`, `creator_address_hash`, `has_tokens`, `has_token_transfers`, `has_logs`, `token` (if ERC-20/721)

### Tokens

```
GET /tokens                               # All tokens (paginated)
GET /tokens/{address}                     # Token details
GET /tokens/{address}/transfers           # Transfer history
GET /tokens/{address}/holders             # Token holder list
GET /tokens/{address}/instances           # NFT instances (ERC-721/1155)
GET /tokens/{address}/counters            # Transfer counters
```

Token fields: `address_hash`, `name`, `symbol`, `decimals`, `type` ("ERC-20"|"ERC-721"|"ERC-1155"), `total_supply`, `holders_count`, `exchange_rate`, `circulating_market_cap`

### Smart Contracts

```
GET /smart-contracts                      # Verified contracts (paginated)
GET /smart-contracts/{address}            # Contract details + source + ABI
GET /smart-contracts/{address}/methods-read   # Read-only methods
GET /smart-contracts/{address}/methods-write  # State-changing methods
POST /smart-contracts/{address}/query-read-method  # Execute a read method
```

Contract fields: `source_code`, `compiler_version`, `optimization_enabled`, `optimization_runs`, `is_verified`, `verified_at`, `abi` (array), `deployed_bytecode`, `creation_status`

**Calling a read method via API:**
```typescript
const result = await fetch(`${config.apiV2}/smart-contracts/${address}/query-read-method`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    args: ["0x1234..."],  // method arguments
    method_id: "0x70a08231",  // function selector (e.g., balanceOf)
    contract_type: "regular",
  }),
});
```

### Search

```
GET /search?q={query}                     # Search blocks, txs, addresses, tokens
```

Returns items with `type` field: "token", "address", "contract", "block", "transaction"

---

## Etherscan-Compatible v1 API

Base URL: use `config.apiV1` from the network switching pattern above.

Standard etherscan format — compatible with ethers.js `EtherscanProvider`.

### Account

```
GET ?module=account&action=balance&address={addr}
GET ?module=account&action=txlist&address={addr}&page=1&offset=10
GET ?module=account&action=listaccounts&page=1&offset=10
```

Response format:
```json
{
  "status": "1",
  "message": "OK",
  "result": "36595011118000000000"
}
```

### Contract

```
GET ?module=contract&action=getabi&address={addr}
GET ?module=contract&action=getsourcecode&address={addr}
```

### Transaction

```
GET ?module=transaction&action=gettxreceiptstatus&txhash={hash}
```

### Logs (Event Indexing)

```
GET ?module=logs&action=getLogs&address={addr}&fromBlock=0&toBlock=latest&topic0={topic}
```

This is one of the most used endpoints for indexing contract events. Filter by topic0 (event signature hash) to get specific events.

---

## JSON-RPC

Standard Ethereum JSON-RPC at the network's RPC URL.

### Common Methods

```typescript
import { createPublicClient, createWalletClient, http, formatEther, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Public client (read operations)
const publicClient = createPublicClient({
  transport: http(config.rpc),
});

// Balance (returns BigInt in wei)
const balance = await publicClient.getBalance({ address: "0x..." });
const xtz = formatEther(balance); // Convert wei to XTZ

// Block
const block = await publicClient.getBlock();

// Transaction
const tx = await publicClient.getTransaction({ hash: "0x..." });

// Call contract (read)
const contract = getContract({ address, abi, client: publicClient });
const result = await contract.read.someViewFunction();

// Send transaction (write)
const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({
  account,
  transport: http(config.rpc),
});
const hash = await walletClient.writeContract({
  address, abi, functionName: "someFunction", args: [arg1, arg2],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

### Wallet Configuration (MetaMask / injected)

```typescript
const ETHERLINK_CHAIN = {
  chainId: `0x${config.chainId.toString(16)}`,
  chainName: network === "mainnet" ? "Etherlink" : "Etherlink Shadownet",
  rpcUrls: [config.rpc],
  nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  blockExplorerUrls: [config.explorer],
};
```

---

## TypeScript API Client Example

```typescript
async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${config.apiV2}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Etherlink API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

// Network stats
const stats = await fetchApi("/stats");

// Address info + balance in XTZ
const addr = await fetchApi<{ coin_balance: string }>(`/addresses/${hash}`);
const balanceXtz = Number(BigInt(addr.coin_balance)) / 1e18;

// Recent transactions
const txs = await fetchApi("/main-page/transactions");

// Token list (paginated)
const tokens = await fetchApi<{ items: Token[]; next_page_params: object | null }>("/tokens");

// Contract source + ABI
const contract = await fetchApi(`/smart-contracts/${address}`);

// Search
const results = await fetchApi(`/search?q=${encodeURIComponent(query)}`);
```

---

## Contract Verification

After deploying with Foundry, verify on the explorer:

```bash
forge verify-contract <ADDRESS> <CONTRACT_NAME> \
  --chain-id $CHAIN_ID \
  --verifier blockscout \
  --verifier-url $VERIFIER_URL
```

Or via the Foundry deploy script:
```bash
forge script script/Deploy.s.sol \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url $VERIFIER_URL
```

Use env vars (`RPC_URL`, `VERIFIER_URL`, `CHAIN_ID`) so the same commands work for Shadownet and Mainnet.

---

## Error Handling

Common API error responses:

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Parse response body |
| 404 | Address/tx/block not found | Show "not found" in UI |
| 422 | Invalid parameters | Check parameter format |
| 429 | Rate limited | Back off and retry after 1 second |
| 500 | Server error | Retry with exponential backoff |

For v1 API, errors return `{ "status": "0", "message": "NOTOK", "result": "..." }`.

## Rate Limiting

- API rate limit: ~**1000 requests per minute** (approximate, may vary)
- No API key required for read endpoints
- For high-volume usage, add delays between requests or implement request queuing
- If you receive 429 responses, back off exponentially

## Important Notes

- All `coin_balance` and `value` fields are in **wei** — use viem's `formatEther(value)` to convert to XTZ
- Addresses are checksummed (mixed-case hex)
- `decoded_input` on transactions contains parsed function calls when the contract is verified
- The `next_page_params` object is `null` when there are no more pages
- All code examples use the network switching pattern — replace with your config for the target network
