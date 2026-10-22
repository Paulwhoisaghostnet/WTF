# MCP remediation verification — 2026-10-22

Production `https://wtfos.app` reported ready at commit `7167ca37` before and after the proof. Existing production Bert credentials were used privately; no account or wallet was created or changed.

- Anonymous MCP requests returned 401. A JSON request of 10 MiB + 1 byte returned 413 before authentication. Discovery advertised the 10 MiB body allowance.
- A temporary `api:read` token listed 47 tools, retained Map Lab schema maxima 80/160, and made a real read through the versioned API bridge without setting browser cookies.
- 101 selected assets, 8193 valid query parameters, and an invalid query value each returned an MCP error before domain work.
- Temporary tokens were revoked; reuse returned 401. The initial recorder attempt had a status-field formatting error; its finally block revoked its token, and the corrected proof passed. Neither receipt includes credentials or bearer values.
- The local HTTP batch test exercised the configured 10 MiB request ceiling, SDK 100-message ceiling, and 8192 boolean query parameters per call using the real MCP server and a stub API handler. All 100 calls completed with 0 errors in 495 ms, peak RSS 330144 KiB, against the measured 4345298944-byte production heap ceiling. The suspected batch amplification failure did not reproduce.

Receipts: `mcp-production-verification.json`, `mcp-production-verification-initial.json`, `mcp-isolated-batch-verification.json`.

Earlier local validation: 15/15 focused tests passed on Node 22.23.4; the real local actor lifecycle passed 1/1; inventory coverage passed 253 rows/995 handles. Global CI/build/deploy verification belongs to the parent remediation task.

Public Chromium smoke: `https://wtfos.app/` and `/login` both returned 200 and rendered the expected home copy, login button, and username/password controls. Chromium emitted no page errors, no failed requests, and no unexpected same-origin HTTP failures. Each anonymous page made the expected `/api/auth/user` request returning 401; the auth route requires a session and the client handles its absence as signed out. Ready health reported `7167ca37` before and after. Receipt: `public-browser-smoke.json`; inspected screenshots: `public-home-chromium.png` and `public-login-chromium.png`. This was a read-only anonymous browser check, without wallet or account mutations.
