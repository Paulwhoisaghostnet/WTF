# wtfOS Load Harness

A configurable, Playwright-based concurrency ramp that drives real wtfOS user
journeys against a running server while sampling server-side runtime metrics, so
we can measure **load per user**, find where latency breaks down, and pin the
root cause of WTF Live lag.

## What it measures

For each ramp step (default `1 → 5 → 10 → 25 → 50` concurrent users) it records:

- **Client latency** per endpoint (avg / p50 / p95 / p99 / max) and request rate.
- **Server runtime metrics** from `GET /api/metrics` (delta-polled): event-loop
  lag, CPU %, DB pool active/waiting, RSS, live WebSocket counts, and
  full-chain per-route latency.
- **Load per user** = server cost ÷ concurrent users, to expose non-linear
  (super-linear) scaling.

Results are written to `tests/load/results/load-<label>-<timestamp>.{json,md}`.

## Prerequisites

The server must expose `/api/metrics`. It is admin-gated by default; for the
harness, set a shared token on **both** the server and the harness:

```bash
# server (.env or shell): enables token access to /api/metrics
export WTF_METRICS_TOKEN="some-long-random-string"
# harness reads the same token
export WTF_METRICS_TOKEN="some-long-random-string"
```

Without the token (and without an admin session) the harness still runs but
server metrics will be empty and only client-side timings are reported.

For authenticated journeys (`lobby`, `browse`), seed puppet users first:

```bash
npm run test:e2e:puppets:seed
```

## Local ramp (recommended for root-cause)

Run a production-like server locally with the rate-limit bypass and metrics
token, then ramp:

```bash
# Terminal 1 — production build, single process (mirrors Hetzner)
npm run build
WTF_METRICS_TOKEN=devtoken WTF_E2E_RATE_LIMIT_BYPASS=1 NODE_ENV=production \
  node dist/index.cjs

# Terminal 2 — ramp 1→50
WTF_METRICS_TOKEN=devtoken npm run load:test
```

To stress the WTF Live realtime path specifically, create/seed a public room
and pass its id, and weight the mix toward rooms:

```bash
WTF_METRICS_TOKEN=devtoken WTF_LOAD_ROOM_ID=<roomId> \
  WTF_LOAD_MIX="room:0.6,lobby:0.4" npm run load:test
```

## Gentle production baseline

Production applies a 200 req/min-per-IP limiter with no bypass, so a single
machine cannot realistically simulate many distributed users — it just measures
the limiter. Use the gentle, guest-only, rate-capped baseline instead:

```bash
npm run load:test:prod-baseline
```

This hits `https://wtfos.app` with guest `public` journeys, 1 and 3 users, and a
4 rps cap to capture a real-world latency baseline without impacting users.

## Configuration (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `WTF_LOAD_BASE_URL` | `http://127.0.0.1:3000` | Target server |
| `WTF_METRICS_TOKEN` | – | Token for `/api/metrics` |
| `WTF_LOAD_STEPS` | `1,5,10,25,50` | Concurrency ramp |
| `WTF_LOAD_STEP_SECONDS` | `30` | Duration per step |
| `WTF_LOAD_SETTLE_SECONDS` | `6` | Cooldown between steps |
| `WTF_LOAD_SAMPLE_MS` | `2000` | Metrics sample interval |
| `WTF_LOAD_MIX` | `lobby:0.5,browse:0.35,room:0.15` | Journey weighting |
| `WTF_LOAD_AUTH` | `auto` | `auto` \| `guest` \| `required` |
| `WTF_LOAD_ROOM_ID` | – | Public WTF Live room id for `room` journey |
| `WTF_LOAD_MAX_RPS` | `0` | Global request cap (0 = unlimited) |
| `WTF_LOAD_LABEL` | `local` | Report label |
| `WTF_LOAD_ALLOW_PRODUCTION` | – | Must be `1` to target prod hosts |

## Journeys

- `lobby` (auth): polls `/api/wtf-live/rooms`, `/rooms/mine`, `/rooms/private`
  every 5s — the identified non-linear hot path (per-room presence scan over the
  global WebSocket client set).
- `browse` (auth): desktop settings, in-app market, notifications, atproto/me.
- `public` (guest): `/api/health` + optional public room metadata. Safe for prod.
- `room` (guest, WS): opens `/ws/wtf-live`, joins a room, sends periodic chat —
  exercises WebSocket broadcast fan-out. Requires `WTF_LOAD_ROOM_ID`.
