import express from "express";
import path from "path";

export function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist/public");

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

  app.use("/assets", express.static(path.join(distPath, "assets")));
  app.get(/^\/assets\/.*/, (req, res) => {
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
