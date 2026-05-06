# Monolith Swarm Roster

Runtime note: the live agent tool rejected additional spawns after six active agents with `agent thread limit reached`. This roster defines the requested ten-division swarm; the manager will run it in waves and recycle slots as supervisors finish.

## Scoring

- Speed trophy: largest clean line-count reduction or wrapper-thinning completed fastest with passing checks.
- Quality trophy: cleanest decomposition, lowest follow-up cleanup, best verification evidence.

## Division 01: StudioProject Client

- Monolith: `client/src/pages/StudioProject.tsx`
- Live leader: Faraday (`019dfa99-c339-78e0-b2ff-116c7b021d1d`)
- Scheduler: D01-Scheduler
- Workers:
  - D01-W01: types, DTOs, constants
  - D01-W02: data queries and hooks
  - D01-W03: mutations and command handlers
  - D01-W04: shell layout and toolbar
  - D01-W05: file tree and folder navigation
  - D01-W06: preview surface
  - D01-W07: annotations panel
  - D01-W08: comments and collaboration state
  - D01-W09: project chat and DM bridge
  - D01-W10: upload, storage, and versions
  - D01-W11: compatibility verifier and cleanup

## Division 02: MessageBoard Client

- Monolith: `client/src/pages/MessageBoard.tsx`
- Live leader: Bacon (`019dfa99-c4be-7781-ae6c-45510425004c`)
- Scheduler: D02-Scheduler
- Workers:
  - D02-W01: types and API contracts
  - D02-W02: board queries and hooks
  - D02-W03: categories and channel navigation
  - D02-W04: thread list
  - D02-W05: thread detail and replies
  - D02-W06: composer and attachments
  - D02-W07: reactions and moderation UI
  - D02-W08: permissions and admin controls
  - D02-W09: webhooks and integrations UI
  - D02-W10: shell layout and responsive states
  - D02-W11: compatibility verifier and cleanup

## Division 03: W Message Routes

- Monolith: `server/features/w/message-routes.ts`
- Live leader: Tesla (`019dfa99-c663-7d03-9210-63bc23521353`)
- Scheduler: D03-Scheduler
- Workers:
  - D03-W01: DTOs and validators
  - D03-W02: conversation resolution
  - D03-W03: DM list and read routes
  - D03-W04: groupchat routes
  - D03-W05: send routes and media ownership checks
  - D03-W06: admin diagnostics routes
  - D03-W07: X DM sync bridge
  - D03-W08: stream-rule admin routes
  - D03-W09: cache and rate-limit helpers
  - D03-W10: route registrar wrapper
  - D03-W11: route-order verifier and tests

## Division 04: TV Menu Screens

- Monolith: `client/src/features/tv/TVMenuScreens.tsx`
- Live leader: Cicero (`019dfa99-c7f9-7360-bbec-029d19a77aa2`)
- Scheduler: D04-Scheduler
- Workers:
  - D04-W01: menu shell and navigation state
  - D04-W02: creator console index
  - D04-W03: channel manager
  - D04-W04: playlist editor
  - D04-W05: media library
  - D04-W06: bumper manager
  - D04-W07: schedule and live settings
  - D04-W08: cache/status panels
  - D04-W09: upload and import dialogs
  - D04-W10: remote/menu state hooks
  - D04-W11: responsive verifier and cleanup

## Division 05: Shared Desktop Model

- Monolith: `shared/desktop.ts`
- Live leader: Linnaeus (`019dfa99-c9b5-7d63-8204-0084354faeb2`)
- Scheduler: D05-Scheduler
- Workers:
  - D05-W01: core DTOs and constants
  - D05-W02: hamster genetics and appearance
  - D05-W03: hamster state and health
  - D05-W04: toy and ball inventory
  - D05-W05: ant and world shared types
  - D05-W06: desktop layout and icon types
  - D05-W07: marketplace item types
  - D05-W08: persistence serialization
  - D05-W09: API request/response contracts
  - D05-W10: validation and normalization
  - D05-W11: barrel export verifier

## Division 06: Marketplace Client

- Monolith: `client/src/pages/Marketplace.tsx`
- Live leader: Godel (`019dfa99-cc92-72b3-bdc0-cccc0065f62a`)
- Scheduler: D06-Scheduler
- Workers:
  - D06-W01: types and API hooks
  - D06-W02: listing grid
  - D06-W03: listing detail
  - D06-W04: create listing form
  - D06-W05: bids and auction panel
  - D06-W06: cart and checkout
  - D06-W07: wallet/on-chain status
  - D06-W08: filters and search
  - D06-W09: seller dashboard
  - D06-W10: shell layout
  - D06-W11: compatibility verifier and cleanup

## Division 07: Profile Client

- Monolith: `client/src/pages/Profile.tsx`
- Live leader: queued
- Scheduler: D07-Scheduler
- Workers:
  - D07-W01: profile types and hooks
  - D07-W02: header and identity
  - D07-W03: wallet management
  - D07-W04: tokens and holdings gallery
  - D07-W05: XP and rewards activity
  - D07-W06: dossier/surveillance panels
  - D07-W07: settings and preferences
  - D07-W08: social links and W identity
  - D07-W09: tabs and route state
  - D07-W10: shell layout
  - D07-W11: compatibility verifier and cleanup

## Division 08: Server Messages Routes

- Monolith: `server/routes/messages.ts`
- Live leader: queued
- Scheduler: D08-Scheduler
- Workers:
  - D08-W01: DTOs and validators
  - D08-W02: auth and participant policy
  - D08-W03: conversation CRUD
  - D08-W04: message read/send
  - D08-W05: reactions and attachments
  - D08-W06: DM/group admin
  - D08-W07: notifications side effects
  - D08-W08: search and pagination
  - D08-W09: websocket/event emission
  - D08-W10: route registrar wrapper
  - D08-W11: route-order verifier and tests

## Division 09: Server Studio Routes

- Monolith: `server/routes/studio.ts`
- Live leader: queued
- Scheduler: D09-Scheduler
- Workers:
  - D09-W01: DTOs and validators
  - D09-W02: project CRUD
  - D09-W03: membership and permissions
  - D09-W04: folders and file metadata
  - D09-W05: upload/storage route bridge
  - D09-W06: comments and activity
  - D09-W07: platform storage admin
  - D09-W08: project state/preferences
  - D09-W09: Google Drive integration bridge
  - D09-W10: route registrar wrapper
  - D09-W11: route-order verifier and tests

## Division 10: Auth Routes

- Monolith: `server/auth/routes.ts`
- Live leader: queued
- Scheduler: D10-Scheduler
- Workers:
  - D10-W01: DTOs and validators
  - D10-W02: login and registration
  - D10-W03: wallet auth and nonce routes
  - D10-W04: session lifecycle
  - D10-W05: OAuth callbacks
  - D10-W06: user bootstrap/profile
  - D10-W07: password/token helpers
  - D10-W08: middleware and policies
  - D10-W09: rate limits and audit logging
  - D10-W10: route registrar wrapper
  - D10-W11: security verifier and tests
