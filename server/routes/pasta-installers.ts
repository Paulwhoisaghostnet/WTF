import { Router } from "express";
import { isAuthenticated } from "../auth/passport";

const router = Router();

const INSTALLER_PLATFORMS = [
  {
    key: "macos",
    label: "macOS",
    env: "PASTA_SUITE_INSTALLER_MACOS_URL",
    sha256Env: "PASTA_SUITE_INSTALLER_MACOS_SHA256",
    fileName: "Pasta-Suite.dmg",
  },
  {
    key: "windows",
    label: "Windows",
    env: "PASTA_SUITE_INSTALLER_WINDOWS_URL",
    sha256Env: "PASTA_SUITE_INSTALLER_WINDOWS_SHA256",
    fileName: "Pasta-Suite.exe",
  },
  {
    key: "raspberry-pi",
    label: "Raspberry Pi",
    env: "PASTA_SUITE_INSTALLER_RASPBERRY_PI_URL",
    sha256Env: "PASTA_SUITE_INSTALLER_RASPBERRY_PI_SHA256",
    fileName: "pasta-suite-arm64.deb",
  },
] as const;

function isLoopbackInstallerHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function safeInstallerUrl(value: string | undefined): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("/") && !text.startsWith("//") && !/[\r\n]/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol === "https:") return url.href;
    if (process.env.NODE_ENV !== "production" && url.protocol === "http:" && isLoopbackInstallerHost(url.hostname)) {
      return url.href;
    }
    return "";
  } catch (_) {
    return "";
  }
}

function safeInstallerSha256(value: string | undefined): string {
  const text = String(value || "").trim().toLowerCase().replace(/^sha256:/, "");
  return /^[0-9a-f]{64}$/.test(text) ? text : "";
}

router.get("/api/pasta/installers", isAuthenticated, (_req, res) => {
  const version = String(process.env.PASTA_SUITE_INSTALLER_VERSION || "").trim();
  return res.json({
    ok: true,
    product: "pasta-suite",
    version: version || null,
    installers: INSTALLER_PLATFORMS.map((platform) => {
      const url = safeInstallerUrl(process.env[platform.env]);
      const sha256 = safeInstallerSha256(process.env[platform.sha256Env]);
      return {
        key: platform.key,
        label: platform.label,
        fileName: platform.fileName,
        sha256: sha256 || null,
        available: Boolean(url && sha256),
        url: url && sha256 ? url : null,
      };
    }),
  });
});

export default router;
