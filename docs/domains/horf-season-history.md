# Horf season history and archive windows

## What the dates mean

Horf assigns a trade to a season by the **receipt transfer timestamp**, not by the horse token's mint timestamp. Mint dates and original artist posts help identify when a horse-trading campaign was active; they do not prove every historical season's exact start and end. The current season starts at **2026-11-01T00:00:00Z** because the requester supplied November 1 as its start. The earlier windows below are proposed UTC archive bins, with inclusive starts and exclusive ends, inferred from campaign names, mint clusters, and dated posts. Gaps remain unassigned rather than being folded into an invented yearlong season.

| Archive label | Proposed UTC interval `[start, end)` | Evidence and limit |
| --- | --- | --- |
| First horse trade | `2023-07-30T00:00:00Z` to `2023-09-01T00:00:00Z` | [Texadelic's later origin account](https://objkt.com/tokens/KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P/23) identifies the first small exchange and its [July 30, 2023 mint](https://objkt.com/tokens/KT1FfrZNFSuMzioMJRxfqEeHBu2FWyupRpPX/11). The end is only the next campaign bin's start. |
| Horse Trading 2023 | `2023-09-01T00:00:00Z` to `2023-11-01T00:00:00Z` | The first `horsetraders` tagged mint is September 1; a [September 3 mint](https://objkt.com/tokens/KT1Je2dRPZGRftSfvJYRTSRMtYr5hPieAvFd/4) calls it “Horsetrading season 2023.” The October end is inferred. |
| Neighvember 2023 | `2023-11-01T00:00:00Z` to `2023-12-01T00:00:00Z` | A [November 8 mint](https://objkt.com/tokens/KT1MTtkQdY6NvpAVWNcE1PAtvyAFJqTENdtd/3) names “Horse Trading Season 3”; [Texadelic's November 21 post](https://x.com/TEXADELIC_EXP/status/1726781111827636554) thanks participants and describes the event as concluding. The month edges are inferred from “Neighvember,” not announced cutovers. |
| For the Love of Horses | `2024-02-01T00:00:00Z` to `2024-03-01T00:00:00Z` | A [February 14 mint](https://objkt.com/tokens/KT1MJJePfNsTRDz4bsQyzN3ekqGjYPiZusLQ/5) names the February 2024 theme. The month edges are inferred. |
| Horse of July 2024 | `2024-07-01T00:00:00Z` to `2024-08-01T00:00:00Z` | [Texadelic's July 14 kickoff](https://objkt.com/tokens/KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P/23) names the event; [his July 26 farewell](https://objkt.com/tokens/KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P/31) offers trades until the end of July. The first tagged mint was July 1, before the kickoff. |
| Neighvember 2024 | `2024-11-01T00:00:00Z` to `2024-12-01T00:00:00Z` | [Texadelic's November 30 post](https://x.com/TEXADELIC_EXP/status/1863000517057654813) thanks participants and says “see you next time.” The November 1 start is inferred. |
| Spring / WTF Horse Trading 2025 | `2025-03-01T00:00:00Z` to `2025-05-01T00:00:00Z` | [March 31 trading post](https://x.com/TheGOATofTezos/status/1906686186451558432), [April 3 WTF Gameshow mint](https://objkt.com/tokens/KT1Ft6yPzbePaUv6btjq21CmzJgTcPNqzmwh/15), and [April 28 contribution post](https://x.com/TheGOATofTezos/status/1916750500877181131) show activity across both months. This bin may contain a March prelude and a distinct April event; neither edge is organizer-confirmed. |
| Neighvember 2025 | `2025-11-01T00:00:00Z` to `2025-12-01T00:00:00Z` | A [November 10 participant post](https://x.com/UnitedSaints/status/1987975322806219197) says the event is in full swing and describes minting multiple editions and finding other traders. Both edges are inferred. |
| Current season | `2026-11-01T00:00:00Z` onward | Start supplied by the requester; no end has been supplied. |

## Mint-cluster check

On November 3, 2026, a cursor-paginated scan of [Objkt's GraphQL index](https://data.objkt.com/docs/) found these counts of tokens carrying the **exact** named tag in each month. They are mint counts, **not trade counts** or unique artists. Metadata and tags can change, so this is discovery evidence rather than a fixed ledger.

| Exact tag | Relevant mint clusters |
| --- | --- |
| `horsetrading` | September 2023: 48; November 2023: 103; February 2024: 123; July 2024: 178; November 2024: 67; March 2025: 15; April 2025: 30; November 2025: 34. |
| `neighvember` | November 2023: 87; November 2024: 65; November 2025: 31. |
| `horseofjuly` | July 2024: 120; August 2024: 5. |

Objkt also has separate year-suffixed or hash-prefixed tags: `#neighvember` (10 tokens), `neighvember2025` (4), `neighvember2024` (2), `neighvember 2024` (1), `#horseofjuly` (16), and `horse of july` (3). Search those variants when discovering eligible tokens. The broad `horse` and `haha` tags predate the first documented horse trade and cannot define campaign boundaries by themselves.

## Numbering is not a reliable archive key

[Texadelic's July 14 kickoff](https://objkt.com/tokens/KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P/23) and [jonCates' July 15 mint](https://objkt.com/tokens/KT1RS5sYP1uFwEXGkqtP2VjN5gxRQqGxgJSN/46) call Horse of July the **fifth** season. [Texadelic's July 26 farewell](https://objkt.com/tokens/KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P/31) calls that same event the **sixth**. February 2024 mints variously use “season 3” and [“Season 2 = 2024”](https://objkt.com/tokens/KT1X8wdM4VaDCShWyAhw9EXkAQQXkpBsLCvH/369). Store stable date and campaign keys; present these historical labels as artist language, not an authoritative ordinal.
