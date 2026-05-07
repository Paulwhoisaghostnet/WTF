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

1. **Read `LESSONS_LEARNED.md`** before writing any code. It contains hard-won corrections from past debugging sessions. Violating a documented lesson is unacceptable.
2. **Read `BUG_BOUNTY_BOARD.md`** to check for open bounty items related to your task.
3. After completing a pass that involved debugging, fixing, or correcting an issue, **append a new entry to `LESSONS_LEARNED.md`** documenting what went wrong, why, and the rule going forward. Do not skip this step. Do not edit or delete existing entries.

## Bug Bounty Board

Before planning or changing code in this repo, check `BUG_BOUNTY_BOARD.md`.

Treat it as the standing queue for known audit red flags, security risks, deploy problems, and production bugs. If your task matches an open bounty item, claim that item in the board before editing, keep your fix scoped to the item, and update the board with status plus verification notes before you finish.

When you discover a new red flag, add it to `BUG_BOUNTY_BOARD.md` with category, priority, point score, evidence, likely correction direction, and verification idea.

Do not erase old bounty entries. Move completed or obsolete entries to `Verified` or `Archived` with a short note so future swarm sessions keep the history.
