# wtfOS Load Test Report — prod-baseline

- Target: `https://wtfos.app`
- Commit: `f625670`
- Started: 2026-06-17T20:47:33.505Z
- Finished: 2026-06-17T20:48:31.154Z
- Step duration: 20s, sample interval: 2000ms
- Journey mix: public:1

## Concurrency ramp — server load vs users

| Users | Client RPS | Client p95 (ms) | Client p99 (ms) | Err % | EL lag mean (ms) | EL lag p99 (ms) | CPU avg % | CPU max % | DB active/max | DB waiting max | RSS max (MB) | WS live max |
|------:|-----------:|----------------:|----------------:|------:|-----------------:|----------------:|----------:|----------:|--------------:|---------------:|-------------:|------------:|
| 1 | 0.15 | 911.4 | 911.4 | 0.0 | - | - | - | - | -/- | - | - | - |
| 3 | 0.55 | 1552.7 | 1552.7 | 0.0 | - | - | - | - | -/- | - | - | - |

## Load per user (server cost ÷ concurrent users)

| Users | RPS/user | CPU % /user | DB active /user | EL lag mean (ms) |
|------:|---------:|------------:|----------------:|-----------------:|
| 1 | 0.15 | - | - | - |
| 3 | 0.18 | - | - | - |

## Slowest endpoints at peak (3 users)

| Endpoint | Count | avg (ms) | p95 (ms) | p99 (ms) | max (ms) | errors |
|----------|------:|---------:|---------:|---------:|---------:|-------:|
| `GET /api/health` | 11 | 1321.9 | 1552.7 | 1552.7 | 1552.7 | 0 |
