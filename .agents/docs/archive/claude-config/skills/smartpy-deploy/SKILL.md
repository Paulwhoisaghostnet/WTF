---
name: smartpy-deploy
description: >
  Compiles and deploys SmartPy smart contracts to the Tezos Shadownet testnet.
  Covers the full lifecycle: installing SmartPy via pip, setting up octez-client,
  creating and funding wallets via the Shadownet faucet, compiling contracts to Michelson,
  deploying (originating) contracts, calling entrypoints, and querying on-chain views.
  Use this skill whenever the user wants to deploy a SmartPy contract, compile to Michelson,
  set up a Tezos wallet, fund a testnet wallet, check tez balance, originate a contract,
  call a contract entrypoint on-chain, or query a Tezos view. Also trigger when the user
  mentions octez-client, Shadownet, testnet deployment, contract origination, .tz files,
  Michelson output, faucet funding, or "deploy to Tezos".
  This skill handles the ops/deployment side — for writing SmartPy contract code itself,
  the smartpy-new-syntax skill should be used instead (or alongside this one).
metadata:
  author: Johannes Simon
  version: 1.0.0
  category: blockchain-deployment
---

# SmartPy Compile & Deploy

This skill walks through the full deployment lifecycle for SmartPy contracts on the
Tezos Shadownet testnet. It assumes contracts are already written (see `smartpy-new-syntax`
skill for writing contracts).

## Workflow Overview

```
Install SmartPy -> Create Wallets -> Fund via Faucet -> Compile Contract
-> Review Output -> Prepare Storage -> Deploy -> Verify -> Call Entrypoints / Query Views
```

---

## Step 1: Install SmartPy

SmartPy is installed as a Python package in a virtual environment. This keeps it isolated
from system Python and avoids dependency conflicts.

```bash
python3 -m venv smartpy-env
source smartpy-env/bin/activate
pip install smartpy-tezos
```

After installation, contracts can be compiled and tested by running them directly:

```bash
source smartpy-env/bin/activate
python3 my_contract.py
```

A successful run (exit code 0) means compilation + tests passed. Warnings from `fa2_lib.py`
about `.contains()` deprecation are harmless and come from the library, not user code.

### Alternative: SmartPy CLI

If the SmartPy CLI (`SmartPy.sh`) is installed separately (e.g., at `~/smartpy-cli/`),
contracts can also be compiled via:

```bash
~/smartpy-cli/SmartPy.sh compile contracts/my_contract.py \
  output/my_contract_output --html --purge
```

The `--purge` flag cleans previous output. The `--html` flag generates a browsable report.

---

## Step 2: Create & Fund Wallets

### 2a. Configure octez-client

The `octez-client` binary is the standard Tezos CLI. Point it at the Shadownet RPC endpoint:

```bash
export TEZOS_CLIENT_UNSAFE_DISABLE_DISCLAIMER=YES
octez-client --endpoint https://rpc.shadownet.teztnets.com config update
```

The `TEZOS_CLIENT_UNSAFE_DISABLE_DISCLAIMER` variable suppresses a safety prompt that blocks
scripted usage. This is fine for testnet work.

### 2b. Generate Wallets

```bash
octez-client gen keys wallet1
octez-client gen keys wallet2
```

View the generated addresses:

```bash
octez-client show address wallet1
octez-client show address wallet2
```

List all known wallets:

```bash
octez-client list known addresses
```

Each wallet gets a `tz1...` address. Save these — you'll need them for funding and deployment.

### 2c. Fund Wallets via Faucet

Shadownet wallets start with 0 tez. Fund them via the faucet:

1. Go to **https://faucet.shadownet.teztnets.com/**
2. Paste the `tz1...` address
3. Request tez (20 tez is usually enough for multiple deployments)

Repeat for each wallet that needs funds.

### 2d. Verify Balances

```bash
octez-client --endpoint https://rpc.shadownet.teztnets.com get balance for wallet1
octez-client --endpoint https://rpc.shadownet.teztnets.com get balance for wallet2
```

If the balance shows `0 ꜩ` right after funding, wait 30 seconds and try again — it takes
one block confirmation.

---

## Step 3: Compile Contract

Run the SmartPy contract file to compile and test:

```bash
source smartpy-env/bin/activate
python3 my_contract.py
```

For CLI-based compilation:

```bash
~/smartpy-cli/SmartPy.sh compile my_contract.py \
  output/my_contract --html --purge
```

### Understanding the Output

The output directory contains several files. Check `log.txt` to locate the compiled artifacts.
The key files are:

| File | Purpose |
|------|---------|
| `step_XXX_cont_N_contract.tz` | Michelson contract code (the program) |
| `step_XXX_cont_N_storage.tz` | Initial storage in Michelson format |
| `step_XXX_cont_N_types.tz` | Type definitions |
| `log.txt` | Build log with file locations |

The `XXX` is the step number and `N` is the contract index (0 for the first contract in the
scenario, 1 for the second, etc.). For a typical single-contract deployment, look for
`step_000_cont_0_contract.tz` and `step_000_cont_0_storage.tz`.

**Important:** If your test scenario deploys multiple contracts (e.g., an FA2 token + a
marketplace), each contract gets its own `cont_N` index. Check `log.txt` to identify which
index corresponds to which contract.

---

## Step 4: Prepare Storage

Before deploying, review the initial storage file (`step_XXX_cont_N_storage.tz`). This
contains the Michelson-encoded initial state of your contract.

If you need custom initial storage (e.g., setting a specific admin address), you have two
options:

1. **Modify the SmartPy test** to set the desired initial values, then recompile
2. **Edit the Michelson storage directly** (advanced — only for simple changes like addresses)

**Ask the user** what initial values they want for storage fields (admin address, project
address, etc.) before deploying. The storage must match the contract's expected types exactly.

---

## Step 5: Deploy Contract to Shadownet

```bash
octez-client --endpoint https://rpc.shadownet.teztnets.com \
  originate contract MY_CONTRACT_NAME \
  transferring 0 from wallet1 \
  running output/my_contract/step_000_cont_0_contract.tz \
  --init "$(cat output/my_contract/step_000_cont_0_storage.tz)" \
  --burn-cap 5
```

**Parameters explained:**
- `MY_CONTRACT_NAME` — a local alias for the contract (only stored in octez-client, not on-chain)
- `transferring 0` — send 0 tez to the contract on deployment (use a value if the contract needs initial balance)
- `from wallet1` — the wallet paying for deployment gas
- `running ...contract.tz` — path to the compiled Michelson code
- `--init "$(cat ...storage.tz)"` — initial storage value
- `--burn-cap 5` — max tez to burn for storage allocation (5 is generous for most contracts)

### Successful Deployment

On success, octez-client prints the new contract address (`KT1...`). Save this address —
you'll need it for all subsequent interactions.

```
New contract KT1AbCdEf... originated.
```

You can also look it up later:

```bash
octez-client list known contracts
```

### Common Deployment Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `balance_too_low` | Wallet doesn't have enough tez | Fund via faucet |
| `storage_limit_exceeded` | `--burn-cap` too low | Increase `--burn-cap` |
| `ill_typed_data` | Storage doesn't match contract types | Recompile with correct init values |

---

## Step 6: Call Entrypoints

Once deployed, call contract entrypoints via `transfer`:

```bash
octez-client --endpoint https://rpc.shadownet.teztnets.com \
  transfer 0 from wallet1 to KT1...CONTRACT_ADDRESS \
  --entrypoint "entrypoint_name" \
  --arg 'MICHELSON_PARAMETER' \
  --burn-cap 0.5
```

**Parameters:**
- `transfer 0` — tez to send (use a value for payable entrypoints like `buy_one`)
- `from wallet1` — the calling wallet
- `to KT1...` — the contract address
- `--entrypoint` — the entrypoint name (e.g., `"add_admin"`, `"buy_one"`)
- `--arg` — Michelson-encoded parameter

### Parameter Encoding Examples

The `--arg` value must be valid Michelson. Common patterns:

```bash
# Address parameter
--arg '"tz1YourAddress..."'

# Nat parameter
--arg '42'

# Record parameter (e.g., register_token)
--arg '(Pair "tz1ArtistAddr..." (Pair "KT1FA2Addr..." (Pair 0 5)))'

# Unit parameter (no args)
--arg 'Unit'
```

For complex parameters, check the contract's `_types.tz` file to see the expected Michelson
type structure. The types file maps entrypoint names to their parameter types.

### Sending Tez with a Call

For payable entrypoints (e.g., buying an NFT), set the transfer amount:

```bash
octez-client --endpoint https://rpc.shadownet.teztnets.com \
  transfer 1 from wallet1 to KT1...CONTRACT_ADDRESS \
  --entrypoint "buy_one" \
  --arg '0' \
  --burn-cap 0.5
```

---

## Step 7: Query On-Chain Views

Views are read-only functions that don't create transactions:

```bash
octez-client --endpoint https://rpc.shadownet.teztnets.com \
  run view VIEW_NAME on contract KT1...CONTRACT_ADDRESS \
  with input 'MICHELSON_INPUT'
```

Example:

```bash
# Query a balance view
octez-client --endpoint https://rpc.shadownet.teztnets.com \
  run view get_balance on contract KT1...CONTRACT_ADDRESS \
  with input '(Pair "tz1OwnerAddr..." 0)'
```

---

## Quick Reference

### Endpoint
All Shadownet commands use: `--endpoint https://rpc.shadownet.teztnets.com`

### Faucet
Fund wallets at: **https://faucet.shadownet.teztnets.com/**

### Common octez-client Commands

```bash
# Check balance
octez-client --endpoint https://rpc.shadownet.teztnets.com get balance for WALLET

# List wallets
octez-client list known addresses

# List deployed contracts
octez-client list known contracts

# Get contract storage
octez-client --endpoint https://rpc.shadownet.teztnets.com get contract storage for KT1...

# Get contract entrypoints
octez-client --endpoint https://rpc.shadownet.teztnets.com get contract entrypoints for KT1...
```

### Troubleshooting

- **"command not found: octez-client"** — Install via your OS package manager or download from https://tezos.gitlab.io/
- **Connection errors** — Shadownet RPC might be temporarily down; try again in a few minutes
- **"ill_typed_data" on deploy** — Usually a storage mismatch; recompile with correct initial values
- **Transaction stuck** — Wait 30 seconds for block confirmation; Shadownet blocks are ~8 seconds
