# wtfOS Application Host Troubleshooting

## Service Status

```bash
systemctl status wtfos-apphost.service
systemctl status wtfos-apphost-xvfb.service
systemctl status wtfos-apphost-pulse.service
systemctl status wtfos-apphost-wm.service
systemctl status wtfos-apphost-vnc.service
journalctl -u wtfos-apphost.service -n 200 --no-pager
```

## API Probe

```bash
curl -fsS http://127.0.0.1:8765/health
curl -fsS http://127.0.0.1:8765/apps
curl -fsS http://127.0.0.1:8765/apps/jackbox-party-pack-10/status
curl -fsS http://127.0.0.1:8765/apps/jackbox-party-pack-10/session
```

## Display Checks

```bash
sudo -u wtfos-apphost env DISPLAY=:99 xdpyinfo
sudo -u wtfos-apphost env DISPLAY=:99 glxinfo -B
sudo -u wtfos-apphost env DISPLAY=:99 LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe MESA_LOADER_DRIVER_OVERRIDE=llvmpipe glxinfo -B
```

If the first OpenGL check fails but the llvmpipe check passes, the launcher will
use Mesa software rendering automatically.

## Audio Checks

```bash
sudo -u wtfos-apphost env \
  XDG_RUNTIME_DIR=/opt/wtfos/apphost/run/user \
  PULSE_SERVER=unix:/opt/wtfos/apphost/run/pulse/native \
  pactl info
```

Restart the audio service if the socket is missing:

```bash
sudo systemctl restart wtfos-apphost-pulse.service
```

## Game Runs But Has No Audio

The Steam client keeps the environment it was first started with for its whole
lifetime, and `steam -applaunch` against an already-running client only sends
an IPC message. If Steam was ever started manually without `PULSE_SERVER`
(for example during operator login/diagnostics), every game it launches will
have a dead audio path even though the apphost passes the right environment.

Confirm the symptom: the game process is running but PulseAudio has no clients:

```bash
sudo -u wtfos-apphost env \
  XDG_RUNTIME_DIR=/opt/wtfos/apphost/run/user \
  PULSE_SERVER=unix:/opt/wtfos/apphost/run/pulse/native \
  pactl list short sink-inputs
```

An empty list while a game is running means the audio path is dead.
`steam-launch.sh` now detects a running Steam without `PULSE_SERVER` in its
environment and restarts it before launching, so a stop + relaunch through the
apphost API self-heals this. To verify audio is actually flowing, record the
null-sink monitor and check the RMS level is non-zero:

```bash
sudo -u wtfos-apphost env \
  XDG_RUNTIME_DIR=/opt/wtfos/apphost/run/user \
  PULSE_SERVER=unix:/opt/wtfos/apphost/run/pulse/native \
  timeout 4 parec --device=auto_null.monitor --format=s16le --rate=48000 --channels=2 /tmp/audio.raw
```

## Screenshots

```bash
sudo -u wtfos-apphost env DISPLAY=:99 scrot /opt/wtfos/apphost/state/screenshot.png
curl -fsS http://127.0.0.1:8765/apps/jackbox-party-pack-10/snapshot | python3 -m json.tool | sed -n '1,20p'
```

## Browser Play Tab Does Not Show The App

1. Confirm the authenticated user is opening
   `/applications/{app-id}/play`, not only `/applications`.
2. Confirm the session descriptor is available:

   ```bash
   curl -fsS http://127.0.0.1:8765/apps/jackbox-party-pack-10/session | python3 -m json.tool
   ```

3. Confirm snapshots work from the virtual desktop:

   ```bash
   curl -fsS http://127.0.0.1:8765/apps/jackbox-party-pack-10/snapshot >/tmp/apphost-snapshot.json
   ```

4. If the snapshot endpoint fails, run the Display Checks above and inspect
   `journalctl -u wtfos-apphost.service -n 200 --no-pager`.
5. If the snapshot works but the browser page is blank, check the wtfOS app logs
   for `/api/apphost/apps/{id}/snapshot` and `/ws/apphost` errors.

## WebRTC Stream Does Not Connect

The play tab uses WebRTC first and keeps snapshots as a fallback. If the page
shows periodic snapshots but not live video/audio, confirm the streamer
dependencies and stream endpoint:

```bash
python3 - <<'PY'
import gi
gi.require_version("Gst", "1.0")
gi.require_version("GstWebRTC", "1.0")
print("gstreamer webrtc bindings ok")
PY
gst-inspect-1.0 ximagesrc webrtcbin pulsesrc opusenc vp8enc
curl -fsS http://127.0.0.1:8765/apps/jackbox-party-pack-10/stream/status | python3 -m json.tool
```

Streamer logs are written under:

```text
/opt/wtfos/apphost/state/streams/{app-id}/{stream-id}/stdout.log
/opt/wtfos/apphost/state/streams/{app-id}/{stream-id}/stderr.log
```

If `stream/offer` returns `503`, rerun the apphost installer so
`gir1.2-gst-plugins-bad-1.0`, `gstreamer1.0-nice`, `gstreamer1.0-x`,
`python3-gi`, and the other GStreamer packages are installed. If it returns
`504`, inspect the stream logs and `journalctl -u wtfos-apphost.service -n 200
--no-pager`. If WebRTC still cannot connect from the browser, snapshots should
continue to render, which isolates the problem to ICE/network negotiation rather
than app launch, X display, or input injection.

## Browser Input Does Not Affect The App

Check that the app is running, then send a test pointer event:

```bash
curl -fsS -X POST http://127.0.0.1:8765/apps/jackbox-party-pack-10/input \
  -H 'Content-Type: application/json' \
  --data '{"type":"pointer","action":"click","x":0.5,"y":0.5,"button":1}'
```

Install or confirm the low-latency XTEST path:

```bash
python3 - <<'PY'
import Xlib
print("python3-xlib ok")
PY
```

If `python3-xlib` is unavailable, the daemon falls back to `xdotool`. That is
acceptable for low-frequency menu interaction, but `python3-xlib` should be
installed for creative apps with drag-heavy workflows.

## Interactive Virtual Desktop

The optional VNC bridge is for operator-only credential/session repair and
emergency desktop inspection. It binds to `127.0.0.1:5901` on the Hetzner host
only.

```bash
sudo systemctl status wtfos-apphost-vnc.service
ssh -N -L 127.0.0.1:5902:127.0.0.1:5901 wtf
```

Open `vnc://127.0.0.1:5902` locally. The VNC bridge is passwordless by design
because it listens only on remote loopback and should be reached through the SSH
tunnel.

If the local VNC client connects but never finishes loading, use a browser
noVNC bridge on the local machine instead. Keep the same SSH tunnel to
`127.0.0.1:5902`, then bridge noVNC to that local port and open:

```text
http://127.0.0.1:6080/vnc.html?host=127.0.0.1&port=6080&path=websockify&autoconnect=1&resize=scale&reconnect=0&shared=1
```

The browser bridge must stay bound to local loopback. Do not expose either VNC
or noVNC on a public interface.

## App Validation

```bash
sudo /opt/wtfos/apphost/scripts/validate-apps.sh
```

Diagnostics are written under `/opt/wtfos/apphost/state/diagnostics`. The script
continues across all manifests, captures OpenGL, Mesa fallback, audio, status,
and screenshot artifacts for each application, and writes a `failures.txt`
summary before exiting non-zero when any required check fails.

To validate from a local checkout after the host is installed, the private
hosted-app credential env/session is configured, and the games are installed:

```bash
apphost/scripts/deploy-hetzner-apphost.sh --validate
```

## Provider Session Handoff Modal

The current Jackbox provider may block launch with a modal like:

```text
You are logged in on another computer already playing American Truck Simulator.
Launching The Jackbox Party Pack 10 here will disconnect the other session from Steam.
```

This is an account/session decision, not an apphost graphics failure. End users
should see only generic host-maintenance progress while an operator resolves it.
Do not click `Continue` unless disconnecting the other provider session is
acceptable.

Jackbox manifests use a 360 second startup timeout for the provider launcher
path. If the provider finishes launching after that window, the next status call records
`startupRecoveredAfterTimeout: true` once the game process becomes healthy.

When handoff is approved:

1. Open the virtual desktop through the loopback VNC/noVNC path.
2. Click `Continue` in the provider modal.
3. Rerun `sudo /opt/wtfos/apphost/scripts/validate-apps.sh`.
4. Confirm `failures.txt` is absent or empty, each app status reports
   `state: running` during validation, and each app directory has
   `glxinfo.txt`, `pulse-info.txt`, `screenshot.png`, `status.json`, and
   `stop.json`.
5. Confirm `GET /api/apphost/apps/{id}/status` in wtfOS transitions through
   running/stopped as launch and stop actions are used.

## Game Does Not Launch

1. Confirm a remembered provider session exists for the `wtfos-apphost` user.
   Normal launches do not pass stored provider passwords.
2. Confirm the game is owned and installed for that account.
3. Confirm the provider account is not already playing another game on a
   different computer; the provider may require approving a session handoff
   before it launches Jackbox.
4. If the remembered session is missing or stale, populate the private
   `/opt/wtfos/apphost/config/hosted-apps.env` file with mode `0600` or `0400`,
   then run `sudo /opt/wtfos/apphost/scripts/steam-login-once.sh` to refresh the
   provider session as an operator. Remove any one-time guard code afterward.
5. Check `/opt/wtfos/apphost/state/logs/{app}.stderr.log`.
6. Run `validate-apps.sh` and inspect the captured OpenGL, audio, and screenshot
   artifacts.

## wtfOS Says Another User Is Already In An App

This is the expected single-active-app guard. The apphost allows only one
external desktop app to be running or launching across wtfOS at a time. Check:

```bash
curl -fsS http://127.0.0.1:8765/apps
```

If `activeSession` is present, either join that user's running app or have the
owner stop it from wtfOS. Operators can stop a stuck session directly:

```bash
curl -fsS -X POST http://127.0.0.1:8765/apps/jackbox-party-pack-10/stop
```

If `activeSession.state` stays `launching` after a failed manual interruption,
inspect `/opt/wtfos/apphost/state/{app-id}.json` and
`/opt/wtfos/apphost/state/logs/{app-id}.stderr.log` before stopping or clearing
state.

## wtfOS Shows Host Unavailable

1. Confirm `wtfos-apphost.service` is running.
2. If the wtfOS server is running on the host directly, confirm
   `WTFOS_APPHOST_URL` is unset or set to `http://127.0.0.1:8765`.
3. If the wtfOS server is running in Docker, confirm
   `/run/wtf/apphost/apphost.sock` exists in the container. The proxy
   auto-prefers that existing wtfOS IPC mount. Confirm the non-secret client env
   file exists at `/run/wtf/apphost/wtfos-apphost.env`. If a custom socket is
   used, `WTFOS_APPHOST_SOCKET_PATH` must point at an absolute path visible
   inside the container. Container `127.0.0.1` is not the Hetzner host.
4. Check the socket as the app process user, not root:

   ```bash
   sudo docker exec -u node wtf-app-app-1 sh -lc 'ls -ln /run/wtf/apphost && node -e "require(\"node:http\").request({ socketPath: \"/run/wtf/apphost/apphost.sock\", path: \"/apps\" }, r => { console.log(r.statusCode); r.pipe(process.stdout); }).end()"'
   ```

   The shared socket should be `0660` and grouped as gid `1000` so the container
   `node` user can connect. The client env file should be `0640` and grouped the
   same way.
5. The proxy intentionally rejects non-loopback HTTP upstreams.
