# Pasta Protocol Validation Test Catalog

This directory is the generated validation-suite layer for the Pasta Protocol story gate. It does not claim that every executable Playwright/API runner exists yet; it records the complete test contract that later implementation passes must satisfy before product work can be called complete.

## Files

- `validation-manifest.json`: machine-readable feature-to-test-kind manifest.
- `feature-validation-catalog.md`: standalone feature validation checklist.
- `cross-app-integration-catalog.md`: directed handoff, meaningful-chain, and excluded-target checklist.
- `deployment-test-catalog.md`: Shadownet, WTF.ME, wtfOS pinning, and puppet deployment checklist.
- `adversarial-test-catalog.md`: break-the-story cases for wallet, package, pinning, hosting, indexer, and authorization drift.
- `requirements-traceability.md`: source feature specs mapped to all required validation kinds.

## Gate

Every current feature spec has all five required validation kinds: standalone, cross-app, integration, deployment, and adversarial. The top-level coverage report remains above the 95 percent story-before-code threshold.

## Naming Boundary

Tortellini is intentionally not a current Pasta product. The suite covers `CH-EASE -> Tortellini` as a blocked-flow requirement, not as an app, route, contract, or implementation target.
