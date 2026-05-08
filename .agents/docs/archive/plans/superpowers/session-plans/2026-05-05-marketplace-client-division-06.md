# Division 06 - Marketplace Client Modularization

Date: 2026-05-05
Leader scope: `client/src/pages/Marketplace.tsx` wrapper integration plus division docs.
Worker scope: new modules under `client/src/features/marketplace/*`.

## Objective

Turn `client/src/pages/Marketplace.tsx` from a 1,505-line client monolith into a compatibility wrapper. Preserve the `Marketplace` named export, route behavior, query keys, API paths, token detail modal behavior, and wallet/on-chain action order.

## Public Contracts To Preserve

- Page export: `export function Marketplace({ initialTab = 0 }: MarketplaceProps)`.
- Route state: `initialTab` seeds `activeTab`; URL prefill accepts `listToken`, `contract`, `tokenId`, and `amount`, then replaces the URL path with `window.history.replaceState`.
- Query keys:
  - `["marketplace", "onchain"]`
  - `["marketplace", "trade-board", boardSearch]`
  - `["wallets"]`
  - invalidation umbrella: `["marketplace"]`
- API paths:
  - `GET /api/marketplace/onchain`
  - `GET /api/marketplace/trade-board?limit=200&q=...`
  - `GET /api/wallets`
  - `POST /api/marketplace`
  - URL prefill lookup: `/api/profile/tokens?contract=...&onTradeBoard=true&limit=200`
- Wallet/on-chain order:
  - Create listing/auction: require connected wallet, validate form, approve token, call chain create function, then persist via `POST /api/marketplace`.
  - Buy listing: approve WTF, buy listing, invalidate marketplace.
  - Bid auction: parse WTF amount, approve WTF, bid, clear bid input, invalidate marketplace.
  - Place offer: parse WTF amount, approve WTF, place offer, clear offer input, invalidate marketplace.
  - Accept offer: if token is not listed, approve token first; accept offer; invalidate marketplace.
  - Cancel/settle actions call the existing Tezos helper and invalidate marketplace.

## Boundary Map

### Wrapper Boundary

`Marketplace.tsx` should own only:

- `MarketplaceProps` and the exported page function.
- Auth/wallet context reads.
- High-level tab state and AppWindow/Tabs composition.
- Wiring between data hook, action hook, tab panels, confirmation dialog, and `TokenDetailModal`.
- Compatibility defaults and route behavior.

### Data Boundary

Target owner: `client/src/features/marketplace/useMarketplaceData.ts`

- React Query calls for on-chain state, trade board rows, and wallets.
- Derived wallet select options.
- Derived offer/listing/auction/activity groupings.
- `invalidateMarket` helper preserving the `["marketplace"]` invalidation contract.

### Model And Helper Boundary

Target owners:

- `client/src/features/marketplace/types.ts`
- `client/src/features/marketplace/utils.ts`

Move DTOs, create-form types, pending confirmation types, `parseWtfInputToRaw`, `inferRoyalty`, `shortAddress`, and repeated token-detail construction helpers here. Keep helper imports dependency-light: no React Query, no page imports.

### Action Boundary

Target owner: `client/src/features/marketplace/useMarketplaceActions.ts`

Move the wallet-sensitive command handlers:

- create listing/auction submit
- buy listing
- cancel listing
- place auction bid
- cancel/settle auction
- place/cancel/accept offer

The hook may accept state setters and the `invalidateMarket` callback from the wrapper/data hook, but it must not change chain helper order or query keys.

### UI Boundary

Target owners:

- `MarketplaceChrome.ts`
- `CreateMarketEntryPanel.tsx`
- `MarketplaceListingsTab.tsx`
- `MarketplaceAuctionsTab.tsx`
- `MarketplaceTradeBoardsTab.tsx`
- `MarketplaceActivityTab.tsx`
- `OfferAcceptanceDialog.tsx`
- `index.ts`

Move styled components and presentational tabs so the wrapper mostly wires props. UI modules may import `react95`, `styled-components`, `OwnedTokensGallery`, `BarterBoard`, `UserLink`, `TokenDetailModal` types, and shared formatter helpers. They should not own query keys or call Tezos helpers directly unless assigned to the action worker.

## Scheduler Queue

Active cap: 1 scheduler + up to 10 active workers/verifiers under the domain skill cap. The user budget permits 11 workers; reserve the last slot for a verifier after the first branch is seeded.

| Slot | Domain | Write Scope | Dependencies | Verification |
| --- | --- | --- | --- | --- |
| Scheduler | Queue and conflict control | none, report only | this doc | final summary |
| W01 | Types/helpers | `types.ts`, `utils.ts` | source page only | Complete; `npm run check -- --pretty false` passed |
| W02 | Shared chrome/styles | `MarketplaceChrome.ts` | source styles only | Complete; `npm run check -- --pretty false` passed |
| W03 | Data hook | `useMarketplaceData.ts` | W01 types | Complete; preserved `["marketplace", "onchain"]`, `["marketplace", "trade-board", boardSearch]`, and `["wallets"]` |
| W04 | Create entry panel | `CreateMarketEntryPanel.tsx` | W01/W02 contracts | Complete; create submit remains callback-driven |
| W05 | Action hook | `useMarketplaceActions.ts` | W01 utils/types | Complete; approve/create/buy/bid/offer/accept ordering preserved |
| W06 | Listings tab | `MarketplaceListingsTab.tsx` | W01/W02/action props | Complete |
| W07 | Auctions tab | `MarketplaceAuctionsTab.tsx` | W01/W02/action props | Complete |
| W08 | Trade boards tab | `MarketplaceTradeBoardsTab.tsx` | W01/W02/action props | Complete |
| W09 | Activity tab | `MarketplaceActivityTab.tsx` | W01/W02/action props | Complete |
| W10 | Confirmation/dialog barrel | `OfferAcceptanceDialog.tsx`, `index.ts` | W01 contracts | Complete |
| W11 | Trailing verifier | no edits unless asked | completed modules + wrapper | `npm run check -- --pretty false` and `git diff --check` passed |

## Integration Plan

1. Wait for first-branch worker modules or inspect partial modules if a worker reports a blocker.
2. Replace imports in `Marketplace.tsx` with feature modules.
3. Keep the wrapper stateful where doing so reduces worker coupling: active tab, create form, selected token, input maps, search/mode, pending confirmation, detail token.
4. Move only enough state into hooks to preserve behavior and keep wrapper readable.
5. Run `npm run check -- --pretty false`.
6. Run `git diff --check`.
7. Update `BUG_BOUNTY_BOARD.md`, this division doc, and the touched-file ledger with verification notes.

## Known Risks

- Query-key drift can leave stale marketplace data after wallet actions.
- Moving create submission can accidentally persist before the on-chain op succeeds.
- Accept-offer quantity confirmation must still gate multi-edition transfers.
- `OwnedTokensGallery` selection must keep trade-board-only filtering and wallet options.
- `TokenDetailModal` needs `OwnedToken`-shaped objects from listings, auctions, and trade-board rows.
- React95 `Select` events use `e.value`, while `TextInput` uses `e.target.value`.

## Completion Notes

- 2026-05-05: `client/src/pages/Marketplace.tsx` is now a 345-line compatibility wrapper that owns route prefill, high-level tab/create/modal state, and feature-module wiring.
- Feature modules now own Marketplace DTOs/helpers, shared chrome, React Query data reads, wallet-sensitive marketplace actions, create-entry UI, listings, auctions, trade boards, activity, and offer-accept confirmation.
- Verification: `npm run check -- --pretty false` passed after each extraction slice; final `git diff --check` passed for `client/src/pages/Marketplace.tsx` and `client/src/features/marketplace/*`.

