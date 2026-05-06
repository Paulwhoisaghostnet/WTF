import type { Router } from "express";
import { requirePermission } from "../../../auth/passport";
import {
  getUserDossier as defaultGetUserDossier,
  getWalletDossier as defaultGetWalletDossier,
} from "../../../lib/wallet-events";

export interface AdminUserDossierRouteDeps {
  requirePermission: typeof requirePermission;
  getUserDossier: typeof defaultGetUserDossier;
  getWalletDossier: typeof defaultGetWalletDossier;
}

export const defaultAdminUserDossierRouteDeps: AdminUserDossierRouteDeps = {
  requirePermission,
  getUserDossier: defaultGetUserDossier,
  getWalletDossier: defaultGetWalletDossier,
};

export function registerAdminUserDossierRoutes(
  router: Router,
  deps: AdminUserDossierRouteDeps = defaultAdminUserDossierRouteDeps
) {
  const { requirePermission, getUserDossier, getWalletDossier } = deps;

  router.get(
    "/api/admin/users/:id/dossier",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ error: "Invalid user id" });
        }
        const limit = Math.min(
          Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1),
          500
        );
        const dossier = await getUserDossier(targetId, { limit });
        res.json(dossier);
      } catch (err) {
        console.error("[admin] user dossier fetch failed:", err);
        res.status(500).json({ error: "Failed to load dossier" });
      }
    }
  );

  router.get(
    "/api/admin/wallets/:address/dossier",
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        const address = String(req.params.address || "");
        if (!address.startsWith("tz")) {
          return res.status(400).json({ error: "Invalid wallet address" });
        }
        const limit = Math.min(
          Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1),
          500
        );
        const dossier = await getWalletDossier(address, { limit });
        res.json({ walletAddress: address, ...dossier });
      } catch (err) {
        console.error("[admin] wallet dossier fetch failed:", err);
        res.status(500).json({ error: "Failed to load dossier" });
      }
    }
  );
}
