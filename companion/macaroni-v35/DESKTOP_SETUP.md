# Macaroni V3.5 desktop setup

Macaroni Desktop and Pasta Suite Desktop already contain the private Companion service. The app creates its private data directory, encryption key, admin token, and a fail-closed configuration on first launch. You do not need to install Node.js or run a separate server for the desktop-managed path.

## Finish the desktop-managed Companion

1. In Macaroni Studio, choose **Open config folder**. The app selects the private `.env` file it actually uses. Do not share this folder or copy it into a website.
2. Read the disclosure comments in `.env`. Replace the unresolved mempool acknowledgement only after you understand it.
3. Configure the Tezos network and RPC. A creator-controlled or local Octez RPC is the secure preference. Using a third-party RPC is an explicit advanced trust expansion.
4. Configure durable IPFS publication with either a private Kubo API or a CAR-capable hosted upload service, plus a public gateway that can retrieve the committed CID.
5. Add a dedicated, low-balance Tezos finalizer secret key to `secrets/finalizer.key`. Never reuse a high-value wallet. Keep the generated `secrets/master.key` and `secrets/admin.token` private.
6. For a remotely hosted static drop, configure your Companion's public HTTPS address, the exact collector-page origin, and the reverse proxy. Expose only `/v1/public/*` and optionally `/health`; never expose `/v1/admin/*`, the raw Companion port, `.env`, `data/`, `secrets/`, Kubo, or provider credentials.
7. Return to Macaroni Studio and choose **Check again**. Studio remains safely locked until the complete doctor and private adapter checks pass.

The app deliberately does not create a finalizer key, accept disclosures, choose a storage provider, or invent public hostnames for you. Closing the app does not erase the setup. Correct the same files and check again when you return.

## Standalone or always-on machine

The adjacent `standalone-companion` folder is a complete secret-free source package for moving the service to an always-on macOS, Linux, Windows, or Docker host. Start with its `README.md`, then use the matching script in `scripts/` or `compose.yaml`. Its `.env.example`, Caddy template, API reference, and backup/recovery guide are included.

Never place `.env`, signer keys, admin tokens, private files, encrypted CARs, or Companion data in the static collector website. The exported drop page needs only the public service descriptor generated after Companion passes its public HTTPS/CORS checks.
