# TempleOS — temple.wtfgameshow.app

A QEMU-hosted TempleOS install, reachable in a browser at
<https://temple.wtfgameshow.app>.  The full, unmodified Terry A. Davis
operating system runs inside a Docker container; noVNC streams the VGA
framebuffer to visitors and tunnels keyboard/mouse back over a
WebSocket.

## Why it lives in this repo

The Hetzner deploy pipeline (`.github/workflows/deploy.yml`) already
builds the main WTF stack with Docker Compose on every `main` push, so
the cheapest way to ship a second service is to drop it next to the
existing `app:` definition in `docker-compose.yml`.  Caddy handles TLS
for the subdomain automatically.

## Components

```
infrastructure/templeos/
├── Dockerfile          — Debian-slim + qemu-system-x86 + websockify
├── entrypoint.sh       — creates the persistent disk, picks KVM/TCG, launches QEMU + noVNC
├── iso/
│   └── TempleOS.ISO    — vendored TempleOS distro (sha256 5d0fc944…)
├── novnc/              — vendored noVNC 1.5.0 static client
└── landing/
    └── index.html      — branded splash served at /
```

## First-boot install

1. `docker compose up -d templeos` on the server.
2. Open <https://temple.wtfgameshow.app> in a browser.
3. Click **Enter God's Kernel** — noVNC connects to the running VM.
4. The ISO boots straight into a live TempleOS environment.  At the
   blinking HolyC prompt, type:

   ```
   Install;
   ```

   …and accept the defaults (`Y`/`Enter` at each prompt).  The
   installer partitions the qcow2 disk, formats it RedSea, and copies
   the OS across.  When it finishes it drops back to the prompt.
5. Shut down cleanly:

   ```
   Reboot;
   ```

6. `entrypoint.sh` inspects the MBR on next boot; once the installer
   has written the `0x55AA` signature it flips the boot order to
   `order=dc` and TempleOS starts from the installed hard disk.  The
   ISO stays attached as a fallback / reference volume.

The persistent disk (`templeos.qcow2`, default 2 GiB) lives in the
`templeos_data` Docker volume, so subsequent `docker compose up
--build` cycles keep the install intact.

## Tunables (env vars)

| Var                      | Default | Meaning                                  |
|--------------------------|---------|------------------------------------------|
| `TEMPLEOS_DISK_SIZE`     | `2G`    | qcow2 size passed to `qemu-img create`   |
| `TEMPLEOS_MEMORY`        | `512`   | RAM in MiB (TempleOS caps itself at 512) |
| `TEMPLEOS_SMP`           | `2`     | Guest CPU count                          |
| `VNC_PORT`               | `6080`  | Port websockify binds inside the container |

## DNS

`temple.wtfgameshow.app` must resolve to the Hetzner host.  If the apex
already has a wildcard `*.wtfgameshow.app` record pointed at the server
nothing more is needed; otherwise add an A/AAAA record for
`temple.wtfgameshow.app`.

## Acceleration

The compose file mounts `/dev/kvm` into the container.  If the host
exposes KVM (every Hetzner CPX/CX22 instance does) the guest runs at
near-native speed.  On hosts without KVM the entrypoint logs `KVM not
available — running under TCG` and TempleOS still boots, just slower.

## Legal

TempleOS is dedicated to the public domain by Terry A. Davis.  The
`TempleOS.ISO` in `iso/` is the canonical distribution served from
<https://templeos.org/Downloads/TempleOS.ISO>.  noVNC is MPL-2.0; the
upstream licence is preserved at `novnc/LICENSE.txt`.
