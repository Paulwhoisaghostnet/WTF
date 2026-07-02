#!/usr/bin/env bash
set -euo pipefail

APPHOST_URL="${WTFOS_APPHOST_URL:-http://127.0.0.1:8765}"
OUT_DIR="${WTFOS_APPHOST_DIAGNOSTICS_DIR:-/opt/wtfos/apphost/state/diagnostics/$(date -u +%Y%m%dT%H%M%SZ)}"
APPHOST_USER="${WTFOS_APPHOST_USER:-wtfos-apphost}"
APPHOST_HOME="${WTFOS_APPHOST_HOME:-/opt/wtfos/apphost/home}"
DISPLAY="${DISPLAY:-:99}"
XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/opt/wtfos/apphost/run/user}"
PULSE_SERVER="${PULSE_SERVER:-unix:/opt/wtfos/apphost/run/pulse/native}"
export DISPLAY XDG_RUNTIME_DIR PULSE_SERVER

mkdir -p "$OUT_DIR"
if [[ "$(id -u)" -eq 0 ]] && id "$APPHOST_USER" >/dev/null 2>&1; then
  chown "$APPHOST_USER:$APPHOST_USER" "$OUT_DIR"
fi
failures_file="$OUT_DIR/failures.txt"
: > "$failures_file"

record_failure() {
  local app_id="$1"
  local message="$2"
  printf '%s: %s\n' "$app_id" "$message" | tee -a "$failures_file" >&2
}

stop_app() {
  local app_id="$1"
  local app_dir="$2"
  curl -fsS -X POST "$APPHOST_URL/apps/$app_id/stop" \
    >"$app_dir/stop.json" 2>"$app_dir/stop.err" || \
    record_failure "$app_id" "stop request failed"
}

as_apphost() {
  if [[ "$(id -u)" -eq 0 ]] && id "$APPHOST_USER" >/dev/null 2>&1; then
    sudo -u "$APPHOST_USER" env \
      HOME="$APPHOST_HOME" \
      XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
      DISPLAY="$DISPLAY" \
      PULSE_SERVER="$PULSE_SERVER" \
      "$@"
  else
    env \
      HOME="${HOME:-$APPHOST_HOME}" \
      XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
      DISPLAY="$DISPLAY" \
      PULSE_SERVER="$PULSE_SERVER" \
      "$@"
  fi
}

curl -fsS "$APPHOST_URL/apps" | tee "$OUT_DIR/apps.json" >/dev/null
python3 - "$OUT_DIR/apps.json" > "$OUT_DIR/app-ids.txt" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
for app in payload.get("apps", []):
    print(app["id"])
PY

while IFS= read -r app_id; do
  [[ -n "$app_id" ]] || continue
  echo "== validating $app_id =="
  app_dir="$OUT_DIR/$app_id"
  mkdir -p "$app_dir"
  if [[ "$(id -u)" -eq 0 ]] && id "$APPHOST_USER" >/dev/null 2>&1; then
    chown "$APPHOST_USER:$APPHOST_USER" "$app_dir"
  fi
  launched=0

  if ! curl -fsS -X POST "$APPHOST_URL/apps/$app_id/launch" | tee "$app_dir/launch.json" >/dev/null; then
    record_failure "$app_id" "launch request failed"
    continue
  fi
  launched=1
  sleep "${WTFOS_APPHOST_VALIDATE_SETTLE_SECONDS:-8}"
  if ! curl -fsS "$APPHOST_URL/apps/$app_id/status" | tee "$app_dir/status.json" >/dev/null; then
    record_failure "$app_id" "status request failed after launch"
    stop_app "$app_id" "$app_dir"
    continue
  fi

  if ! as_apphost glxinfo -B >"$app_dir/glxinfo.txt" 2>"$app_dir/glxinfo.err"; then
    if ! as_apphost env LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe MESA_LOADER_DRIVER_OVERRIDE=llvmpipe \
      glxinfo -B >"$app_dir/glxinfo-llvmpipe.txt" 2>"$app_dir/glxinfo-llvmpipe.err"; then
      record_failure "$app_id" "OpenGL did not initialize, including Mesa llvmpipe fallback"
    fi
  fi

  if ! as_apphost pactl info >"$app_dir/pulse-info.txt" 2>"$app_dir/pulse-info.err"; then
    record_failure "$app_id" "audio did not initialize"
  fi
  if ! as_apphost scrot "$app_dir/screenshot.png" 2>"$app_dir/screenshot.err"; then
    record_failure "$app_id" "screenshot capture failed"
  elif [[ ! -s "$app_dir/screenshot.png" ]]; then
    record_failure "$app_id" "screenshot capture produced an empty file"
  fi

  if ! python3 - "$app_dir/status.json" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
status = payload.get("status", {})
if status.get("state") != "running":
    raise SystemExit(f"application is not running: {status}")
PY
  then
    record_failure "$app_id" "application is not running after validation settle window"
  fi
  if [[ "$launched" == "1" ]]; then
    stop_app "$app_id" "$app_dir"
  fi
done < "$OUT_DIR/app-ids.txt"

echo "Diagnostics written to $OUT_DIR"
if [[ -s "$failures_file" ]]; then
  echo "Validation failures:" >&2
  cat "$failures_file" >&2
  exit 1
fi
