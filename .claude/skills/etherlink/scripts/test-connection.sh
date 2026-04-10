#!/bin/bash
# Test Etherlink RPC connectivity for both networks

echo "=== Etherlink RPC Connection Test ==="
echo ""

# Mainnet
echo "--- Mainnet (Chain ID: 42793) ---"
MAINNET_CHAIN_ID=$(curl -s -X POST https://node.mainnet.etherlink.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  | grep -o '"result":"[^"]*"' | cut -d'"' -f4)

if [ "$MAINNET_CHAIN_ID" = "0xa729" ]; then
  echo "  Chain ID: $MAINNET_CHAIN_ID (42793)"

  MAINNET_BLOCK=$(curl -s -X POST https://node.mainnet.etherlink.com \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
  MAINNET_BLOCK_DEC=$((MAINNET_BLOCK))
  echo "  Latest Block: $MAINNET_BLOCK_DEC"
else
  echo "  Failed to connect or unexpected chain ID: $MAINNET_CHAIN_ID"
fi

echo ""

# Shadownet
echo "--- Shadownet (Chain ID: 127823) ---"
SHADOWNET_CHAIN_ID=$(curl -s -X POST https://node.shadownet.etherlink.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  | grep -o '"result":"[^"]*"' | cut -d'"' -f4)

if [ "$SHADOWNET_CHAIN_ID" = "0x1f34f" ]; then
  echo "  Chain ID: $SHADOWNET_CHAIN_ID (127823)"

  SHADOWNET_BLOCK=$(curl -s -X POST https://node.shadownet.etherlink.com \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
  SHADOWNET_BLOCK_DEC=$((SHADOWNET_BLOCK))
  echo "  Latest Block: $SHADOWNET_BLOCK_DEC"
else
  echo "  Failed to connect or unexpected chain ID: $SHADOWNET_CHAIN_ID"
fi

echo ""
echo "=== Done ==="
