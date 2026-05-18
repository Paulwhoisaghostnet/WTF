# jstz Local Sandbox Proof

Date: 2026-05-18

Status: PASSED for local sandbox adapter proof. This is not a production-network claim; jstz remains local/configurable until stable production endpoints exist.

## Environment

- CLI package: `@jstz-dev/cli@0.1.1-alpha.5`
- CLI output: `jstz 0.1.1-alpha.5`
- Sandbox image: `docker.io/jstzdev/jstzd:0.1.1-alpha.5`
- Docker host: Colima, Docker `29.2.1`
- Local proof network:
  - jstz node endpoint: `http://127.0.0.1:8933`
  - Octez RPC endpoint: `http://127.0.0.1:54321`

## Proof

The sandbox health endpoint returned HTTP 200 at `/health`.

The disposable account deployed a counter smart function:

```text
Smart function deployed by codex-proof at address: KT1LjUpf4JdfeNP644n4f7PWZSeVoU685wtw
```

Counter reads and writes succeeded:

```text
jstz run jstz://KT1LjUpf4JdfeNP644n4f7PWZSeVoU685wtw/get -n local-proof
"Current value is 0"

jstz run jstz://KT1LjUpf4JdfeNP644n4f7PWZSeVoU685wtw/increment -n local-proof
"Incremented. Current value is 1"

jstz run jstz://KT1LjUpf4JdfeNP644n4f7PWZSeVoU685wtw/get -n local-proof
"Current value is 1"
```

The repo guard was then run with a JSON argv proof command and returned `status: verified`, `canClaimAdapter: true`.

## Notes

- The official `jstz sandbox --container start` wrapper found Docker only when `DOCKER_HOST` was pointed at Colima, but still failed container creation on this host.
- The same official image worked when started directly with the canonical `jstz-sandbox` container name and explicit local port bindings.
- No private key, mnemonic, or production credential is recorded in this proof.
