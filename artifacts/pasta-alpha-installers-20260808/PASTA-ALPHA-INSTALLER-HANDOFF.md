# Pasta Protocol macOS alpha installer handoff

## Outcome

All nine macOS universal applications passed their actual distributed-package boundary in both forms: ZIP extraction and launch, plus DMG verification, license acceptance where present, mount, copy, and launch. Every app then quit and relaunched against the same profile and recovered its local browser state without an unexpected page, request, console, or HTTP failure.

These artifacts are explicitly **dirty-preflight developer-review builds**. They are suitable for the current controlled human alpha, are unsigned, and must not be published as clean release binaries.

## Runtime coverage

| App | Stable origin | Required assets | Suite tools opened | Formats smoked |
| --- | --- | ---: | ---: | --- |
| pasta-suite | http://127.0.0.1:30770 | 38 | 8 | ZIP + DMG |
| ch-ease | http://127.0.0.1:30778 | 34 | 0 | ZIP + DMG |
| macaroni | http://127.0.0.1:30771 | 5 | 0 | ZIP + DMG |
| spaghetti | http://127.0.0.1:30772 | 4 | 0 | ZIP + DMG |
| gnocchi | http://127.0.0.1:30773 | 4 | 0 | ZIP + DMG |
| ravioli | http://127.0.0.1:30774 | 10 | 0 | ZIP + DMG |
| rotini | http://127.0.0.1:30775 | 6 | 0 | ZIP + DMG |
| penne | http://127.0.0.1:30776 | 4 | 0 | ZIP + DMG |
| lasagna | http://127.0.0.1:30777 | 4 | 0 | ZIP + DMG |

## Exact artifact inventory

| App | Format | Bytes | SHA-256 | Path |
| --- | --- | ---: | --- | --- |
| pasta-suite | DMG | 224929142 | `2b849bb69f806c7932b9151ee4247da737d68b66d8726e930e1cf4bf6a2d894c` | `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.1-alpha.1-mac-universal.dmg` |
| pasta-suite | ZIP | 224958650 | `0ca0d291cd200221468aea1f5fcf23ee80822a3df4a79670580e7182ee75fcf2` | `apps/pasta-suite-desktop/release/Pasta-Suite-1.0.1-alpha.1-mac-universal.zip` |
| ch-ease | DMG | 223240265 | `7e72dd382f1527d116d80a7d41148b1ebc35895422cfd75378a7f0e8121aaf91` | `apps/ch-ease-desktop/release/CH-EASE-Studio-1.0.1-alpha.1-mac-universal.dmg` |
| ch-ease | ZIP | 223162209 | `afe140872ba4bb67551d242c24d869ff44a2db2b3e243f34dbb448d23dc42ee1` | `apps/ch-ease-desktop/release/CH-EASE-Studio-1.0.1-alpha.1-mac-universal.zip` |
| macaroni | DMG | 214943703 | `90811b3693280acbe44fdf533168bec537916886eded27243d3100b43414199a` | `apps/macaroni-desktop/release/Macaroni-Studio-1.0.1-alpha.1-mac-universal.dmg` |
| macaroni | ZIP | 214788841 | `ab893b55161c79fbc1d09481c512de9728ff57e9897c2c69e71ba05f8a4596b6` | `apps/macaroni-desktop/release/Macaroni-Studio-1.0.1-alpha.1-mac-universal.zip` |
| spaghetti | DMG | 214771431 | `5338895e2c1174546a9fca8787a72cde823349288148adf4d495ec82c811dc81` | `apps/spaghetti-desktop/release/Spaghetti-Studio-1.0.1-alpha.1-mac-universal.dmg` |
| spaghetti | ZIP | 214691110 | `f73799a2c8f46a295b84c97818a39633d690ec0005bf02fcd1d0499b50cde560` | `apps/spaghetti-desktop/release/Spaghetti-Studio-1.0.1-alpha.1-mac-universal.zip` |
| gnocchi | DMG | 214992460 | `23f171cc97d9fedb7de53dd6471c150bb8a334514de29931e2cc07d3feaa32d7` | `apps/gnocchi-desktop/release/Gnocchi-Studio-1.0.1-alpha.1-mac-universal.dmg` |
| gnocchi | ZIP | 214802379 | `c06978337fa9d6760abf769758c482211dcbf07f97933f265e80ee6242ada81c` | `apps/gnocchi-desktop/release/Gnocchi-Studio-1.0.1-alpha.1-mac-universal.zip` |
| ravioli | DMG | 214894445 | `d32a4937831b3e79d1bb05306ef3b992e12cc8e3ee2422e7e209e8fedc8529b8` | `apps/ravioli-desktop/release/Ravioli-Studio-1.0.1-alpha.1-mac-universal.dmg` |
| ravioli | ZIP | 214789387 | `ed8f6fb08f385bc6a6f3416f80629b045715b331a7c5e2c0eb68636364120cdb` | `apps/ravioli-desktop/release/Ravioli-Studio-1.0.1-alpha.1-mac-universal.zip` |
| rotini | DMG | 214930146 | `9c2dd2bf0cf9abf1df618d5ca13c68544591888743de29d12977547bb8f2d595` | `apps/rotini-desktop/release/Rotini-Studio-1.0.1-alpha.1-mac-universal.dmg` |
| rotini | ZIP | 214782106 | `6cbf20ac858e9782b17157f3740482d0d7b8ebd74851d8a5150242049540f993` | `apps/rotini-desktop/release/Rotini-Studio-1.0.1-alpha.1-mac-universal.zip` |
| penne | DMG | 214869131 | `bdcb7e4788e41a27053a9a33d2523461de346b2faca43205659c4880b1ecfb75` | `apps/penne-desktop/release/Penne-Studio-1.0.1-alpha.1-mac-universal.dmg` |
| penne | ZIP | 214718847 | `a311eb7a87aa9049091bdba9e8805c69a78f05dae02e8c451ca7f5c877be3242` | `apps/penne-desktop/release/Penne-Studio-1.0.1-alpha.1-mac-universal.zip` |
| lasagna | DMG | 214773921 | `1797cd46901c8a3d949fd25f3b58516cb835e3a9d4045a564ab2299e840da01b` | `apps/lasagna-desktop/release/Lasagna-Studio-1.0.1-alpha.1-mac-universal.dmg` |
| lasagna | ZIP | 214687401 | `d73eaa9d746afb8b22876ed40b029f4ef18b32b1f0eff0967582021d830ed2bc` | `apps/lasagna-desktop/release/Lasagna-Studio-1.0.1-alpha.1-mac-universal.zip` |

## Architecture and workflow boundary

- Pasta Suite owns Colander at `http://127.0.0.1:30770` and opens all eight bundled tools as native child windows.
- Each standalone owns a different immutable loopback origin, so the suite and standalones can run together without sharing or changing their localStorage namespace.
- The packaged runtime blocks hosted wtfOS-only APIs. Wallet authority stays in the user's wallet; portable pages use creator-owned Pinata/Kubo/static hosting.
- Every artifact embeds `provenance/build-provenance.json` for version `1.0.1-alpha.1`, base Git SHA `81dd26f2a050a412b60a2e0236b33e6ba341f81b`, dirty state, and target `darwin/universal/dmg+zip`.

## Alpha runbook

1. Verify the selected artifact against `SHA256SUMS.txt` in this directory.
2. Prefer the DMG for the normal install journey; accept the pre-release license, drag the app into Applications, and Control-click → Open if Gatekeeper warns about an unidentified developer.
3. Confirm the app opens on its registered Shadownet-default local surface without Node.js, npm, Homebrew, a terminal, or a separately started web server.
4. Create or import a project/draft, quit the complete application, reopen it, and verify the state recovers.
5. For Pasta Suite, walk Colander → CH-EASE → publisher → exported public page. For each standalone, test its focused creator journey and export.
6. File UX/UI findings against the exact artifact SHA-256, app id, macOS version, hardware architecture, and screenshot/steps.

## Known risks and limits

- The macOS artifacts are unsigned and not notarized; the manual Open flow is expected for this controlled alpha.
- Their provenance intentionally says `dirty: true`. A clean commit rebuild is mandatory before publication or broader distribution.
- This handoff proves macOS arm64 and x86_64 binaries inside universal packages. Native Windows NSIS and arm64 Debian/Raspberry Pi execution remain separate platform gates.
- Shadownet remains the pre-release default. Mainnet actions require explicit selection and normal wallet approval.

## Promotion gates

1. Consolidate the intended source into one clean reviewed commit without sweeping in unrelated dirty-worktree changes.
2. Rebuild all platform artifacts so embedded provenance identifies that exact clean commit.
3. Run native installed-package smoke on macOS and Windows, native arm64 Debian smoke, and a physical Raspberry Pi alpha pass.
4. Add signing/notarization when public distribution no longer relies on the documented manual permission flow.
