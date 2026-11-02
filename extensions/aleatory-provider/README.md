# wtfOS Aleatory provider

This package runs the artist-selected Aleatory render service independently of the wtfOS web application. It polls official factory/collection state, renders assigned pieces through Cloudflare Browser Rendering, pins canonical media and metadata through Pinata, and publishes metadata with a dedicated render-agent wallet. It has no public listener or Studio UI.

The service uses the upstream polling interval when no interval is configured. The owner selected a launch fee of **0.5 XTZ (500,000 mutez)** on 2026-10-02, intentionally pricing wtfOS above Aleatory's own provider. This is a positioning decision, not a claim about measured profit or throughput. Mainnet registration, funding and operator transactions are separate, explicit setup steps. Preparing a release performs no blockchain operation; activating the daemon starts real metadata publishing for assigned work.

## Custody and runtime configuration

The operator owns provider configuration and withdrawals. The render agent publishes token metadata. These must be different wallets. The continuously running daemon receives only an encrypted **agent-only** keyring, never the production platform/root keyring or its master key.

| Path | Ownership and purpose |
| --- | --- |
| `/etc/wtf-aleatory-provider/provider.env` | `root:root`, mode `0600`; selected Cloudflare/Pinata credentials and explicit public configuration |
| `/var/lib/wtf-aleatory-provider/secrets/agent-keyring.json` | `wtf-aleatory-provider:wtf-aleatory-provider`, mode `0600`; only the configured render agent |
| `/var/lib/wtf-aleatory-provider/secrets/agent-master.key` | Same dedicated service ownership, mode `0600`; decrypts that agent keyring |
| `/var/lib/wtf-aleatory-provider/state/` | Dedicated service ownership, mode `0700`; persistent queue/recovery state and `health.json` |
| `/opt/wtf-aleatory-provider/releases/<git-sha>/` | Root-owned immutable source/dependency release |
| `/opt/wtf-aleatory-provider/current` | Atomic symlink selecting the service release |

Start from [`ops/provider.env.example`](ops/provider.env.example). Set the official mainnet router/registry, originated provider, operator and agent addresses from verified deployment evidence. `ALEA_RENDER_GAS_MUTEZ` must contain the owner's selected flat rendering fee. Mainnet is explicit; no Shadownet addresses are supplied as defaults.

Map only the required credentials into `CF_ACCOUNT_ID`, `CF_API_TOKEN`, and `PINATA_JWT`. Cloudflare requires account-scoped Browser Rendering write access. Do not import the whole application environment or `/etc/wtf/cloudflare.env`, which also contains unrelated DNS/R2 credentials. A dedicated scoped token can replace the selected token without changing the service design. Pinata credentials must support the media/metadata pinning operations the provider uses.

The systemd unit runs as `wtf-aleatory-provider`, with read-only agent custody, writable state, private temporary storage, no extra capabilities and no access to the platform signer directories. It retains OS resource defaults. It disables the upstream optional push listener; polling remains the work-discovery mechanism.

## Assemble a committed release

Use the isolated provider worktree. Commit the reviewed provider slice and its required shared dependencies first. Assembly reads bytes from the specified Git commit, not the working tree, so unrelated modifications, untracked secrets and application code do not enter the artifact.

```sh
node extensions/aleatory-provider/ops/assemble.mjs /tmp/wtf-aleatory-provider.tar.gz HEAD
python3 extensions/aleatory-provider/ops/verify-release.py /tmp/wtf-aleatory-provider.tar.gz
```

The output includes a `.sha256` transport checksum. The archive has its own file manifest and source commit. It contains the independent package/lockfile, provider source and vendored runtime, required signer modules/types, compiled provider contract JSON and these operator scripts. It contains no installed dependencies or credentials.

Transport the archive, checksum and the committed `ops/install.sh` / `ops/verify-release.py` bootstrap scripts through the established `scripts/wtf-ssh.sh` connection. Verify the transport checksum on the host before executing the installer. Keep any private configuration transfer separate from this source artifact and out of terminal output.

## Install and activate

The host needs Linux/systemd, Node at the version required by this package, npm, Python 3, and ordinary user-management utilities. The installer serializes provider installations, creates the dedicated account/directories and installs dependencies with the package's own lockfile. `npm ci` runs without lifecycle scripts or inherited credentials, as the non-root service user; a TypeScript runtime import checks the installed loader before the release becomes current.

On the host, using the verified bootstrap scripts:

```sh
sudo bash /path/to/verified/ops/install.sh /path/to/wtf-aleatory-provider.tar.gz
```

This prepares the release and unit without starting or enabling the daemon. Securely provision the dedicated environment and agent-only custody files with the ownership above. Once provider configuration and chain setup have been verified, activate the same artifact:

```sh
sudo bash /path/to/verified/ops/install.sh /path/to/wtf-aleatory-provider.tar.gz --activate
```

Activation checks the environment allowlist, mandatory fields, exact custody locations, file ownership/modes, mainnet agent identity and operator/agent separation. The runtime performs its own chain/configuration checks. The installer does not originate, register, fund, set prices or export keys.

This service does not belong to the `wtf-app` Docker Compose project and does not invoke `scripts/server-deploy.sh`. Routine wtfOS application deployments and their orphan-container cleanup therefore do not own this service. No application restart, migration, Caddy route or public port is needed.

## Verify operation and recover

```sh
sudo systemctl is-active wtf-aleatory-provider.service
sudo systemctl show wtf-aleatory-provider.service -p MainPID -p Result -p ExecMainStatus
sudo cat /var/lib/wtf-aleatory-provider/state/health.json
sudo journalctl -u wtf-aleatory-provider.service --since today
```

An active process is only startup evidence. Before advertising a working provider, verify router/registry registration and fees, agent balance, healthy polling, and a real assigned token's completed canonical media/metadata publication. Retain operation receipts, content hashes/CIDs and a public retrieval check. Never publish environment files, keyring contents, master keys or raw API responses containing credentials in support logs.

Stop with `sudo systemctl stop wtf-aleatory-provider.service`. Preserve its state and agent custody across upgrades or rollback. Reinstalling a previously reviewed artifact selects that immutable release; inspect pending operations and chain state before reactivating it. Never delete queue/state files merely to retry an uncertain on-chain write.

## Operator setup and price changes

One-off operator commands load `WTF_ALEATORY_ENV_FILE` and require the existing encrypted platform keyring through `WTF_ALEATORY_OPERATOR_KEYRING`, `WTF_ALEATORY_OPERATOR_MASTER_KEY_FILE`, and `WTF_ALEATORY_OPERATOR_WALLET_ID`. Keep these variables outside the daemon environment. The upstream provider's operator is immutable; verify that address before origination. Its render agent and flat fee can be changed by the operator later.

`src/operator.mts status` reads balances, live directory state and retained operation receipts. `estimate --for originate`, `estimate --for register`, and `estimate --for reveal-agent` simulate setup without broadcasting. `estimate --for fund-agent --amount-mutez <amount>` requires an explicit amount. Origination requires an existing dedicated agent and the explicitly chosen `ALEA_RENDER_GAS_MUTEZ`. Registration requires a confirmed provider address. Use a private operator receipt directory outside the daemon-writable state, such as `/var/lib/wtf-aleatory-provider/operator`, passed through `--receipt-dir` for every command.

Only commands with `--execute` broadcast. Funding additionally requires `--request-id` to distinguish a new top-up from a retry. Signed operation bytes and their hash are persisted before injection; a retry reconciles or reinjects the same operation. An uncertain or expired operation is not silently replaced.

To change the fee, estimate then execute the chosen amount:

```sh
node --import tsx extensions/aleatory-provider/src/operator.mts estimate --for set-price --price-mutez 500000 --receipt-dir /var/lib/wtf-aleatory-provider/operator
node --import tsx extensions/aleatory-provider/src/operator.mts set-price --price-mutez 500000 --request-id launch-price --execute --receipt-dir /var/lib/wtf-aleatory-provider/operator
```

The example preserves the owner's launch price. Each later change needs a new request ID and the desired integer mutez amount. After confirmation, update `ALEA_RENDER_GAS_MUTEZ` in the dedicated environment and restart the service, then verify on-chain storage and the directory. New mints use the live fee; this is manual repricing, not an exchange-rate oracle.

`src/prove.mts --pin` renders our diagnostic fixture twice, verifies deterministic PNGs and blocked network access, pins both the image and canonical metadata, and retrieves both through the configured IPFS content root. It records Cloudflare's actual billable browser milliseconds when supplied. Proof files explicitly state that no token was minted. This infrastructure proof does not replace an actual assigned token publication.

## Local packaging checks

```sh
python3 -m unittest discover -s extensions/aleatory-provider/ops -p 'test_*.py'
bash -n extensions/aleatory-provider/ops/install.sh
```

These checks exercise committed-only packaging, manifest integrity, secret-path exclusion, unsafe archive rejection and extraction preservation. They do not prove host service operation or an on-chain delivery.
