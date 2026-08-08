#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "usage: $0 <app-key> <deb-path> <deb-package-name> <executable-name>" >&2
  exit 2
fi

app_key="$1"
deb_path="$(realpath "$2")"
expected_package_name="$3"
executable_name="$4"

test -f "$deb_path"
test "$(dpkg --print-architecture)" = "arm64"
test "$(dpkg-deb --field "$deb_path" Architecture)" = "arm64"

package_name="$(dpkg-deb --field "$deb_path" Package)"
if [ "$package_name" != "$expected_package_name" ]; then
  echo "$app_key Debian package name mismatch: expected $expected_package_name, got $package_name" >&2
  exit 1
fi

if dpkg-query --show --showformat='${Status}' "$package_name" 2>/dev/null | grep -qx 'install ok installed'; then
  echo "refusing to replace pre-existing Debian package $package_name" >&2
  exit 1
fi

installed=0
cleanup() {
  if [ "$installed" -eq 1 ]; then
    sudo apt-get purge --yes "$package_name" >/dev/null
  fi
}
trap cleanup EXIT

sudo apt-get update
sudo apt-get install --yes xvfb "$deb_path"
installed=1

desktop_file=""
executable_path=""
while IFS= read -r owned_path; do
  if [ -z "$desktop_file" ] && [[ "$owned_path" == /usr/share/applications/*.desktop ]] && [ -f "$owned_path" ]; then
    desktop_file="$owned_path"
  fi
  if [ -z "$executable_path" ] && [[ "$owned_path" == /opt/* ]] && [ -f "$owned_path" ] && [ -x "$owned_path" ] && [ "$(basename "$owned_path")" = "$executable_name" ]; then
    executable_path="$owned_path"
  fi
done < <(dpkg-query --listfiles "$package_name")

if [ -z "$desktop_file" ]; then
  echo "$app_key did not install a desktop application entry" >&2
  exit 1
fi
if [ -z "$executable_path" ]; then
  echo "$app_key did not install executable $executable_name below /opt" >&2
  exit 1
fi
if ! grep -Fq "$executable_name" "$desktop_file"; then
  echo "$app_key desktop application entry does not reference $executable_name" >&2
  exit 1
fi

PASTA_DESKTOP_APP="$app_key" \
PASTA_DESKTOP_EXECUTABLE="$executable_path" \
PASTA_DESKTOP_EXPECTED_TARGET="linux/arm64/deb" \
PASTA_DESKTOP_EXPECTED_GIT_SHA="${GITHUB_SHA:?GITHUB_SHA is required for artifact provenance verification}" \
xvfb-run --auto-servernum npm run pasta:desktop:artifact-smoke

sudo apt-get purge --yes "$package_name"
installed=0

if dpkg-query --show --showformat='${Status}' "$package_name" 2>/dev/null | grep -qx 'install ok installed'; then
  echo "$app_key Debian package remained installed after purge" >&2
  exit 1
fi
if [ -e "$executable_path" ]; then
  echo "$app_key executable remained after Debian package purge" >&2
  exit 1
fi
