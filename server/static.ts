import express from "express";
import path from "path";

export function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist/public");
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
