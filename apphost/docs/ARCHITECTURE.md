# wtfOS Remote Application Host Architecture

## Goal

Run Linux desktop applications on the Hetzner server without relying on a local
MacBook, changing existing containers, or touching production databases.

## Isolation Model

Everything new lives under:

```text
/opt/wtfos/apphost
```

The only durable files outside that tree are removable systemd unit files:

```text
/etc/systemd/system/wtfos-apphost.service
/etc/systemd/system/wtfos-apphost-xvfb.service
/etc/systemd/system/wtfos-apphost-pulse.service
/etc/systemd/system/wtfos-apphost-wm.service
/etc/systemd/system/wtfos-apphost-vnc.service   # optional, loopback only
```

No existing containers, compose files, databases, or wtfOS data directories are
altered by the apphost installer. At runtime, `wtfos-apphost.service` also owns
`/run/wtf/apphost/apphost.sock`, a removable IPC bridge inside the existing
`/run/wtf` mount that the production app container already uses for native host
services.

## Runtime Pieces

```text
wtfOS browser
  /applications route
  /applications/{id}/play route
  authenticated /api/apphost/* proxy
  authenticated /ws/apphost session room

Node wtfOS server
  validates session/CSRF
  forwards to the apphost Unix socket when containerized
  relays apphost room presence, WebRTC control messages, and input events
  may use http://127.0.0.1:8765 for host-local validation

Application host
  Python stdlib daemon
  exposes /opt/wtfos/apphost/run/apphost.sock, /run/wtf/apphost/apphost.sock,
  and host loopback
  reads /opt/wtfos/apphost/manifests/*.json
  launches process groups as wtfos-apphost
  starts per-browser GStreamer WebRTC streamer processes on demand

Virtual desktop
  Xvfb :99
  Mesa llvmpipe fallback
  PulseAudio unix socket
  Openbox window manager
```

## Services

- `wtfos-apphost-xvfb.service`: creates the virtual X display.
- `wtfos-apphost-pulse.service`: creates the private audio socket.
- `wtfos-apphost-wm.service`: runs Openbox in the virtual display.
- `wtfos-apphost.service`: exposes the launcher API on host loopback and
  private Unix sockets under `/opt/wtfos/apphost/run` and `/run/wtf/apphost`.
- `wtfos-apphost-vnc.service`: optional loopback-only VNC bridge for
  operator-only provider/session repair or emergency desktop access.

Each service runs as the dedicated `wtfos-apphost` system user with
`HOME=/opt/wtfos/apphost/home`.

## wtfOS Transport

The apphost daemon keeps `http://127.0.0.1:8765` for host-local diagnostics and
scripts. The production wtfOS app runs inside Docker, where `127.0.0.1` is the
container namespace, not the Hetzner host. Because the production app container
already mounts `/run/wtf`, the apphost also exposes:

```text
/run/wtf/apphost/apphost.sock
```

The wtfOS proxy auto-prefers that shared runtime socket when it exists. Set
`WTFOS_APPHOST_SOCKET_PATH=/path/visible/in/container/apphost.sock` only when a
deployment needs a different absolute socket path. The proxy rejects
non-loopback HTTP upstreams and accepts only absolute Unix socket paths. Do not
expose the apphost API on a public interface.

The apphost also publishes a non-secret client env file at:

```text
/run/wtf/apphost/wtfos-apphost.env
```

It is copied from `/opt/wtfos/apphost/config/wtfos-apphost.env` on service
start. wtfOS may read this file to discover the socket path and client timeout.
It must not contain provider passwords or user credentials. Provider credential
material, when configured by an operator, is kept in
`/opt/wtfos/apphost/config/hosted-apps.env` with mode `0600` for
`wtfos-apphost`. Provider session state remains private to
`/opt/wtfos/apphost/home`, and users never receive provider controls.

## User Experience Boundary

Applications are launched by manifest id through wtfOS. The user-facing surface
shows manifest-generated title cards, cover images, the selected application, a
sanitized launch progress bar, and Open/Stop/Status controls. Open creates a
dedicated wtfOS app window at `/applications/{id}/play`; that window attaches to
an already running remote app or launches the selected manifest if nothing is
running. Provider runtime prompts, process IDs, health checks, and raw
diagnostics are implementation details kept out of the normal application UI.

The apphost enforces a single active external app across all of wtfOS. A launch
request records the authenticated wtfOS user as the session owner when provided.
If another user tries to launch a different external app while one is already
running or launching, the daemon returns HTTP `409` with sanitized owner/app
metadata. The wtfOS UI renders that as a join-the-current-session message
instead of exposing the launcher implementation.

## Remote App Session Model

The play route is generic. Jackbox is only a manifest; future creative tools use
the same contract:

```text
browser play tab
  GET /api/apphost/apps/{id}/session
  POST /api/apphost/apps/{id}/launch when needed
  POST /api/apphost/apps/{id}/stream/offer for WebRTC media
  POST /api/apphost/apps/{id}/stream/stop when the tab closes
  GET /api/apphost/apps/{id}/snapshot while WebRTC negotiates or fails
  /ws/apphost for room presence, signaling, and input forwarding

apphost daemon
  exposes display/audio/input/storage capabilities from the manifest runtime
  answers WebRTC offers with a managed GStreamer ximagesrc/pulsesrc streamer
  captures the X display for browser snapshots
  injects pointer/keyboard input into DISPLAY=:99
```

`/ws/apphost` is the control plane. It is authenticated through the existing
wtfOS session cookie and supports app-specific join/leave, signaling relay, and
input forwarding. The session descriptor advertises WebRTC as the preferred
transport and snapshot streaming as the fallback. The play tab creates a
browser `RTCPeerConnection`, sends its SDP offer through the authenticated
apphost proxy, receives the apphost SDP answer and ICE candidates, and then
renders the remote video/audio stream in the same input surface. The streamer
process remains owned by `wtfos-apphost` and is stopped when the tab closes or
the app stops.

Pointer and keyboard input are first-class session data, not a Jackbox-only
special case. Input events are normalized by the browser against the configured
virtual desktop size and injected on the host through XTEST when `python3-xlib`
is installed, with `xdotool` available as a compatibility fallback.

## Linux Support Verification

Checked on June 29, 2026:

- Jackbox Party Pack 10: Steam app id `2216830`; the Steam store page has a
  `SteamOS + Linux` system requirements tab, and the Steam appdetails API
  reports `"linux": true`.
- Jackbox Party Pack 11: Steam app id `3364070`; the Steam store page has a
  `SteamOS + Linux` system requirements tab, and the Steam appdetails API
  reports `"linux": true`.

Source URLs:

- `https://store.steampowered.com/app/2216830/The_Jackbox_Party_Pack_10/`
- `https://store.steampowered.com/api/appdetails?appids=2216830&filters=platforms,basic`
- `https://store.steampowered.com/app/3364070/The_Jackbox_Party_Pack_11/`
- `https://store.steampowered.com/api/appdetails?appids=3364070&filters=platforms,basic`

## Authentication

Provider authentication is not bypassed. Normal user launches require a
remembered provider session for the isolated apphost account; they do not pass
stored passwords to the provider. Operators can refresh that remembered session
from the private hosted-application env file:

```text
/opt/wtfos/apphost/config/hosted-apps.env
```

For the current Jackbox provider, populate:

```bash
WTFOS_APPHOST_STEAM_ADMIN_LOGIN=1
WTFOS_APPHOST_STEAM_USERNAME=...
WTFOS_APPHOST_STEAM_PASSWORD=...
# Optional, temporary, only while satisfying a one-time guard challenge:
# WTFOS_APPHOST_STEAM_GUARD_CODE=...
```

The file is created by the installer/update scripts if missing and is never
overwritten. It is local to the Hetzner host, gitignored in the repository, and
must stay mode `0600` or `0400`. After the env is populated, refresh the
provider session as an operator:

```bash
sudo /opt/wtfos/apphost/scripts/steam-login-once.sh
```

Install prompts for owned apps still require the authenticated provider account.
If a provider requires a one-time guard code, add it temporarily, run the login
refresh, then remove that guard value from the env.

For manual login without exposing a public desktop port, install the optional
loopback VNC bridge:

```bash
sudo /opt/wtfos/apphost/scripts/install-apphost.sh --with-vnc
```

From a local checkout, the deploy wrapper can install the same bridge:

```bash
apphost/scripts/deploy-hetzner-apphost.sh --install --with-vnc
```

Then open an SSH tunnel from the local machine:

```bash
ssh -N -L 127.0.0.1:5902:127.0.0.1:5901 wtf
```

Connect a local VNC client to `vnc://127.0.0.1:5902`. The VNC service listens
only on remote loopback, and the local tunnel listens on local loopback, so SSH
is the authentication boundary. The VNC bridge itself does not prompt for a
separate password.

If a native VNC client hangs after connecting, a local noVNC bridge can be used
as operator tooling. It should bind only to `127.0.0.1` and forward to the
existing local SSH tunnel; it is not a production apphost component and must not
be exposed publicly.

## Remote Deployment Flow

From the repository root, upload the isolated apphost bundle without changing
the remote host:

```bash
apphost/scripts/deploy-hetzner-apphost.sh
```

Install the services after reviewing the upload:

```bash
apphost/scripts/deploy-hetzner-apphost.sh --install
```

The deploy wrapper uses `scripts/wtf-ssh.sh`, stages only the `apphost/` bundle
under `/tmp/wtfos-apphost-deploy`, and then runs the installer from that staged
copy. It does not touch existing containers, compose files, databases, or wtfOS
service units. The installer creates only the `wtfos-apphost-*` systemd units
listed above.

After install, populate the private hosted-application env, refresh the provider
session, and install the hosted apps:

```bash
sudo /opt/wtfos/apphost/scripts/steam-login-once.sh
sudo /opt/wtfos/apphost/scripts/install-steam-apps.sh
```

Then validate:

```bash
sudo /opt/wtfos/apphost/scripts/validate-apps.sh
```

`--validate` can also be passed to the deploy wrapper after the provider session
and game installation are already complete:

```bash
apphost/scripts/deploy-hetzner-apphost.sh --validate
```

## Removal

```bash
sudo /opt/wtfos/apphost/scripts/uninstall-apphost.sh
```

This stops and removes only the `wtfos-apphost-*` services. Set
`WTFOS_APPHOST_PURGE=1` to also remove `/opt/wtfos/apphost` and the dedicated
system user.
