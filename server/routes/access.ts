import { Router, type Request } from "express";
import { defaultPublicSiteHost } from "@shared/platform-branding";
import { canonicalizePlatformUrl, resolveCanonicalPublicOrigin } from "../lib/canonical-domain";
import { buildWtfAccessManifest } from "../lib/wtf-access";
import { getDesktopAppConfig } from "../lib/desktop-apps";

const router = Router();

export function originForRequest(req: Request): string {
  const proto = req.protocol || "https";
  const host = req.get("host") || defaultPublicSiteHost();
  return resolveCanonicalPublicOrigin(
    {
      NODE_ENV: process.env.NODE_ENV,
      WTFOS_PUBLIC_BASE_URL: process.env.WTFOS_PUBLIC_BASE_URL,
      CANONICAL_PUBLIC_ORIGIN: process.env.CANONICAL_PUBLIC_ORIGIN,
      PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
    },
    `${proto}://${host}`
  );
}

export function mcpEndpointForOrigin(req: Request, origin: string): string {
  const configured = String(process.env.MCP_PUBLIC_ENDPOINT || "").trim();
  if (configured) return canonicalizePlatformUrl(configured) || configured.replace(/\/+$/, "");
  return `${origin}/mcp`;
}

router.get("/api/access", async (req, res) => {
  try {
    const origin = originForRequest(req);
    const apps = await getDesktopAppConfig();
    res.json(
      buildWtfAccessManifest({
        origin,
        mcpEndpoint: mcpEndpointForOrigin(req, origin),
        apps,
      })
    );
  } catch (err) {
    console.error("[access] failed to build access manifest:", err);
    res.status(500).json({ error: "Failed to build WTF access manifest" });
  }
});

export default router;
