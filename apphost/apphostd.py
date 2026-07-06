#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import signal
import socketserver
import subprocess
import threading
import time
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse


APP_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,80}$")
STREAM_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._:-]{1,120}$")
DEFAULT_ROOT = Path("/opt/wtfos/apphost")
MESA_SOFTWARE_ENV = {
    "LIBGL_ALWAYS_SOFTWARE": "1",
    "GALLIUM_DRIVER": "llvmpipe",
    "MESA_LOADER_DRIVER_OVERRIDE": "llvmpipe",
}


@dataclass(frozen=True)
class ProbeResult:
    ok: bool
    output: str = ""
    error: str = ""


@dataclass(frozen=True)
class AppHostConfig:
    manifest_dir: Path = DEFAULT_ROOT / "manifests"
    state_dir: Path = DEFAULT_ROOT / "state"
    display: str = ":99"
    pulse_server: str = "unix:/opt/wtfos/apphost/run/pulse/native"
    webrtc_streamer: Path = DEFAULT_ROOT / "bin" / "webrtc-streamer.py"


Probe = Callable[[str, dict[str, str]], ProbeResult]


def json_safe_error(exc: BaseException) -> str:
    return exc.args[0] if exc.args else exc.__class__.__name__


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def progress_payload(phase: str, label: str, percent: int | float, detail: str = "") -> dict[str, Any]:
    return {
        "phase": phase,
        "label": label,
        "detail": detail,
        "percent": max(0, min(100, int(percent))),
    }


def sanitized_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def sanitize_actor(actor: Any) -> dict[str, Any] | None:
    if not isinstance(actor, dict):
        return None
    user_id = actor.get("userId")
    user_id_text = str(user_id).strip() if user_id is not None else None
    username = sanitized_optional_string(actor.get("username"))
    display_name = sanitized_optional_string(actor.get("displayName"))
    label = display_name or username or (f"user {user_id_text}" if user_id_text else None)
    if not label:
        return None
    return {
        "userId": user_id_text,
        "username": username,
        "displayName": display_name,
        "label": label,
    }


def run_command_probe(kind: str, env: dict[str, str]) -> ProbeResult:
    commands = {
        "display": ["xdpyinfo", "-display", env.get("DISPLAY", ":99")],
        "opengl": ["glxinfo", "-B"],
        "audio": ["pactl", "info"],
    }
    command = commands.get(kind)
    if command is None:
        return ProbeResult(ok=False, error=f"unknown probe: {kind}")
    try:
        completed = subprocess.run(
            command,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=8,
            check=False,
        )
        return ProbeResult(
            ok=completed.returncode == 0,
            output=completed.stdout[-4000:],
            error=completed.stderr[-4000:],
        )
    except FileNotFoundError as exc:
        return ProbeResult(ok=False, error=f"{command[0]} not installed: {exc}")
    except subprocess.TimeoutExpired as exc:
        return ProbeResult(ok=False, output=exc.stdout or "", error=f"{kind} probe timed out")


def probe_to_json(result: ProbeResult) -> dict[str, Any]:
    return {"ok": result.ok, "output": result.output, "error": result.error}


def apply_mesa_software_env(env: dict[str, str]) -> dict[str, str]:
    updated = dict(env)
    updated.update(MESA_SOFTWARE_ENV)
    return updated


def prepare_launch_environment(
    manifest: dict[str, Any],
    base_env: dict[str, str],
    probe: Probe = run_command_probe,
) -> tuple[dict[str, str], dict[str, Any]]:
    env = dict(os.environ)
    env.update(base_env)
    env.update({str(k): str(v) for k, v in dict(manifest.get("environment") or {}).items()})
    diagnostics: dict[str, Any] = {
        "mesaSoftwareFallback": False,
        "probes": {},
    }

    if manifest.get("display_required"):
        display = probe("display", env)
        diagnostics["probes"]["display"] = probe_to_json(display)
        opengl = probe("opengl", env)
        diagnostics["probes"]["opengl"] = probe_to_json(opengl)
        if not opengl.ok:
            env = apply_mesa_software_env(env)
            diagnostics["mesaSoftwareFallback"] = True
            diagnostics["openglFailureBeforeMesa"] = probe_to_json(opengl)
            retry = probe("opengl", env)
            diagnostics["probes"]["openglMesa"] = probe_to_json(retry)

    if manifest.get("audio_required"):
        audio = probe("audio", env)
        diagnostics["probes"]["audio"] = probe_to_json(audio)

    return env, diagnostics


class ManifestError(ValueError):
    pass


class AppHostConflict(RuntimeError):
    def __init__(self, payload: dict[str, Any]):
        self.payload = payload
        super().__init__(str(payload.get("error", "Application host is busy")))


class AppHostInputError(RuntimeError):
    def __init__(self, status: HTTPStatus, payload: dict[str, Any]):
        self.status = status
        self.payload = payload
        super().__init__(str(payload.get("error", "Input rejected")))


class AppHostStreamError(RuntimeError):
    def __init__(self, status: HTTPStatus, payload: dict[str, Any]):
        self.status = status
        self.payload = payload
        super().__init__(str(payload.get("error", "Stream rejected")))


class X11InputInjector:
    def __init__(self, display_name: str):
        self.display_name = display_name
        self._display: Any | None = None
        self._xlib: dict[str, Any] | None = None
        self._lock = threading.Lock()

    def _connect(self) -> tuple[Any, dict[str, Any]]:
        if self._display is not None and self._xlib is not None:
            return self._display, self._xlib
        from Xlib import X, XK  # type: ignore[import-not-found]
        from Xlib.display import Display  # type: ignore[import-not-found]
        from Xlib.ext import xtest  # type: ignore[import-not-found]

        self._display = Display(self.display_name)
        self._xlib = {"X": X, "XK": XK, "xtest": xtest}
        return self._display, self._xlib

    def inject(self, event: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            display, xlib = self._connect()
            if event["type"] == "pointer":
                self._inject_pointer(display, xlib, event)
            elif event["type"] == "keyboard":
                self._inject_keyboard(display, xlib, event)
            else:
                raise ValueError(f"unsupported input event type: {event['type']}")
            display.sync()
        return {"ok": True, "method": "xtest"}

    def _inject_pointer(self, display: Any, xlib: dict[str, Any], event: dict[str, Any]) -> None:
        X = xlib["X"]
        xtest = xlib["xtest"]
        root = display.screen().root
        action = event.get("action")
        button = int(event.get("button") or 1)
        x = int(event["x"])
        y = int(event["y"])
        root.warp_pointer(x, y)
        display.sync()
        if action == "move":
            return
        if action == "down":
            xtest.fake_input(display, X.ButtonPress, button)
            return
        if action == "up":
            xtest.fake_input(display, X.ButtonRelease, button)
            return
        if action == "click":
            xtest.fake_input(display, X.ButtonPress, button)
            xtest.fake_input(display, X.ButtonRelease, button)
            return
        if action == "doubleClick":
            for _ in range(2):
                xtest.fake_input(display, X.ButtonPress, button)
                xtest.fake_input(display, X.ButtonRelease, button)
            return
        if action == "wheel":
            wheel_button = 4 if float(event.get("deltaY") or 0) < 0 else 5
            xtest.fake_input(display, X.ButtonPress, wheel_button)
            xtest.fake_input(display, X.ButtonRelease, wheel_button)
            return
        raise ValueError(f"unsupported pointer action: {action}")

    def _inject_keyboard(self, display: Any, xlib: dict[str, Any], event: dict[str, Any]) -> None:
        X = xlib["X"]
        XK = xlib["XK"]
        xtest = xlib["xtest"]
        action = event.get("action")
        key = str(event.get("key") or "")
        key_name = {
            " ": "space",
            "ArrowUp": "Up",
            "ArrowDown": "Down",
            "ArrowLeft": "Left",
            "ArrowRight": "Right",
            "Enter": "Return",
            "Escape": "Escape",
            "Backspace": "BackSpace",
            "Tab": "Tab",
            "Delete": "Delete",
        }.get(key, key)
        keysym = XK.string_to_keysym(key_name)
        if not keysym and len(key) == 1:
            keysym = ord(key)
        keycode = display.keysym_to_keycode(keysym)
        if not keycode:
            raise ValueError(f"unsupported key: {key}")
        if action == "down":
            xtest.fake_input(display, X.KeyPress, keycode)
        elif action == "up":
            xtest.fake_input(display, X.KeyRelease, keycode)
        elif action == "press":
            xtest.fake_input(display, X.KeyPress, keycode)
            xtest.fake_input(display, X.KeyRelease, keycode)
        else:
            raise ValueError(f"unsupported keyboard action: {action}")


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ManifestError(f"{path.name}: invalid JSON: {exc}") from exc

    required = {
        "id": str,
        "name": str,
        "executable": str,
        "working_directory": str,
        "environment": dict,
        "startup_timeout": (int, float),
        "health_check": dict,
        "display_required": bool,
        "audio_required": bool,
    }
    for field, expected in required.items():
        if field not in data:
            raise ManifestError(f"{path.name}: missing {field}")
        if not isinstance(data[field], expected):
            raise ManifestError(f"{path.name}: invalid {field}")

    app_id = data["id"].strip()
    if not APP_ID_RE.match(app_id):
        raise ManifestError(f"{path.name}: invalid id")
    if path.stem != app_id:
        raise ManifestError(f"{path.name}: filename must match manifest id")

    data["id"] = app_id
    data["name"] = data["name"].strip()
    data["startup_timeout"] = max(1.0, float(data["startup_timeout"]))
    data["arguments"] = [str(arg) for arg in data.get("arguments", [])]
    return data


def public_app(manifest: dict[str, Any]) -> dict[str, Any]:
    app = {
        "id": manifest["id"],
        "name": manifest["name"],
        "displayRequired": bool(manifest["display_required"]),
        "audioRequired": bool(manifest["audio_required"]),
        "startupTimeout": manifest["startup_timeout"],
        "healthCheck": manifest["health_check"],
    }
    for source, target in (
        ("cover_image_url", "coverImageUrl"),
        ("cover_image_alt", "coverImageAlt"),
        ("summary", "summary"),
        ("category", "category"),
    ):
        value = sanitized_optional_string(manifest.get(source))
        if value:
            app[target] = value
    return app


class ApplicationHost:
    def __init__(self, config: AppHostConfig, probe: Probe = run_command_probe):
        self.config = config
        self.probe = probe
        self._processes: dict[int, subprocess.Popen[Any]] = {}
        self._streams: dict[tuple[str, str], subprocess.Popen[Any]] = {}
        self._launch_lock = threading.RLock()
        self._health_cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self._health_cache_lock = threading.Lock()
        self._x11_input: X11InputInjector | None = None
        self.config.state_dir.mkdir(parents=True, exist_ok=True)
        (self.config.state_dir / "logs").mkdir(parents=True, exist_ok=True)
        (self.config.state_dir / "streams").mkdir(parents=True, exist_ok=True)

    def _manifest_map(self) -> dict[str, dict[str, Any]]:
        apps = {}
        for path in sorted(self.config.manifest_dir.glob("*.json")):
            manifest = load_manifest(path)
            apps[manifest["id"]] = manifest
        return apps

    def _require_manifest(self, app_id: str) -> dict[str, Any]:
        apps = self._manifest_map()
        if app_id not in apps:
            raise KeyError(app_id)
        return apps[app_id]

    def list_apps(self) -> list[dict[str, Any]]:
        return [public_app(manifest) for manifest in self._manifest_map().values()]

    def apps_payload(self) -> dict[str, Any]:
        return {"apps": self.list_apps(), "activeSession": self.active_session()}

    def get_app(self, app_id: str) -> dict[str, Any]:
        return public_app(self._require_manifest(app_id))

    def _runtime_config(self, manifest: dict[str, Any]) -> dict[str, Any]:
        runtime = manifest.get("runtime") if isinstance(manifest.get("runtime"), dict) else {}
        display = runtime.get("display") if isinstance(runtime.get("display"), dict) else {}
        input_cfg = runtime.get("input") if isinstance(runtime.get("input"), dict) else {}
        storage = runtime.get("storage") if isinstance(runtime.get("storage"), dict) else {}
        width = self._bounded_int(display.get("width"), default=1280, minimum=320, maximum=7680)
        height = self._bounded_int(display.get("height"), default=720, minimum=240, maximum=4320)
        export_paths = storage.get("export_paths")
        return {
            "display": {
                "width": width,
                "height": height,
                "displayName": self.config.display,
            },
            "input": {
                "pointer": bool(input_cfg.get("pointer", True)),
                "keyboard": bool(input_cfg.get("keyboard", True)),
                "clipboard": bool(input_cfg.get("clipboard", False)),
            },
            "storage": {
                "workspaceRequired": bool(storage.get("workspace_required", False)),
                "exportPaths": [str(path) for path in export_paths] if isinstance(export_paths, list) else [],
            },
        }

    def _bounded_int(self, value: Any, *, default: int, minimum: int, maximum: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default
        return max(minimum, min(maximum, parsed))

    def session_descriptor(self, app_id: str) -> dict[str, Any]:
        manifest = self._require_manifest(app_id)
        runtime = self._runtime_config(manifest)
        return {
            "ok": True,
            "app": public_app(manifest),
            "status": self.status(app_id),
            "session": {
                "appId": manifest["id"],
                "appName": manifest["name"],
                "display": {
                    **runtime["display"],
                    "required": bool(manifest.get("display_required")),
                },
                "audio": {
                    "required": bool(manifest.get("audio_required")),
                    "pulseServer": self.config.pulse_server,
                },
                "stream": {
                    "preferredTransport": "webrtc",
                    "fallbackTransports": ["snapshot"],
                    "signalingRoom": f"apphost:{manifest['id']}",
                    "webSocketPath": "/ws/apphost",
                    "offerPath": f"/api/apphost/apps/{manifest['id']}/stream/offer",
                    "statusPath": f"/api/apphost/apps/{manifest['id']}/stream/status",
                    "stopPath": f"/api/apphost/apps/{manifest['id']}/stream/stop",
                    "snapshotPath": f"/api/apphost/apps/{manifest['id']}/snapshot",
                    "iceServers": [],
                },
                "input": {
                    **runtime["input"],
                    "transport": "websocket",
                    "coordinateSpace": {
                        "width": runtime["display"]["width"],
                        "height": runtime["display"]["height"],
                    },
                },
                "storage": runtime["storage"],
            },
        }

    def _state_path(self, app_id: str) -> Path:
        return self.config.state_dir / f"{app_id}.json"

    def _read_state(self, app_id: str) -> dict[str, Any]:
        path = self._state_path(app_id)
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def _write_state(self, app_id: str, state: dict[str, Any]) -> None:
        state["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        tmp = self._state_path(app_id).with_suffix(".json.tmp")
        tmp.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
        tmp.replace(self._state_path(app_id))
        self._invalidate_health_cache(app_id)

    def _invalidate_health_cache(self, app_id: str) -> None:
        with self._health_cache_lock:
            self._health_cache.pop(app_id, None)

    def _cached_health(self, manifest: dict[str, Any], state: dict[str, Any], *, ttl: float = 0.75) -> dict[str, Any]:
        app_id = manifest["id"]
        now = time.monotonic()
        with self._health_cache_lock:
            cached = self._health_cache.get(app_id)
            if cached and now - cached[0] <= ttl:
                return dict(cached[1])
        health = self._health(manifest, state)
        with self._health_cache_lock:
            self._health_cache[app_id] = (now, dict(health))
        return health

    def _public_diagnostics(self, diagnostics: Any) -> dict[str, Any]:
        if not isinstance(diagnostics, dict):
            return {}
        public: dict[str, Any] = {}
        for key in ("startupConfirmed", "startupTimedOut", "startupRecoveredAfterTimeout"):
            if key in diagnostics:
                public[key] = bool(diagnostics.get(key))
        if diagnostics.get("adminAuthRequired"):
            public["adminMaintenanceRequired"] = True
            public["startupFailure"] = "host maintenance required before application launch"
        elif diagnostics.get("startupTimedOut"):
            public["startupFailure"] = "application did not become ready before startup timeout"
        elif diagnostics.get("startupFailure") and not diagnostics.get("launcherExitedBeforeHealth"):
            public["startupFailure"] = "application launch did not complete"
        return public

    def _known_process(self, pid: Any) -> subprocess.Popen[Any] | None:
        try:
            return self._processes.get(int(pid))
        except (TypeError, ValueError):
            return None

    def _pid_is_running(self, pid: Any) -> bool:
        process = self._known_process(pid)
        if process is not None:
            return process.poll() is None
        try:
            pid_int = int(pid)
            if pid_int <= 0:
                return False
            os.kill(pid_int, 0)
            return True
        except (TypeError, ValueError, ProcessLookupError):
            return False
        except PermissionError:
            return True

    def _process_name_pids(self, check: dict[str, Any]) -> list[int]:
        pattern = check.get("pattern")
        if not isinstance(pattern, str) or not pattern:
            return []
        command = ["pgrep", "-f", pattern]
        user = check.get("user")
        if isinstance(user, str) and user:
            command[1:1] = ["-u", user]
        try:
            completed = subprocess.run(
                command,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=float(check.get("timeout", 5)),
                check=False,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return []
        if completed.returncode not in (0, 1):
            return []
        pids: list[int] = []
        for line in completed.stdout.splitlines():
            try:
                pid = int(line.strip())
            except ValueError:
                continue
            if pid > 0:
                pids.append(pid)
        return pids

    def status(self, app_id: str, *, private_diagnostics: bool = False) -> dict[str, Any]:
        manifest = self._require_manifest(app_id)
        state = self._read_state(app_id)
        process = self._known_process(state.get("pid"))
        if process is not None and process.poll() is not None:
            state.update(
                {
                    "pid": None,
                    "exitCode": process.returncode,
                }
            )
            self._processes.pop(process.pid, None)
        pid_running = self._pid_is_running(state.get("pid"))
        health = self._cached_health(manifest, state)
        check_type = (manifest.get("health_check") or {}).get("type", "process")
        running = pid_running or (check_type != "process" and bool(health.get("ok")))
        state_changed = False
        if running:
            if state.get("state") != "running" or state.get("stoppedAt") is not None or state.get("exitCode") is not None:
                state.update(
                    {
                        "state": "running",
                        "stoppedAt": None,
                        "exitCode": None,
                        "progress": progress_payload("ready", "Ready", 100, "The application is open."),
                    }
                )
                state_changed = True
            diagnostics = state.get("diagnostics")
            if isinstance(diagnostics, dict) and (
                diagnostics.get("startupTimedOut") or diagnostics.get("startupConfirmed") is False
            ):
                diagnostics["startupConfirmed"] = True
                diagnostics["startupTimedOut"] = False
                diagnostics["startupRecoveredAfterTimeout"] = True
                diagnostics["startupRecoveredAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                diagnostics["startupRecoveredHealth"] = health
                diagnostics.pop("startupFailure", None)
                state_changed = True
        if not running and state.get("state") == "running":
            state.update(
                {
                    "state": "exited",
                    "stoppedAt": utc_now(),
                    "progress": progress_payload("closed", "Closed", 100, "The application is no longer running."),
                }
            )
            self._write_state(app_id, state)
        elif state_changed:
            self._write_state(app_id, state)
        status = {
            "appId": manifest["id"],
            "state": "running" if running else state.get("state", "stopped"),
            "pid": int(state["pid"]) if pid_running and state.get("pid") else None,
            "startedAt": state.get("startedAt"),
            "stoppedAt": state.get("stoppedAt"),
            "exitCode": state.get("exitCode"),
            "health": health if running else {"ok": False, "type": check_type},
            "progress": state.get("progress") or self._default_progress(state, running),
            "owner": state.get("owner") if running or state.get("state") == "launching" else None,
            "diagnostics": state.get("diagnostics", {})
            if private_diagnostics
            else self._public_diagnostics(state.get("diagnostics", {})),
        }
        if not running and status["state"] == "running":
            status["state"] = "exited"
        return status

    def active_session(self, *, exclude_app_id: str | None = None) -> dict[str, Any] | None:
        for manifest in self._manifest_map().values():
            if exclude_app_id and manifest["id"] == exclude_app_id:
                continue
            status = self.status(manifest["id"])
            if status["state"] in ("running", "launching"):
                owner = status.get("owner") if isinstance(status.get("owner"), dict) else None
                return {
                    "appId": manifest["id"],
                    "appName": manifest["name"],
                    "state": status["state"],
                    "owner": self._public_owner(owner),
                    "progress": status.get("progress"),
                }
        return None

    def _public_owner(self, owner: dict[str, Any] | None) -> dict[str, Any] | None:
        if not owner:
            return None
        return {
            "userId": owner.get("userId"),
            "username": owner.get("username"),
            "displayName": owner.get("displayName"),
            "label": owner.get("label") or owner.get("displayName") or owner.get("username"),
        }

    def _default_progress(self, state: dict[str, Any], running: bool) -> dict[str, Any]:
        if running:
            return progress_payload("ready", "Ready", 100, "The application is open.")
        state_name = state.get("state")
        if state_name == "launching":
            return progress_payload("opening", "Opening application", 50, "The application is still starting.")
        if state_name == "failed":
            return progress_payload("failed", "Could not open application", 100, "Diagnostics were captured for support.")
        if state_name == "exited":
            return progress_payload("closed", "Closed", 100, "The application is no longer running.")
        return progress_payload("idle", "Ready to open", 0, "Select Open when you are ready.")

    def _health(self, manifest: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
        check = manifest.get("health_check") or {"type": "process"}
        check_type = check.get("type", "process")
        if check_type == "process":
            return {"ok": self._pid_is_running(state.get("pid")), "type": "process"}
        if check_type == "process_name":
            pids = self._process_name_pids(check)
            return {"ok": bool(pids), "type": "process_name", "pids": pids}
        if check_type == "command":
            command = check.get("command")
            if not isinstance(command, list) or not command:
                return {"ok": False, "type": "command", "error": "invalid command health check"}
            try:
                completed = subprocess.run(
                    [str(part) for part in command],
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=float(check.get("timeout", 5)),
                    check=False,
                )
                return {
                    "ok": completed.returncode == 0,
                    "type": "command",
                    "exitCode": completed.returncode,
                    "output": completed.stdout[-2000:],
                    "error": completed.stderr[-2000:],
                }
            except Exception as exc:  # noqa: BLE001 - diagnostic surface
                return {"ok": False, "type": "command", "error": json_safe_error(exc)}
        return {"ok": True, "type": check_type}

    def _steam_app_id(self, manifest: dict[str, Any]) -> str | None:
        environment = manifest.get("environment") if isinstance(manifest.get("environment"), dict) else {}
        return sanitized_optional_string(environment.get("STEAM_APP_ID")) or sanitized_optional_string(manifest.get("steam_app_id"))

    def _steam_loginusers_path(self, env: dict[str, str]) -> Path:
        return Path(env.get("HOME") or str(DEFAULT_ROOT / "home")) / ".local/share/Steam/config/loginusers.vdf"

    def _credential_env_path(self) -> Path:
        configured = (
            os.environ.get("WTFOS_APPHOST_CREDENTIAL_ENV_FILE")
            or os.environ.get("WTFOS_APPHOST_STEAM_ADMIN_ENV_FILE")
            or str(DEFAULT_ROOT / "config" / "hosted-apps.env")
        )
        return Path(configured)

    def _read_credential_env(self) -> dict[str, str]:
        path = self._credential_env_path()
        try:
            source = path.read_text(encoding="utf-8")
        except OSError:
            return {}
        values: dict[str, str] = {}
        for raw_line in source.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"'")
            if re.match(r"^WTFOS_APPHOST_[A-Z0-9_]+$", key):
                values[key] = value
        return values

    def _stored_credentials_configured(self) -> bool:
        values = self._read_credential_env()
        return (
            values.get("WTFOS_APPHOST_STEAM_ADMIN_LOGIN") == "1"
            and bool(values.get("WTFOS_APPHOST_STEAM_USERNAME"))
            and bool(values.get("WTFOS_APPHOST_STEAM_PASSWORD"))
        )

    def _steam_loginusers_status(self, env: dict[str, str]) -> dict[str, Any]:
        path = self._steam_loginusers_path(env)
        status: dict[str, Any] = {
            "ok": False,
            "loginUsersPath": str(path),
            "accountConfigured": False,
            "rememberPassword": False,
            "allowAutoLogin": False,
        }
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except FileNotFoundError:
            status["reason"] = "loginusers.vdf is missing"
            return status
        except OSError as exc:
            status["reason"] = json_safe_error(exc)
            return status

        status["accountConfigured"] = bool(re.search(r'"AccountName"\s+"[^"]+"', text))
        status["rememberPassword"] = bool(re.search(r'"RememberPassword"\s+"1"', text))
        status["allowAutoLogin"] = bool(re.search(r'"AllowAutoLogin"\s+"1"', text))
        status["ok"] = bool(status["accountConfigured"] and status["rememberPassword"] and status["allowAutoLogin"])
        if not status["ok"]:
            status["reason"] = "remembered admin account is not configured"
        return status

    def _steam_recent_login_window_seen(self, env: dict[str, str]) -> bool:
        log_path = Path(env.get("HOME") or str(DEFAULT_ROOT / "home")) / ".local/share/Steam/logs/webhelper.txt"
        try:
            with log_path.open("rb") as handle:
                handle.seek(0, os.SEEK_END)
                size = handle.tell()
                handle.seek(max(0, size - 200_000))
                text = handle.read().decode("utf-8", "replace")
        except OSError:
            return False
        start = text.rfind("Startup - webhelper launched")
        recent = text[start:] if start >= 0 else text
        return "steamid=0" in recent and "DesktopLoginWindow" in recent

    def _annotate_steam_admin_auth_preflight(
        self,
        manifest: dict[str, Any],
        env: dict[str, str],
        diagnostics: dict[str, Any],
    ) -> bool:
        if not self._steam_app_id(manifest):
            return True
        session_status = self._steam_loginusers_status(env)
        credentials_configured = self._stored_credentials_configured()
        diagnostics["deliveryAuth"] = {
            "rememberedSessionConfigured": bool(session_status.get("ok")),
            "storedCredentialsConfigured": credentials_configured,
            "credentialEnvPath": str(self._credential_env_path()),
        }
        if session_status.get("ok"):
            return True
        diagnostics["adminAuthRequired"] = True
        diagnostics["adminAuthProvider"] = "apphost"
        diagnostics["startupConfirmed"] = False
        diagnostics["startupTimedOut"] = False
        diagnostics["startupFailure"] = "host maintenance required before application launch"
        return False

    def _annotate_steam_admin_auth_failure(
        self,
        manifest: dict[str, Any],
        env: dict[str, str],
        diagnostics: dict[str, Any],
    ) -> None:
        if not self._steam_app_id(manifest):
            return
        session_status = self._steam_loginusers_status(env)
        recent_login_window = self._steam_recent_login_window_seen(env)
        diagnostics["deliveryAuth"] = {
            "rememberedSessionConfigured": bool(session_status.get("ok")),
            "storedCredentialsConfigured": self._stored_credentials_configured(),
            "credentialEnvPath": str(self._credential_env_path()),
            "recentProviderLoginWindow": recent_login_window,
        }
        if recent_login_window or not session_status.get("ok"):
            diagnostics["adminAuthRequired"] = True
            diagnostics["adminAuthProvider"] = "apphost"
            diagnostics["startupTimedOut"] = False
            diagnostics["startupFailure"] = "host maintenance required before application launch"

    def _actor_owns_status(self, status: dict[str, Any], actor: dict[str, Any] | None) -> bool:
        owner = status.get("owner")
        if not owner and not actor:
            return True
        if not isinstance(owner, dict) or not actor:
            return False
        return bool(owner.get("userId") and owner.get("userId") == actor.get("userId"))

    def _conflict_payload(self, active: dict[str, Any], requested_app: dict[str, Any]) -> dict[str, Any]:
        owner = active.get("owner") if isinstance(active.get("owner"), dict) else {}
        owner_label = sanitized_optional_string(owner.get("label")) if isinstance(owner, dict) else None
        active_name = sanitized_optional_string(active.get("appName")) or sanitized_optional_string(active.get("appId")) or "the running app"
        return {
            "ok": False,
            "error": f'Sorry, try joining user "{owner_label or "the current player"}" in "{active_name}".',
            "conflict": {
                "requestedAppId": requested_app["id"],
                "requestedAppName": requested_app["name"],
                **active,
            },
        }

    def launch(self, app_id: str, actor: dict[str, Any] | None = None) -> dict[str, Any]:
        manifest = self._require_manifest(app_id)
        actor = sanitize_actor(actor)

        with self._launch_lock:
            current = self.status(app_id)
            if current["state"] in ("running", "launching"):
                if self._actor_owns_status(current, actor):
                    return {"ok": True, "app": public_app(manifest), "status": current, "activeSession": self.active_session()}
                raise AppHostConflict(self._conflict_payload(self.active_session() or {}, public_app(manifest)))

            active = self.active_session(exclude_app_id=app_id)
            if active is not None:
                raise AppHostConflict(self._conflict_payload(active, public_app(manifest)))

            state = {
                "state": "launching",
                "pid": None,
                "startedAt": utc_now(),
                "stoppedAt": None,
                "exitCode": None,
                "owner": actor,
                "diagnostics": {},
                "progress": progress_payload(
                    "preparing",
                    "Preparing application",
                    8,
                    "Setting up the remote desktop session.",
                ),
            }
            self._write_state(app_id, state)
        base_env = {"DISPLAY": self.config.display}
        if self.config.pulse_server:
            base_env["PULSE_SERVER"] = self.config.pulse_server
        state["progress"] = progress_payload(
            "checking",
            "Checking display and audio",
            22,
            "Verifying the remote desktop is ready.",
        )
        self._write_state(app_id, state)
        env, diagnostics = prepare_launch_environment(manifest, base_env, self.probe)
        state["diagnostics"] = diagnostics
        if not self._annotate_steam_admin_auth_preflight(manifest, env, diagnostics):
            state.update(
                {
                    "state": "failed",
                    "pid": None,
                    "stoppedAt": utc_now(),
                    "exitCode": None,
                    "owner": None,
                    "progress": progress_payload(
                        "blocked",
                        "Admin maintenance required",
                        100,
                        "The remote application host needs administrator maintenance before this app can open.",
                    ),
                }
            )
            self._write_state(app_id, state)
            return {
                "ok": True,
                "app": public_app(manifest),
                "status": self.status(app_id),
                "activeSession": self.active_session(),
            }
        state["progress"] = progress_payload(
            "opening",
            "Opening application",
            38,
            "This can take a few minutes the first time.",
        )
        self._write_state(app_id, state)
        process, state = self._spawn(
            manifest,
            env,
            diagnostics,
            state_name="launching",
            started_at=state["startedAt"],
            owner=actor,
        )
        confirmed = self._confirm_startup(manifest, process, state)
        self._record_startup_attempt(manifest, process, env, diagnostics, "initial", confirmed)
        if not confirmed and self._should_retry_with_mesa(manifest, process, diagnostics):
            self._terminate_pid(process.pid, process_group=True)
            diagnostics["mesaSoftwareFallback"] = True
            diagnostics["mesaRelaunchAfterEarlyExit"] = True
            env = apply_mesa_software_env(env)
            state["progress"] = progress_payload(
                "adjusting",
                "Adjusting graphics",
                48,
                "Trying a compatibility display mode.",
            )
            self._write_state(app_id, state)
            process, state = self._spawn(
                manifest,
                env,
                diagnostics,
                state_name="launching",
                started_at=state["startedAt"],
                owner=actor,
            )
            confirmed = self._confirm_startup(manifest, process, state)
            self._record_startup_attempt(manifest, process, env, diagnostics, "mesa", confirmed)
        if confirmed:
            state["state"] = "running"
            state["stoppedAt"] = None
            state["exitCode"] = None
            state["progress"] = progress_payload("ready", "Ready", 100, "The application is open.")
        else:
            state["state"] = "failed"
            state["stoppedAt"] = utc_now()
            state["exitCode"] = process.poll()
            state["progress"] = progress_payload(
                "blocked" if diagnostics.get("adminAuthRequired") else "failed",
                "Admin maintenance required" if diagnostics.get("adminAuthRequired") else "Could not open application",
                100,
                "The remote application host needs administrator maintenance before this app can open."
                if diagnostics.get("adminAuthRequired")
                else "Diagnostics were captured for support.",
            )
        self._write_state(app_id, state)
        return {"ok": True, "app": public_app(manifest), "status": self.status(app_id), "activeSession": self.active_session()}

    def _record_startup_attempt(
        self,
        manifest: dict[str, Any],
        process: subprocess.Popen[Any],
        env: dict[str, str],
        diagnostics: dict[str, Any],
        label: str,
        confirmed: bool,
    ) -> None:
        check_type = (manifest.get("health_check") or {}).get("type", "process")
        attempt = {
            "label": label,
            "confirmed": confirmed,
            "timeoutSeconds": float(manifest.get("startup_timeout", 1)),
            "healthCheckType": check_type,
            "healthAtTimeout": self._health(manifest, {"pid": process.pid}),
            "launcherPid": process.pid,
            "launcherExitCode": process.poll(),
        }
        if not confirmed:
            attempt["desktopEvidence"] = self._capture_desktop_evidence(manifest["id"], env)
            self._annotate_steam_admin_auth_failure(manifest, env, diagnostics)
        attempts = diagnostics.setdefault("startupAttempts", [])
        if isinstance(attempts, list):
            attempts.append(attempt)
        else:
            diagnostics["startupAttempts"] = [attempt]
        diagnostics["startupConfirmed"] = confirmed
        diagnostics["lastStartupAttempt"] = attempt
        if not confirmed:
            diagnostics["startupTimedOut"] = bool(diagnostics.get("startupTimedOut", True))
            diagnostics["startupFailure"] = str(
                diagnostics.get("startupFailure") or "health check did not become healthy before startup timeout"
            )
        else:
            diagnostics["startupTimedOut"] = False

    def _capture_desktop_evidence(self, app_id: str, env: dict[str, str]) -> dict[str, Any]:
        evidence_dir = self.config.state_dir / "diagnostics" / "api-launch"
        try:
            evidence_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            return {"ok": False, "error": json_safe_error(exc)}

        timestamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        base = evidence_dir / f"{app_id}-{timestamp}-{int(time.time() * 1000) % 1000:03d}"
        evidence: dict[str, Any] = {}

        screenshot_path = base.with_suffix(".png")
        evidence["screenshot"] = self._run_evidence_command(
            ["scrot", str(screenshot_path)],
            env,
            path=screenshot_path,
            include_output=False,
        )

        window_tree_path = base.with_suffix(".xwininfo.txt")
        evidence["windowTree"] = self._run_evidence_command(
            ["xwininfo", "-root", "-tree"],
            env,
            path=window_tree_path,
            include_output=True,
        )
        return evidence

    def _run_evidence_command(
        self,
        command: list[str],
        env: dict[str, str],
        *,
        path: Path,
        include_output: bool,
    ) -> dict[str, Any]:
        try:
            completed = subprocess.run(
                command,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=8,
                check=False,
            )
        except FileNotFoundError as exc:
            return {"ok": False, "error": f"{command[0]} not installed: {exc}"}
        except subprocess.TimeoutExpired as exc:
            return {
                "ok": False,
                "path": str(path),
                "output": (exc.stdout or "")[-2000:],
                "error": f"{command[0]} timed out",
            }

        output = completed.stdout or ""
        if include_output:
            try:
                path.write_text(output, encoding="utf-8")
            except OSError as exc:
                return {"ok": False, "error": json_safe_error(exc), "output": output[-2000:]}

        result: dict[str, Any] = {
            "ok": completed.returncode == 0,
            "path": str(path),
            "exitCode": completed.returncode,
            "error": (completed.stderr or "")[-2000:],
        }
        if include_output:
            result["outputPreview"] = output[-2000:]
        return result

    def _should_retry_with_mesa(
        self,
        manifest: dict[str, Any],
        process: subprocess.Popen[Any],
        diagnostics: dict[str, Any],
    ) -> bool:
        if not manifest.get("display_required") or diagnostics.get("mesaSoftwareFallback"):
            return False
        check_type = (manifest.get("health_check") or {}).get("type", "process")
        return check_type == "process" and process.poll() is not None

    def _spawn(
        self,
        manifest: dict[str, Any],
        env: dict[str, str],
        diagnostics: dict[str, Any],
        *,
        state_name: str = "running",
        started_at: str | None = None,
        owner: dict[str, Any] | None = None,
    ) -> tuple[subprocess.Popen[Any], dict[str, Any]]:
        executable = Path(manifest["executable"])
        working_dir = Path(manifest["working_directory"])
        if not executable.exists():
            raise FileNotFoundError(str(executable))
        if not working_dir.exists():
            raise FileNotFoundError(str(working_dir))

        log_base = self.config.state_dir / "logs" / manifest["id"]
        stdout = open(f"{log_base}.stdout.log", "ab", buffering=0)
        stderr = open(f"{log_base}.stderr.log", "ab", buffering=0)
        command = [str(executable), *manifest.get("arguments", [])]
        try:
            process = subprocess.Popen(
                command,
                cwd=str(working_dir),
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                start_new_session=True,
            )
        finally:
            stdout.close()
            stderr.close()
        self._processes[process.pid] = process
        state = {
            "state": state_name,
            "pid": process.pid,
            "command": command,
            "startedAt": started_at or utc_now(),
            "stoppedAt": None,
            "exitCode": None,
            "owner": owner,
            "diagnostics": diagnostics,
            "progress": progress_payload(
                "opening",
                "Opening application",
                45,
                "Waiting for the application window.",
            ),
        }
        self._write_state(manifest["id"], state)
        return process, state

    def _confirm_startup(
        self,
        manifest: dict[str, Any],
        process: subprocess.Popen[Any],
        state: dict[str, Any] | None = None,
    ) -> bool:
        deadline = time.time() + float(manifest.get("startup_timeout", 1))
        started = time.time()
        timeout_seconds = max(1.0, float(manifest.get("startup_timeout", 1)))
        next_progress_write = 0.0
        check_type = (manifest.get("health_check") or {}).get("type", "process")
        if check_type != "process":
            check = manifest.get("health_check") or {}
            try:
                launcher_exit_grace = float(check.get("launcher_exit_grace", 10.0))
            except (TypeError, ValueError):
                launcher_exit_grace = 10.0
            launcher_exit_grace = max(0.1, launcher_exit_grace)
            launcher_exited_at: float | None = None
            while time.time() < deadline:
                health = self._health(manifest, {"pid": process.pid})
                if health.get("ok"):
                    return True
                exit_code = process.poll()
                now = time.time()
                if exit_code is not None:
                    if launcher_exited_at is None:
                        launcher_exited_at = now
                        if state is not None:
                            diagnostics = state.setdefault("diagnostics", {})
                            if isinstance(diagnostics, dict):
                                diagnostics["launcherExitedBeforeHealth"] = True
                                diagnostics["launcherExitCode"] = exit_code
                                diagnostics["launcherExitObservedAt"] = utc_now()
                                diagnostics["launcherExitGraceSeconds"] = launcher_exit_grace
                    elif now - launcher_exited_at >= launcher_exit_grace:
                        if state is not None:
                            diagnostics = state.setdefault("diagnostics", {})
                            if isinstance(diagnostics, dict):
                                diagnostics["startupTimedOut"] = False
                                diagnostics["startupFailure"] = "launcher exited before application health check became healthy"
                                diagnostics["healthAfterLauncherExit"] = health
                        return False
                if state is not None and time.time() >= next_progress_write:
                    elapsed = time.time() - started
                    percent = 45 + min(48, int((elapsed / timeout_seconds) * 48))
                    detail = "Waiting for the application window."
                    if launcher_exited_at is not None:
                        detail = "Waiting briefly for the application window after the launcher exited."
                    state["progress"] = progress_payload(
                        "opening",
                        "Opening application",
                        percent,
                        detail,
                    )
                    self._write_state(manifest["id"], state)
                    next_progress_write = time.time() + 1.0
                time.sleep(0.5)
            if state is not None:
                diagnostics = state.setdefault("diagnostics", {})
                if isinstance(diagnostics, dict):
                    diagnostics.setdefault("startupTimedOut", True)
            return False
        while time.time() < deadline:
            if process.poll() is not None:
                return False
            if state is not None:
                state["progress"] = progress_payload("opening", "Opening application", 82, "Starting the app window.")
                self._write_state(manifest["id"], state)
            return True
            time.sleep(0.2)
        return process.poll() is None

    def stop(self, app_id: str) -> dict[str, Any]:
        manifest = self._require_manifest(app_id)
        stream_exit_codes = self._stop_streams(app_id)
        state = self._read_state(app_id)
        pid = state.get("pid")
        exit_code = None
        if self._pid_is_running(pid):
            exit_code = self._terminate_pid(int(pid), process_group=True)
        target_exit_codes = self._terminate_health_targets(manifest)
        state.update(
            {
                "state": "stopped",
                "pid": None,
                "stoppedAt": utc_now(),
                "exitCode": exit_code,
                "owner": None,
                "targetExitCodes": target_exit_codes,
                "streamExitCodes": stream_exit_codes,
                "progress": progress_payload("idle", "Ready to open", 0, "Select Open when you are ready."),
            }
        )
        self._write_state(app_id, state)
        check_type = (manifest.get("health_check") or {}).get("type", "process")
        return {
            "ok": True,
            "app": public_app(manifest),
            "status": {
                "appId": manifest["id"],
                "state": "stopped",
                "pid": None,
                "startedAt": state.get("startedAt"),
                "stoppedAt": state.get("stoppedAt"),
                "exitCode": state.get("exitCode"),
                "health": {"ok": False, "type": check_type},
                "progress": state.get("progress"),
                "owner": None,
                "diagnostics": self._public_diagnostics(state.get("diagnostics", {})),
            },
        }

    def input_event(self, app_id: str, event: dict[str, Any]) -> dict[str, Any]:
        manifest = self._require_manifest(app_id)
        status = self.status(app_id)
        if status["state"] != "running":
            raise AppHostInputError(
                HTTPStatus.CONFLICT,
                {
                    "ok": False,
                    "error": "Application is not ready for input",
                    "status": status,
                },
            )
        runtime = self._runtime_config(manifest)
        normalized = self._normalize_input_event(event, runtime)
        try:
            injected = self._inject_input_event(normalized)
        except Exception as exc:  # noqa: BLE001 - returned as apphost diagnostic
            raise AppHostInputError(
                HTTPStatus.BAD_REQUEST,
                {"ok": False, "error": "Input event could not be injected", "detail": json_safe_error(exc)},
            ) from exc
        return {
            "ok": True,
            "app": public_app(manifest),
            "status": status,
            "input": normalized,
            "injected": injected,
        }

    def stream_offer(self, app_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        manifest = self._require_manifest(app_id)
        status = self.status(app_id)
        if status["state"] != "running":
            raise AppHostStreamError(
                HTTPStatus.CONFLICT,
                {
                    "ok": False,
                    "error": "Application is not ready for streaming",
                    "status": status,
                },
            )
        if not isinstance(payload, dict):
            raise AppHostStreamError(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Stream offer must be an object"})
        stream_id = self._normalize_stream_id(payload.get("streamId"))
        offer = payload.get("offer")
        if not isinstance(offer, dict):
            raise AppHostStreamError(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "WebRTC offer is required"})
        offer_type = str(offer.get("type") or "")
        offer_sdp = str(offer.get("sdp") or "")
        if offer_type != "offer" or not offer_sdp or len(offer_sdp) > 1024 * 1024:
            raise AppHostStreamError(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Invalid WebRTC offer"})
        try:
            timeout_seconds = float(payload.get("timeoutSeconds") or 12)
        except (TypeError, ValueError):
            timeout_seconds = 12
        timeout_seconds = max(1.0, min(20.0, timeout_seconds))
        streamer = Path(self.config.webrtc_streamer)
        if not streamer.exists():
            raise AppHostStreamError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {
                    "ok": False,
                    "error": "WebRTC streamer is not installed",
                    "streamer": str(streamer),
                },
            )

        self._stop_stream_process(app_id, stream_id)
        runtime = self._runtime_config(manifest)
        stream_dir = self.config.state_dir / "streams" / app_id / stream_id
        stream_dir.mkdir(parents=True, exist_ok=True)
        offer_path = stream_dir / "offer.json"
        answer_path = stream_dir / "answer.json"
        stdout_path = stream_dir / "stdout.log"
        stderr_path = stream_dir / "stderr.log"
        offer_payload = {
            "appId": manifest["id"],
            "streamId": stream_id,
            "offer": {"type": offer_type, "sdp": offer_sdp},
            "audio": {"required": bool(manifest.get("audio_required"))},
            "video": {
                "width": runtime["display"]["width"],
                "height": runtime["display"]["height"],
            },
        }
        offer_path.write_text(json.dumps(offer_payload, indent=2, sort_keys=True), encoding="utf-8")
        for path in (answer_path, stdout_path, stderr_path):
            try:
                path.unlink()
            except FileNotFoundError:
                pass

        command = [
            str(streamer),
            "--offer",
            str(offer_path),
            "--answer",
            str(answer_path),
            "--display",
            self.config.display,
            "--pulse-server",
            self.config.pulse_server or "",
            "--width",
            str(runtime["display"]["width"]),
            "--height",
            str(runtime["display"]["height"]),
            "--stream-id",
            stream_id,
        ]
        env = dict(os.environ)
        env["DISPLAY"] = self.config.display
        if self.config.pulse_server:
            env["PULSE_SERVER"] = self.config.pulse_server
        stdout = open(stdout_path, "ab", buffering=0)
        stderr = open(stderr_path, "ab", buffering=0)
        try:
            process = subprocess.Popen(
                command,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                start_new_session=True,
            )
        finally:
            stdout.close()
            stderr.close()
        self._streams[(app_id, stream_id)] = process
        answer = self._wait_for_stream_answer(app_id, stream_id, process, answer_path, stderr_path, timeout_seconds)
        return {
            "ok": True,
            "app": public_app(manifest),
            "status": status,
            "transport": "webrtc",
            "streamId": stream_id,
            **answer,
        }

    def _normalize_stream_id(self, value: Any) -> str:
        stream_id = str(value or "").strip()
        if not STREAM_ID_RE.match(stream_id):
            raise AppHostStreamError(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Invalid stream id"})
        return stream_id

    def _wait_for_stream_answer(
        self,
        app_id: str,
        stream_id: str,
        process: subprocess.Popen[Any],
        answer_path: Path,
        stderr_path: Path,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if answer_path.exists():
                try:
                    answer = json.loads(answer_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError) as exc:
                    raise AppHostStreamError(
                        HTTPStatus.BAD_GATEWAY,
                        {"ok": False, "error": "Invalid WebRTC streamer answer", "detail": json_safe_error(exc)},
                    ) from exc
                if not isinstance(answer, dict):
                    raise AppHostStreamError(
                        HTTPStatus.BAD_GATEWAY,
                        {"ok": False, "error": "Invalid WebRTC streamer answer"},
                    )
                if answer.get("ok") is False:
                    self._stop_stream_process(app_id, stream_id)
                    raise AppHostStreamError(HTTPStatus.BAD_GATEWAY, answer)
                return answer
            if process.poll() is not None:
                self._streams.pop((app_id, stream_id), None)
                detail = ""
                try:
                    detail = stderr_path.read_text(encoding="utf-8")[-2000:]
                except OSError:
                    pass
                raise AppHostStreamError(
                    HTTPStatus.BAD_GATEWAY,
                    {
                        "ok": False,
                        "error": "WebRTC streamer exited before answering",
                        "exitCode": process.returncode,
                        "detail": detail,
                    },
                )
            time.sleep(0.05)
        exit_code = self._stop_stream_process(app_id, stream_id)
        raise AppHostStreamError(
            HTTPStatus.GATEWAY_TIMEOUT,
            {"ok": False, "error": "WebRTC streamer did not answer before timeout", "exitCode": exit_code},
        )

    def stream_status(self, app_id: str, stream_id: str | None = None) -> dict[str, Any]:
        manifest = self._require_manifest(app_id)
        if stream_id is not None:
            stream_id = self._normalize_stream_id(stream_id)
            process = self._streams.get((app_id, stream_id))
            active = bool(process is not None and process.poll() is None)
            if process is not None and not active:
                self._streams.pop((app_id, stream_id), None)
            return {
                "ok": True,
                "app": public_app(manifest),
                "streamId": stream_id,
                "active": active,
                "pid": process.pid if active and process is not None else None,
                "exitCode": process.poll() if process is not None else None,
            }
        streams = []
        for (candidate_app_id, candidate_stream_id), process in list(self._streams.items()):
            if candidate_app_id != app_id:
                continue
            active = process.poll() is None
            if not active:
                self._streams.pop((candidate_app_id, candidate_stream_id), None)
                continue
            streams.append({"streamId": candidate_stream_id, "pid": process.pid, "active": True})
        return {"ok": True, "app": public_app(manifest), "streams": streams}

    def stream_stop(self, app_id: str, stream_id: str | None = None) -> dict[str, Any]:
        manifest = self._require_manifest(app_id)
        if stream_id is not None:
            stream_id = self._normalize_stream_id(stream_id)
            exit_code = self._stop_stream_process(app_id, stream_id)
            return {
                "ok": True,
                "app": public_app(manifest),
                "streamId": stream_id,
                "stopped": exit_code is not None,
                "exitCode": exit_code,
            }
        exit_codes = self._stop_streams(app_id)
        return {"ok": True, "app": public_app(manifest), "stopped": bool(exit_codes), "streamExitCodes": exit_codes}

    def _stop_streams(self, app_id: str) -> dict[str, int | None]:
        exit_codes: dict[str, int | None] = {}
        for candidate_app_id, stream_id in list(self._streams):
            if candidate_app_id == app_id:
                exit_codes[stream_id] = self._stop_stream_process(candidate_app_id, stream_id)
        return exit_codes

    def _stop_stream_process(self, app_id: str, stream_id: str) -> int | None:
        process = self._streams.pop((app_id, stream_id), None)
        if process is None:
            return None
        if process.poll() is not None:
            return process.returncode
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        except ProcessLookupError:
            return process.poll()
        except PermissionError:
            process.terminate()
        try:
            return process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
            except PermissionError:
                process.kill()
            try:
                return process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                return -signal.SIGKILL

    def _normalize_input_event(self, event: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(event, dict):
            raise AppHostInputError(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Input event must be an object"})
        event_type = str(event.get("type") or "")
        if event_type == "pointer":
            action = str(event.get("action") or "")
            if action not in {"move", "down", "up", "click", "doubleClick", "wheel"}:
                raise AppHostInputError(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Unsupported pointer action"})
            width = int(runtime["display"]["width"])
            height = int(runtime["display"]["height"])
            x = self._normalize_axis(event.get("x"), width)
            y = self._normalize_axis(event.get("y"), height)
            return {
                "type": "pointer",
                "action": action,
                "x": x,
                "y": y,
                "button": self._bounded_int(event.get("button"), default=1, minimum=1, maximum=8),
                "deltaX": float(event.get("deltaX") or 0),
                "deltaY": float(event.get("deltaY") or 0),
            }
        if event_type == "keyboard":
            action = str(event.get("action") or "")
            if action not in {"down", "up", "press"}:
                raise AppHostInputError(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Unsupported keyboard action"})
            key = str(event.get("key") or "")
            if not key:
                raise AppHostInputError(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Keyboard input requires key"})
            return {"type": "keyboard", "action": action, "key": key[:64], "code": str(event.get("code") or "")[:64]}
        raise AppHostInputError(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Unsupported input event type"})

    def _normalize_axis(self, value: Any, maximum: int) -> int:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            numeric = 0.0
        if 0.0 <= numeric <= 1.0:
            numeric *= maximum
        return max(0, min(maximum - 1, int(round(numeric))))

    def _inject_input_event(self, event: dict[str, Any]) -> dict[str, Any]:
        if self._x11_input is None:
            self._x11_input = X11InputInjector(self.config.display)
        try:
            return self._x11_input.inject(event)
        except ModuleNotFoundError:
            return self._inject_input_event_with_xdotool(event)

    def _inject_input_event_with_xdotool(self, event: dict[str, Any]) -> dict[str, Any]:
        env = dict(os.environ)
        env["DISPLAY"] = self.config.display
        if event["type"] == "pointer":
            command = ["xdotool", "mousemove", str(event["x"]), str(event["y"])]
            action = event["action"]
            button = str(event.get("button") or 1)
            if action == "move":
                pass
            elif action == "down":
                command.extend(["mousedown", button])
            elif action == "up":
                command.extend(["mouseup", button])
            elif action == "click":
                command.extend(["click", button])
            elif action == "doubleClick":
                command.extend(["click", "--repeat", "2", button])
            elif action == "wheel":
                command.extend(["click", "4" if float(event.get("deltaY") or 0) < 0 else "5"])
            else:
                raise ValueError(f"unsupported pointer action: {action}")
        elif event["type"] == "keyboard":
            key = str(event["key"])
            action = event["action"]
            if action == "press":
                command = ["xdotool", "key", key]
            elif action == "down":
                command = ["xdotool", "keydown", key]
            elif action == "up":
                command = ["xdotool", "keyup", key]
            else:
                raise ValueError(f"unsupported keyboard action: {action}")
        else:
            raise ValueError(f"unsupported input event type: {event['type']}")
        completed = subprocess.run(
            command,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=2,
            check=False,
        )
        return {
            "ok": completed.returncode == 0,
            "method": "xdotool",
            "exitCode": completed.returncode,
            "error": completed.stderr[-1000:],
        }

    def snapshot(self, app_id: str) -> dict[str, Any]:
        manifest = self._require_manifest(app_id)
        content_type, image = self._capture_snapshot_image(app_id)
        encoded = base64.b64encode(image).decode("ascii")
        return {
            "ok": True,
            "appId": manifest["id"],
            "contentType": content_type,
            "capturedAt": utc_now(),
            "dataUrl": f"data:{content_type};base64,{encoded}",
        }

    def _capture_snapshot_image(self, app_id: str) -> tuple[str, bytes]:
        snapshot_dir = self.config.state_dir / "snapshots"
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        snapshot_path = snapshot_dir / f"{app_id}-{int(time.time() * 1000)}.jpg"
        env = dict(os.environ)
        env["DISPLAY"] = self.config.display
        completed = subprocess.run(
            ["scrot", "-z", "-q", "65", str(snapshot_path)],
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=8,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError((completed.stderr or "snapshot capture failed")[-1000:])
        try:
            return "image/jpeg", snapshot_path.read_bytes()
        finally:
            try:
                snapshot_path.unlink()
            except FileNotFoundError:
                pass

    def _terminate_health_targets(self, manifest: dict[str, Any]) -> dict[str, int | None]:
        check = manifest.get("health_check") or {}
        if check.get("type") != "process_name":
            return {}
        results: dict[str, int | None] = {}
        for pid in self._process_name_pids(check):
            results[str(pid)] = self._terminate_pid(pid, process_group=False)
        return results

    def _terminate_pid(self, pid: int, *, process_group: bool) -> int | None:
        def reap_known_process() -> int | None:
            process = self._processes.get(pid)
            if process is None:
                return None
            return_code = process.poll()
            if return_code is None:
                return None
            self._processes.pop(pid, None)
            return return_code

        def send(sig: signal.Signals) -> bool:
            try:
                if process_group:
                    os.killpg(os.getpgid(pid), sig)
                else:
                    os.kill(pid, sig)
                return True
            except ProcessLookupError:
                return False
            except PermissionError:
                os.kill(pid, sig)
                return True

        if not send(signal.SIGTERM):
            return reap_known_process()
        deadline = time.time() + 5
        while time.time() < deadline:
            process = self._processes.get(pid)
            if process is not None and process.poll() is not None:
                self._processes.pop(pid, None)
                return process.returncode
            if not self._pid_is_running(pid):
                return 0
            time.sleep(0.1)
        if not send(signal.SIGKILL):
            return 0
        process = self._processes.get(pid)
        if process is not None:
            try:
                code = process.wait(timeout=2)
                self._processes.pop(pid, None)
                return code
            except subprocess.TimeoutExpired:
                pass
        return -signal.SIGKILL


class AppHostRequestHandler(BaseHTTPRequestHandler):
    host: ApplicationHost
    protocol_version = "HTTP/1.0"

    def _read_json_body(self) -> dict[str, Any]:
        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = max(0, int(raw_length))
        except ValueError:
            length = 0
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        payload = json.loads(raw.decode("utf-8"))
        return payload if isinstance(payload, dict) else {}

    def _send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
        self.close_connection = True
        try:
            self.send_response(status.value)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, OSError):
            self.close_connection = True

    def _handle(self, method: str) -> None:
        parsed = urlparse(self.path)
        parts = [part for part in parsed.path.split("/") if part]
        try:
            if method == "GET" and parts == ["health"]:
                self._send_json(HTTPStatus.OK, {"ok": True, "service": "wtfos-apphost"})
                return
            if method == "GET" and parts == ["apps"]:
                self._send_json(HTTPStatus.OK, self.host.apps_payload())
                return
            if len(parts) == 2 and parts[0] == "apps" and method == "GET":
                app_id = parts[1]
                self._send_json(HTTPStatus.OK, {"app": self.host.get_app(app_id)})
                return
            if len(parts) == 3 and parts[0] == "apps" and method == "GET" and parts[2] == "status":
                app_id = parts[1]
                self._send_json(HTTPStatus.OK, {"status": self.host.status(app_id)})
                return
            if len(parts) == 3 and parts[0] == "apps" and method == "GET" and parts[2] == "session":
                app_id = parts[1]
                self._send_json(HTTPStatus.OK, self.host.session_descriptor(app_id))
                return
            if len(parts) == 3 and parts[0] == "apps" and method == "GET" and parts[2] == "snapshot":
                app_id = parts[1]
                self._send_json(HTTPStatus.OK, self.host.snapshot(app_id))
                return
            if len(parts) == 3 and parts[0] == "apps" and method == "POST" and parts[2] == "launch":
                app_id = parts[1]
                body = self._read_json_body()
                actor = body.get("actor") if isinstance(body, dict) else None
                self._send_json(HTTPStatus.OK, self.host.launch(app_id, actor=actor))
                return
            if len(parts) == 3 and parts[0] == "apps" and method == "POST" and parts[2] == "stop":
                app_id = parts[1]
                self._send_json(HTTPStatus.OK, self.host.stop(app_id))
                return
            if len(parts) == 3 and parts[0] == "apps" and method == "POST" and parts[2] == "input":
                app_id = parts[1]
                self._send_json(HTTPStatus.OK, self.host.input_event(app_id, self._read_json_body()))
                return
            if len(parts) == 4 and parts[0] == "apps" and parts[2] == "stream" and method == "POST" and parts[3] == "offer":
                app_id = parts[1]
                self._send_json(HTTPStatus.OK, self.host.stream_offer(app_id, self._read_json_body()))
                return
            if len(parts) == 4 and parts[0] == "apps" and parts[2] == "stream" and method == "GET" and parts[3] == "status":
                app_id = parts[1]
                self._send_json(HTTPStatus.OK, self.host.stream_status(app_id))
                return
            if len(parts) == 4 and parts[0] == "apps" and parts[2] == "stream" and method == "POST" and parts[3] == "stop":
                app_id = parts[1]
                body = self._read_json_body()
                stream_id = body.get("streamId") if isinstance(body, dict) else None
                self._send_json(HTTPStatus.OK, self.host.stream_stop(app_id, str(stream_id) if stream_id else None))
                return
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})
        except KeyError:
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown application"})
        except ManifestError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": json_safe_error(exc)})
        except AppHostConflict as exc:
            self._send_json(HTTPStatus.CONFLICT, exc.payload)
        except AppHostInputError as exc:
            self._send_json(exc.status, exc.payload)
        except AppHostStreamError as exc:
            self._send_json(exc.status, exc.payload)
        except json.JSONDecodeError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": f"Invalid JSON body: {exc}"})
        except Exception as exc:  # noqa: BLE001 - REST diagnostics
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": json_safe_error(exc)})

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")

    def log_message(self, fmt: str, *args: Any) -> None:
        try:
            address = self.address_string()
        except (IndexError, TypeError):
            address = "unix"
        print(f"[apphostd] {address} {fmt % args}", flush=True)


class BoundedThreadingMixIn(socketserver.ThreadingMixIn):
    daemon_threads = True
    block_on_close = False
    request_queue_size = 128
    max_request_threads = 48

    def __init__(self, *args: Any, **kwargs: Any):
        self._request_semaphore = threading.BoundedSemaphore(self.max_request_threads)
        super().__init__(*args, **kwargs)

    def process_request(self, request: Any, client_address: Any) -> None:
        if not self._request_semaphore.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_semaphore.release()
            raise

    def process_request_thread(self, request: Any, client_address: Any) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_semaphore.release()


class AppHostThreadingHTTPServer(BoundedThreadingMixIn, ThreadingHTTPServer):
    allow_reuse_address = True


class UnixThreadingHTTPServer(BoundedThreadingMixIn, socketserver.UnixStreamServer):
    pass


def handler_for(app_host: ApplicationHost) -> type[AppHostRequestHandler]:
    class Handler(AppHostRequestHandler):
        pass

    Handler.host = app_host
    return Handler


def build_server(config: AppHostConfig, host: str, port: int) -> AppHostThreadingHTTPServer:
    return build_tcp_server(ApplicationHost(config), host, port)


def build_tcp_server(app_host: ApplicationHost, host: str, port: int) -> AppHostThreadingHTTPServer:
    return AppHostThreadingHTTPServer((host, port), handler_for(app_host))


def build_unix_server(app_host: ApplicationHost, socket_path: Path, mode: int) -> UnixThreadingHTTPServer:
    socket_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        socket_path.unlink()
    except FileNotFoundError:
        pass
    server = UnixThreadingHTTPServer(str(socket_path), handler_for(app_host))
    socket_path.chmod(mode)
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="wtfOS remote Linux application host")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--manifest-dir", type=Path, default=DEFAULT_ROOT / "manifests")
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_ROOT / "state")
    parser.add_argument("--display", default=os.environ.get("DISPLAY", ":99"))
    parser.add_argument("--pulse-server", default=os.environ.get("PULSE_SERVER", "unix:/opt/wtfos/apphost/run/pulse/native"))
    parser.add_argument(
        "--socket-path",
        type=Path,
        action="append",
        default=[],
        help="Unix socket path to expose. May be provided more than once.",
    )
    parser.add_argument("--socket-mode", default="0660")
    args = parser.parse_args()
    config = AppHostConfig(
          manifest_dir=args.manifest_dir,
          state_dir=args.state_dir,
          display=args.display,
          pulse_server=args.pulse_server,
    )
    app_host = ApplicationHost(config)
    servers: list[tuple[str, socketserver.BaseServer]] = [
        (f"http://{args.host}:{args.port}", build_tcp_server(app_host, args.host, args.port)),
    ]
    for socket_path in args.socket_path:
        try:
            socket_mode = int(str(args.socket_mode), 8)
        except ValueError as exc:
            raise SystemExit(f"invalid --socket-mode: {args.socket_mode}") from exc
        servers.append((f"unix:{socket_path}", build_unix_server(app_host, socket_path, socket_mode)))

    threads = []
    for label, server in servers:
        print(f"[apphostd] listening on {label}", flush=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        threads.append((thread, server))

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        for _thread, server in threads:
            server.shutdown()


if __name__ == "__main__":
    main()
