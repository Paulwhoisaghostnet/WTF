import express from "express";
import path from "path";
import { WTFOS_PLATFORM_LONG_NAME, resolvePublicSiteOrigin } from "@shared/platform-branding";

const DISCOVERY_ROUTES = [
  "/",
  "/skywire",
  "/live",
  "/wim",
  "/tv",
  "/arcade",
  "/gallery",
  "/links",
  "/faq",
];

function publicOrigin(): string {
  return resolvePublicSiteOrigin(process.env.PUBLIC_SITE_URL);
}

function publicUrl(pathname: string): string {
  return new URL(pathname, publicOrigin() + "/").toString();
}

function sendDiscoveryMetadata(
  res: express.Response,
  contentType: string,
  body: string
) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Content-Type", contentType);
  res.send(body);
}

function robotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "Sitemap: " + publicUrl("/sitemap.xml"),
    "",
  ].join("\n");
}

function sitemapXml(): string {
  const urls = DISCOVERY_ROUTES.map((route) =>
    "  <url><loc>" + publicUrl(route) + "</loc></url>"
  ).join("\n");
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

function webManifest(): string {
  return JSON.stringify(
    {
      name: WTFOS_PLATFORM_LONG_NAME,
      short_name: "wtfOS",
      description: "WTF OS platform desktop, live rooms, creation tools, and social apps.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#101820",
      theme_color: "#f047a6",
      categories: ["social", "entertainment", "productivity"],
    },
    null,
    2
  ) + "\n";
}

export function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Console game cartridges (wrapper HTML + `.jsdos` bundles + any vendor
  // runtime) MUST bypass the browser cache.  We've hit this twice now:
  // when we rebuilt a bundle or changed the CSP override, Chrome happily
  // reused the cached wrapper HTML (with its old CSP response headers) and
  // the cached `.jsdos` body, so users kept seeing "Broken bundle" or
  // stale CSP violations long after a deploy.  The total footprint is
  // tiny (a few hundred KB total across all cartridges) so `no-store` is
  // a cheap, bulletproof fix.
  const noStore: express.RequestHandler = (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  };
  app.use(
    "/games/installed",
    noStore,
    express.static(path.join(distPath, "games", "installed"), {
      // `express.static`'s `send` helper sets its own Cache-Control
      // via `maxAge`; explicitly clear it so our `noStore` headers aren't
      // clobbered on the way out.
      maxAge: 0,
      etag: true,
      lastModified: true,
      setHeaders(res) {
        res.setHeader("Cache-Control", "no-store, must-revalidate");
      },
    })
  );
  app.use(
    "/games/_vendor",
    noStore,
    express.static(path.join(distPath, "games", "_vendor"), {
      maxAge: 0,
      etag: true,
      lastModified: true,
      setHeaders(res) {
        res.setHeader("Cache-Control", "no-store, must-revalidate");
      },
    })
  );
  app.use(
    "/creation-tools",
    noStore,
    express.static(path.join(distPath, "creation-tools"), {
      maxAge: 0,
      etag: true,
      lastModified: true,
      setHeaders(res) {
        res.setHeader("Cache-Control", "no-store, must-revalidate");
      },
    })
  );

  app.get("/robots.txt", (_req, res) => {
    sendDiscoveryMetadata(res, "text/plain; charset=utf-8", robotsTxt());
  });

  app.get("/sitemap.xml", (_req, res) => {
    sendDiscoveryMetadata(res, "application/xml; charset=utf-8", sitemapXml());
  });

  app.get("/manifest.json", (_req, res) => {
    sendDiscoveryMetadata(res, "application/manifest+json; charset=utf-8", webManifest());
  });

  app.use("/assets", express.static(path.join(distPath, "assets")));
  app.get(/^\/assets\/.*/, (req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res
      .status(404)
      .type("text/plain")
      .send(`Asset not found: ${req.path}`);
  });

  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-store, must-revalidate");
      }
    },
  }));
  app.get(/.*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(path.join(distPath, "index.html"));
  });
}
