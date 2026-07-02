# Pasta Protocol Lasagna Shadownet E2E Report

- Status: PASSED
- Timestamp: 2026-07-01T08:13:36.979Z
- RPC: https://tezos-shadownet.octez.io
- TzKT API: https://api.shadownet.tzkt.io/v1

## Result

- Signer-backed Lasagna Shadownet exhibition deploy/configure/revision/admin-handoff proof passed.
- Creator wallet: `wtf-os-root` / `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM`
- Curator wallet: `arcade-treasury` / `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`
- Contract: `KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r`
- Explorer: https://shadownet.tzkt.io/KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r

## Operations

- Creator funding top-up: `oopACxFXLpaymaAn9HNWLpwXkzcm2J4MP5cx6sCpFa6kuwmnxQD`
- Origination: `ooC4sPHna3JitAUL5fbKSszCas4gL9CsvxBA2cCNRWoHSr3jhs2`
- Add curator: `ontuJWXApaw5qqBLwxbrnm3hBwLEAxZ3RZjANkzSrLQ3KiHhKtM`
- Curator publish revision 0: `opRyqay93MN3ngWueFX1zk3JWV6Frb6SGSeWHp673Xw4Fv9iNw9`
- Administrator publish revision 1: `opHbmXxzPZU7vaA9iUiuQCJq3nzDcLbSuk45w2W3ShCapdPcmdG`
- Set current revision to 0: `ooMrVCnRvA8HZhuA874Hn7gmuvWdnEV28jwmXgGz1JCPCbMVTjG`
- Remove curator: `onpsnj8e5J8nt2hcY1hwVxQyiY88mZnbnCF2qqK1m69sw5sCJZp`
- Transfer administration: `oojtP5PcBpsJhiRPxFPkPWuJD6kw4noVEemSCVLdnVhjatoN4ht`
- Accept administration: `opComejGYmbYFovuqfnffrYeLtmCT9Xs7j16XFs6oNLpyPz4YuL`

## Indexed Proof

- Contract storage indexed metadata big map `26831`, curators big map `26830`, and revisions big map `26832`.
- Final administrator: `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej`; pending administrator: `null`.
- Revision count: `2`; current revision pointer: `0`.
- Revision 0 curator `tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej` references `2` tokens and decodes to metadata revision `0`.
- Revision 1 curator `tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM` references `3` tokens and decodes to metadata revision `1`.
- Revision 0 references current Spaghetti/Gnocchi proof contracts: `KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc`, `KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK`.
- Revision 1 references current Ravioli/Rotini/Penne proof contracts: `KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB`, `KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ`, `KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz`.
- The curator big map has no active entry for the removed curator after the admin handoff.
- Contract metadata decoded to `Lasagna Shadownet E2E` with relationship metadata and Lasagna revision policy intact.
- Relationship group: `lasagna-shadownet-e2e-mr1srf15`

## Scope

- This proves signer-backed Shadownet origination, curator configuration, revision publication, current-revision rollback, curator removal, two-step administration transfer, referenced-token metadata resolution, and Colander adapter detection for Lasagna exhibitions.
- It does not yet prove WTF.ME page hosting, wtfOS hosted pinning, Colander browser action-state refresh, failure recovery, or mainnet readiness.
