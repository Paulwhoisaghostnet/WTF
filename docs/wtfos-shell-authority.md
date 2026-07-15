# wtfOS shell authority

wtfOS has one canonical production shell: **Classic**, served at `/` and `wtfos.app`.

The alternate shells are subordinate presentation lanes over the same routes, APIs, permissions, events, and persistence:

| Shell | Authority | Change policy | Purpose |
| --- | --- | --- | --- |
| Classic | Canonical production | Active product development | Shipping authority and baseline behavior |
| Gamma | Successor preview | Compatibility fixes and convergence toward an approved promotion only | Evaluate a possible future shell without creating a second product contract |
| Beta | Frozen research | Critical fixes only | Preserve research evidence and comparison fixtures |

No feature is considered shipped merely because it exists in Beta or Gamma. New capability contracts belong to the shared route, app, access, event, and inventory registries; presentation shells may consume them but may not fork them. Promoting Gamma requires an explicit decision that changes `CANONICAL_PRESENTATION_HOST`, the root routing policy, inventory evidence, and production E2E coverage in one reviewed pass.

The executable policy lives in `client/src/lib/presentation-shell.tsx` and is enforced by its unit test.
