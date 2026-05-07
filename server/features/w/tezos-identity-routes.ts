import type { Router } from "express";
import { isAuthenticated } from "../../auth/passport";
import {
  getXTezosIdentityHints,
  normalizeXHandle,
  resolveObjktTezosAddressesForHandle,
  upsertXTezosIdentityHints,
} from "../../lib/objkt-identity";

function parseHandles(raw: unknown): string[] {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((handle) => normalizeXHandle(handle))
        .filter((handle): handle is string => Boolean(handle))
    )
  ).slice(0, 50);
}

export function registerWTezosIdentityRoutes(router: Router): void {
  router.get("/api/w/tezos-identities", isAuthenticated, async (req, res) => {
    try {
      const handles = parseHandles(req.query.handles);
      if (handles.length === 0) return res.json({ hints: [] });

      if (String(req.query.refresh || "") === "1") {
        const refreshed = [];
        for (const handle of handles.slice(0, 10)) {
          const hints = await resolveObjktTezosAddressesForHandle(handle);
          await upsertXTezosIdentityHints(hints);
          refreshed.push(...hints);
        }
        return res.json({ hints: refreshed, refreshed: true });
      }

      const hints = await getXTezosIdentityHints(handles);
      res.json({ hints, refreshed: false });
    } catch (err) {
      console.error("[w/tezos-identities] failed:", err);
      res.status(500).json({ error: "Failed to load Tezos identity hints" });
    }
  });
}
