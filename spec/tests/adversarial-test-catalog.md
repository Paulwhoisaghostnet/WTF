# Adversarial Test Catalog

These cases are shared across all feature-level adversarial validations in the manifest. Each feature test selects the relevant subset and records blocked mutation, visible recovery copy, last durable artifact, and safe retry decision.

| ID | Category | Required Proof |
| --- | --- | --- |
| ADV-001 | Naming drift | Macaroni, CH-EASE, and Colander keep canonical names; Tortellini remains explicitly absent. |
| ADV-002 | Wrong network | Wallet signing blocks mismatched chain id or RPC and records no false success. |
| ADV-003 | Unauthorized hosted service | Ordinary and standalone users cannot select trusted-only wtfOS pinning or hosting. |
| ADV-004 | Malformed package | CH-EASE and publishers reject missing media, duplicate token ids, invalid attributes, and bad relationship metadata. |
| ADV-005 | Broken CID | Pinning and hosted pages surface the failed artifact and recovery path without claiming public availability. |
| ADV-006 | Indexer lag | Wallet-returned hashes are not treated as accepted until node or indexer visibility confirms them. |
| ADV-007 | Colander guesswork | Action forms are driven by adapter/entrypoint detection, not guessed product type. |
| ADV-008 | Marketplace preview loss | External previews preserve edition quantity, owner, price, target contract, and media metadata. |
| ADV-009 | Puppet node loss | Actor-backed stories survive node loss with last durable artifact and replay instruction. |
| ADV-010 | Standalone leakage | Downloaded bundles contain no embedded wtfOS-only secrets, host assumptions, or server-only endpoints. |
| ADV-011 | Excluded target drift | CH-EASE -> Tortellini stays a visible blocked-flow case until an owner-approved app dossier exists. |
