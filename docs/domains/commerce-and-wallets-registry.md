# Commerce And Wallets Registry

This registry is the operational companion to [commerce-and-wallets.md](./commerce-and-wallets.md). It covers market, wallet, marketplace, and membership surfaces.

## Command Palette Registry

Launchable commerce surfaces include:

- WTF IAM
- portfolio
- Rat Race
- Trade Boards
- Casino
- Club Dues
- Swap
- Tezos Intel

## MCP Registry

Commerce surfaces can be read through the shared WTFOS MCP layer, but any write-capable or value-moving tool must be explicitly authorized and should remain admin/audited unless the user journey requires otherwise.

## Event Registry

Core event families:

- `wtfiam.*`
- `marketplace.*`
- `rat_race.*`
- `trade_board.*`
- `casino.*`
- `club_dues.*`
- `swap.*`
- `wallet.*`

Registry rule:

- Any value-moving surface must have explicit preflight, rollback, and user-visible confirmation behavior.
- Price or membership state changes must not be hidden behind passive UI updates.

## Install Policy

Commerce apps are blocked from normal-user installability when docs are stale or the install key is revoked. Admin and trusted-creator repair access remains available for recovery work.

## Operating Procedures

1. Update the acceptance registry whenever a market or wallet path changes.
1. Keep the install-policy note aligned with the current price, wallet, and membership rules.
1. Prefer source-of-truth contract or marketplace evidence over local guesses.
