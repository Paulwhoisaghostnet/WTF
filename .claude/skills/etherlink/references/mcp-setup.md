# Etherlink MCP Server Setup

The Etherlink MCP server provides direct blockchain interaction tools for Claude.

Source: https://github.com/efekucuk/etherlink-mcp-server

## Installation Options

### Installation (this project)

The MCP server is cloned into `etherlink-mcp-server/` at the project root and configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "etherlink": {
      "command": "bun",
      "args": ["run", "./etherlink-mcp-server/src/index.ts"],
      "env": {
        "EVM_PRIVATE_KEY": ""
      }
    }
  }
}
```

To set up from scratch:
```bash
git clone https://github.com/efekucuk/etherlink-mcp-server.git
cd etherlink-mcp-server
bun install
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NETWORK` | Network name or chain ID | `ethereum` |
| `PRIVATE_KEY` | Private key for write operations | none (read-only) |
| `RPC_URL` | Override default RPC URL | network default |

### Examples

**Etherlink Shadownet (read-only):**
```bash
NETWORK=etherlink-shadownet bun run start
```

**Etherlink Shadownet (with write access):**
```bash
NETWORK=etherlink-shadownet PRIVATE_KEY=0x... bun run start
```

## Available Tools

### Read Operations
- `get_balance` — Get XTZ balance for an address
- `get_block` — Get block by number or hash
- `get_transaction` — Get transaction details
- `get_transaction_receipt` — Get transaction receipt
- `call_contract` — Call a view function (automatic ABI fetching)
- `get_logs` — Query event logs
- `get_token_balance` — Get ERC20 token balance
- `get_token_info` — Get ERC20 token metadata

### Write Operations (require PRIVATE_KEY)
- `send_transaction` — Send XTZ with automatic gas estimation
- `transfer_token` — Transfer ERC20 tokens
- `deploy_contract` — Deploy a contract
- `write_contract` — Call a state-changing function

### Utility
- `estimate_gas` — Estimate gas for a transaction
- `get_gas_price` — Get current gas price
- `encode_function_data` — Encode contract call data
- `decode_function_result` — Decode contract return data

## Security Notes

1. **Never commit private keys** — Use environment variables
2. **Use read-only mode** when possible — Omit PRIVATE_KEY
3. **Test on Shadownet first** — Get free testnet XTZ from faucet
4. **Rate limits apply** — 1000 req/min on public RPC

## Troubleshooting

### "Network not found"
Use valid network identifier: `etherlink`, `etherlink-mainnet`, `42793`, `etherlink-shadownet`, `etherlink-testnet`, `127823`

### "Transaction failed"
- Insufficient XTZ balance
- Contract revert
- Check gas estimation

### "Rate limited"
Exceeded 1000 req/min. Wait, use own node, or batch requests.

### Private key issues
- Must start with `0x`
- Must be 64 hex characters (32 bytes)
- Account must have XTZ for gas
