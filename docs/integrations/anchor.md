# Anchor — Permanent by Design

Anchor is an independent, collector-owned preservation appliance integrated into wtfOS as an alternative to hosted Porcupin. The upstream project is licensed under AGPL-3.0-or-later and maintained at [GitLab](https://gitlab.com/anchor-permanent-by-design/anchor).

Anchor was built and is maintained by **zabuxx and daggiedee**. wtfOS preserves that credit in the app itself, links users directly to the canonical GitLab source, and does not present Anchor as a wtfOS-authored project.

## wtfOS ownership

- Owner surface: `/apps/anchor`
- Parent system app: IPFS Pinning Manager (`ipfs-pinning`)
- Download manifest: authenticated `GET /api/anchor/downloads`
- Canonical interaction: `anchor.download_manifest.viewed`
- Access: any signed-in wtfOS user can inspect and download Anchor; the WTF Pin Collector role remains specific to hosted wtfOS/Porcupin service.
- User data: wtfOS does not receive wallet keys or Anchor appliance data. Anchor reads public wallet addresses and keeps its preservation data on user-owned hardware.

## Pinned upstream release

- Version: `0.2.4`
- Tag: `v0.2.4`
- Source commit: `74326162c6b5c17165fe6e14768a53f325840982`
- Source archive SHA-256: `daf0759eff05b699b5197ec5d81ca9d68efc5750cd866ce5c064b1e5286fcaa0`
- Daemon image: `quay.io/zabuxx/anchor-daemon@sha256:c72ae7e91be7c82214f52c4dc038c45e52e937ccc94a5eb380e61ee77f487a14`

The source archive is immediately downloadable. Bootable ISO and virtual-machine images fail closed until the production runtime provides an HTTPS or same-origin artifact URL and a valid SHA-256 digest for that exact file.

## Release operation

Anchor upstream defines release targets for x86_64 and aarch64 installer ISOs, QCOW2 disks, raw disks, VHDX disks, an x86_64 OVA, and a Raspberry Pi 4 image. Populate the matching `ANCHOR_INSTALLER_*_URL` and `ANCHOR_INSTALLER_*_SHA256` variables only from the published artifact bytes. Redeploy the app so the running process receives the new environment, then verify the authenticated manifest and download bytes before presenting the image as live.

Do not describe a source archive as a bootable appliance image. Do not expose a URL without its matching checksum. The installer ISO is unattended and may overwrite its configured destination disk; keep that warning visible in the download UI.
