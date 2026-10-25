# coLILseum XTZ Duel automatic payout escrow

This is a new, immutable escrow version for newly created Mainnet and Shadownet open-seat XTZ Duels. Existing rooms remain pinned to the earlier claim-based contract.

The host deposits the entry and the owner-approved 0.5 XTZ house fee. The first authorized challenger deposits the matching entry. After the authoritative match finishes, the referee signs `finalize_room` with both ranked entrant wallets and the transcript/result commitments. That single Tezos transaction sends the 0.5 XTZ fee to the pinned treasury and the two-entry pot to the winner. A true tie returns one entry to each player. The contract stores paid receipts (`get_claim`) and exposes no `claim` entrypoint. Only implicit wallets may enter, because direct XTZ transfers to them cannot be rejected by recipient contract code.

Cancellation before start and technical-void refunds retain the prior rules. The client labels this version as automatic payout and keeps a Claim prize action only for rooms pinned to the previous contract.

`artifacts/build-manifest.json` identifies the exact SmartPy source, tests, and compiled Michelson. `shadownet-deployment.json` and `mainnet-deployment.json` pin the applied contracts and finalized script identities. Shadownet lifecycle proof includes both cancellation and a finalized duel whose operation transferred the fee and prize in the same transaction.

The Mainnet app must set `WTFIAP_OPEN_DUEL_MAINNET_PAYOUT_MODE=auto` with the new Mainnet contract and script hash. The signer allowlist must include both old and new contracts until all old funded rooms are settled. Shadownet uses the corresponding `WTFIAP_OPEN_DUEL_SHADOWNET_*` settings. The application verifies the configured payout mode against the exact approved script hash before admitting new rooms.
