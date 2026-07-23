#!/usr/bin/env bash
# Provision the Hetzner host for running wtf-operator-signer.
# Creates the isolated user/group, the socket dir, the log dir, installs
# the systemd unit, and enables the service. .env + built artifacts are
# SCP'd separately by server-deploy.sh.
set -euo pipefail

if [[ $(id -u) -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

getent group wtf >/dev/null || groupadd --system wtf
id -u wtf-signer >/dev/null 2>&1 || useradd \
  --system --gid wtf --home /nonexistent --shell /usr/sbin/nologin wtf-signer

mkdir -p /opt/wtf-operator-signer /run/wtf /var/log/wtf /var/lib/wtf /etc/wtf/secrets
chown -R wtf-signer:wtf /opt/wtf-operator-signer
chown wtf-signer:wtf /run/wtf /var/log/wtf /var/lib/wtf
chown root:wtf /etc/wtf/secrets
chmod 770 /run/wtf
chmod 770 /var/log/wtf
chmod 700 /var/lib/wtf
chmod 750 /etc/wtf/secrets

# The WTF app's user must be added to the `wtf` group externally so it can
# connect to the signer socket.

install -o root -g root -m 0644 \
  "$(dirname "$0")/wtf-operator-signer.service" \
  /etc/systemd/system/wtf-operator-signer.service

systemctl daemon-reload
systemctl enable wtf-operator-signer.service

echo "Provisioning complete. Run server-deploy.sh to push code + env."
