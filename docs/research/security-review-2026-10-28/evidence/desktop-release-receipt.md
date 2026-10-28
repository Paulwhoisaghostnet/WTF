# Desktop security release receipt — October 28, 2026

All nine products published `1.0.1-alpha.3` prereleases from the exact tested source commit **3a8439fb71ee2bd3a3219931eced1011c746cd28**. All **27 native platform jobs** and **36 installed-format checks** passed without retries: macOS universal DMG and ZIP, Windows x64 NSIS, and Raspberry Pi arm64 DEB for every product. Each actual executable reports **Electron 43.8.4 / Node 24.22.1 / Chromium 150.0.7871.250**, clean source provenance and stable-origin storage after quit/relaunch. Pasta Suite also created its test project and opened all eight bundled tools.

| Product | Successful build/install/publication run | Published release |
| --- | --- | --- |
| spaghetti | [40631555955](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/40631555955) | [alpha.3](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/spaghetti-desktop-v1.0.1-alpha.3) |
| macaroni | [40631559522](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/40631559522) | [alpha.3](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/macaroni-desktop-v1.0.1-alpha.3) |
| pasta-suite | [40631562581](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/40631562581) | [alpha.3](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/pasta-suite-desktop-v1.0.1-alpha.3) |
| ch-ease | [40631565697](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/40631565697) | [alpha.3](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/ch-ease-desktop-v1.0.1-alpha.3) |
| gnocchi | [40631569012](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/40631569012) | [alpha.3](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/gnocchi-desktop-v1.0.1-alpha.3) |
| ravioli | [40631571987](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/40631571987) | [alpha.3](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/ravioli-desktop-v1.0.1-alpha.3) |
| rotini | [40631574846](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/40631574846) | [alpha.3](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/rotini-desktop-v1.0.1-alpha.3) |
| penne | [40631577416](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/40631577416) | [alpha.3](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/penne-desktop-v1.0.1-alpha.3) |
| lasagna | [40631580341](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/40631580341) | [alpha.3](https://github.com/Paulwhoisaghostnet/WTF/releases/tag/lasagna-desktop-v1.0.1-alpha.3) |

The [CI runtime attestations](desktop-ci-runtime-attestations.json) contain all 36 proofs. [Published releases](desktop-published-releases.json) record tag commits, release IDs and SHA256/size/URL for each format. All 27 configured public download assets passed anonymous byte-range GET checks; these availability probes are not complete-file rehashes. See [public asset checks](desktop-public-asset-checks.json).

An independent full download of the published Spaghetti universal ZIP matched its **222717922 bytes** and SHA256 **f536c960ec36aa955dd23a174141ab57e5f94b9d9cc9664e8a25566ccaf374ca**. Its extracted application passed a fresh strict installed-binary check for the clean release commit, alpha.3 product identity, patched runtime, four required assets and storage-preserving relaunch. See [published download proof](desktop-published-download-proof.json).

The [source verification receipt](desktop-source-remediation.json) records 82 passing owning tests, clean installation of both distinct graphs on Node 22.23.4, and 18 zero-result full/production npm audits across nine graphs. Each graph changes only Electron 43.8.3→43.8.4 and fast-uri 3.1.8→3.1.9; no dependency is added, removed or downgraded. electron-builder 26.15.3, the scoped global-agent 4.1.3 override and physical removal of roarr/sprintf-js are preserved. App identities, stable origins, storage paths and data formats were unchanged.

The [vendor release](https://github.com/electron/electron/releases/tag/v43.8.4) includes Node 24.22.1 and the File System Access/ASAR security corrections. The earlier Chromium Brotli backport finding remains valid; this release does not claim all newly announced Chrome issues apply to or are fixed in Electron.

## Production configuration handoff

At **2026-10-28T04:33:11Z**, exactly 63 existing public installer settings were replaced atomically in `/etc/wtf/wtf.env`, under an exclusive flock on the existing `/tmp/wtf-app-deploy.lock` opened read-only. All unrelated lines and root:root 0600 ownership/mode were preserved. A protected 0600 rollback copy is `/etc/wtf/wtf.env.desktop-security.20261028T043311741821Z.bak`. No container was recreated and no service restarted. [Environment receipt](desktop-environment-activation.json), [verified public settings](desktop-public-installer-env.json).

**Configuration is staged; the normal main deployment and authenticated live-manifest verification remain pending.** Existing installed customer applications are not automatically replaced by publishing a new installer. Alpha.2 releases were preserved.

After deployment, use the existing private authenticated session through `WTFOS_INSTALLER_COOKIE`, or the existing test actor through `WTFOS_INSTALLER_USERNAME`/`WTFOS_INSTALLER_PASSWORD`; never print those values. Set `WTFOS_INSTALLER_REQUIRE_AUTH=1`, `WTFOS_INSTALLER_CHECK_ASSETS=1`, and `WTFOS_INSTALLER_BASE_URL=https://wtfos.app`. Run `node scripts/check-<product>-installers-live.mjs` for pasta-suite, ch-ease, macaroni, spaghetti, gnocchi, ravioli, rotini, penne and lasagna. These commands derive alpha.3 from package metadata and check anonymous 401, authenticated manifest version/URLs/hashes against the published release, and public asset availability.
