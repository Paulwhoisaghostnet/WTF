# Aleatory provider source

Vendored from [skullzarmy/aleatory](https://github.com/skullzarmy/aleatory) at
[`82bea97b21bd477f3bd66cb4e189c0f1627c9654`](https://github.com/skullzarmy/aleatory/tree/82bea97b21bd477f3bd66cb4e189c0f1627c9654),
verified against GitHub on 2026-10-02. The upstream license is the Unlicense;
its complete text is retained at `vendor/LICENSE`.

`vendor/provenance.json` records SHA-256 hashes of both the original upstream
bytes and the vendored bytes for every imported file. The provider contract's
source and compilation evidence are separately owned by `contract/`.

## Included source

The runtime slice includes the provider daemon, one-pass checker, explicit
retry runner, rendering harness, metadata builder and golden tests, dependency
resolver, fee helper, heartbeat and failure-state modules. Two files outside
the upstream provider directory are required: `src/lib/params.ts` supplies
canonical parameter normalization and `src/lib/harness-core.js` supplies the
exact seeded random implementation. Their upstream relative paths are
preserved under `vendor/`.

The platform frontend, news-art prototype, upstream key-generating setup
command and platform deployment command are not part of this runtime.
In particular, upstream `provider/setup.mts` prints its generated secret key;
wtfOS uses its existing isolated keyring custody instead.

## Local adaptations

- `provider/provider.mts` exports `configureRuntimeAdapters({ signer })` and
  `runtimeConfiguration()`. A supplied Taquito `Signer` is used directly;
  neither the adapter nor metadata publication requests `secretKey()`. Without
  an adapter, upstream `ALEA_AGENT_SK` behavior remains available. Once the
  toolkit is created, replacing its signer requires a process restart.
- `provider/daemon.mts` and `provider/run.mts` recognize that injected signer in
  their startup checks. Pinning still uses the unmodified Pinata interface.
- `provider/render.mts` sends `rejectRequestPattern: [".*"]` to Cloudflare
  Browser Rendering. This denies browser requests at the capture service in
  addition to upstream document CSP, including navigations that document CSP
  alone does not prevent. Cloudflare documents this field in the
  [snapshot API](https://developers.cloudflare.com/api/resources/browser_rendering/subresources/snapshot/methods/create/).
  Successful render results also expose optional `browserMsUsed`, parsed from
  Cloudflare's `X-Browser-Ms-Used` response header. Missing, empty, non-finite or
  negative values remain absent instead of becoming a zero-cost observation.
  The [Cloudflare pricing documentation](https://developers.cloudflare.com/browser-run/pricing/)
  identifies this header as browser usage in milliseconds for estimating cost;
  it is distinct from the caller's elapsed request time.
- `provider/heartbeat.ts` exports `configureHeartbeatObserver(callback)` for
  local health reporting without an HTTP listener. It delivers an immutable
  copy of each beat even when no remote heartbeat URL is configured. Observer
  failures are logged without interrupting the render queue.
- `provider/stuck.mts` stores its existing failure records under
  `ALEA_STATE_DIR/stuck.json` when configured, preserving state across releases.
  Without the variable it retains the upstream `provider/.state` location.

`vendor/provider/runtime.test.mts` is local. Its mocked publication exercises
the injected signer path without extracting a secret or signing a transaction;
other checks cover capture request isolation, browser-usage header parsing, trait extraction, local
heartbeat delivery and persistent failure state. Upstream metadata golden
tests are retained unchanged. Hosted capture and actual chain delivery require
the service's separate operational verification; these tests do not establish
that evidence.

## Runtime dependencies and configuration

Upstream's `.nvmrc` names Node 24. Its lockfile resolves
`@taquito/taquito`, `@taquito/signer` and `@taquito/utils` to 25.0.0, `blakejs`
to 1.2.1, `dotenv` to 18.0.2 and `tsx` to 4.23.15. The last two are root
development dependencies upstream, so copying the upstream manifest and then
omitting development dependencies would not produce a runnable daemon. This
extension maintains its own minimal runtime manifest and lockfile.

Configure the environment before importing `provider.mts`: chain endpoints,
provider and router addresses, and Pinata credentials are read at module
initialization. Then inject the keyring signer and local heartbeat observer,
and finally import the selected entrypoint. No operator key is needed in the
daemon. The upstream worker does not derive its endpoints from `TEZOS_NETWORK`;
set `TEZOS_RPC` and `TZKT_API` explicitly and verify their chain in the bootstrap.

The capture service receives only the generated HTML and a separate Cloudflare
API authorization header. The HTML contains source, verified dependencies,
seed and normalized parameters; it must never contain custody credentials.
The API token needs Browser Rendering Write permission. Images and metadata
use Pinata; the reference runtime does not provide a local Chromium or Kubo
adapter. Push listening remains optional and disabled by default.

## Known upstream behavior retained

`pendingIn()` returns the first five pending pieces for a generator, while the
daemon skips records marked stuck afterward. Five oldest stuck pieces can
therefore prevent later pending pieces in that generator from entering a pass.
This is a source-level limitation; no wtfOS assigned backlog has demonstrated
it, and this integration does not change upstream scheduling.

The upstream `retry` command bypasses the pending-document check and can
rewrite an already published token. It is a signing operation, not a read-only
health check. The daemon and retry runner must not be started concurrently
against the same agent. Upstream retry has no dry-run switch.

Gateway warming precedes publication, but upstream still publishes after all
its gateway warm attempts fail. A successful pin API response and a submitted
chain operation alone do not prove that indexers can retrieve the artifact.

The daemon's heartbeat reports a pass as up even when individual pieces fail
or remain stuck. Consumers should preserve the pass message and failure counts,
and should not interpret process liveness as successful fulfillment.

## Official mainnet discovery at inspection

The configuration served by `https://aleatory.art/contracts` named router
`KT1HTY5RFTUai5K2Bh2LVySQvSid9Mx2dP4J`. Its
[mainnet storage](https://api.tzkt.io/v1/contracts/KT1HTY5RFTUai5K2Bh2LVySQvSid9Mx2dP4J/storage)
named registry `KT1E7wraYc1cgywqDQX2KGMNF4TbCADsHVL9` and factory
`KT1NsgmgerVRF6K4jLDnXVYX7EnPaQuR9fYq`. These are observed public deployment
facts, not substitutes for fresh chain checks before onboarding. Follow the
router's factory history instead of pinning a factory override in production.

The upstream provider-only deploy option uses the platform deployment manifest,
starts the provider price at zero, and does not call registry `register`.
Provider registration and price configuration therefore belong in wtfOS's
separate explicit onboarding operation. The provider contract has no operator
rotation entrypoint, so its owner must be selected deliberately at origination.
