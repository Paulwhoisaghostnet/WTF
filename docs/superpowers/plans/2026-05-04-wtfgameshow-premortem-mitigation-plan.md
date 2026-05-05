# wtfgameshow.app Pre-Mortem Mitigation Plan

Date: 2026-05-04
Status: implemented locally; deploy/live verification pending
Source report: `docs/reports/2026-05-04-wtfgameshow-app-premortem.md`

## Goal

Preserve the intended product behavior:

- Users can upload and share their own media.
- WTF uses Hetzner Object Storage as the durable source-of-record for user media originals.
- The Volume-backed TV cache remains a hot playback cache.
- IPFS/token media and user-hosted media continue to play smoothly.

Close the risky boundary:

- Public users should not be able to make wtfgameshow.app fetch and cache arbitrary internet URLs under the WTF origin.

## Implementation Update

Applied locally on 2026-05-04:

- Removed `passport-twitter` and its `xmldom/xtraverse` critical audit path. Legacy OAuth 1.0a Twitter routes now require an explicit flag, configured credentials, and an installed legacy strategy package; otherwise OAuth 2 remains the active X path.
- Tightened TV cache URL handling so an empty `TV_CACHE_ALLOWED_HOSTS` no longer means "all public hosts". Default cache hosts are limited to configured/default IPFS gateways, with additional production hosts opt-in through env.
- Added playback content-type gates: `/api/tv/cache/media` accepts only `video/*` and `image/gif`; the generic `/api/cache/media` path still supports images from allowed/IPFS hosts for wallpaper/media surfaces.
- Added JSON 404 handling for unmatched `/api/*` routes before the SPA fallback.
- Fixed `/api/health/disk` severity ordering so a full cache can report `crit`.
- Added regression tests for the above paths.

Still pending after deploy:

- Run the live smoke checks in Phase 5 against `https://wtfgameshow.app`.
- Add DNS-level resolved-IP validation for hostnames and every redirect target. Literal private/local hosts remain blocked, but this deeper guard is still future hardening.

## Non-Goals

- Do not remove user uploads.
- Do not remove Object Storage.
- Do not remove TV hot caching.
- Do not require all playback to be authenticated if the product needs public channel viewing.
- Do not break existing Object Storage-backed media IDs or active TV channels.

## Phase 1: Classify Media Sources

Define explicit source classes in code and docs:

1. `user_upload`: media row owned by a WTF user, original in Object Storage, hot copy on Volume.
2. `object_storage`: durable object key/bucket already recorded in DB.
3. `ipfs_token_media`: normalized IPFS CID/path fetched through known gateways.
4. `staff_external_import`: staff-approved external URL import.
5. `external_url`: arbitrary public URL. This should not be accepted by the unauthenticated playback cache.

Deliverables:

- Add comments or small types around TV/media source handling.
- Update `docs/server-storage-architecture.md` or `docs/cache-policy.md` with the source classes.

## Phase 2: Tighten TV Cache Inputs

Preferred behavior:

- User-uploaded media should be requested by DB media id or a server-generated playback URL, not by arbitrary `url=...`.
- Object Storage-backed playback should hydrate from stored object metadata, not user-supplied external URLs.
- IPFS/token media should be normalized to a configured gateway list.
- Arbitrary external URLs should require staff auth, a signed import token, or a separate import workflow.

Implementation options:

1. Keep `/api/tv/cache/media?url=...` only for allowlisted gateways/CDNs.
2. Add `/api/tv/cache/media/:mediaId` or reuse existing `/api/media/:id/file` for user uploads.
3. For public TV playback, issue opaque playback URLs from server-built channel queues.
4. Set `TV_CACHE_ALLOWED_HOSTS` in production to known IPFS/media gateways and WTF-owned media hosts.

Code targets:

- `server/routes/tv.ts`
- `server/lib/network-safety.ts`
- `server/routes/media-library.ts`
- `docs/cache-policy.md`
- `.env.example`

Tests:

- Reject `https://example.com/` from unauthenticated cache fetch.
- Reject `text/html` responses even from public hosts.
- Reject localhost/private literal hosts.
- Reject redirects to localhost/private hosts.
- Allow configured IPFS gateway media.
- Allow Object Storage-backed media by media id/object metadata.

## Phase 3: Add Fetch Safety Beyond Hostname Strings

Current private-host checks are useful but string-based. Add network-level checks:

- Resolve hostnames before outbound fetch.
- Reject private/link-local/loopback/reserved resolved IPs.
- Re-run the same validation after every redirect target.
- Consider blocking raw IP hosts unless explicitly allowlisted.
- Enforce content-type family for playback cache: `video/*`, `image/gif`, and any other intentionally supported media types.

Tests:

- Hostname that resolves to a private IP is rejected.
- Public URL redirecting to private IP is rejected.
- Oversized body still aborts and cleans up temp files.

## Phase 4: Fix Other Premortem Tigers

Legacy Twitter OAuth:

- Decide whether OAuth 2 covers the remaining legacy Twitter use case.
- If yes, remove/disable OAuth 1.0a routes and `passport-twitter`.
- If no, replace `passport-twitter` with a maintained OAuth 1.0a client path.
- Run `npm audit --audit-level=critical` and verify the critical `xmldom` path is gone.

API fallback:

- Add a JSON 404 for unmatched `/api/*` before static fallback.
- Verify frontend deep links still return `index.html`.

Disk health:

- Reorder `crit` before `warn` in `/api/health/disk`.
- Add a test that usage `1.0` returns `crit` and `0.9` returns `warn`.

## Phase 5: Live Verification

After deploy, run:

```bash
curl -i https://wtfgameshow.app/api/health
curl -i https://wtfgameshow.app/api/health/disk
curl -i https://wtfgameshow.app/api/definitely-not-a-route
curl -i 'https://wtfgameshow.app/api/tv/cache/media?url=http%3A%2F%2F127.0.0.1%3A3000%2Fapi%2Fhealth'
curl -i 'https://wtfgameshow.app/api/tv/cache/media?url=https%3A%2F%2Fexample.com%2F'
npm audit --audit-level=critical
```

Expected:

- Health returns `200`.
- API missing route returns JSON `404`.
- Private host cache request returns `400`.
- Arbitrary `example.com` cache request returns `400` or `403`, not cached HTML.
- Critical audit gate passes.

## Rollback

- Keep existing `/api/media/:id/file` and DB-backed playback paths unchanged.
- Roll back TV cache tightening by restoring the previous `normalizeMediaUri` allow behavior only if public TV playback breaks.
- Prefer temporarily adding known media hosts to `TV_CACHE_ALLOWED_HOSTS` over reopening all public hosts.

## Acceptance Criteria

- Users can still upload media and share/play it from WTF.
- Object Storage remains the durable original store.
- TV playback still works for active channels.
- Unauthenticated users cannot make the app fetch arbitrary public HTML or non-media URLs.
- Private/internal host fetch attempts are rejected before and after redirects.
- `npm audit --audit-level=critical` passes or has a documented exception with disabled code path.
- `/api/*` misses return JSON 404.
- `/api/health/disk` can report `crit`.
