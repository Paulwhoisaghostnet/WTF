# wtfOS Application Host API

The application host listens on host loopback and on an apphost-owned Unix
socket:

```text
http://127.0.0.1:8765
/opt/wtfos/apphost/run/apphost.sock
/run/wtf/apphost/apphost.sock
```

wtfOS proxies authenticated browser requests through `/api/apphost/*`. The raw
daemon endpoints stay private to the host. A containerized wtfOS server
auto-prefers `/run/wtf/apphost/apphost.sock` when that existing wtfOS IPC mount
is visible. `WTFOS_APPHOST_SOCKET_PATH` can override the socket path, and
host-local validation can continue to use `http://127.0.0.1:8765`.

The shared client environment contract is written to:

```text
/run/wtf/apphost/wtfos-apphost.env
```

This file is non-secret. It contains the apphost socket path, client timeout,
and allowed client actions only. Steam credentials are not stored in env files.

## `GET /apps`

Returns all manifest-defined applications and the currently active remote app,
if one exists. wtfOS uses `activeSession` to enforce the one-external-app rule
across all users.

```json
{
  "apps": [
    {
      "id": "jackbox-party-pack-10",
      "name": "Jackbox Party Pack 10",
      "category": "Party game",
      "summary": "Five remote-hosted party games for room-code play.",
      "coverImageUrl": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2216830/header.jpg?t=1728584851",
      "coverImageAlt": "Jackbox Party Pack 10 cover art",
      "displayRequired": true,
      "audioRequired": true,
      "startupTimeout": 360,
      "healthCheck": {
        "type": "process_name",
        "pattern": "TJPP10_(OpenGL|Vulkan)",
        "user": "wtfos-apphost",
        "timeout": 5
      }
    }
  ],
  "activeSession": null
}
```

## `GET /apps/{id}`

Returns one public manifest view.

## `POST /apps/{id}/launch`

Launches the application inside the virtual desktop. wtfOS may include the
authenticated user as a sanitized actor so the apphost can report who owns the
single active external app slot:

```json
{
  "actor": {
    "userId": "123",
    "username": "example",
    "displayName": "Example Name"
  }
}
```

The daemon runs display, OpenGL, and audio probes before launch. If OpenGL
fails, it retries with Mesa software rendering:

```json
{
  "ok": true,
  "app": { "id": "jackbox-party-pack-10", "name": "Jackbox Party Pack 10" },
  "status": {
    "appId": "jackbox-party-pack-10",
    "state": "running",
    "pid": null,
    "health": { "ok": true, "type": "process_name", "pids": [12345] },
    "owner": {
      "userId": "123",
      "username": "example",
      "displayName": "Example Name",
      "label": "Example Name"
    },
    "progress": {
      "phase": "ready",
      "label": "Ready",
      "detail": "The application is open.",
      "percent": 100
    },
    "diagnostics": {
      "mesaSoftwareFallback": true,
      "startupConfirmed": true,
      "startupTimedOut": false,
      "startupAttempts": [
        {
          "label": "initial",
          "confirmed": true,
          "timeoutSeconds": 360,
          "healthCheckType": "process_name",
          "healthAtTimeout": { "ok": true, "type": "process_name", "pids": [12345] },
          "launcherPid": 1000,
          "launcherExitCode": 0
        }
      ],
      "probes": {
        "display": { "ok": true, "output": "...", "error": "" },
        "opengl": { "ok": false, "output": "", "error": "..." },
        "openglMesa": { "ok": true, "output": "...", "error": "" },
        "audio": { "ok": true, "output": "...", "error": "" }
      }
    }
  },
  "activeSession": {
    "appId": "jackbox-party-pack-10",
    "appName": "Jackbox Party Pack 10",
    "state": "running",
    "owner": {
      "userId": "123",
      "username": "example",
      "displayName": "Example Name",
      "label": "Example Name"
    },
    "progress": {
      "phase": "ready",
      "label": "Ready",
      "detail": "The application is open.",
      "percent": 100
    }
  }
}
```

Only one external app may be active across wtfOS. If a user tries to launch a
different app while another session is running or launching, the daemon returns
HTTP `409`:

```json
{
  "ok": false,
  "error": "Sorry, try joining user \"Example Name\" in \"Jackbox Party Pack 10\".",
  "conflict": {
    "requestedAppId": "jackbox-party-pack-11",
    "requestedAppName": "Jackbox Party Pack 11",
    "appId": "jackbox-party-pack-10",
    "appName": "Jackbox Party Pack 10",
    "state": "running",
    "owner": {
      "userId": "123",
      "username": "example",
      "displayName": "Example Name",
      "label": "Example Name"
    }
  }
}
```

`progress` is the user-facing launch state. It intentionally avoids naming the
underlying delivery/runtime provider. wtfOS should render `progress.label`,
`progress.detail`, and `progress.percent` while keeping `diagnostics` private to
support and validation workflows.

If the launcher starts but the manifest health check does not become healthy
before `startup_timeout`, the response remains structured. `diagnostics` will
include `startupTimedOut: true`, `startupFailure`, `lastStartupAttempt`, and
best-effort desktop evidence paths:

```json
{
  "startupConfirmed": false,
  "startupTimedOut": true,
  "startupFailure": "health check did not become healthy before startup timeout",
  "lastStartupAttempt": {
    "label": "initial",
    "confirmed": false,
    "healthCheckType": "process_name",
    "healthAtTimeout": { "ok": false, "type": "process_name", "pids": [] },
    "launcherExitCode": 0,
    "desktopEvidence": {
      "screenshot": {
        "ok": true,
        "path": "/opt/wtfos/apphost/state/diagnostics/api-launch/jackbox-party-pack-10-20260629T212152Z-123.png"
      },
      "windowTree": {
        "ok": true,
        "path": "/opt/wtfos/apphost/state/diagnostics/api-launch/jackbox-party-pack-10-20260629T212152Z-123.xwininfo.txt"
      }
    }
  }
}
```

## `POST /apps/{id}/stop`

Stops the application process group and records the stop timestamp. Steam
manifests use a `process_name` health check, so stop also terminates matching
game processes that Steam started after the short-lived launcher command.

## `GET /apps/{id}/status`

Returns the current process, health, private diagnostics, and sanitized
`progress` object. During a long startup, `state` is `launching` and `progress`
advances while the apphost waits for the application window/process health.

## `GET /apps/{id}/session`

Returns the generic remote-application session contract used by the wtfOS
`/applications/{id}/play` route. The contract is not game-specific; creative
desktop tools use the same display, stream, input, and storage fields.

```json
{
  "ok": true,
  "app": { "id": "jackbox-party-pack-10", "name": "Jackbox Party Pack 10" },
  "status": { "appId": "jackbox-party-pack-10", "state": "running" },
  "session": {
    "appId": "jackbox-party-pack-10",
    "appName": "Jackbox Party Pack 10",
    "display": {
      "width": 1280,
      "height": 720,
      "displayName": ":99",
      "required": true
    },
    "audio": {
      "required": true,
      "pulseServer": "unix:/opt/wtfos/apphost/run/pulse/native"
    },
    "stream": {
      "preferredTransport": "webrtc",
      "fallbackTransports": ["snapshot"],
      "signalingRoom": "apphost:jackbox-party-pack-10",
      "webSocketPath": "/ws/apphost",
      "offerPath": "/api/apphost/apps/jackbox-party-pack-10/stream/offer",
      "statusPath": "/api/apphost/apps/jackbox-party-pack-10/stream/status",
      "stopPath": "/api/apphost/apps/jackbox-party-pack-10/stream/stop",
      "snapshotPath": "/api/apphost/apps/jackbox-party-pack-10/snapshot",
      "iceServers": []
    },
    "input": {
      "pointer": true,
      "keyboard": true,
      "clipboard": false,
      "transport": "websocket",
      "coordinateSpace": { "width": 1280, "height": 720 }
    },
    "storage": {
      "workspaceRequired": false,
      "exportPaths": []
    }
  }
}
```

## `POST /apps/{id}/stream/offer`

Starts or replaces a managed WebRTC streamer process for the running app and
returns the host SDP answer. wtfOS calls this from the play tab after creating a
browser `RTCPeerConnection` offer. The streamer captures the virtual X display
with GStreamer, sends VP8 video, and sends OPUS audio when the manifest requires
audio and the private PulseAudio socket is available.

Request:

```json
{
  "streamId": "stream-8b4f3a1f0d7c4e28a4bb3a",
  "offer": {
    "type": "offer",
    "sdp": "v=0\r\n..."
  }
}
```

Response:

```json
{
  "ok": true,
  "transport": "webrtc",
  "streamId": "stream-8b4f3a1f0d7c4e28a4bb3a",
  "answer": {
    "type": "answer",
    "sdp": "v=0\r\n..."
  },
  "candidates": [
    {
      "candidate": "candidate:...",
      "sdpMLineIndex": 0
    }
  ],
  "video": {
    "width": 1280,
    "height": 720,
    "codec": "VP8"
  },
  "audio": {
    "enabled": true,
    "codec": "OPUS"
  }
}
```

The endpoint returns `409` if the app is not running, `503` if the streamer
executable or dependencies are missing, and `504` if the streamer cannot produce
an answer before the apphost timeout. wtfOS keeps the snapshot transport active
until WebRTC connects and falls back to snapshots if negotiation fails.

## `GET /apps/{id}/stream/status`

Returns active WebRTC streamer processes for the app:

```json
{
  "ok": true,
  "app": { "id": "jackbox-party-pack-10", "name": "Jackbox Party Pack 10" },
  "streams": [
    {
      "streamId": "stream-8b4f3a1f0d7c4e28a4bb3a",
      "pid": 12345,
      "active": true
    }
  ]
}
```

## `POST /apps/{id}/stream/stop`

Stops a single stream when `streamId` is provided, or all streams for the app
when it is omitted. `POST /apps/{id}/stop` also stops all app streams.

```json
{
  "streamId": "stream-8b4f3a1f0d7c4e28a4bb3a"
}
```

## `GET /apps/{id}/snapshot`

Captures the virtual desktop and returns a browser-safe image data URL. This is
the immediate display fallback for the play route while WebRTC is being
negotiated or when the browser/apphost cannot establish a peer connection.

```json
{
  "ok": true,
  "appId": "jackbox-party-pack-10",
  "contentType": "image/jpeg",
  "capturedAt": "2026-06-30T15:00:00Z",
  "dataUrl": "data:image/jpeg;base64,..."
}
```

## `POST /apps/{id}/input`

Injects normalized browser input into the virtual X display for a running app.
The daemon prefers persistent XTEST input through `python3-xlib` and falls back
to `xdotool` if the Python X bindings are unavailable.

Pointer events use normalized `x`/`y` coordinates from `0` to `1`, or absolute
desktop pixels:

```json
{
  "type": "pointer",
  "action": "click",
  "x": 0.5,
  "y": 0.5,
  "button": 1
}
```

Keyboard events use browser key names:

```json
{
  "type": "keyboard",
  "action": "press",
  "key": "Enter",
  "code": "Enter"
}
```

If the app is not running, the endpoint returns HTTP `409` with the current
status object instead of silently discarding input.

## Manifest Shape

Applications are data, not code:

```json
{
  "id": "jackbox-party-pack-11",
  "name": "Jackbox Party Pack 11",
  "category": "Party game",
  "summary": "The latest remote-hosted Jackbox pack for shared-room play.",
  "cover_image_url": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3364070/35c35317cc3f6ac5733896ab00c4cfbd5a1a025d/header.jpg?t=1774630140",
  "cover_image_alt": "Jackbox Party Pack 11 cover art",
  "executable": "/opt/wtfos/apphost/bin/steam-launch.sh",
  "working_directory": "/opt/wtfos/apphost/home",
  "environment": {
    "HOME": "/opt/wtfos/apphost/home",
    "XDG_RUNTIME_DIR": "/opt/wtfos/apphost/run/user",
    "STEAM_APP_ID": "3364070",
    "STEAM_RUNTIME": "1"
  },
  "startup_timeout": 360,
  "health_check": {
    "type": "process_name",
    "pattern": "TJPP11_(OpenGL|Vulkan)",
    "user": "wtfos-apphost",
    "timeout": 5
  },
  "display_required": true,
  "audio_required": true
}
```
