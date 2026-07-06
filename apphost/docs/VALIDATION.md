# wtfOS Application Host Validation

## Latest Host Validation

Date: 2026-06-29

Host diagnostics directory:

```text
/opt/wtfos/apphost/state/diagnostics/20260629T215037Z
```

Command:

```bash
sudo /opt/wtfos/apphost/scripts/validate-apps.sh
```

Result:

- `failures.txt` was empty.
- `wtfos-apphost-xvfb.service`, `wtfos-apphost-pulse.service`,
  `wtfos-apphost-wm.service`, `wtfos-apphost-vnc.service`, and
  `wtfos-apphost.service` were active afterward.
- Existing production containers remained healthy:
  `wtf-app-app-1`, `wtf-app-caddy-1`, and `wtf-app-postgres-1`.

## Application Results

| Application | Launch health | Status health | Stop health | Artifacts |
| --- | --- | --- | --- | --- |
| Jackbox Party Pack 10 | `running`, `TJPP10_Vulkan` PID observed | `running` | `stopped` | `launch.json`, `status.json`, `stop.json`, `glxinfo.txt`, `pulse-info.txt`, `screenshot.png` |
| Jackbox Party Pack 11 | `running`, `TJPP11_Vulkan` PID observed | `running` | `stopped` | `launch.json`, `status.json`, `stop.json`, `glxinfo.txt`, `pulse-info.txt`, `screenshot.png` |

Both applications initialized OpenGL through Mesa llvmpipe on display `:99`.
Both applications initialized PulseAudio through
`unix:/opt/wtfos/apphost/run/pulse/native`.

## Live API State After Validation

After validation cleanup:

```text
jackbox-party-pack-10: stopped, health.ok=false
jackbox-party-pack-11: stopped, health.ok=false
```

The apphost manifest API reports a `360` second startup timeout for both
Jackbox applications. This timeout is intentionally longer than a normal game
process start because the provider client/session/runtime may need to finish
background work before the Jackbox process appears.

The daemon also exposes a private Unix socket at:

```text
/opt/wtfos/apphost/run/apphost.sock
/run/wtf/apphost/apphost.sock
```

On 2026-06-29, raw HTTP requests over both sockets returned `200 OK`. The
canonical apphost socket returned `{"ok": true, "service": "wtfos-apphost"}`;
the shared `/run/wtf` socket returned the Jackbox manifest list from inside the
existing `wtf-app-app-1` container.

On 2026-06-30, the shared `/run/wtf` bridge was validated as the production app
container user, not root. The socket was mode `0660`, the client env file was
mode `0640`, and both were grouped as gid `1000`, which maps to `node` inside
`wtf-app-app-1`.

The shared non-secret client env file was present at:

```text
/run/wtf/apphost/wtfos-apphost.env
```

It was readable from the existing `wtf-app-app-1` container as uid/gid
`1000:1000` and exported
`WTFOS_APPHOST_SOCKET_PATH=/run/wtf/apphost/apphost.sock`. A container-side Node
request using that env file returned the expected Jackbox manifests:

```text
200 jackbox-party-pack-10 jackbox-party-pack-11
```

The status API now includes sanitized user-facing `progress` fields while raw
diagnostics remain private to apphost support artifacts. The manifest list now
also includes `activeSession` plus cover/title metadata for the wtfOS external
Applications carousel.

Deployed daemon tests also passed on the host:

```bash
cd /opt/wtfos/apphost && python3 -W error::ResourceWarning -m unittest tests/test_apphostd.py
```

## wtfOS Exposure Check

The isolated apphost is live on loopback and the production wtfOS app image now
contains the Applications route and authenticated apphost proxy.

```text
https://wtfos.app/applications      -> 200 text/html
https://wtfos.app/api/apphost/apps  -> 401 application/json without login
https://gamma.wtfos.app/applications -> 200 text/html
https://beta.wtfos.app/applications  -> 200 text/html
```

`wtfos.me` remains the user-site/ATProto host surface and should not be used as
the canonical wtfOS app host for this route.

Local integration checks run on 2026-06-29:

```bash
./node_modules/.bin/tsx --test \
  server/features/apphost/proxy.test.ts \
  client/src/pages/applications-policy.test.ts \
  client/src/pages/applications-presentation-policy.test.ts

npx playwright test tests/playwright/inventory/routes.spec.mjs -g '/applications'
npx playwright test tests/playwright/inventory/gamma-wtfos.spec.mjs -g 'Applications'
```

Results:

- Apphost proxy and Applications policy tests: 19 passing.
- `/applications` inventory route smoke: passing.
- Gamma Applications presentation smoke: passing.
- `npm run build`: passing locally.
- `npm run check`: blocked by pre-existing `DesktopSettings.tsx` localization
  key type errors unrelated to apphost.
- In-app Browser plugin validation was attempted, but the plugin blocked local
  harness URLs with `net::ERR_BLOCKED_BY_CLIENT`; Playwright provided the
  rendered route verification fallback.

Production deployment checks run on 2026-06-29:

- `apphost/scripts/deploy-hetzner-apphost.sh --apply`: passed.
- Remote `bash scripts/server-deploy.sh`: passed, recreated only the existing
  app and Caddy containers after normal skipped-migration checks.
- `wtf-app-app-1`: healthy after deployment.
- `wtf-app-caddy-1`: running after deployment.
- `wtf-app-postgres-1`: remained healthy.
- Container-side Node request through `/run/wtf/apphost/wtfos-apphost.env`
  returned `200`, two apps, and `activeSession: null`.
- Deployed apphost daemon tests passed:

```bash
sudo bash -lc 'cd /opt/wtfos/apphost && python3 -W error::ResourceWarning -m unittest tests/test_apphostd.py'
```
