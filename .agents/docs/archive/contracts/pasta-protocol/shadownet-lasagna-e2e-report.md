# Pasta Protocol Lasagna Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T00:32:42.862Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Lasagna Shadownet exhibition deploy/configure/revision/admin-handoff proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Curator wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1GrrYTevWKExvhFWVigUdGKR86SQKwYceN`
- Explorer: https://shadownet.tzkt.io/KT1GrrYTevWKExvhFWVigUdGKR86SQKwYceN

## Operations

- Origination: `onzXgGMzYxcSjdLTMyxbHqf8dfUakWXig3P8ZeCJsh5UvVwsNAT`
- Add curator: `opWHD7JtP8TUhrmsgZC7KntKEHxv779DFTJhc31qBoiNWjGHcwJ`
- Curator publish revision 0: `op3m9yfqHiQCMmkT7qgNZQBYTZ5ydtYnw8hRbamHEYMcH3eepqe`
- Administrator publish revision 1: `ooqzTWCAmdUXTt7F6XDWDjkVomQyzNKh96em1Xt7RMyo7uwchUR`
- Set current revision to 0: `ooH9HKyVjJYRLprbTE7kxZgHY9oXq4JosicS4PQDj6XjMGDspFt`
- Remove curator: `ongWrFmZXn3K6A4BosC5oeJBVt5RkprsRkWLa7kE3ND9ajWems4`
- Transfer administration: `oo6s88oLv7kZoywT9ukH1uH3PAHrdzRH7Zeg696yUDvek9ij8C9`
- Accept administration: `ooLwFs9r5XTygtC1mo3Xv71Gm8ZAamJg69iYK5pfam1HrPG299c`

## Indexed Proof

- Contract storage indexed metadata big map `26775`, curators big map `26774`, and revisions big map `26776`.
- Final administrator: `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`; pending administrator: `null`.
- Revision count: `2`; current revision pointer: `0`.
- Revision 0 curator `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej` references `2` tokens and decodes to metadata revision `0`.
- Revision 1 curator `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM` references `3` tokens and decodes to metadata revision `1`.
- The curator big map has no active entry for the removed curator after the admin handoff.
- Contract metadata decoded to `Lasagna Shadownet E2E` with relationship metadata and Lasagna revision policy intact.
- Relationship group: `lasagna-shadownet-e2e-mr1caxn6`

## Scope

- This proves signer-backed Shadownet origination, curator configuration, revision publication, current-revision rollback, curator removal, two-step administration transfer, referenced-token metadata resolution, and Colander adapter detection for Lasagna exhibitions.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander browser action-state refresh, failure recovery, or mainnet readiness.
