#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${WTFOS_APPHOST_DIR:-/opt/wtfos/apphost}"
APPHOST_USER="${WTFOS_APPHOST_USER:-wtfos-apphost}"
INSTALL_SUNSHINE=0
INSTALL_VNC=0

for arg in "$@"; do
  case "$arg" in
    --with-sunshine) INSTALL_SUNSHINE=1 ;;
    --with-vnc) INSTALL_VNC=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 64
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the Hetzner host." >&2
  exit 77
fi

if ! id "$APPHOST_USER" >/dev/null 2>&1; then
  useradd --system --home "$TARGET_DIR/home" --shell /usr/sbin/nologin "$APPHOST_USER"
fi

install -d -m 0750 -o "$APPHOST_USER" -g "$APPHOST_USER" "$TARGET_DIR"
install -d -m 0750 -o "$APPHOST_USER" -g "$APPHOST_USER" \
  "$TARGET_DIR/bin" "$TARGET_DIR/config" "$TARGET_DIR/manifests" "$TARGET_DIR/scripts" "$TARGET_DIR/docs" \
  "$TARGET_DIR/state" "$TARGET_DIR/state/logs" "$TARGET_DIR/run" "$TARGET_DIR/run/user" \
  "$TARGET_DIR/home"

install -m 0755 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/apphostd.py" "$TARGET_DIR/apphostd.py"
install -m 0755 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/bin/"*.sh "$TARGET_DIR/bin/"
if compgen -G "$ROOT_DIR/bin/*.py" >/dev/null; then
  install -m 0755 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/bin/"*.py "$TARGET_DIR/bin/"
fi
if compgen -G "$ROOT_DIR/config/*.env" >/dev/null; then
  install -m 0640 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/config/"*.env "$TARGET_DIR/config/"
fi
install -m 0644 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/manifests/"*.json "$TARGET_DIR/manifests/"
install -m 0755 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/scripts/"*.sh "$TARGET_DIR/scripts/"
if compgen -G "$ROOT_DIR/docs/*.md" >/dev/null; then
  install -m 0644 -o "$APPHOST_USER" -g "$APPHOST_USER" "$ROOT_DIR/docs/"*.md "$TARGET_DIR/docs/"
fi

dpkg --add-architecture i386
apt-get update

steamcmd_status="$(dpkg-query -W -f='${db:Status-Abbrev}' steamcmd:i386 2>/dev/null || true)"
if [[ -n "$steamcmd_status" && "$steamcmd_status" != "ii " ]]; then
  echo "Removing partial steamcmd package state from a previous install attempt."
  if ! DEBIAN_FRONTEND=noninteractive apt-get purge -y steamcmd steamcmd:i386; then
    dpkg --remove --force-remove-reinstreq steamcmd:i386 || true
    DEBIAN_FRONTEND=noninteractive apt-get -f install -y
  fi
fi

DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  dbus-x11 \
  gir1.2-gst-plugins-bad-1.0 \
  gir1.2-gst-plugins-base-1.0 \
  gir1.2-gstreamer-1.0 \
  gstreamer1.0-libav \
  gstreamer1.0-nice \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-pulseaudio \
  gstreamer1.0-tools \
  gstreamer1.0-x \
  libasound2-plugins \
  libasound2-plugins:i386 \
  libegl1 \
  libegl1:i386 \
  libgl1 \
  libgl1:i386 \
  libgl1-mesa-dri \
  libgl1-mesa-dri:i386 \
  libglx-mesa0 \
  libglx-mesa0:i386 \
  libpulse0 \
  libpulse0:i386 \
  libvulkan1 \
  libvulkan1:i386 \
  libxcb-xkb1:i386 \
  libxkbcommon-x11-0:i386 \
  mesa-utils \
  mesa-vulkan-drivers \
  mesa-vulkan-drivers:i386 \
  openbox \
  pulseaudio \
  python3 \
  python3-gi \
  python3-xlib \
  scrot \
  x11-utils \
  xauth \
  xdotool \
  xvfb

if ! command -v steam >/dev/null 2>&1; then
  tmp_deb="$(mktemp /tmp/steam-installer.XXXXXX.deb)"
  curl -fsSL "https://cdn.cloudflare.steamstatic.com/client/installer/steam.deb" -o "$tmp_deb"
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$tmp_deb"
  rm -f "$tmp_deb"
fi

if apt-cache show steam-libs-amd64 >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    steam-libs-amd64 \
    steam-libs-i386
fi

if [[ "$INSTALL_SUNSHINE" == "1" ]]; then
  if [[ -z "${SUNSHINE_DEB_URL:-}" ]]; then
    echo "Set SUNSHINE_DEB_URL to a pinned Sunshine .deb URL, then rerun with --with-sunshine." >&2
    exit 78
  fi
  tmp_sunshine="$(mktemp /tmp/sunshine.XXXXXX.deb)"
  curl -fsSL "$SUNSHINE_DEB_URL" -o "$tmp_sunshine"
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$tmp_sunshine"
  rm -f "$tmp_sunshine"
fi

if [[ "$INSTALL_VNC" == "1" ]]; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends x11vnc
  rm -f "$TARGET_DIR/run/vnc.pass"
fi

install -m 0644 "$ROOT_DIR/systemd/"*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now \
  wtfos-apphost-xvfb.service \
  wtfos-apphost-pulse.service \
  wtfos-apphost-wm.service \
  wtfos-apphost.service

if [[ "$INSTALL_VNC" == "1" ]]; then
  systemctl enable --now wtfos-apphost-vnc.service
fi

systemctl --no-pager --full status wtfos-apphost.service
echo "Application host installed at $TARGET_DIR and listening on http://127.0.0.1:8765"
