import json
import os
import socket
import stat
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apphostd import (  # noqa: E402
    AppHostConflict,
    AppHostConfig,
    AppHostInputError,
    AppHostStreamError,
    AppHostThreadingHTTPServer,
    ApplicationHost,
    BoundedThreadingMixIn,
    ProbeResult,
    UnixThreadingHTTPServer,
    X11InputInjector,
    build_unix_server,
    prepare_launch_environment,
)


class AppHostTests(unittest.TestCase):
    def test_input_injector_and_servers_are_bounded_for_interactive_load(self):
        injector = X11InputInjector(":99")

        self.assertIsInstance(injector._lock, threading.Lock().__class__)  # noqa: SLF001
        self.assertTrue(injector._worker.is_alive())
        self.assertTrue(issubclass(AppHostThreadingHTTPServer, BoundedThreadingMixIn))
        self.assertTrue(issubclass(UnixThreadingHTTPServer, BoundedThreadingMixIn))
        self.assertEqual(AppHostThreadingHTTPServer.max_request_threads, 48)
        self.assertEqual(UnixThreadingHTTPServer.max_request_threads, 48)

    def test_runtime_stream_defaults_keep_native_size_and_cap_large_displays(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            manifests.mkdir()
            state.mkdir()
            for app_id, width, height in (("demo-app", 1280, 720), ("big-app", 1920, 1080)):
                (manifests / f"{app_id}.json").write_text(
                    json.dumps(
                        {
                            "id": app_id,
                            "name": app_id,
                            "executable": "/bin/true",
                            "working_directory": str(root),
                            "environment": {},
                            "startup_timeout": 2,
                            "health_check": {"type": "process"},
                            "display_required": True,
                            "audio_required": False,
                            "runtime": {"display": {"width": width, "height": height}},
                        }
                    ),
                    encoding="utf-8",
                )
            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            native = host._runtime_config(host._require_manifest("demo-app"))
            self.assertEqual(native["stream"]["width"], 1280)
            self.assertEqual(native["stream"]["height"], 720)
            self.assertEqual(native["stream"]["framerate"], 30)
            capped = host._runtime_config(host._require_manifest("big-app"))
            self.assertEqual(capped["stream"]["width"], 1280)
            self.assertEqual(capped["stream"]["height"], 720)

    def test_manifest_driven_launch_status_and_stop(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            env_capture = state / "env.json"
            executable = bin_dir / "demo-app"
            executable.write_text(
                "#!/usr/bin/env sh\n"
                "python3 - <<'PY'\n"
                "import json, os, pathlib, time\n"
                f"pathlib.Path({str(env_capture)!r}).write_text(json.dumps(dict(os.environ)))\n"
                "time.sleep(30)\n"
                "PY\n",
                encoding="utf-8",
            )
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "demo.json").write_text(
                json.dumps(
                    {
                        "id": "demo",
                        "name": "Demo App",
                        "cover_image_url": "https://example.test/demo.jpg",
                        "cover_image_alt": "Demo App cover",
                        "category": "Utility",
                        "summary": "Demo app summary.",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {"DEMO_FLAG": "yes"},
                        "startup_timeout": 2,
                        "health_check": {"type": "process"},
                        "display_required": True,
                        "audio_required": True,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(
                AppHostConfig(
                    manifest_dir=manifests,
                    state_dir=state,
                    display=":77",
                    pulse_server="unix:/tmp/apphost-pulse/native",
                )
            )

            apps = host.list_apps()
            self.assertEqual([app["id"] for app in apps], ["demo"])
            self.assertEqual(apps[0]["coverImageUrl"], "https://example.test/demo.jpg")
            self.assertEqual(apps[0]["category"], "Utility")
            launch = host.launch("demo")
            self.assertEqual(launch["app"]["id"], "demo")
            self.assertEqual(launch["status"]["state"], "running")
            self.assertIsInstance(launch["status"]["pid"], int)
            self.assertEqual(launch["status"]["progress"]["phase"], "ready")
            self.assertEqual(launch["status"]["progress"]["percent"], 100)
            self.assertTrue(launch["status"]["diagnostics"]["startupConfirmed"])
            self.assertFalse(launch["status"]["diagnostics"]["startupTimedOut"])

            deadline = time.time() + 2
            while not env_capture.exists() and time.time() < deadline:
                time.sleep(0.05)
            captured_env = json.loads(env_capture.read_text(encoding="utf-8"))
            self.assertEqual(captured_env["DISPLAY"], ":77")
            self.assertEqual(captured_env["PULSE_SERVER"], "unix:/tmp/apphost-pulse/native")
            self.assertEqual(captured_env["DEMO_FLAG"], "yes")

            stopped = host.stop("demo")
            self.assertEqual(stopped["status"]["state"], "stopped")

    def test_only_one_manifest_app_can_be_active_for_wtfos(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "demo-app"
            executable.write_text("#!/usr/bin/env sh\nsleep 30\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            for app_id, name in (("demo-one", "Demo One"), ("demo-two", "Demo Two")):
                (manifests / f"{app_id}.json").write_text(
                    json.dumps(
                        {
                            "id": app_id,
                            "name": name,
                            "executable": str(executable),
                            "working_directory": str(root),
                            "environment": {},
                            "startup_timeout": 2,
                            "health_check": {"type": "process"},
                            "display_required": False,
                            "audio_required": False,
                        }
                    ),
                    encoding="utf-8",
                )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            alice = {"userId": 1, "username": "alice", "displayName": "Alice"}
            bob = {"userId": 2, "username": "bob", "displayName": "Bob"}

            launch = host.launch("demo-one", actor=alice)
            self.assertEqual(launch["status"]["owner"]["label"], "Alice")
            self.assertEqual(launch["activeSession"]["appName"], "Demo One")

            with self.assertRaises(AppHostConflict) as raised:
                host.launch("demo-two", actor=bob)

            payload = raised.exception.payload
            self.assertEqual(payload["conflict"]["appName"], "Demo One")
            self.assertEqual(payload["conflict"]["owner"]["label"], "Alice")
            self.assertIn('try joining user "Alice" in "Demo One"', payload["error"])

            host.stop("demo-one")

    def test_status_reports_exited_for_child_that_quits_after_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "short-app"
            executable.write_text(
                "#!/usr/bin/env sh\n"
                "sleep 0.2\n",
                encoding="utf-8",
            )
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "short-app.json").write_text(
                json.dumps(
                    {
                        "id": "short-app",
                        "name": "Short App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "health_check": {"type": "process"},
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            launch = host.launch("short-app")
            self.assertEqual(launch["status"]["state"], "running")

            deadline = time.time() + 3
            status = host.status("short-app")
            while status["state"] == "running" and time.time() < deadline:
                time.sleep(0.05)
                status = host.status("short-app")

            self.assertEqual(status["state"], "exited")
            self.assertEqual(status["pid"], None)
            self.assertEqual(status["exitCode"], 0)

    def test_process_name_health_tracks_app_after_launcher_exits(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "steam-style-launcher"
            executable.write_text("#!/usr/bin/env sh\nexit 0\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "steam-style.json").write_text(
                json.dumps(
                    {
                        "id": "steam-style",
                        "name": "Steam Style App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "health_check": {"type": "process_name", "pattern": "FakeGame"},
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            health_calls = 0

            def process_name_pids(check):
                nonlocal health_calls
                health_calls += 1
                return [] if health_calls == 1 else [12345]

            host._process_name_pids = process_name_pids  # type: ignore[method-assign]

            launch = host.launch("steam-style")
            self.assertEqual(launch["status"]["state"], "running")

            deadline = time.time() + 3
            status = host.status("steam-style")
            while status["pid"] is not None and time.time() < deadline:
                time.sleep(0.05)
                status = host.status("steam-style")
            self.assertEqual(status["state"], "running")
            self.assertEqual(status["pid"], None)
            self.assertEqual(status["health"]["type"], "process_name")
            self.assertEqual(status["health"]["pids"], [12345])
            self.assertTrue(status["diagnostics"]["startupConfirmed"])
            self.assertFalse(status["diagnostics"]["startupTimedOut"])

    def test_process_name_launcher_exit_fails_after_grace_instead_of_full_timeout(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "steam-style-launcher"
            executable.write_text("#!/usr/bin/env sh\nexit 0\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "steam-style.json").write_text(
                json.dumps(
                    {
                        "id": "steam-style",
                        "name": "Steam Style App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 5,
                        "health_check": {
                            "type": "process_name",
                            "pattern": "FakeGame",
                            "launcher_exit_grace": 0.1,
                        },
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))

            started = time.monotonic()
            launch = host.launch("steam-style")
            elapsed = time.monotonic() - started

            self.assertLess(elapsed, 2.5)
            self.assertEqual(launch["status"]["state"], "failed")
            self.assertEqual(launch["status"]["progress"]["phase"], "failed")
            private_status = host.status("steam-style", private_diagnostics=True)
            self.assertTrue(private_status["diagnostics"]["launcherExitedBeforeHealth"])
            self.assertFalse(private_status["diagnostics"]["startupTimedOut"])
            self.assertEqual(
                private_status["diagnostics"]["startupFailure"],
                "launcher exited before application health check became healthy",
            )

    def test_steam_manifest_without_admin_session_blocks_before_spawn(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            steam_home = root / "steam-home"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()
            steam_home.mkdir()

            marker = state / "spawned"
            executable = bin_dir / "hosted-launcher"
            executable.write_text(f"#!/usr/bin/env sh\ntouch {marker}\nsleep 30\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "hosted-style.json").write_text(
                json.dumps(
                    {
                        "id": "hosted-style",
                        "name": "Hosted Style App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {"HOME": str(steam_home), "STEAM_APP_ID": "123"},
                        "startup_timeout": 5,
                        "health_check": {"type": "process"},
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            launch = host.launch("hosted-style")

            self.assertFalse(marker.exists())
            self.assertEqual(launch["status"]["state"], "failed")
            self.assertEqual(launch["status"]["progress"]["phase"], "blocked")
            self.assertTrue(launch["status"]["diagnostics"]["adminMaintenanceRequired"])
            self.assertFalse(launch["status"]["diagnostics"]["startupTimedOut"])
            self.assertNotRegex(json.dumps(launch["status"]), r"Steam|steam|STEAM")
            private_status = host.status("hosted-style", private_diagnostics=True)
            self.assertTrue(private_status["diagnostics"]["adminAuthRequired"])
            self.assertEqual(
                private_status["diagnostics"]["startupFailure"],
                "host maintenance required before application launch",
            )

    def test_steam_manifest_with_private_credentials_still_requires_remembered_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            steam_home = root / "steam-home"
            credential_env = root / "hosted-apps.env"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()
            steam_home.mkdir()
            credential_env.write_text(
                "\n".join(
                    [
                        "WTFOS_APPHOST_STEAM_ADMIN_LOGIN=1",
                        "WTFOS_APPHOST_STEAM_USERNAME=apphost",
                        "WTFOS_APPHOST_STEAM_PASSWORD=secret",
                    ]
                ),
                encoding="utf-8",
            )

            marker = state / "spawned"
            executable = bin_dir / "hosted-launcher"
            executable.write_text(f"#!/usr/bin/env sh\ntouch {marker}\nsleep 30\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "hosted-style.json").write_text(
                json.dumps(
                    {
                        "id": "hosted-style",
                        "name": "Hosted Style App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {"HOME": str(steam_home), "STEAM_APP_ID": "123"},
                        "startup_timeout": 2,
                        "health_check": {"type": "process"},
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            previous = os.environ.get("WTFOS_APPHOST_CREDENTIAL_ENV_FILE")
            os.environ["WTFOS_APPHOST_CREDENTIAL_ENV_FILE"] = str(credential_env)
            try:
                host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
                launch = host.launch("hosted-style")
            finally:
                if previous is None:
                    os.environ.pop("WTFOS_APPHOST_CREDENTIAL_ENV_FILE", None)
                else:
                    os.environ["WTFOS_APPHOST_CREDENTIAL_ENV_FILE"] = previous

            self.assertFalse(marker.exists())
            self.assertEqual(launch["status"]["state"], "failed")
            self.assertEqual(launch["status"]["progress"]["phase"], "blocked")
            self.assertNotRegex(json.dumps(launch["status"]), r"Steam|steam|STEAM|secret")
            private_status = host.status("hosted-style", private_diagnostics=True)
            self.assertTrue(private_status["diagnostics"]["adminAuthRequired"])
            self.assertTrue(private_status["diagnostics"]["deliveryAuth"]["storedCredentialsConfigured"])

    def test_normal_steam_launch_wrapper_never_reads_private_credentials(self):
        launch_source = (Path(__file__).resolve().parents[1] / "bin" / "steam-launch.sh").read_text(encoding="utf-8")

        self.assertNotIn("source \"$STEAM_ENV_FILE\"", launch_source)
        self.assertNotIn("WTFOS_APPHOST_STEAM_PASSWORD", launch_source)
        self.assertNotIn("-login", launch_source)

    def test_steam_login_window_failure_reports_admin_auth_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            steam_home = root / "steam-home"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()
            (steam_home / ".local/share/Steam/config").mkdir(parents=True)
            (steam_home / ".local/share/Steam/logs").mkdir(parents=True)

            (steam_home / ".local/share/Steam/config/loginusers.vdf").write_text(
                '"users" { "76561190000000000" { "AccountName" "apphost" '
                '"RememberPassword" "1" "AllowAutoLogin" "1" } }',
                encoding="utf-8",
            )
            (steam_home / ".local/share/Steam/logs/webhelper.txt").write_text(
                "[2026-07-05 01:49:39] Startup - webhelper launched pid: 123 "
                "commandline: ./steamwebhelper -steamid=0\n"
                "[2026-07-05 01:49:41] SP DesktopLoginWindow_uid0: Created window\n",
                encoding="utf-8",
            )

            executable = bin_dir / "hosted-launcher"
            executable.write_text("#!/usr/bin/env sh\nexit 0\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "hosted-style.json").write_text(
                json.dumps(
                    {
                        "id": "hosted-style",
                        "name": "Hosted Style App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {"HOME": str(steam_home), "STEAM_APP_ID": "123"},
                        "startup_timeout": 5,
                        "health_check": {
                            "type": "process_name",
                            "pattern": "FakeGame",
                            "launcher_exit_grace": 0.1,
                        },
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            launch = host.launch("hosted-style")

            self.assertEqual(launch["status"]["state"], "failed")
            self.assertEqual(launch["status"]["progress"]["phase"], "blocked")
            self.assertTrue(launch["status"]["diagnostics"]["adminMaintenanceRequired"])
            self.assertFalse(launch["status"]["diagnostics"]["startupTimedOut"])
            self.assertNotRegex(json.dumps(launch["status"]), r"Steam|steam|STEAM")
            private_status = host.status("hosted-style", private_diagnostics=True)
            self.assertTrue(private_status["diagnostics"]["adminAuthRequired"])
            self.assertTrue(private_status["diagnostics"]["deliveryAuth"]["recentProviderLoginWindow"])

    def test_stop_terminates_process_name_health_targets_without_process_group(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "launcher"
            executable.write_text("#!/usr/bin/env sh\nexit 0\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "steam-style.json").write_text(
                json.dumps(
                    {
                        "id": "steam-style",
                        "name": "Steam Style App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "health_check": {"type": "process_name", "pattern": "FakeGame"},
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            live_pids = [12345]
            host._process_name_pids = lambda check: list(live_pids)  # type: ignore[method-assign]
            calls = []

            def terminate(pid, *, process_group):
                calls.append((pid, process_group))
                live_pids.clear()
                return 0

            host._terminate_pid = terminate  # type: ignore[method-assign]

            stopped = host.stop("steam-style")

            self.assertEqual(stopped["status"]["state"], "stopped")
            self.assertEqual(calls, [(12345, False)])

    def test_keep_launcher_warm_stop_spares_launcher_and_status_follows_game(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "launcher"
            executable.write_text("#!/usr/bin/env sh\nsleep 30\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "steam-style.json").write_text(
                json.dumps(
                    {
                        "id": "steam-style",
                        "name": "Steam Style",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "lifecycle": {"keep_launcher_warm": True},
                        "health_check": {"type": "process_name", "pattern": "FakeGame"},
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            live_pids = [12345]
            host._process_name_pids = lambda check: list(live_pids)  # type: ignore[method-assign]
            calls = []

            def terminate(pid, *, process_group):
                calls.append((pid, process_group))
                live_pids.clear()
                return 0

            host._terminate_pid = terminate  # type: ignore[method-assign]

            launch = host.launch("steam-style")
            self.assertEqual(launch["status"]["state"], "running")

            stopped = host.stop("steam-style")
            self.assertEqual(stopped["status"]["state"], "stopped")
            # Only the game (health target) is terminated; the warm launcher pid is spared.
            self.assertEqual(calls, [(12345, False)])

            # With the game gone but the launcher pid alive, status must not report running.
            status = host.status("steam-style")
            self.assertEqual(status["state"], "stopped")

            host._terminate_pid = lambda pid, *, process_group: 0  # type: ignore[method-assign]
            host.stop("steam-style")

    def test_keep_launcher_warm_status_holds_running_through_boot_grace_flap(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state_dir = root / "state"
            manifests.mkdir()
            state_dir.mkdir()

            (manifests / "steam-style.json").write_text(
                json.dumps(
                    {
                        "id": "steam-style",
                        "name": "Steam Style",
                        "executable": "/bin/true",
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "lifecycle": {"keep_launcher_warm": True},
                        "health_check": {
                            "type": "process_name",
                            "pattern": "FakeGame",
                            "launcher_exit_grace": 90,
                        },
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state_dir))
            # Health flaps empty right after launch (reaper matched, game still booting).
            host._process_name_pids = lambda check: []  # type: ignore[method-assign]
            host._write_state(
                "steam-style",
                {
                    "state": "running",
                    "pid": None,
                    "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "stoppedAt": None,
                    "exitCode": None,
                    "diagnostics": {"startupConfirmed": True},
                },
            )

            status = host.status("steam-style")
            self.assertEqual(status["state"], "running")

            # Outside the boot grace the same empty health means the game exited.
            host._invalidate_health_cache("steam-style")
            stale = host._read_state("steam-style")
            stale["startedAt"] = "2020-01-01T00:00:00Z"
            host._write_state("steam-style", stale)
            status = host.status("steam-style")
            self.assertEqual(status["state"], "exited")

    def test_process_name_launch_timeout_returns_structured_status_without_mesa_relaunch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "launcher"
            executable.write_text("#!/usr/bin/env sh\nexit 0\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "steam-style.json").write_text(
                json.dumps(
                    {
                        "id": "steam-style",
                        "name": "Steam Style App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 1,
                        "health_check": {"type": "process_name", "pattern": "FakeGame"},
                        "display_required": True,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            def probe(kind, env):
                return ProbeResult(ok=True, output=f"{kind} ok", error="")

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state), probe=probe)

            launch = host.launch("steam-style")

            self.assertTrue(launch["ok"])
            self.assertEqual(launch["status"]["appId"], "steam-style")
            self.assertEqual(launch["status"]["state"], "failed")
            self.assertEqual(launch["status"]["progress"]["phase"], "failed")
            self.assertEqual(launch["status"]["progress"]["label"], "Could not open application")
            self.assertNotRegex(json.dumps(launch["status"]["progress"]), r"Steam|steam")
            self.assertEqual(launch["status"]["health"]["type"], "process_name")
            private_status = host.status("steam-style", private_diagnostics=True)
            self.assertFalse(private_status["diagnostics"]["mesaSoftwareFallback"])
            self.assertNotIn("mesaRelaunchAfterEarlyExit", private_status["diagnostics"])
            self.assertFalse(private_status["diagnostics"]["startupConfirmed"])
            self.assertTrue(private_status["diagnostics"]["startupTimedOut"])
            self.assertEqual(
                private_status["diagnostics"]["startupFailure"],
                "health check did not become healthy before startup timeout",
            )
            self.assertEqual(
                private_status["diagnostics"]["lastStartupAttempt"]["healthCheckType"],
                "process_name",
            )
            self.assertIn("desktopEvidence", private_status["diagnostics"]["lastStartupAttempt"])

    def test_process_name_status_recovers_late_healthy_startup_timeout(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "launcher"
            executable.write_text("#!/usr/bin/env sh\nexit 0\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "steam-style.json").write_text(
                json.dumps(
                    {
                        "id": "steam-style",
                        "name": "Steam Style App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 1,
                        "health_check": {"type": "process_name", "pattern": "FakeGame"},
                        "display_required": False,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            host._process_name_pids = lambda check: [12345]  # type: ignore[method-assign]
            host._write_state(
                "steam-style",
                {
                    "state": "stopped",
                    "pid": None,
                    "startedAt": "2026-06-29T20:00:00Z",
                    "stoppedAt": "2026-06-29T20:01:00Z",
                    "exitCode": None,
                    "diagnostics": {
                        "startupConfirmed": False,
                        "startupTimedOut": True,
                        "startupFailure": "health check did not become healthy before startup timeout",
                    },
                },
            )

            status = host.status("steam-style", private_diagnostics=True)

            self.assertEqual(status["state"], "running")
            self.assertIsNone(status["stoppedAt"])
            self.assertTrue(status["diagnostics"]["startupConfirmed"])
            self.assertFalse(status["diagnostics"]["startupTimedOut"])
            self.assertTrue(status["diagnostics"]["startupRecoveredAfterTimeout"])
            self.assertEqual(status["diagnostics"]["startupRecoveredHealth"]["pids"], [12345])
            self.assertEqual(status["progress"]["phase"], "ready")
            self.assertNotIn("startupFailure", status["diagnostics"])

    def test_display_preflight_retries_with_mesa_software_rendering(self):
        calls = []

        def probe(kind, env):
            calls.append((kind, dict(env)))
            if kind == "opengl" and len([call for call in calls if call[0] == "opengl"]) == 1:
                return ProbeResult(ok=False, output="", error="no GLX context")
            return ProbeResult(ok=True, output=f"{kind} ok", error="")

        env, diagnostics = prepare_launch_environment(
            {
                "id": "demo",
                "environment": {},
                "display_required": True,
                "audio_required": False,
            },
            {"DISPLAY": ":99"},
            probe,
        )

        self.assertEqual(env["LIBGL_ALWAYS_SOFTWARE"], "1")
        self.assertEqual(env["GALLIUM_DRIVER"], "llvmpipe")
        self.assertEqual(env["MESA_LOADER_DRIVER_OVERRIDE"], "llvmpipe")
        self.assertTrue(diagnostics["mesaSoftwareFallback"])
        self.assertEqual([call[0] for call in calls], ["display", "opengl", "opengl"])
        self.assertNotIn("LIBGL_ALWAYS_SOFTWARE", calls[1][1])
        self.assertEqual(calls[2][1]["LIBGL_ALWAYS_SOFTWARE"], "1")

    def test_unix_socket_server_serves_health_endpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            manifests.mkdir()
            state.mkdir()
            socket_path = root / "apphost.sock"

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            server = build_unix_server(host, socket_path, 0o600)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                    client.connect(str(socket_path))
                    client.sendall(b"GET /health HTTP/1.1\r\nHost: apphost\r\nConnection: close\r\n\r\n")
                    chunks = []
                    while True:
                        chunk = client.recv(4096)
                        if not chunk:
                            break
                        chunks.append(chunk)
                response = b"".join(chunks).decode("utf-8", errors="replace")
                self.assertIn("HTTP/1.0 200 OK", response)
                self.assertIn('"service": "wtfos-apphost"', response)
                self.assertEqual(stat.S_IMODE(socket_path.stat().st_mode), 0o600)
            finally:
                server.shutdown()
                server.server_close()

    def test_session_descriptor_is_generic_remote_app_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "creative-app"
            executable.write_text("#!/usr/bin/env sh\nsleep 30\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "creative-app.json").write_text(
                json.dumps(
                    {
                        "id": "creative-app",
                        "name": "Creative App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "health_check": {"type": "process"},
                        "display_required": True,
                        "audio_required": True,
                        "runtime": {
                            "display": {"width": 1600, "height": 900},
                            "input": {"pointer": True, "keyboard": True, "clipboard": True},
                            "storage": {"workspace_required": True, "export_paths": ["exports"]},
                        },
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))

            session = host.session_descriptor("creative-app")

            self.assertEqual(session["app"]["id"], "creative-app")
            self.assertEqual(session["session"]["appId"], "creative-app")
            self.assertEqual(session["session"]["display"]["width"], 1600)
            self.assertEqual(session["session"]["display"]["height"], 900)
            self.assertEqual(session["session"]["stream"]["preferredTransport"], "webrtc")
            self.assertIn("snapshot", session["session"]["stream"]["fallbackTransports"])
            self.assertTrue(session["session"]["input"]["pointer"])
            self.assertTrue(session["session"]["input"]["keyboard"])
            self.assertTrue(session["session"]["input"]["clipboard"])
            self.assertTrue(session["session"]["storage"]["workspaceRequired"])

    def test_input_event_requires_running_app_and_normalizes_coordinates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "demo-app"
            executable.write_text("#!/usr/bin/env sh\nsleep 30\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "demo-app.json").write_text(
                json.dumps(
                    {
                        "id": "demo-app",
                        "name": "Demo App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "health_check": {"type": "process"},
                        "display_required": True,
                        "audio_required": False,
                        "runtime": {"display": {"width": 1280, "height": 720}},
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            injected = []
            host._inject_input_event = lambda event: injected.append(event) or {"ok": True}  # type: ignore[method-assign]

            with self.assertRaises(AppHostInputError):
                host.input_event("demo-app", {"type": "pointer", "action": "click", "x": 0.25, "y": 0.5})

            host.launch("demo-app")
            result = host.input_event("demo-app", {"type": "pointer", "action": "click", "x": 0.25, "y": 0.5})

            self.assertTrue(result["ok"])
            self.assertEqual(injected[0]["type"], "pointer")
            self.assertEqual(injected[0]["action"], "click")
            self.assertEqual(injected[0]["x"], 320)
            self.assertEqual(injected[0]["y"], 360)
            host.stop("demo-app")

    def test_snapshot_payload_contains_browser_safe_image_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "demo-app"
            executable.write_text("#!/usr/bin/env sh\nsleep 30\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            (manifests / "demo-app.json").write_text(
                json.dumps(
                    {
                        "id": "demo-app",
                        "name": "Demo App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "health_check": {"type": "process"},
                        "display_required": True,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(AppHostConfig(manifest_dir=manifests, state_dir=state))
            host._capture_snapshot_image = lambda app_id: ("image/jpeg", b"\xff\xd8frame")  # type: ignore[method-assign]
            host.launch("demo-app")

            snapshot = host.snapshot("demo-app")

            self.assertTrue(snapshot["ok"])
            self.assertEqual(snapshot["appId"], "demo-app")
            self.assertEqual(snapshot["contentType"], "image/jpeg")
            self.assertTrue(snapshot["dataUrl"].startswith("data:image/jpeg;base64,"))
            host.stop("demo-app")

    def test_webrtc_stream_offer_starts_managed_streamer_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "demo-app"
            executable.write_text("#!/usr/bin/env sh\nsleep 30\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            streamer = bin_dir / "fake-webrtc-streamer.py"
            streamer.write_text(
                "#!/usr/bin/env python3\n"
                "import argparse, json, time\n"
                "parser = argparse.ArgumentParser()\n"
                "parser.add_argument('--offer', required=True)\n"
                "parser.add_argument('--answer', required=True)\n"
                "parser.add_argument('--display', required=True)\n"
                "parser.add_argument('--pulse-server', required=True)\n"
                "parser.add_argument('--width', required=True)\n"
                "parser.add_argument('--height', required=True)\n"
                "parser.add_argument('--framerate', required=True)\n"
                "parser.add_argument('--stream-id', required=True)\n"
                "args = parser.parse_args()\n"
                "offer = json.load(open(args.offer, encoding='utf-8'))\n"
                "json.dump({\n"
                "  'ok': True,\n"
                "  'streamId': args.stream_id,\n"
                "  'answer': {'type': 'answer', 'sdp': 'v=0\\\\r\\\\n'},\n"
                "  'candidates': [],\n"
                "  'receivedOfferType': offer['offer']['type'],\n"
                "  'display': args.display,\n"
                "  'pulseServer': args.pulse_server,\n"
                "  'video': {'width': int(args.width), 'height': int(args.height)},\n"
                "}, open(args.answer, 'w', encoding='utf-8'))\n"
                "time.sleep(30)\n",
                encoding="utf-8",
            )
            streamer.chmod(streamer.stat().st_mode | stat.S_IXUSR)

            (manifests / "demo-app.json").write_text(
                json.dumps(
                    {
                        "id": "demo-app",
                        "name": "Demo App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "health_check": {"type": "process"},
                        "display_required": True,
                        "audio_required": True,
                        "runtime": {"display": {"width": 1024, "height": 768}},
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(
                AppHostConfig(
                    manifest_dir=manifests,
                    state_dir=state,
                    display=":55",
                    pulse_server="unix:/tmp/pulse/native",
                    webrtc_streamer=streamer,
                )
            )
            host.launch("demo-app")

            offered = host.stream_offer(
                "demo-app",
                {
                    "streamId": "stream-test-1",
                    "offer": {"type": "offer", "sdp": "v=0\r\n"},
                },
            )

            self.assertTrue(offered["ok"])
            self.assertEqual(offered["streamId"], "stream-test-1")
            self.assertEqual(offered["answer"]["type"], "answer")
            self.assertEqual(offered["receivedOfferType"], "offer")
            self.assertEqual(offered["display"], ":55")
            self.assertEqual(offered["pulseServer"], "unix:/tmp/pulse/native")
            self.assertEqual(offered["video"], {"width": 960, "height": 720})
            self.assertTrue(host.stream_status("demo-app", "stream-test-1")["active"])
            self.assertTrue(host.stream_stop("demo-app", "stream-test-1")["stopped"])
            host.stop("demo-app")

    def test_webrtc_stream_offer_timeout_reaps_streamer_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifests = root / "manifests"
            state = root / "state"
            bin_dir = root / "bin"
            manifests.mkdir()
            state.mkdir()
            bin_dir.mkdir()

            executable = bin_dir / "demo-app"
            executable.write_text("#!/usr/bin/env sh\nsleep 30\n", encoding="utf-8")
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            streamer = bin_dir / "hanging-webrtc-streamer.py"
            streamer.write_text(
                "#!/usr/bin/env python3\n"
                "import argparse, time\n"
                "parser = argparse.ArgumentParser()\n"
                "parser.add_argument('--offer', required=True)\n"
                "parser.add_argument('--answer', required=True)\n"
                "parser.add_argument('--display', required=True)\n"
                "parser.add_argument('--pulse-server', required=True)\n"
                "parser.add_argument('--width', required=True)\n"
                "parser.add_argument('--height', required=True)\n"
                "parser.add_argument('--framerate', required=True)\n"
                "parser.add_argument('--stream-id', required=True)\n"
                "parser.parse_args()\n"
                "time.sleep(30)\n",
                encoding="utf-8",
            )
            streamer.chmod(streamer.stat().st_mode | stat.S_IXUSR)

            (manifests / "demo-app.json").write_text(
                json.dumps(
                    {
                        "id": "demo-app",
                        "name": "Demo App",
                        "executable": str(executable),
                        "working_directory": str(root),
                        "environment": {},
                        "startup_timeout": 2,
                        "health_check": {"type": "process"},
                        "display_required": True,
                        "audio_required": False,
                    }
                ),
                encoding="utf-8",
            )

            host = ApplicationHost(
                AppHostConfig(manifest_dir=manifests, state_dir=state, webrtc_streamer=streamer)
            )
            host.launch("demo-app")

            with self.assertRaises(AppHostStreamError) as raised:
                host.stream_offer(
                    "demo-app",
                    {
                        "streamId": "stream-timeout",
                        "offer": {"type": "offer", "sdp": "v=0\r\n"},
                        "timeoutSeconds": 1,
                    },
                )

            self.assertEqual(raised.exception.status.value, 504)
            self.assertFalse(host.stream_status("demo-app", "stream-timeout")["active"])
            host.stop("demo-app")


if __name__ == "__main__":
    unittest.main()
