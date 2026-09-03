import { Router } from "express";
import { isAuthenticated } from "../auth/passport";

const router = Router();

export const ANCHOR_UPSTREAM = {
  version: "0.2.4",
  tag: "v0.2.4",
  commit: "74326162c6b5c17165fe6e14768a53f325840982",
  repositoryUrl: "https://gitlab.com/anchor-permanent-by-design/anchor",
  maintainers: ["zabuxx", "daggiedee"],
  license: "AGPL-3.0-or-later",
  sourceUrl:
    "https://gitlab.com/anchor-permanent-by-design/anchor/-/archive/v0.2.4/anchor-v0.2.4.tar.gz",
  sourceSha256: "daf0759eff05b699b5197ec5d81ca9d68efc5750cd866ce5c064b1e5286fcaa0",
  daemonImage:
    "quay.io/zabuxx/anchor-daemon@sha256:c72ae7e91be7c82214f52c4dc038c45e52e937ccc94a5eb380e61ee77f487a14",
} as const;

const APPLIANCE_DOWNLOADS = [
  {
    key: "iso-x86_64",
    label: "Installer ISO · Intel / AMD",
    format: "ISO",
    architecture: "x86_64",
    useCase: "Bare metal or a hypervisor; installs unattended to the selected disk.",
    envPrefix: "ANCHOR_INSTALLER_ISO_X86_64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-vda-x86_64.iso`,
  },
  {
    key: "iso-aarch64",
    label: "Installer ISO · ARM64",
    format: "ISO",
    architecture: "aarch64",
    useCase: "ARM64 bare metal or a compatible hypervisor.",
    envPrefix: "ANCHOR_INSTALLER_ISO_AARCH64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-vda-aarch64.iso`,
  },
  {
    key: "qcow2-x86_64",
    label: "QEMU / Proxmox / UTM · Intel / AMD",
    format: "QCOW2",
    architecture: "x86_64",
    useCase: "Import into QEMU, libvirt, Proxmox, or UTM.",
    envPrefix: "ANCHOR_INSTALLER_QCOW2_X86_64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-500G-x86_64.qcow2.xz`,
  },
  {
    key: "qcow2-aarch64",
    label: "QEMU / UTM · ARM64",
    format: "QCOW2",
    architecture: "aarch64",
    useCase: "Import on Apple Silicon or another ARM64 host.",
    envPrefix: "ANCHOR_INSTALLER_QCOW2_AARCH64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-500G-aarch64.qcow2.xz`,
  },
  {
    key: "ova-x86_64",
    label: "VirtualBox / VMware · Intel / AMD",
    format: "OVA",
    architecture: "x86_64",
    useCase: "Import as a preconfigured virtual appliance.",
    envPrefix: "ANCHOR_INSTALLER_OVA_X86_64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-500G-4cpu-16gb-x86_64.ova`,
  },
  {
    key: "raw-x86_64",
    label: "Apple Hypervisor / raw disk · Intel / AMD",
    format: "RAW",
    architecture: "x86_64",
    useCase: "Compressed raw disk for compatible hypervisors.",
    envPrefix: "ANCHOR_INSTALLER_RAW_X86_64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-500G-x86_64.raw.gz`,
  },
  {
    key: "raw-aarch64",
    label: "Apple Hypervisor / raw disk · ARM64",
    format: "RAW",
    architecture: "aarch64",
    useCase: "Compressed raw disk for Apple Silicon and ARM64 hosts.",
    envPrefix: "ANCHOR_INSTALLER_RAW_AARCH64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-500G-aarch64.raw.gz`,
  },
  {
    key: "vhdx-x86_64",
    label: "Hyper-V · Intel / AMD",
    format: "VHDX",
    architecture: "x86_64",
    useCase: "Import into Hyper-V on Windows.",
    envPrefix: "ANCHOR_INSTALLER_VHDX_X86_64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-500G-x86_64.vhdx.zip`,
  },
  {
    key: "vhdx-aarch64",
    label: "Hyper-V · ARM64",
    format: "VHDX",
    architecture: "aarch64",
    useCase: "Import into an ARM64 Hyper-V host.",
    envPrefix: "ANCHOR_INSTALLER_VHDX_AARCH64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-500G-aarch64.vhdx.zip`,
  },
  {
    key: "pi4-aarch64",
    label: "Raspberry Pi 4",
    format: "RAW.XZ",
    architecture: "aarch64",
    useCase: "Write directly to Pi 4 media; this lite profile omits the local Tezos node.",
    envPrefix: "ANCHOR_INSTALLER_PI4_AARCH64",
    fileName: `anchor-${ANCHOR_UPSTREAM.version}-pi4-aarch64.raw.xz`,
  },
] as const;

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function safeAnchorDownloadUrl(value: string | undefined): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("/") && !text.startsWith("//") && !/[\r\n]/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol === "https:") return url.href;
    if (process.env.NODE_ENV !== "production" && url.protocol === "http:" && isLoopbackHost(url.hostname)) {
      return url.href;
    }
    return "";
  } catch {
    return "";
  }
}

export function safeAnchorSha256(value: string | undefined): string {
  const text = String(value || "").trim().toLowerCase().replace(/^sha256:/, "");
  return /^[0-9a-f]{64}$/.test(text) ? text : "";
}

export function buildAnchorDownloadManifest() {
  const appliances = APPLIANCE_DOWNLOADS.map((item) => {
    const url = safeAnchorDownloadUrl(process.env[`${item.envPrefix}_URL`]);
    const sha256 = safeAnchorSha256(process.env[`${item.envPrefix}_SHA256`]);
    return {
      key: item.key,
      label: item.label,
      kind: "appliance" as const,
      format: item.format,
      architecture: item.architecture,
      useCase: item.useCase,
      fileName: item.fileName,
      available: Boolean(url && sha256),
      url: url && sha256 ? url : null,
      sha256: sha256 || null,
    };
  });

  return {
    ok: true,
    product: "anchor",
    label: "Anchor — Permanent by Design",
    status: "beta",
    version: ANCHOR_UPSTREAM.version,
    upstreamTag: ANCHOR_UPSTREAM.tag,
    upstreamCommit: ANCHOR_UPSTREAM.commit,
    repositoryUrl: ANCHOR_UPSTREAM.repositoryUrl,
    maintainers: ANCHOR_UPSTREAM.maintainers,
    license: ANCHOR_UPSTREAM.license,
    daemonImage: ANCHOR_UPSTREAM.daemonImage,
    source: {
      key: "source",
      label: "Verified source bundle",
      kind: "source" as const,
      format: "TAR.GZ",
      architecture: "source",
      useCase: "Build an ISO or virtual-machine image with Anchor's documented release targets.",
      fileName: `anchor-${ANCHOR_UPSTREAM.tag}-source.tar.gz`,
      available: true,
      url: ANCHOR_UPSTREAM.sourceUrl,
      sha256: ANCHOR_UPSTREAM.sourceSha256,
    },
    appliances,
    summary: {
      sourceAvailable: true,
      applianceAvailable: appliances.some((item) => item.available),
      availableApplianceCount: appliances.filter((item) => item.available).length,
    },
  };
}

router.get("/api/anchor/downloads", isAuthenticated, (_req, res) => {
  return res.json(buildAnchorDownloadManifest());
});

export default router;
