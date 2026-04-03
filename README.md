# WTF Gameshow Platform

A survival-based challenge game platform on Tezos, featuring WTF token integration, real-time messaging, marketplace with on-chain FA2 swaps, and a retro Windows 95 UI aesthetic.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + React95 (Windows 95 UI)
- **Backend**: Express.js + Drizzle ORM + PostgreSQL
- **Auth**: Passport.js (local + Google OAuth)
- **Wallet**: octez.connect + Beacon SDK fallback + Taquito
- **Real-time**: WebSockets for live chat
- **Blockchain**: TzKT API + Teznames domain resolution
- **Deploy**: Netlify (serverless functions + static frontend)

## WTF Token

- Contract: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`
- Standard: FA2 | Symbol: WTF | Decimals: 8

## Setup

```bash
# Install dependencies
npm install

# Copy env file and configure
cp .env.example .env

# Start PostgreSQL and create database
createdb wtf_gameshow

# Push database schema
npm run db:push

# Start dev server
npm run dev
```

## User Roles

| Role | Description |
|------|-------------|
| **Host** | Full admin control over the gameshow |
| **Cohost** | Admin-level access for managing rounds and challenges |
| **Contestant** | Active participant in rounds and challenges |
| **Witness** | Read-only observer access |

## Features

- **Dashboard**: WTF balance, active season, quick actions
- **Seasons & Rounds**: Browse seasons, view round details and challenges
- **Challenges**: Submit responses, receive grades, earn WTF rewards
- **Message Board**: Hybrid async/sync chat with channels and threads
- **Marketplace**: List tokens for auction or buy-now, pay with WTF
- **Leaderboard**: WTF holder rankings with .tez domain resolution
- **Gallery**: Survival tokens and exclusive gameshow art
- **Side Quests**: Bonus challenges for extra WTF earnings
- **Admin Panel**: Manage users, seasons, rounds, challenges, channels

## Smart Contracts

The marketplace contract is in `contracts/WTFMarketplace.py` (SmartPy).
Compile with SmartPy CLI before deploying to Tezos.

## Deployment

Configured for Netlify deployment:

```bash
npm run build:netlify
```

Set environment variables in Netlify dashboard:
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Random secret for sessions
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Optional Google OAuth
