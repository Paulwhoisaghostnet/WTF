import { Router, type Request } from "express";
import { defaultPublicSiteHost } from "@shared/platform-branding";
import { buildWtfAccessManifest } from "../lib/wtf-access";
import { getDesktopAppConfig } from "../lib/desktop-apps";

const router = Router();

function originForRequest(req: Request): string {
  const configured = String(process.env.PUBLIC_SITE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = req.protocol || "https";
  const host = req.get("host") || defaultPublicSiteHost();
  return `${proto}://${host}`;
}

function mcpEndpointForOrigin(req: Request, origin: string): string {
  const configured = String(process.env.MCP_PUBLIC_ENDPOINT || "").trim();
  if (configured) return configured;
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
