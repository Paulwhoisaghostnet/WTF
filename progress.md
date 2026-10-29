Original prompt: Restore recognition of signed-in WTF players in the coLILseum lobby and let them rejoin their rooms; use their WTF identity so they do not have to enter a commander name.

- The WTFOS room directory now returns the signed-in player's WTF username and that player's seat ID for rooms they occupy, without exposing account IDs.
- Lobby cards now show a direct Return to room action for a recognized participant. When the seat's browser token is missing, the authenticated server route reissues a seat token and reconnects to the existing commander.
- Create and join name fields are prefilled with the signed-in WTF identity; the server remains authoritative for the seated name.
- Updated the runtime release manifest and compatibility pin because the session recovery route is part of the authoritative room server. Existing pinned matches remain supported because recovery does not alter game state or match rules.
- Verification: authority/identity and compatibility tests pass; pinned duel parity and Cherub replay tests pass; Playwright verifies username prefill, Return to room on the second browser, and recovery from the first browser after its token has been rotated. Inventory coverage and bounty-board consistency checks pass.
