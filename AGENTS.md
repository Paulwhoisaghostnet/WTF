# WTF Agent Notes

## Pre-Flight Checklist (MANDATORY — every pass)

1. **Read `LESSONS_LEARNED.md`** before writing any code. It contains hard-won corrections from past debugging sessions. Violating a documented lesson is unacceptable.
2. **Read `BUG_BOUNTY_BOARD.md`** to check for open bounty items related to your task.
3. After completing a pass that involved debugging, fixing, or correcting an issue, **append a new entry to `LESSONS_LEARNED.md`** documenting what went wrong, why, and the rule going forward. Do not skip this step. Do not edit or delete existing entries.

## Bug Bounty Board

Before planning or changing code in this repo, check `BUG_BOUNTY_BOARD.md`.

Treat it as the standing queue for known audit red flags, security risks, deploy problems, and production bugs. If your task matches an open bounty item, claim that item in the board before editing, keep your fix scoped to the item, and update the board with status plus verification notes before you finish.

When you discover a new red flag, add it to `BUG_BOUNTY_BOARD.md` with category, priority, point score, evidence, likely correction direction, and verification idea.

Do not erase old bounty entries. Move completed or obsolete entries to `Verified` or `Archived` with a short note so future swarm sessions keep the history.
