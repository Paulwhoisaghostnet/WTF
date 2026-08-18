# Workspace reconciliation — 2026-08-18

This file records the ownership and release status of work that was present in the shared WTF checkout during the 2026-08-18 cleanup pass. It is an index, not a claim that loose worktree bytes are captured by this commit.

## Production baseline

- `origin/main`: `327749cb1404e2b74886ea6d977d19e09821e73b` (`Refresh API environment inventory`)
- Live `https://wtfos.app/api/health/ready`: ready on commit `327749cb` at the start of the pass
- Latest successful Hetzner deployment: GitHub Actions run `31334574603`

## Release candidate

- PixAlerce alpha integration: isolated from the shared checkout as commit `7638db59` on `codex/pixalerce-alpha-integration`, based directly on `origin/main`.
- Distribution boundary: authenticated alpha testers only. Public release remains blocked by WTF-BB-612 until Niko's redistribution grant and complete included-asset rights record are committed.
- Verification at classification time: clean production build, TypeScript, all creation-tool asset checks, inventory coverage, and the focused save/reload/reopen browser proof passed. The full inventory browser run was started on the clean release worktree.

## Unfinished worktree: Pasta proof and alpha handoff

The shared checkout remains on `codex/full-send-dirty-snapshot-20260808`. After extracting PixAlerce, the mixed Pasta proof/recovery set comprised 39 tracked modifications, three untracked source/test files, 989 initially visible untracked live-proof artifact files, and a separately discovered 900-file V2 proof directory. The source state is now retained in local WIP commits. All 1,889 artifact files are retained in checksum-indexed archives outside the repository and have been removed from the working tree.

The work maps to active claimed bounty items WTF-BB-586 through WTF-BB-592, WTF-BB-600 through WTF-BB-608, and WTF-BB-611. Verified corrections for WTF-BB-594 through WTF-BB-599 and WTF-BB-609 through WTF-BB-610 are intermixed with those active lanes. The combined tree therefore cannot be promoted as one release without incorrectly certifying unfinished live-proof state.

Primary ownership paths:

- `scripts/pasta-protocol/**`: restart, recovery, projection, and UI-live runner code
- `scripts/pasta-desktop-*`: installer smoke and alpha-handoff integrity
- `public/creation-tools/{gnocchi,lasagna,penne,ravioli,rotini,spaghetti}/css/site.css`: shared standalone-site presentation
- `artifacts/pasta-protocol-proof-runs/pasta-alpha-proof-20260808t140453z/**`: live proof journal, pins, screenshots, open kits, and receipts

Do not bulk-commit or publish the artifact tree. It contains live-run evidence and must first pass the existing secret/public-release boundary checks and the owning bounty validators.

## Branch candidates outside main

- `codex/payroll-admin-app` at `d0d2a568`: genuine unmerged feature commit. It is based on an older main and touches wallet/admin/interaction surfaces. Rebase or cherry-pick it onto current `origin/main`, resolve the retired-Hoard/current-registry drift, then rerun its focused wallet tests, TypeScript, build, inventory coverage, focused Playwright proof, and full inventory suite before considering production.
- `codex/pasta-suite-windows-validation-20260715` at `c4b925a8`: do not deploy wholesale. Its files all exist on current main and later verified installer/provenance work supersedes this historical commit even though its patch identity is not present.

All other named local feature branches reviewed in this pass are already represented on `origin/main` by patch identity. Their branch pointers may be retained as history or deleted later after owner confirmation; they are not pending deployments.

## Cleanup actions completed

- Removed eleven stale/prunable Git worktree registrations whose directories no longer exist.
- Preserved every source change in the local `WIP: label Pasta proof recovery state` commit and retained the exact branch history in a verified Git bundle.
- Archived and re-extracted/checksummed all 1,889 untracked Pasta proof files under the sibling `WTF-workspace-archive-20260818-pasta-proof` directory before removing them from the checkout.
- Extracted the verified PixAlerce change set into a current-main release branch without carrying Pasta code, artifacts, or the unrelated `package.json` edit.
- Verified the shared checkout has an empty `git status` after labeling and archival.
