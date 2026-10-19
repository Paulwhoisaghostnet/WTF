# AT edge private-page routing

These files own the public `wtfos.me` TLS edge configuration. They preserve the existing AT/PDS services and add the authenticated private-page route back to the application's session authority.

| Source | Active AT-server path | Purpose |
| --- | --- | --- |
| `Caddyfile` | `/opt/platform/atproto-edge/Caddyfile` | Keeps public/PDS routing and proxies only `/_private/*` over private-network HTTPS to `10.0.0.2:443`, preserving the user-site Host and verifying the certificate as `wtfos.app`. |
| `tls-gate.py` | `/opt/platform/atproto-edge/tls-gate.py` | Retains known infrastructure/PDS handle authorization, then checks the application's registered-host authority for other `wtfos.me` hosts. Failed lookups deny certificate issuance. |

The normal `main` Hetzner workflow deploys the application. It does **not** install these files on the separate AT edge. Its existing compose deployment is `/opt/platform/atproto-edge/docker-compose.edge.yml`; retain that file, its network configuration, PDS routes, and wildcard DNS. This folder does not deploy the separate public PDS-backed site renderer.

## Test from the repository root

```sh
node --test scripts/atproto-edge-policy.test.mjs
```

The Node wrapper checks route ownership and runs the Python gate tests. The Python tests can also run directly:

```sh
python3 -B infra/atproto-edge/tls_gate_test.py
```

The gate keeps the existing four-second network lookup timeout. The gate never reads private content; the proxy forwards requests without replacing the application's owner/admin and session checks.

## Deploy on the AT server

1. Retain a timestamped backup of both active files and stage the reviewed sources separately. Confirm that the private-network upstream is reachable with valid TLS for `wtfos.app`, and validate the candidate Caddy configuration with the installed Caddy image before activation.
2. Copy the staged bytes **into the existing files**, for example with `cat staged-file > active-file`. Do not replace their inodes with `mv`: the running containers bind-mount these files.
3. Restart only the existing gate service, then validate and reload Caddy:

   ```sh
   cd /opt/platform/atproto-edge
   docker compose -f docker-compose.edge.yml restart tls-gate
   docker exec wtfos-edge-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec wtfos-edge-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

4. Verify that a registered app host and existing infrastructure/PDS hosts pass the TLS gate, while an unknown host is denied. Verify existing AT/PDS health, then run the real private-page browser handoff: owner and current strict admin can open it; anonymous and unrelated accounts cannot. Confirm wildcard DNS and public routes remain unchanged.
5. Preserve source hashes, validation/reload output, browser evidence, and fixture-cleanup receipts. If activation fails, restore the backup bytes into the same active file inodes, restart the gate, and validate/reload the restored Caddy configuration.

Do not expose application port 3000, disable upstream TLS verification, broaden the proxy beyond `/_private/*`, or publish private content into PDS. App-side publication and local fixtures cannot establish a working production subdomain.

See the [gameshow host runbook](../../docs/gameshow-host-runbook.md) for the user workflow and production proof. `WTF-BB-266` retains the broader public-renderer work separately.
