# Desktop build dependency and embedded Node follow-up

## Requested outcome and proof

Remove the eight historical build-only findings without downgrading dependencies, preserve the newer production fixes, and move Electron to a supported stable runtime containing the October Node security update if such a binary is published. Prove the dependency graph, downloader behavior and actual packaging; promote the safe change through the normal production path. A source-branch version bump alone does not establish an available or deployed Electron runtime.

## Build dependency correction

All nine desktop manifests use this narrow npm override:

```json
"overrides": {
  "@electron/get@3.1.0": {
    "global-agent": "4.1.3"
  }
}
```

Electron remains 43.8.3 and electron-builder remains 26.15.3. The builder's downloader remains @electron/get 3.1.0. Stable global-agent 4.1.3 removes its obsolete logging dependencies, including `roarr` and the vulnerable `sprintf-js`, while retaining the CommonJS bootstrap interface consumed by the downloader. This physically removes the known vulnerable package; it is neither an audit suppression nor a package alias.

The historical [eight-entry audit receipt](evidence/desktop-build-audit-residuals.json) remains unchanged. During this follow-up, npm's registry stopped returning the advisory even for the unchanged vulnerable baseline. A zero audit count therefore does not, by itself, prove remediation. The [GitHub advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) still identifies sprintf-js through 1.1.3 with no patched version. The lock comparison and installed package inventory prove the removal.

The scoped change upgrades global-agent 3.0.0 to 4.1.3, matcher 3.0.0 to 4.0.0, serialize-error 7.0.1 to 8.1.0 and type-fest 0.13.1 to 0.20.2. No package is downgraded. The root production lockfile is unchanged. Existing immutable alpha.2 releases remain their originally tested binaries; this build-only change does not require replacing installed application files or republishing those tags.

Both distinct graphs passed clean installs with lifecycle scripts enabled, and all nine lock graphs match the appropriate installed candidate. Full audits report zero; comparison proves exactly four upgrades, seven removals and no other version changes. All 62 owning desktop, provenance and supply-chain policy checks passed. The unchanged builder produced a real macOS arm64 package whose installed-artifact smoke passed required assets, stable origin, persistence and relaunch. Nine local downloader scenarios passed, including the actual builder HTTP/HTTPS proxy calls, checksum rejection and untrusted TLS rejection.

- [Dependency, installed graph and local packaging receipt](evidence/desktop-build-chain-followup.md), with [machine-readable hashes and results](evidence/desktop-build-chain-followup.json).
- [Proxy/checksum/TLS receipt](evidence/desktop-build-proxy-compatibility.json) and [rerunnable local fixture](evidence/desktop-build-proxy-compatibility.mjs).

Hosted validation uses the existing Spaghetti Windows x64, macOS universal and Linux arm64 installer workflow with release publication disabled. The changed downloader path is identical across all products, while the two distinct dependency graphs are separately clean-installed. Existing alpha.2 tags and assets are not replaced. [Hosted run39853171515](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39853171515) passed at `e39ff8c833255d1e975cdc7e060afc5e4ffaba42`: all three platform jobs and all four installed formats (Windows NSIS, Linux DEB, macOS DMG and ZIP) passed. Each attests clean exact-source provenance, required assets, stable local origin, persistence/relaunch and the unchanged Electron43.8.3/Node24.22.0 runtime. The publication job was skipped. [Hosted validation receipt](evidence/desktop-build-hosted-validation.json).

Production promotion follows the normal main/Hetzner workflow, preserving all existing production dependency and runtime fixes. The delivery message identifies the pushed commit, completed workflow and public health verification. No interaction or API contract changed in this pass, so no interaction inventory entries were added.

## Electron runtime publication blocker

As of October 22, 2026, supported stable Electron 43.8.3, 44.9.3 and 45.0.0 embed Node 24.22.0. Electron has merged the Node 24.22.1 update into all three supported branches ([43 PR55161](https://github.com/electron/electron/pull/55161), [44 PR55162](https://github.com/electron/electron/pull/55162), [45 PR55163](https://github.com/electron/electron/pull/55163)), but a supported stable binary containing that complete update was not yet published when checked. The [timestamped release receipt](evidence/electron-node-release-availability.json) records the exact versions, source pins and upstream merge evidence.

Electron 43.8.3 already contains the certificate SPKI blocklist fix through an earlier backport. That protection is distinct from the remaining October Node fixes, and Node's displayed version alone would miss the backport. The previously published installer attestations show the actual Electron43.8.3/Node24.22.0 runtime. There is no new desktop runtime deployment in this follow-up. A system Node upgrade does not replace Electron's embedded Node, and moving to today's stable Electron45 does not supply Node24.22.1.

The remaining runtime action is blocked on upstream stable release publication. A future vendor release must be inspected, packaged, installed and attested before claiming the full embedded Node remediation. Existing desktop source review did not demonstrate reachable use of the remaining vulnerable APIs; that is not a claim that the embedded runtime contains every fix.
