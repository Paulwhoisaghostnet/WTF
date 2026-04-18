#!/usr/bin/env bash
#
# Boot TempleOS inside QEMU and expose it over noVNC.
#
# First run: the persistent disk (`templeos.qcow2`) is empty, so QEMU
# boots the ISO directly and you land in the live TempleOS
# environment. Run `Install` from the HolyC prompt to permanently
# install to C: — subsequent boots will start from the installed disk
# with the ISO available as a fallback.
#

set -euo pipefail

DATA_DIR=/opt/templeos/data
DISK=${DATA_DIR}/templeos.qcow2
ISO=/opt/templeos/TempleOS.ISO
VNC_SOCK=/tmp/qemu-templeos.vnc
MONITOR_SOCK=/tmp/qemu-templeos.mon
NOVNC_ROOT=/opt/templeos/novnc
VNC_PORT=${VNC_PORT:-6080}
DISK_SIZE=${TEMPLEOS_DISK_SIZE:-2G}
MEMORY=${TEMPLEOS_MEMORY:-512}
SMP=${TEMPLEOS_SMP:-2}

log() { printf '[templeos] %s\n' "$*" >&2; }

mkdir -p "$DATA_DIR"

if [ ! -f "$DISK" ]; then
    log "creating ${DISK_SIZE} persistent disk at ${DISK}"
    qemu-img create -f qcow2 "$DISK" "$DISK_SIZE" >/dev/null
fi

# Clean stale sockets from a previous crash so QEMU can bind cleanly.
rm -f "$VNC_SOCK" "$MONITOR_SOCK"

# ── Acceleration selection ────────────────────────────────────────────
# Prefer KVM when the host exposes /dev/kvm (Hetzner CPX/CX22 instances
# do).  Fall back to TCG (software emulation) on anything else —
# TempleOS is a 1995-era instruction set, so TCG is still interactive.
ACCEL_ARGS=(-machine type=pc,accel=tcg)
CPU_ARGS=(-cpu qemu64)
if [ -w /dev/kvm ]; then
    log "KVM available — using hardware acceleration"
    ACCEL_ARGS=(-machine type=pc,accel=kvm)
    CPU_ARGS=(-cpu host)
else
    log "KVM not available — running under TCG"
fi

# ── Boot order ────────────────────────────────────────────────────────
# Always present the ISO as a CD-ROM, but boot the hard disk first. On
# the first run the disk is blank so the BIOS falls through to the CD
# and we land in live TempleOS; after `Install` runs, the installed
# disk boots automatically and the ISO is available as a recovery/
# reference volume.
BOOT_ORDER="order=cd"
if [ -s "$DISK" ]; then
    # qemu-img does lazy allocation; `-s` says "file exists and is
    # non-zero".  We also peek at the MBR to see whether install has
    # actually been run.  The TempleOS installer writes `0x55AA` at
    # offset 510; any live disk has it.
    MBR_SIG=$(od -An -tx1 -N2 -j510 "$DISK" 2>/dev/null | tr -d ' \n' || true)
    if [ "$MBR_SIG" = "55aa" ]; then
        BOOT_ORDER="order=dc"
        log "installed TempleOS detected — booting hard disk first"
    fi
fi

# ── Launch QEMU ───────────────────────────────────────────────────────
QEMU_ARGS=(
    "${ACCEL_ARGS[@]}"
    "${CPU_ARGS[@]}"
    -m "$MEMORY"
    -smp "$SMP"
    -drive file="$DISK",format=qcow2,if=ide,index=0
    -drive file="$ISO",media=cdrom,readonly=on,if=ide,index=1
    -boot "$BOOT_ORDER"
    -vga std
    -audiodev none,id=snd0
    -nic none
    -rtc base=localtime
    -display vnc=unix:"$VNC_SOCK",share=force-shared
    -monitor unix:"$MONITOR_SOCK",server,nowait
    -name "TempleOS (temple.wtfgameshow.app)"
)

log "booting qemu: ${QEMU_ARGS[*]}"
qemu-system-x86_64 "${QEMU_ARGS[@]}" &
QEMU_PID=$!

# Propagate SIGTERM/SIGINT to the QEMU child so shutdowns are clean.
trap 'log "shutting down"; kill -TERM "$QEMU_PID" 2>/dev/null || true; wait "$QEMU_PID" 2>/dev/null || true; exit 0' TERM INT

# Wait for QEMU to create the VNC socket before exposing the front end.
for _ in $(seq 1 60); do
    if [ -S "$VNC_SOCK" ]; then
        break
    fi
    sleep 0.25
done
if [ ! -S "$VNC_SOCK" ]; then
    log "qemu never created $VNC_SOCK — aborting"
    kill -TERM "$QEMU_PID" 2>/dev/null || true
    exit 1
fi

log "noVNC listening on 0.0.0.0:${VNC_PORT}"

# `--web` makes websockify also serve static files, so the same port
# delivers both the HTML client and the WebSocket tunnel.
websockify \
    --web="$NOVNC_ROOT" \
    --unix-target="$VNC_SOCK" \
    "0.0.0.0:${VNC_PORT}" &
WS_PID=$!

# Exit as soon as *either* child dies so Docker's restart policy kicks
# in and we get a fresh TempleOS session instead of a half-dead pair.
wait -n "$QEMU_PID" "$WS_PID" || true
log "supervised child exited — tearing down"
kill -TERM "$QEMU_PID" "$WS_PID" 2>/dev/null || true
wait 2>/dev/null || true
exit 1
