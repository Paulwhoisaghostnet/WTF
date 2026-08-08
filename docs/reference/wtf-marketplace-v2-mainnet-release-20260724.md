# WTF Marketplace V2 Mainnet Release

This public release receipt records the exact mainnet deployment and the
preserved legacy-recovery boundary without exposing private operator evidence.

- Status: PASSED
- Network: Tezos mainnet
- Chain id: `NetXdQprcVkpaWU`
- Active Marketplace V2: `KT1C8jTazt2QyFLPKf27xRGssv99AtzagWHb`
- Legacy Marketplace V1 retained: `KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj`
- WTF FA2: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`, token id `0`
- Deployer wallet: `wtf-os-root` / `tz1c8FUJvTvtMLFT87mCwNGTnZVEZnQGPvyo`
- Administrator wallet: `contract-admin` / `tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo`
- Canonical code SHA-256: `1e8715dfdb851f558dbd1ce774ee25a72c0a06c5ae3e6f2ebb08c87640c0aef2`
- Shadownet proof contract: `KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy`
- Signed origination size: `15,241` bytes
- Operation headroom: `17,527` bytes

## Applied operations

- Treasury-to-root deployment funding: `ootAN9xXMWxgtzLxKZL7Lsq1vdPCmrBX4Mww5UW9qSZ9fupJ9kq`
- Origination: `ontJVKgZ5Dby8bJg7BKXvYt1kW3gvjFZgiLmS93xZBGa3J6YvA5`
- Administrator pause smoke: `ooN3U5iwqG4y1czjsNfZ3pitspkZn7171epAwqPgzQQZx7FkCK3`
- Administrator unpause smoke: `onqydzxR5sJ9PGTB93CLQ8jL5fuJwxJZwVG4GfmDjZ34MfkCu7Q`

## Final state

- `paused=false`
- `proposed_admin=null`
- listing, offer, and auction counters are all `0`
- live mainnet code hash equals the current compiled source and the Shadownet-proven contract
- the production signer remains origination-disabled
- Marketplace V2 is allowlisted for bounded administrative maintenance
- wtfOS production configuration names V2 as the active marketplace and V1 only as the legacy marketplace

## Legacy preservation

Marketplace V1 was not paused, replaced, upgraded, or mutated. It still holds
`110,000,000` WTF base units (`1.1 WTF`) for the existing offer. The user
explicitly authorized abandoning that offer for now and retaining V1 for later
human recovery through BCD or another chain interface.

## Production verification

- Main commit: `e066bd69`
- Hetzner deploy run: `30127125718` (`success`)
- Public readiness: `https://wtfos.app/api/health/ready` returned `ready`,
  `nodeEnv=production`, and commit `e066bd69`
- Public marketplace API returned V2 as active, V1 as legacy, version `v2`,
  the correct admin, `paused=false`, and zero fresh listings, offers, or auctions
- Production browser assets contain the V2 address
- The separate Quality Gates failure was the existing dependency audit finding,
  not a contract, SmartPy, type, build, inventory, or deployment failure
