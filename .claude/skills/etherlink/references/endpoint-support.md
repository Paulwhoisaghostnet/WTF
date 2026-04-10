# Etherlink JSON-RPC Endpoint Support

Source: https://docs.etherlink.com/building-on-etherlink/endpoint-support

## Fully Supported

- `debug_traceBlockByNumber`
- `eth_accounts`
- `eth_blockNumber`
- `eth_call`
- `eth_chainId`
- `eth_coinbase`
- `eth_estimateGas`
- `eth_feeHistory`
- `eth_gasPrice`
- `eth_getBalance`
- `eth_getBlockByHash`
- `eth_getBlockByNumber`
- `eth_getBlockReceipts`
- `eth_getBlockTransactionCountByHash`
- `eth_getBlockTransactionCountByNumber`
- `eth_getCode`
- `eth_getLogs`
- `eth_getStorageAt`
- `eth_getTransactionByBlockHashAndIndex`
- `eth_getTransactionByBlockNumberAndIndex`
- `eth_getTransactionByHash`
- `eth_getTransactionCount`
- `eth_getTransactionReceipt`
- `eth_getUncleByBlockHashAndIndex`
- `eth_getUncleByBlockNumberAndIndex`
- `eth_getUncleCountByBlockHash`
- `eth_getUncleCountByBlockNumber`
- `eth_maxPriorityFeePerGas`
- `eth_sendRawTransaction`
- `eth_subscribe` (Experimental — requires own node with `--ws`)
- `net_version`
- `web3_clientVersion`
- `web3_sha3`

## Partially Supported

- `debug_traceCall` — callTracer and structLogger only
- `debug_traceTransaction` — callTracer and structLogger only
- `txpool_content` — testnet only

## Not Supported

- All `debug_*` methods (except traceBlockByNumber, traceCall, traceTransaction)
- All `engine_*` endpoints
- `eth_blobBaseFee`
- `eth_createAccessList`
- `eth_getFilterChanges`
- `eth_getFilterLogs`
- `eth_getProof`
- `eth_hashrate`
- `eth_mining`
- `eth_newBlockFilter`
- `eth_newFilter`
- `eth_newPendingTransactionFilter`
- `eth_protocolVersion`
- `eth_sendTransaction` (use `eth_sendRawTransaction` instead)
- `eth_sign`
- `eth_signTransaction`
- `eth_syncing`
- `eth_uninstallFilter`
- `net_listening`
- `net_peerCount`

## ethers.js SDK Compatibility

All commonly used methods work:
- `getBlock`
- `getTransactionReceipt`
- `getBlockNumber`
- `getBalance`
- `sendTransaction`

## Key Limitations for Developers

1. **No filter-based subscriptions** — `eth_newFilter`, `eth_getFilterChanges` are unsupported. Use `eth_getLogs` with polling instead.
2. **No `eth_sendTransaction`** — Must use `eth_sendRawTransaction` (sign client-side).
3. **No `eth_syncing`** — Cannot check sync status.
4. **Limited debug** — Only `traceBlockByNumber`, `traceCall`, and `traceTransaction` with callTracer/structLogger.
