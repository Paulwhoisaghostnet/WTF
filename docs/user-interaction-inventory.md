# WTF Platform User Interaction Inventory

Last reviewed: 2026-05-06

This inventory lists the main interactions a person, staff operator, paired
agent, bot, or anonymous visitor can have with the WTF platform. It is divided
by issue of concern first, then by domain.

Source basis: `README.md`, `docs/public-access.md`,
`client/src/routes/page-defs.ts`, `server/routes.ts`, and the page/feature
modules under `client/src/pages`, `client/src/features`, `server/routes`, and
`server/features`.

## Access Legend

| Access | Meaning |
| --- | --- |
| Public | No signed-in session required. |
| Session | Signed-in browser session required. |
| Owner/creator | Signed-in user must own the relevant wallet, media item, channel, project, or record. |
| Staff | Admin, host, cohost, or a role with the required permission. |
| Bot | Discord bot, webhook, or server-to-server credential. |
| Agent | Paired MCP token acting for one approved user. |

## Concern: Entry, Authentication, and Account Identity

| Domain | Access | Possible interactions |
| --- | --- | --- |
| Public entry | Public | View landing screen; open login; open registration; view public leaderboard; view public gallery; view public links; read FAQ; view Discord terms, privacy, and linked-role policy pages. |
| Local auth | Public/session | Register account; log in; log out; fetch current user; change or set password; handle auth failures and expired sessions. |
| Social auth | Session/public callback | Start Google, GitHub, X/Twitter, and Discord OAuth flows where configured; complete callbacks; view provider configuration; view X OAuth diagnostics and self-tests. |
| Wallet auth | Public/session | Request wallet challenge; verify wallet signature; create wallet-backed account; sign in through wallet proof. |
| Profile identity | Session | Edit display name; set email visibility; set X/Discord handle visibility; link verified X account; link verified Discord account; disconnect X/Discord account; view XP profile data. |
| Profile picture | Session/owner | Browse owned-token PFP candidates; search and page through candidates; select token image; edit PFP image on canvas with draw, text, sticker, and crop tools; save token-backed PFP; remove PFP. |
| Public profile | Public/session | View a user profile; view public about fields; view trade-board tokens; view listings; view public XP/activity; start a DM lookup with that user when signed in and allowed. |
| Notification identity | Session | View notification preferences; change preference toggles; list notifications; filter unread notifications; open notification target; mark one notification read; mark all notifications read. |

## Concern: Desktop OS, Navigation, and Personal Environment

| Domain | Access | Possible interactions |
| --- | --- | --- |
| Window shell | Public/session by route | Open app windows from browser routes; open desktop-icon apps; open Start Menu apps; focus existing windows; use full-screen login, register, and landing overlays; close/minimize/focus app windows through the window manager. |
| Desktop icons | Session/public gates | Open dashboard, WTF In-App Marketplace, Hoard, W, WTF TV, Dicksword, WTF Console, Game Studio, Studio, My Gallery, and other enabled app icons; reposition icons; reset icon layout. |
| Desktop appearance | Session | Choose color scheme; edit desktop, window, title, text, highlight, and button colors; choose wallpaper fit; clear wallpaper; upload wallpaper image; set wallpaper from saved images; set wallpaper from owned token art; choose cursor style; save appearance. |
| Desktop physics | Session | Enable or disable desktop icon physics; choose gravity mode; interact with gravity/zero-gravity icon behavior. |
| Desktop pet | Session | Enable/disable pet; adopt/revive pet; rename pet; choose pet color scheme; view hunger, thirst, energy, mood, hygiene, health, sickness, trauma, and other stats; feed; water; play; pet; clean; scoop; nap/rest; medicate; use inventory-backed food, medicine, balls, and shoebox/rest tools. |
| Desktop ambient world | Session | Place food and water drops; create poop/remains cleanup targets; watch ants respond to food; interact with pet toys; see anonymous visiting pets or toys from the hidden shared-world simulation; send escaped pet or toy events to neighboring desktops without exposing topology. |
| Desktop items | Session/owner | Render owned desktop artifacts; use cursor tool tray; use scale tool; place portal-gun portals; switch portal colors; open jukebox/Tezamp; trigger item-owned effects such as fan, lights, sticky-note trap, mop, vacuum, train kit, paper shredder, catapult, ant farm, and other inventory items where granted. |
| Screen saver and cursor | Session | Trigger/exit screen saver; use custom animated cursors; hide system cursor while custom cursor or care tool is active. |
| Agent pairing from settings | Session | View MCP endpoint; create named MCP token; copy token once; view active token prefixes/scopes/last-used state; revoke token. |

## Concern: Wallets, Tokens, Portfolio, and On-Chain State

| Domain | Access | Possible interactions |
| --- | --- | --- |
| Tezos wallets | Session | List linked wallets; link wallet by connected address or manual address; unlink wallet; set primary wallet; request wallet challenge; sync profile tokens; sync one wallet; fetch wallet WTF balance; fetch wallet tokens; view profile dossier. |
| Etherlink wallets | Session/staff for sync-all | View supported Etherlink networks; request challenge; link EVM/Etherlink wallet; set primary; unlink; sync one wallet; sync all user wallets; list Etherlink assets; staff can trigger all-user Etherlink sync. |
| Dashboard overview | Session | View passport summary; open profile editor; open public profile view; view WTF balance; use wallet connect button; view active season; jump to rounds and challenges; see portfolio summary. |
| Dashboard holdings | Session | View indexed token holdings; filter holdings by wallet/domain; inspect contracts, token counts, and portfolio positions. |
| Dashboard activity | Session | View indexed wallet/token activity and operation history. |
| Dashboard collections | Session | Browse collections; open collection detail; backfill or refresh collection metadata where available. |
| Dashboard sync | Session | View sync status and backfill status; queue wallet sync; run sync jobs when authorized; inspect sync runs. |
| Cockpit/portfolio API | Session | Fetch holdings; fetch overview; fetch activity; fetch collections; fetch collection detail; trigger wallet sync; view P&L summary, positions, realized sales, and collection rollups. |
| Token archive | Session/owner | Request archive data for a token; queue owned token artifacts for preservation; view archive status. |
| Contract activity | Session/staff | Submit contract activity evidence; browse contract activity log with status/search filters. |

## Concern: Gameshow Participation, Progression, and Rewards

| Domain | Access | Possible interactions |
| --- | --- | --- |
| Seasons | Public read/staff write | List seasons; view season detail; staff create, update, delete, and status-manage seasons. |
| Rounds | Public/session read, staff write | List rounds by active season; view round detail; inspect round status, dates, description, and attached challenges; staff create, update, delete, attach to seasons, and manage round status. |
| Challenges | Public/session | List challenges; filter by round; expand challenge; view rules, requirements, reward data, and cockpit stats; submit text/link/evidence payload; view own submission state; staff create, update, grade submissions, mark reward paid, and manage reward flags. |
| Side quests | Public/session | List side quests; view active/completed quests; expand quest; submit completion evidence; view own completions; staff create/update quests, define auto-completion rules, and approve completions. |
| Mint portal | Session | View mint-bound challenges; copy submission tags; open challenge mint links; check recent mints for linked wallets; auto-create submissions from indexed mint events; view mint submissions, token contract/id, and operation hash. |
| Leaderboards | Public | View WTF holder leaderboard; view XP leaderboard; view recent WTF transfers; inspect enriched Tezos names/profile data. |
| WTF Recapture | Public/session | View recapture leaderboard; view active buyback windows; view WTF auctions; signed-in users view their recapture events; submit buyback swap intent after wallet operation; bid in live WTF auctions. |
| Calendar | Public/session/staff | Browse events by today, week, or season; view published public/role-visible events; submit event ticket for review; view own tickets; staff review tickets, create manual events, sync source events, cancel or publish events, and expose iCal feed. |
| Attendance | Session/public bot-like entry | Claim attendance through configured entry points; claim in-app attendance; view own attendance; staff view and patch attendance records. |
| Rewards | Staff/session view | View reward ledger; filter rewards; select reward rows; mark paid; batch pay with operation hash; inspect XP log; award XP manually. |

## Concern: Community, Social, Messaging, and Discord

| Domain | Access | Possible interactions |
| --- | --- | --- |
| Message board | Public/session/role-gated | List categories; list visible channels; read channel messages; read pins; post message where allowed; edit/delete own or moderated messages; pin/unpin; manage forum/text/announcement channel behavior; manage categories and channels; use board webhooks. |
| Legacy threads | Public/session | Read legacy thread lists/details; create thread replies where still supported; receive deprecation headers toward the board surface. |
| Direct messages | Session | Search users; create DM; list direct and Studio-room conversations; select conversation; read message history; send DM; open emoji picker; mark DM read. |
| Notifications inbox | Session | View notification tab; toggle notification settings; filter all/unread; open linked item; mark one/all read. |
| W timeline | Session | View cached/live X timeline; refresh; compose W post; upload W media; reply; like; repost; quote; open post detail route; view diagnostics/source/staleness; toggle night mode. |
| W messages | Session/admin variants | View public/official groupchats; select groupchat; send groupchat message; list user DMs; read user DM messages; send user DM; start direct DM by target; use platform/admin DM controls if permitted. |
| W social/settings | Session/staff | View follows summary; list follows; follow accounts; inspect X spaces; embed an X Space URL; view W capabilities; manage official groupchat IDs; view DM diagnostics; manage stream rules; inspect stream status; run X OAuth diagnostics/self-test. |
| Dicksword/Discord | Public/session/bot/staff | View Discord config and command list; view signed-in Discord identity; create Discord claim; choose avatar layer selection; submit proof/activity events; sync roles; view avatar assets; staff or bot routes automate role assignment and claims. |
| Public profiles as social surface | Public/session | Browse user public profile, trade board, listings, and activity; open DM with user when signed in. |
| WebSocket realtime | Session | Receive board and Studio live events; send Studio cursor/presence through authenticated realtime channel. |

## Concern: Media, Creation, Gallery, and Preservation

| Domain | Access | Possible interactions |
| --- | --- | --- |
| Public gallery | Public | Browse public gallery; open token detail by gallery path or token path; inspect token metadata and media preview. |
| My Gallery | Session | Browse owned linked-wallet tokens; search; filter by creator, collection, wallet, and media kind; sort by acquisition, mint date, title, or creator; open token detail; import playable media to My Videos, My Photos, My Games, or My Music; preserve artifact through archive pass/status. |
| Media library API | Session/owner | List own media by category; view media metadata; import token media with provenance; upload file media; stream own media file; edit title/creator credits; inspect usage; delete media with cascade awareness. |
| My Videos | Session/owner | View uploaded/imported video library; import owned video/GIF tokens; upload video file; edit upload-only credits; add video to a TV channel; detach from a channel; toggle bumper assignment; manage usage before deletion; delete library item. |
| My Photos | Session/owner | View image library; import owned image tokens; upload image; open token detail; delete image item. |
| My Music | Session/owner | Upload audio file; title audio; view audio library; play audio items. |
| Tezamp | Session | Open music player surface; play local/library audio where wired from My Music or jukebox item. |
| colleKT bridge | Session | View colleKT session state; see WTF profile wallets used as source; launch standalone colleKT module; inspect detected wallets/tokens through bridge endpoints. |
| Creation tools | Session | Open PArticle Painter, INDUSTR1ALIZER, and Paul's Particles tool wrappers; use vendored/local creative tool experiences. |
| Game Studio | Public/session for publish | Select game template; view scaffold files; preview starter game; filter stock assets; select stock assets; upload local assets into the workbench; choose ZIP bundle; upload bundle to media library; submit game to WTF Arcade review or export for owned Console media. |
| Studio projects | Session/permission | Create project; connect/disconnect Google Drive; refresh Studio Drive usage; open last project; browse projects; open project workspace; upload files; create folders; select file; preview image/video/audio/document/raw files; download raw file; rename file; delete file; create pin/rectangle annotations; save/cancel annotation drafts; resolve/reopen/delete annotations; comment on annotations; chat in project room; pin/unpin chat messages; invite members; view member presence. |
| Studio storage/admin | Staff/session | Configure platform/user Drive; connect/disconnect admin drive; refresh quota/usage; set root folder; inspect storage backend and dependent project counts. |

## Concern: WTF TV, Playback, Channels, and Embeds

| Domain | Access | Possible interactions |
| --- | --- | --- |
| TV viewer | Public/session | List public channels; switch channel by dial/selection; watch deterministic stream; view current item; adjust volume; open menu; view schedule; view channel settings; trigger playback telemetry; receive skip/error notice and broadcast playback state. |
| TV embeds | Public | Resolve channel by dial; fetch embed metadata; render iframe player; fetch oEmbed response; play channel-scoped media and bumper media through safe playback routes. |
| Creator channels | Session/creator | List own channels; create channel within cap; select owned channel; edit title, description, logo, banner, slug, public flag, and videos-per-bumper; delete channel; refresh token/media sources. |
| TV playlists | Session/owner | Create playlist; rename playlist; set active playlist; open playlist order editor; add/remove/reorder videos; set per-item duration; save playlist items. |
| TV token/media sources | Session/owner | Search playable tokens; sort playable tokens; page tokens; add token to channel; remove video from channel; view My Media in TV; add media library item to channel; detach media from channel; manage usage before delete; delete media item. |
| TV bumpers | Public/session/owner | View personal bumpers; view public/community bumper pool; upload bumper file; choose personal/community category; update bumper category; toggle media as bumper; remove from bumper pool; delete owned bumper. |
| TV schedule | Public/session/owner | View channel schedule; create playlist schedule entry with start/end time and label; delete schedule entry; query current item by slug. |
| TV cache and telemetry | Public/session/staff | Fetch playback cache media; view cache stats; prefetch media; send playback events; send item-end telemetry; view aggregate telemetry if authorized. |
| WTF TV admin | Staff | Configure canonical WTF TV source mode; select all users, selected users, or specific wallets; set tokens per wallet; set durations, playlist size, refresh interval, and bumper mode; initialize canonical channel; refresh sources; choose selected bumpers. |

## Concern: Market, Exchange, Inventory, and Commerce

| Domain | Access | Possible interactions |
| --- | --- | --- |
| WTF In-App Marketplace | Session | Browse categories: Desktop Pet, Desktop Items, System Appearance, WTF TV, Studio, Preservation; view live/staged listings; view EXP balance; switch cart currency between WTF and EXP; add/remove live stock tickets to cart; clear cart. Checkout is staged/disabled in the current client surface even though server routes exist for intents, EXP checkout, sync, verify, and item use. |
| In-app inventory use | Session/owner/API | Sync in-app inventory; verify purchase operation; use inventory item; consume inventory items through desktop pet/item interactions; enforce item caps such as pet balls. |
| In-app market admin | Staff | View catalog items; update item stock, active state, visibility, pricing, metadata, and category placement. |
| On-chain marketplace | Public/session/owner | View on-chain marketplace snapshot; view listings; open listing detail; create buy-now listing or auction; select owned token; buy listing; cancel own listing; place offer; accept/reject/cancel offers; view external listings; cancel linked-wallet external listing; view My Activity. |
| Auctions | Public/session/owner | Browse active auctions; create auction; bid; cancel own auction; settle auction; inspect auction detail and bids. |
| Trade boards and barter | Public/session/owner | View public trade-board cache; search trade boards; switch board modes; add/remove owned tokens from own trade board; place trade-board offer; accept/reject/cancel offer; view barter on-chain snapshot. |
| Hoard | Session/owner | Browse linked-wallet token hoard; search/filter owned tokens; sync wallet first when empty; mark tokens for trade-board/listing workflows through wallet ownership checks. |
| Swap/DEX | Public/session/wallet | View token list; view pools; choose from/to token; flip swap direction; fetch counterpart tokens; inspect pool metrics and health; set amount; set slippage; execute SpicySwap through connected wallet; view operation status/hash. |
| WTF -> XTZ buyback | Public/session/staff | View active buyback windows; check allowlist status; submit swap intent after wallet operation; staff create/fund/open/close/pause/resume/sweep buyback windows through operator wallet. |
| Contract factory | Staff | Choose contract template; select network; edit origination storage JSON; compile; deploy with configured test wallet; view deployed WTF contracts registry; retire live contract. |
| Operator wallet | Staff | View signer/operator status; refresh balances; view unpaid reward ledger; preview disbursement; run signed reward disbursement; run buyback fund/open/close/pause/resume/sweep actions; view recent runs; reconcile run. |
| Contract ledger | Staff/session | View contract activity log; filter by status/search; submit activity evidence through contract activity endpoint. |

## Concern: Games, Console, and Playable Cartridges

| Domain | Access | Possible interactions |
| --- | --- | --- |
| WTF Console library | Public/session | Browse all games, arcade/published games, demo cartridges, and wallet cartridges; launch game; boot direct iframe cartridge; load ZIP cartridge; reset game; eject game; submit session telemetry/scores through SDK. |
| Console play sessions | Session | Create play ticket/session; submit score with score caps; view leaderboard by slug; view recent score submissions. |
| Creator submissions | Session/creator | View my submitted games; upload game ZIP through Game Studio/media library; submit game for review with title, description, category, and score limits. |
| Console moderation | Staff | Approve, reject, or remove submitted game by slug/action; manage score eligibility and published catalog. |
| Game Studio templates/assets | Public/session | Fetch templates; fetch assets; fetch scaffold; create scaffold from template; use stock assets in a project; upload local assets; publish bundle to review. |

## Concern: Administration, Governance, and Operations

| Domain | Access | Possible interactions |
| --- | --- | --- |
| Admin overview | Staff | View counts for users, seasons, rounds, challenges, side quests, listings, threads, links, and FAQ. |
| User admin | Staff | Search users; change role; award XP; edit identity profile fields; clear social identity; delete user; inspect dossier; set temporary password; clear temporary password; resync user wallet/token/profile data. |
| Season admin | Staff | Create, edit, status-manage, and delete seasons. |
| Round admin | Staff | Create round; edit round; attach/detach from season; set status; edit starts/ends metadata; delete round. |
| Challenge admin | Staff | Create challenge; edit challenge; assign to round or library; set status; configure reward/subdomain/mint fields; expand submissions; grade pass/fail/bonus; mark reward state. |
| Side quest admin | Staff | Create quest; edit quest; set status; configure auto/manual completion rules; approve completion. |
| Board admin | Staff | Moderate board content; delete thread/message content; manage categories, channels, pins, permission overwrites, and webhooks. |
| Content admin | Staff | Create/update/delete curated links; create/update/delete FAQ entries; set display order/category. |
| XP log admin | Staff | Filter XP events by user; inspect XP source history. |
| Reward admin | Staff | Filter reward ledger; select rows; enter batch operation hash; mark paid; run batch payment workflow. |
| Desktop app gates | Staff | View desktop app gate map; enable/disable app surfaces such as gallery, hoard, TV, console, game-studio, and related MCP feature gates. |
| Roles and permissions | Staff | View permissions by category; toggle role permissions; reset role permission set. |
| WTF TV admin | Staff | Configure canonical channel inputs, bumper behavior, auto-refresh, and selected source users/wallets. |
| Studio admin | Staff | Connect/disconnect platform Drive; refresh quota/usage; set Studio root folder. |
| WTF.tez admin | Staff | Grant subdomain label to user; track provisioning status; update status and operation hash; view all grants. |
| In-app market admin | Staff | Manage inventory catalog item activity, stock, visibility, and metadata. |
| Control board | Staff | Run gameshow operator workflows; fetch season/round/challenge state; manage elimination/drafting rules; process submissions; run buyback dry-runs; apply control-board actions and status transitions. |
| Health and system logs | Public/staff | Fetch API health; fetch disk/cache health; ingest bounded client logs; staff query system logs and log summaries. |
| Deploy/backup docs and ops | Staff/operator | Follow documented backup/recovery and deploy workflows; monitor health endpoints; run production deploy outside normal user UI. |

## Concern: Public Data, Embeds, APIs, Agents, and Automation

| Domain | Access | Possible interactions |
| --- | --- | --- |
| Public JSON APIs | Public | Read health, disk/cache status, desktop app gates, links, FAQ, console demo/catalog data, game-studio templates/assets/scaffolds, leaderboards, public profiles, public trade boards, marketplace snapshots, DEX data, calendar events, TV channels, TV streams, embeds, and public gallery/token data. |
| Public write endpoints | Public/bounded | Submit client diagnostic logs; submit TV playback/item-end telemetry; use configured board webhook token; use attendance in-app endpoint where allowed. |
| MCP token management | Session | List MCP tokens; create token; receive raw token once; revoke token; view public endpoint. |
| MCP transport | Agent | Connect to `/mcp` with bearer token; call paired-user tools; receive rate-limit and feature-gate capability data. |
| MCP desktop tools | Agent | Read desktop appearance; set desktop appearance; read desktop pet; perform safe pet-care actions for paired user. |
| MCP public data tools | Agent | Search public token metadata; list unlisted trade-board tokens; list public TV channels; list WTF Arcade games/stats/fees, stock Console discovery, Console player/score summaries, and Game Studio templates/assets/snippets/targets. |
| MCP account-scoped tools | Agent | Set paired user's trade-board tokens after ownership checks; prepare single-edition listing workflow without signing; create game-studio scaffold. |
| Embed/oEmbed | Public | Render TV iframe by ref; fetch oEmbed metadata; resolve TV channel embed information; share embeddable player URLs. |
| WebSocket | Session | Connect authenticated browser socket for board/Studio live events, presence, and collaboration invalidations. |
| Discord bot and external automation | Bot/staff | Verify Discord bot proofs; ingest activity; sync roles; process claims; call bot-protected routes with configured credentials/HMAC. |
| Crawler preview/embed | Public/ops | Generate and inspect crawler preview metadata for public routes; provide social/card previews for supported platform pages. |

## Concern: Safety, Privacy, and Boundaries

| Domain | Access | Possible interactions |
| --- | --- | --- |
| Public/private data boundary | All | Public users can read on-chain/IPFS/TzKT/Objkt-derived facts and intentionally public WTF rows; private email, OAuth tokens, DMs, notifications, unpublished Studio/media, and admin state require session/permission. |
| Ownership checks | Session/owner | Mutations that affect wallets, media, TV channels, Studio projects, trade-board rows, marketplace rows, and desktop inventory are scoped to the signed-in or paired user unless staff permissions apply. |
| Wallet signature boundary | Session/wallet | On-chain actions require user wallet signature and verifiable operation hash; MCP can prepare workflows but cannot silently sign. |
| Rate limits | Public/session/agent | Auth attempts, wallet auth, OAuth start, generic API, media upload, TV cache prefetch, MCP requests, and playback telemetry have route-specific rate limits or payload caps. |
| Feature gates | Public/session/staff/agent | Admin desktop-app gates hide or disable app surfaces and matching MCP workflows; disabled gates fail closed for agent tools. |
| Moderation and deletion | Owner/staff | Users can delete own media and manage own posts where supported; staff can moderate board content, users, games, Studio access, TV surfaces, and platform content. |
