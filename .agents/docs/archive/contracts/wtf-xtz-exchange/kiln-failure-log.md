# Kiln Failure Log

## 2026-05-02 Attempt

Command:

```bash
npm run contract:deploy:wtf-xtz:kiln
```

Result:

```text
BLOCKED: KILN_API_TOKEN is not set. Wrote docs/wtf-xtz-exchange/shadownet-deployment-log.md
```

Public probes captured in `shadownet-deployment-log.md`:

- Capabilities route returned HTTP `200`.
- Unauthenticated `/api/kiln/workflow/run` returned HTTP `401` with `{ "error": "Unauthorized" }`.

No deployment was attempted because protected routes require a token.

