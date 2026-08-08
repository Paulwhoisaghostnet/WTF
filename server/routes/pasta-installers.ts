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

const BUNDLED_PASTA_APPS = [
  {
    key: "ch-ease",
    label: "CH-EASE",
    purpose: "Local media and metadata package preparation",
  },
  {
    key: "macaroni",
    label: "Macaroni",
    purpose: "Blind-mint drop publisher",
  },
  {
    key: "spaghetti",
    label: "Spaghetti",
    purpose: "Standard collection publisher",
  },
  {
    key: "gnocchi",
    label: "Gnocchi",
    purpose: "Open-edition publisher",
  },
  {
    key: "ravioli",
    label: "Ravioli",
    purpose: "Bundle token publisher",
  },
  {
    key: "rotini",
    label: "Rotini",
    purpose: "Generative collection publisher",
  },
  {
    key: "penne",
    label: "Penne",
    purpose: "Distribution and claim publisher",
  },
  {
    key: "lasagna",
    label: "Lasagna",
    purpose: "Exhibition and curation publisher",
  },
] as const;

type InstallerPlatformKey = (typeof INSTALLER_PLATFORMS)[number]["key"];
type InstallerPlatformDescriptor = {
  readonly key: InstallerPlatformKey;
  readonly label: string;
  readonly env: string;
  readonly sha256Env: string;
  readonly fileName: string;
};

const INDIVIDUAL_PASTA_INSTALLER_PRODUCTS = [
  {
    key: "ch-ease",
    product: "ch-ease",
    label: "CH-EASE Desktop",
    purpose: "Local media and metadata package preparation with bundled publisher handoffs",
    manifestPath: "/api/ch-ease/installers",
    releaseTagPrefix: "ch-ease-desktop-v",
    versionEnv: "CH_EASE_INSTALLER_VERSION",
    envPrefix: "CH_EASE_INSTALLER",
    fileNames: {
      macos: "CH-EASE-Studio.dmg",
      windows: "CH-EASE-Studio.exe",
      "raspberry-pi": "ch-ease-studio-arm64.deb",
    },
  },
  {
    key: "macaroni",
    product: "macaroni",
    label: "Macaroni Desktop",
    purpose: "Blind-mint drop publisher",
    manifestPath: "/api/macaroni/installers",
    releaseTagPrefix: "macaroni-desktop-v",
    versionEnv: "MACARONI_INSTALLER_VERSION",
    envPrefix: "MACARONI_INSTALLER",
    fileNames: {
      macos: "Macaroni-Studio.dmg",
      windows: "Macaroni-Studio.exe",
      "raspberry-pi": "macaroni-studio-arm64.deb",
    },
  },
  {
    key: "spaghetti",
    product: "spaghetti",
    label: "Spaghetti Desktop",
    purpose: "Standard collection publisher",
    manifestPath: "/api/spaghetti/installers",
    releaseTagPrefix: "spaghetti-desktop-v",
    versionEnv: "SPAGHETTI_INSTALLER_VERSION",
    envPrefix: "SPAGHETTI_INSTALLER",
    fileNames: {
      macos: "Spaghetti-Studio.dmg",
      windows: "Spaghetti-Studio.exe",
      "raspberry-pi": "spaghetti-studio-arm64.deb",
    },
  },
  {
    key: "gnocchi",
    product: "gnocchi",
    label: "Gnocchi Desktop",
    purpose: "Open-edition publisher",
    manifestPath: "/api/gnocchi/installers",
    releaseTagPrefix: "gnocchi-desktop-v",
    versionEnv: "GNOCCHI_INSTALLER_VERSION",
    envPrefix: "GNOCCHI_INSTALLER",
    fileNames: {
      macos: "Gnocchi-Studio.dmg",
      windows: "Gnocchi-Studio.exe",
      "raspberry-pi": "gnocchi-studio-arm64.deb",
    },
  },
  {
    key: "ravioli",
    product: "ravioli",
    label: "Ravioli Desktop",
    purpose: "Bundle token publisher",
    manifestPath: "/api/ravioli/installers",
    releaseTagPrefix: "ravioli-desktop-v",
    versionEnv: "RAVIOLI_INSTALLER_VERSION",
    envPrefix: "RAVIOLI_INSTALLER",
    fileNames: {
      macos: "Ravioli-Studio.dmg",
      windows: "Ravioli-Studio.exe",
      "raspberry-pi": "ravioli-studio-arm64.deb",
    },
  },
  {
    key: "rotini",
    product: "rotini",
    label: "Rotini Desktop",
    purpose: "Generative collection publisher",
    manifestPath: "/api/rotini/installers",
    releaseTagPrefix: "rotini-desktop-v",
    versionEnv: "ROTINI_INSTALLER_VERSION",
    envPrefix: "ROTINI_INSTALLER",
    fileNames: {
      macos: "Rotini-Studio.dmg",
      windows: "Rotini-Studio.exe",
      "raspberry-pi": "rotini-studio-arm64.deb",
    },
  },
  {
    key: "penne",
    product: "penne",
    label: "Penne Desktop",
    purpose: "Distribution and claim publisher",
    manifestPath: "/api/penne/installers",
    releaseTagPrefix: "penne-desktop-v",
    versionEnv: "PENNE_INSTALLER_VERSION",
    envPrefix: "PENNE_INSTALLER",
    fileNames: {
      macos: "Penne-Studio.dmg",
      windows: "Penne-Studio.exe",
      "raspberry-pi": "penne-studio-arm64.deb",
    },
  },
  {
    key: "lasagna",
    product: "lasagna",
    label: "Lasagna Desktop",
    purpose: "Exhibition and curation publisher",
    manifestPath: "/api/lasagna/installers",
    releaseTagPrefix: "lasagna-desktop-v",
    versionEnv: "LASAGNA_INSTALLER_VERSION",
    envPrefix: "LASAGNA_INSTALLER",
    fileNames: {
      macos: "Lasagna-Studio.dmg",
      windows: "Lasagna-Studio.exe",
      "raspberry-pi": "lasagna-studio-arm64.deb",
    },
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

function installerPlatformEntries(
  envPrefix: string,
  fileNames: Readonly<Record<InstallerPlatformKey, string>>
): InstallerPlatformDescriptor[] {
  return INSTALLER_PLATFORMS.map((platform) => ({
    key: platform.key,
    label: platform.label,
    env: `${envPrefix}_${platform.key === "macos" ? "MACOS" : platform.key === "windows" ? "WINDOWS" : "RASPBERRY_PI"}_URL`,
    sha256Env: `${envPrefix}_${platform.key === "macos" ? "MACOS" : platform.key === "windows" ? "WINDOWS" : "RASPBERRY_PI"}_SHA256`,
    fileName: fileNames[platform.key],
  }));
}

function installerItems(platforms: ReadonlyArray<InstallerPlatformDescriptor>) {
  return platforms.map((platform) => {
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
  });
}

function suiteManifest() {
  const version = String(process.env.PASTA_SUITE_INSTALLER_VERSION || "").trim();
  return {
    product: "pasta-suite",
    key: "pasta-suite",
    label: "Pasta Suite Desktop",
    kind: "suite",
    purpose: "Bundled local desktop suite for CH-EASE, Macaroni, and Pasta publishers",
    manifestPath: "/api/pasta/installers",
    releaseTag: version ? `pasta-suite-desktop-v${version}` : null,
    version: version || null,
    bundledApps: BUNDLED_PASTA_APPS,
    installers: installerItems(INSTALLER_PLATFORMS),
  };
}

function individualManifest(product: (typeof INDIVIDUAL_PASTA_INSTALLER_PRODUCTS)[number]) {
  const version = String(process.env[product.versionEnv] || "").trim();
  const installers = installerItems(installerPlatformEntries(product.envPrefix, product.fileNames));
  return {
    product: product.product,
    key: product.key,
    label: product.label,
    kind: "individual",
    purpose: product.purpose,
    manifestPath: product.manifestPath,
    releaseTag: version ? `${product.releaseTagPrefix}${version}` : null,
    includedInSuite: true,
    version: version || null,
    installers,
  };
}

router.get("/api/pasta/installers", isAuthenticated, (_req, res) => {
  return res.json({
    ok: true,
    ...suiteManifest(),
  });
});

router.get("/api/pasta/installers/catalog", isAuthenticated, (_req, res) => {
  const suite = suiteManifest();
  const individualApps = INDIVIDUAL_PASTA_INSTALLER_PRODUCTS.map((product) => individualManifest(product));
  return res.json({
    ok: true,
    product: "pasta-protocol-installers",
    manifestVersion: 1,
    suite,
    individualApps,
    products: [suite, ...individualApps],
    summary: {
      suiteAvailable: suite.installers.every((item) => item.available),
      individualAvailable: individualApps.every((app) => app.installers.every((item) => item.available)),
      platformKeys: INSTALLER_PLATFORMS.map((platform) => platform.key),
      individualCount: individualApps.length,
    },
  });
});

export default router;
