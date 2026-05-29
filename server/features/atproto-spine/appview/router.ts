import { Router, type Request, type Response } from "express";
import { isSpineEnabled } from "../config";
import { listAppviewRecords, getAppviewRecordByUri } from "./query";
import { parseFilters, parsePagination } from "./query-params";

/**
 * AppView read API (S3.2). Exposes the read model over REST and XRPC. Read-only and
 * flag-gated (404 when ATPROTO_SPINE_ENABLED is off). Mount additively, e.g.:
 *   app.use(createAppViewRouter());
 * It owns only new paths under /api/atproto/appview and /xrpc/app.wtfos.appview.* so it
 * cannot collide with existing routes.
 */

function disabled(res: Response): boolean {
  if (!isSpineEnabled()) {
    res.status(404).json({ error: "appview_disabled" });
    return true;
  }
  return false;
}

async function handleList(req: Request, res: Response): Promise<void> {
  if (disabled(res)) return;
  const filters = parseFilters(req.query as Record<string, unknown>);
  const page = parsePagination(req.query as { limit?: unknown; cursor?: unknown });
  const { records, cursor } = await listAppviewRecords(filters, page);
  res.json({
    records: records.map((r) => ({
      uri: r.uri,
      cid: r.cid,
      did: r.did,
      collection: r.collection,
      rkey: r.rkey,
      domain: r.domain,
      value: r.json,
      indexedAt: r.indexedAt,
    })),
    cursor,
  });
}

async function handleGet(req: Request, res: Response): Promise<void> {
  if (disabled(res)) return;
  const uri = String(req.query.uri ?? "");
  if (!uri) {
    res.status(400).json({ error: "uri_required" });
    return;
  }
  const row = await getAppviewRecordByUri(uri);
  if (!row) {
    res.status(404).json({ error: "record_not_found" });
    return;
  }
  res.json({
    uri: row.uri,
    cid: row.cid,
    did: row.did,
    collection: row.collection,
    rkey: row.rkey,
    domain: row.domain,
    value: row.json,
    indexedAt: row.indexedAt,
  });
}

export function createAppViewRouter(): Router {
  const router = Router();
  // REST
  router.get("/api/atproto/appview/records", handleList);
  router.get("/api/atproto/appview/record", handleGet);
  // XRPC aliases (same read model)
  router.get("/xrpc/app.wtfos.appview.getRecords", handleList);
  router.get("/xrpc/app.wtfos.appview.getRecord", handleGet);
  return router;
}
