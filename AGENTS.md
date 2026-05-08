# WTF Agent Notes

## "Full Send" Means Live Deployment

When the user says **full send**, treat it as an explicit request to take the current work all the way live through the repo's normal production path.

This means: finish the code/docs change, verify it, push the working branch if needed, merge or cherry-pick the completed change onto `main`, push `main`, let the normal Hetzner deploy workflow run, and verify the public production app after deploy. Do not stop at a feature-branch push. Do not leave a completed branch unmerged unless the user explicitly asks to keep it separate or the change is not safe to deploy.

Prefer the narrowest production promotion path that avoids branch sprawl: if the branch contains unrelated work, cherry-pick only the relevant commits onto `main`; if the branch is wholly ready, merge it. After pushing `main`, confirm the deploy workflow succeeds and that live health reports the new commit before saying the work is live.

Full-send completion checklist:

1. The relevant change is on `main`, not only a feature branch.
2. `main` has been pushed to `origin`.
3. The normal production deploy has completed successfully.
4. The live public site has been smoke-tested after deploy.
5. The final response states the production URL and the live verification performed.

If any item above is not complete, do not say "full sent", "live", "shipped", or "done". Say exactly what is still pending and why.

## Pre-Flight Checklist (MANDATORY — every pass)

1. **Read `.agents/docs/live/LESSONS_LEARNED.md`** before writing any code. It contains hard-won corrections from past debugging sessions. Violating a documented lesson is unacceptable.
2. **Read `.agents/docs/live/BUG_BOUNTY_BOARD.md`** to check for open bounty items related to your task.
3. After completing a pass that involved debugging, fixing, or correcting an issue, **append a new entry to `.agents/docs/live/LESSONS_LEARNED.md`** documenting what went wrong, why, and the rule going forward. Do not skip this step. Do not edit or delete existing entries.

## Bug Bounty Board

Before planning or changing code in this repo, check `.agents/docs/live/BUG_BOUNTY_BOARD.md`.

Treat it as the standing queue for known audit red flags, security risks, deploy problems, and production bugs. If your task matches an open bounty item, claim that item in the board before editing, keep your fix scoped to the item, and update the board with status plus verification notes before you finish.

When you discover a new red flag, add it to `.agents/docs/live/BUG_BOUNTY_BOARD.md` with category, priority, point score, evidence, likely correction direction, and verification idea.

Do not erase old bounty entries. Move completed or obsolete entries to `Verified` or `Archived` with a short note so future swarm sessions keep the history.

## Interaction Inventory and E2E Coverage (MANDATORY)

Any change that adds, removes, renames, or materially changes a user interaction, app route, sub-app, desktop item, admin screen, API handle, reward trigger, challenge trigger, side quest verifier, bot/agent tool, telemetry event, or normalized `SystemEvent` must update the E2E testing scheme in the same pass.

Required updates:

1. Update `.agents/docs/live/user-interaction-inventory.md` with the domain, subdomain, access level, interaction description, and canonical handle.
2. Update the inventory-driven E2E registry under `tests/e2e/inventory/` when the change adds a route, domain workflow, API probe, admin surface, or system integration path.
3. Run `npm run test:e2e:inventory:coverage` before final verification. For UI or interaction changes, also run `npm run test:e2e:inventory` or explain why it could not be run.
4. Keep tests modular by domain/subdomain. Do not add one-off monolithic E2E scripts when a domain fixture, route fixture, or workflow entry is the correct ownership point.
5. Distinguish skeleton coverage from feature behavior coverage. Route smoke and normalized-handle tests prove the feature is reachable; state-changing features also need domain-owned assertions for the user-visible result and durable side effect before anyone claims that feature is fully E2E tested.
6. For changes involving auth, roles, wallets, rewards, admin tooling, persistence, or cross-domain workflows, update the actor-backed live puppet harness under `tests/e2e/puppets/` and `tests/playwright/live/` as needed. Run `npm run test:e2e:live:puppets` when practical, or document the blocker.
