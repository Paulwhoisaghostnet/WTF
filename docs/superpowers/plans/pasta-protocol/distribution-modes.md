# Subplan — Distribution Modes (Owner Directive #3)

Every Pasta app ships in two modes from one codebase.

## wtfOS-embedded

- Running inside wtfOS, authenticated.
- Trusted creators get backend privileges: wtfOS-managed IPFS pinning, storage, and published-site
  hosting, plus optional Kiln backend-signed origination for trusted flows.
- Backend features are gated by role (`trusted_creator` and above) and policy, server-side.

## Downloaded / standalone

- The static `public/creation-tools/<app>/` bundle, run anywhere.
- No wtfOS backend. The user must supply their own pinning (e.g. their Pinata key or own IPFS node),
  storage, and hosting.
- Same compile/configure/deploy/export tooling; only the convenience backend is absent.

## Implementation rule

- A single capability flag (resolved at runtime: embedded+role vs standalone) toggles backend-backed
  affordances. Standalone never calls wtfOS endpoints.
- Mirrors Macaroni's existing behavior; do not regress Macaroni.
