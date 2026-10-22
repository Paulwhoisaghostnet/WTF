# Quality verification — October 22, 2026

[Quality Gates run 39846715405](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39846715405) completed **successfully** for main commit `e266b0daa54b73e05e0b53cc304e99ea6fca45e7` at `2026-10-22T20:29:39Z`. Results below were read from the completed GitHub run and its logs; no duplicate suite was started for this receipt.

| Check | Completed result |
| --- | --- |
| Production dependency audit | 0 vulnerabilities |
| Aggregate unit suite | 2638 tests: 2620 passed, 0 failed, 18 skipped |
| Supply-chain policy | 4 passed, 0 failed |
| Public release boundary, Docker build-context boundary, environment inventory, bounty-board integrity | Passed |
| Particle Painter lint | Passed |
| CycloneDX SBOM generation and artifact upload | Passed |
| Typecheck, Vite environment policy, production build | Passed |
| Inventory registry | 253/253 rows, 995/995 handles; 120 route fixtures, 18 domain workflows, 75 admin surfaces |
| Chromium inventory suite | 741 passed, 0 failed; reported duration 13.7 minutes |
| External link safety | Passed |
| SmartPy V1.2 job | Marketplace and buyback contract tests, Macaroni V3 compilation, generated-artifact diff check passed |

The application-quality job ran from `20:11:56Z` to `20:29:38Z`; the SmartPy job completed at `20:13:19Z`. Inventory registry and route smoke establish their stated coverage and reachability; the separate MCP production and actor receipts establish the remediated authentication and tool behavior.

## Later image-ownership change

Between `e266b0da` and `c21e4aa7fb02ecf17c436c66292299728171f09a`, application JavaScript/TypeScript and dependencies were unchanged. The executable change was Dockerfile ownership/layer handling: `COPY --chown=node:node`, ownership of the dependency layer, and owned writable-directory creation replace the later recursive ownership layer. Remaining changes were documentation/evidence and bounty records. Deployment and actual image ownership are verified in the [deployed image receipt](deploy-disk-recovery.md).

[Quality Gates run 39848495614](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39848495614) for `c21e4aa7` failed its aggregate unit stage: **2618 passed, 2 failed, 18 skipped** out of 2638. Both failures were static Dockerfile-string assertions that required the previous `COPY --from=builder /app/...` spelling:

- `server/features/wtfiap/authority.test.ts:163` — expected the server-directory COPY without `--chown`.
- `server/routes/collection-factory-policy.test.ts:46` — expected the contracts-directory COPY without `--chown`.

The production audit, supply-chain policy, release/build-context boundaries, environment/board checks, and SmartPy job passed in that run. App checks after the unit failure were skipped, so this run is **not** recorded as an aggregate pass.

The two assertions were corrected to allow the exact optional `--chown=node:node` flag while retaining the builder source and source/destination path checks. The focused run reproduced **3 passed / 2 failed** before that correction, then **5 passed / 0 failed / 0 skipped** using official Node 22.23.4 and:

```sh
node --import tsx --test server/features/wtfiap/authority.test.ts server/routes/collection-factory-policy.test.ts
```

That owning suite includes the WTFIAP HTTP/authentication/CSRF/SSE/persistence checks. Only the two static assertions changed; production source did not change for this correction. The successful `e266b0da` full suite and the focused correction proof are reported separately rather than presenting the failed `c21e4aa7` run as green.

## Superseded run

[Quality Gates run 39845359034](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39845359034), commit `c2dcb07754a0b055711913dc7f6008b6102c03b0`, was still in inventory when the newer `e266b0da` run passed. It was **canceled as superseded** to stop redundant work; `gh run watch` confirmed cancellation. Its completed earlier stages are not used to claim a full pass.
