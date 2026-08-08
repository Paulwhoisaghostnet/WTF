#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 5 ]; then
  echo "usage: $0 <app-key> <dmg-path> <zip-path> <app-bundle-name> <executable-name>" >&2
  exit 2
fi

app_key="$1"
dmg_path="$2"
zip_path="$3"
app_bundle_name="$4"
executable_name="$5"
smoke_root="${RUNNER_TEMP:?RUNNER_TEMP is required}/pasta-${app_key}-artifact-smoke"
zip_root="$smoke_root/zip"
dmg_mount="$smoke_root/dmg-mount"
dmg_install_root="$smoke_root/dmg-installed"
dmg_attached=0

cleanup() {
  if [ "$dmg_attached" -eq 1 ]; then
    hdiutil detach "$dmg_mount" >/dev/null
  fi
  rm -rf "$smoke_root"
}

trap cleanup EXIT

run_artifact_smoke() {
  local format="$1"
  local executable_path="$2"
  local result_path="${PASTA_DESKTOP_RESULT_PATH:-}"
  local screenshot_path="${PASTA_DESKTOP_SCREENSHOT:-}"

  if [ -n "${PASTA_DESKTOP_SMOKE_EVIDENCE_DIR:-}" ]; then
    mkdir -p "$PASTA_DESKTOP_SMOKE_EVIDENCE_DIR"
    result_path="$PASTA_DESKTOP_SMOKE_EVIDENCE_DIR/${app_key}-${format}-smoke.json"
    screenshot_path="$PASTA_DESKTOP_SMOKE_EVIDENCE_DIR/${app_key}-${format}-first-run.png"
  fi

  PASTA_DESKTOP_APP="$app_key" \
  PASTA_DESKTOP_EXECUTABLE="$executable_path" \
  PASTA_DESKTOP_EXPECTED_TARGET="darwin/universal/dmg+zip" \
  PASTA_DESKTOP_EXPECTED_GIT_SHA="${GITHUB_SHA:?GITHUB_SHA is required for artifact provenance verification}" \
  PASTA_DESKTOP_RESULT_PATH="$result_path" \
  PASTA_DESKTOP_SCREENSHOT="$screenshot_path" \
  npm run pasta:desktop:artifact-smoke
}

test -f "$dmg_path"
test -f "$zip_path"
rm -rf "$smoke_root"
mkdir -p "$zip_root" "$dmg_mount" "$dmg_install_root"
ditto -x -k "$zip_path" "$zip_root"

zip_executable_path="$zip_root/$app_bundle_name/Contents/MacOS/$executable_name"
test -x "$zip_executable_path"

printf 'Y\n' | hdiutil attach -nobrowse -readonly -mountpoint "$dmg_mount" "$dmg_path" >/dev/null
dmg_attached=1
test -d "$dmg_mount/$app_bundle_name"
ditto "$dmg_mount/$app_bundle_name" "$dmg_install_root/$app_bundle_name"
hdiutil detach "$dmg_mount" >/dev/null
dmg_attached=0

dmg_executable_path="$dmg_install_root/$app_bundle_name/Contents/MacOS/$executable_name"
test -x "$dmg_executable_path"

run_artifact_smoke "zip" "$zip_executable_path"
run_artifact_smoke "dmg" "$dmg_executable_path"
