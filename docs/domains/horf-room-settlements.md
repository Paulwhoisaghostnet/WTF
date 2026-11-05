# Horf V3 room settlement ledger

`drizzle/0157_horf_room_settlements.sql` stores confirmed Mainnet V3 room
events and a contract-addressed TzKT cursor. The indexer accepts only
`horse_claimed` (Reciprocal or Honor), `horse_swapped` (Outlaw), and
`private_offer_fulfilled` (private escrow). It checks the configured V3 KT1,
Mainnet chain ID, event identity and timestamp, and the applied transaction
that emitted the event. Deposits, private escrow creation, and cancellation
move custody but never create race activity or HORSE rewards.

A claim creates one owner-to-claimant horse send. A swap creates that output
send and one claimant-to-owner input send. Both wallets earn 10 HORSE for the
horse they sent, while the race and completed-trade tally count one exchange
per wallet. The exact Objkt direct transfer matching a V3 input send is
consumed once by operation hash, wallets, and token ID so it cannot pay twice.
Additional direct sends in the same operation remain separate. A Marshal's
exact-token nonhorse decision filters the affected leg in both race and reward
reconciliation. V2 Stable claims retain their own contract-qualified source.

Every V3 reward key includes the contract address, TzKT event ID, and output
or input leg. Claim permits wait for V3 settlement sync readiness. The
actor-backed local puppet database includes the settlement migration.
