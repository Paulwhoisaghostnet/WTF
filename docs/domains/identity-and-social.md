# Identity And Social

## Purpose

Identity and social systems connect WTF accounts, Tezos wallets, profiles, messages, public board activity, W social posts, and Discord-linked identity.

## WTF OS Connection

Users enter through login/register, then access profile, messages, board, W, leaderboard, and public profile windows from WTF OS. Wallet login and wallet linking are identity flows, but wallet spending remains a Tezos/user-wallet concern.

## Main Code

- `server/auth`
- `server/routes/board.ts`
- `server/features/w`
- `server/features/crp-nominations`
- `client/src/features/board`
- `client/src/features/w`
- `client/src/pages/CrpNominate.tsx`
- `client/src/pages/Profile.tsx`

## Notes

Public profile and board reads may be anonymous when configured. Direct messages, OAuth tokens, account settings, and private social state stay session-protected.
