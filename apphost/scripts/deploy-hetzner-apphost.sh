#!/usr/bin/env bash
set -euo pipefail

APPHOST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APPHOST_DIR/.." && pwd)"
SSH_WRAPPER="${WTFOS_SSH_WRAPPER:-$REPO_ROOT/scripts/wtf-ssh.sh}"
REMOTE_STAGING="${WTFOS_APPHOST_REMOTE_STAGING:-/tmp/wtfos-apphost-deploy}"
TARGET_DIR="${WTFOS_APPHOST_DIR:-/opt/wtfos/apphost}"
APPHOST_USER="${WTFOS_APPHOST_USER:-wtfos-apphost}"
INSTALL=0
APPLY=0
INSTALL_SUNSHINE=0
INSTALL_VNC=0
RUN_VALIDATE=0

usage() {
  cat <<'EOF'
Usage:
  apphost/scripts/deploy-hetzner-apphost.sh [--install|--apply] [--with-sunshine] [--with-vnc] [--validate]

Uploads only the apphost bundle to the configured wtf SSH host using
scripts/wtf-ssh.sh. The script does not modify the remote host unless --install
is provided.

Options:
  --install        Run the isolated /opt/wtfos/apphost installer after upload.
  --apply          Apply code/manifests/docs/systemd updates only. This preserves
                   Steam home, state, run directories, existing containers, and
                   databases. Requires a prior --install.
  --with-sunshine  Pass --with-sunshine to the installer. Requires SUNSHINE_DEB_URL.
  --with-vnc       Pass --with-vnc to the installer. The VNC bridge binds to
                   remote loopback only and is intended for Steam
                   login/diagnostics through an SSH tunnel.
  --validate       Run validate-apps.sh on the remote host. Requires apps to be
                   installed and the Steam account to have completed manual login.
EOF
}

quote_remote() {
  printf "%q" "$1"
}

for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --apply) APPLY=1 ;;
    --with-sunshine) INSTALL_SUNSHINE=1 ;;
    --with-vnc) INSTALL_VNC=1 ;;
    --validate) RUN_VALIDATE=1 ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [[ ! -x "$SSH_WRAPPER" ]]; then
  echo "SSH wrapper is missing or not executable: $SSH_WRAPPER" >&2
  exit 66
fi

if [[ "$INSTALL_SUNSHINE" == "1" && -z "${SUNSHINE_DEB_URL:-}" ]]; then
  echo "SUNSHINE_DEB_URL is required with --with-sunshine." >&2
  exit 64
fi

if [[ "$INSTALL" == "1" && "$APPLY" == "1" ]]; then
  echo "Use either --install or --apply, not both." >&2
  exit 64
fi

remote_staging_q="$(quote_remote "$REMOTE_STAGING")"
target_dir_q="$(quote_remote "$TARGET_DIR")"
apphost_user_q="$(quote_remote "$APPHOST_USER")"
remote_installer_q="$(quote_remote "$REMOTE_STAGING/apphost/scripts/install-apphost.sh")"
remote_apply_q="$(quote_remote "$REMOTE_STAGING/apphost/scripts/apply-apphost-update.sh")"
remote_validator_q="$(quote_remote "$TARGET_DIR/scripts/validate-apps.sh")"

"$SSH_WRAPPER" --check >/dev/null
"$SSH_WRAPPER" "rm -rf $remote_staging_q && mkdir -p $remote_staging_q"

LC_ALL=C COPYFILE_DISABLE=1 tar \
  --no-xattrs \
  --exclude='._*' \
  --exclude='.DS_Store' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  -C "$REPO_ROOT" \
  -czf - apphost | "$SSH_WRAPPER" "tar -xzf - -C $remote_staging_q"

echo "Uploaded apphost bundle to $REMOTE_STAGING/apphost"

if [[ "$INSTALL" != "1" && "$APPLY" != "1" ]]; then
  echo "Upload complete. Rerun with --install to apply the isolated apphost services."
  if [[ "$RUN_VALIDATE" == "1" ]]; then
    "$SSH_WRAPPER" "sudo bash $remote_validator_q"
  fi
  exit 0
fi

if [[ "$APPLY" == "1" ]]; then
  "$SSH_WRAPPER" "sudo env WTFOS_APPHOST_DIR=$target_dir_q WTFOS_APPHOST_USER=$apphost_user_q bash $remote_apply_q"
  "$SSH_WRAPPER" "curl -fsS http://127.0.0.1:8765/health && printf '\n' && curl -fsS http://127.0.0.1:8765/apps && printf '\n'"
  if [[ "$RUN_VALIDATE" == "1" ]]; then
    "$SSH_WRAPPER" "sudo bash $remote_validator_q"
  fi
  exit 0
fi

install_cmd="sudo env WTFOS_APPHOST_DIR=$target_dir_q WTFOS_APPHOST_USER=$apphost_user_q"
if [[ "$INSTALL_SUNSHINE" == "1" ]]; then
  sunshine_deb_q="$(quote_remote "$SUNSHINE_DEB_URL")"
  install_cmd="$install_cmd SUNSHINE_DEB_URL=$sunshine_deb_q"
fi
install_cmd="$install_cmd bash $remote_installer_q"
if [[ "$INSTALL_SUNSHINE" == "1" ]]; then
  install_cmd="$install_cmd --with-sunshine"
fi
if [[ "$INSTALL_VNC" == "1" ]]; then
  install_cmd="$install_cmd --with-vnc"
fi

"$SSH_WRAPPER" "$install_cmd"
"$SSH_WRAPPER" "curl -fsS http://127.0.0.1:8765/health && printf '\n' && curl -fsS http://127.0.0.1:8765/apps && printf '\n'"

if [[ "$RUN_VALIDATE" == "1" ]]; then
  "$SSH_WRAPPER" "sudo bash $remote_validator_q"
fi
