# syntax=docker/dockerfile:1.6
#
# TempleOS-on-Ubuntu container.
#
# Boots the vendored TempleOS.ISO in QEMU against a persistent
# qcow2 disk image, and exposes an HTTP/WebSocket noVNC front-end
# on port 6080.  Caddy handles TLS at the edge.
#
# The container deliberately runs QEMU in user-space only: if the
# host gives it /dev/kvm (Hetzner CPX/CX22 all do) we use KVM for
# full 64-bit speed; otherwise we fall back to TCG and just run
# slower — TempleOS is small enough that even emulated is fine.
#
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# qemu-system-x86  → amd64 + i386 emulation
# seabios          → BIOS image QEMU boots TempleOS against
# ovmf             → UEFI firmware (kept in case we need it later)
# websockify       → TCP↔WebSocket bridge that also serves noVNC
# python3          → websockify runtime
# curl, ca-certs   → health check + HTTPS support
# dumb-init        → PID 1 so QEMU + websockify exit cleanly on SIGTERM
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        qemu-system-x86 \
        qemu-utils \
        seabios \
        ovmf \
        websockify \
        python3 \
        curl \
        ca-certificates \
        dumb-init && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/templeos

# Vendored assets — everything needed to run the OS and serve the web
# client is committed to the repo so rebuilds work without internet.
COPY iso/TempleOS.ISO ./TempleOS.ISO
COPY novnc/ ./novnc/
COPY landing/ ./novnc/landing/
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && \
    # Drop the landing page in at the root of the web server so visitors
    # to `/` see the branded splash that auto-loads the VNC session.
    cp ./novnc/landing/index.html ./novnc/index.html

# Persistent disk lives on a named volume so TempleOS installs survive
# container rebuilds / image pulls.
VOLUME /opt/templeos/data

EXPOSE 6080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -sf http://localhost:6080/index.html >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["./entrypoint.sh"]
