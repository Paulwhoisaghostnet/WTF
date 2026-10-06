# Backup and recovery

The Companion is part of the drop's custody boundary. A static page, public CAR, database status response, or wtfOS account cannot reconstruct its hidden entropy or signer.

## Back up before activation

Stop the Companion so the filesystem snapshot is consistent. Back up these items together:

- the entire configured `data/` directory, including `companion.sqlite`, any `-wal`/`-shm` siblings, encrypted CARs/manifests, encrypted entropy, encrypted signed operations, uploads, and work state;
- `secrets/master.key`;
- `secrets/finalizer.key`;
- `secrets/admin.token`;
- `.env` and the exact bundled `contract/` directory.

Keep an offline encrypted copy. Test restoring it to a separate machine before opening a sale. Never put a backup under the static drop's document root or an ordinary public cloud folder.

## Restore

1. Keep the original installation stopped.
2. Restore the paths above without renaming individual encrypted files.
3. Restore private file permissions. On macOS/Linux, directories should be `0700` and `.env`/secret files `0600`.
4. Install the same package version with Node.js 22 or newer.
5. Run `npm run doctor`. Confirm the network, contract hash, finalizer address, encryption recovery, index services, CAR provider, and gateway all pass.
6. Start the Companion once. Check the admin project state and public claim counts before changing any external service.

Do not register a replacement project with a new entropy chain. Do not delete work rows, edit token quantities/commitments, clear an operation hash, or manually move the FIFO cursor.

## Interrupted settlement

The journal distinguishes an immutable intent, append-only signed attempts, injection, chain inclusion, finality, and publication. The same rules protect the one-time `arm_fulfillment` handshake and each FIFO settlement.

- If signing was never persisted, the worker may prepare the same committed claim once.
- If signed bytes were persisted but injection is uncertain, it checks the exact operation hash in TzKT, the mempool, and canonical blocks, then checks the claim and FIFO cursor. The identical bytes may be re-injected while their branch remains live.
- A single node's rejected list or a changed manager counter is not enough to replace an attempt. The worker waits until the original branch is beyond the protocol's operation TTL, then proves that exact hash absent from its entire canonical inclusion window. Only then may it append a linked attempt with the same immutable private-parameter and allocation intent.
- If the FIFO cursor, committed token row, metadata postcondition, contract binding, or custody state conflicts, the claim becomes `attention_required`. Do not erase that state to force a retry.
- If the operation is included, publication still waits for two blocks on top and a fresh exact claim/token/allocation/metadata re-read.
- If the artifact is published but metadata is not, the journal resumes metadata publication from the same encrypted committed CAR.

A database-only restore without every referenced encrypted signed-attempt file is intentionally insufficient to resubmit that operation. Keep the SQLite database, WAL/SHM files, and encrypted signed-attempt directory from the same stopped snapshot.

## Key loss

Losing `admin.token` blocks management access but does not alter the on-chain allocation. It can be replaced locally while the service is stopped.

Losing `master.key` prevents entropy, manifest, CAR, and signed-operation recovery. Losing `finalizer.key` prevents new settlement signatures. Neither key can be recovered from Tezos or the static export. Keep both backed up before activation.

If fulfillment cannot be restored, permanently close the sale so no new claims can be created. Closing does not cancel paid claims: all existing claims still require FIFO settlement before the contract can perform its safe final sweep.
