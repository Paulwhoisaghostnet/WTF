# MCP remediation verification — 2026-10-22

Production `https://wtfos.app` reported ready at commit `7167ca37` before and after the proof. Existing production Bert credentials were used privately; no account or wallet was created or changed.

- Anonymous MCP requests returned401. A JSON request of10MiB+1byte returned413 before authentication. Discovery advertised the10MiB body allowance.
- A temporary `api:read` token listed47tools, retained Map Lab schema maxima80/160, and made a real read through the versioned API bridge without setting browser cookies.
-101selected assets,8193valid query parameters, and an invalid query value each returned an MCP error before domain work.
- Temporary tokens were revoked; reuse returned401. The initial recorder attempt had a status-field formatting error; its finally block revoked its token, and the corrected proof passed. Neither receipt includes credentials or bearer values.
- The local HTTP batch test exercised the configured10MiB request ceiling, SDK100-message ceiling, and8192boolean query parameters per call using the real MCP server and a stub API handler. All100calls completed with0errors in495ms, peakRSS330144KiB, against the measured4345298944-byte production heap ceiling. The suspected batch amplification failure did not reproduce.

Receipts: `mcp-production-verification.json`, `mcp-production-verification-initial.json`, `mcp-isolated-batch-verification.json`.

Earlier local validation:15/15focused tests passed on Node22.23.4; the real local actor lifecycle passed1/1; inventory coverage passed253rows/995handles. Global CI/build/deploy verification belongs to the parent remediation task.
