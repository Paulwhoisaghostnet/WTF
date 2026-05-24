import { Router } from "express";
import { isAuthenticated } from "../auth/passport";
import {
  browserAllowedHosts,
  resolveBrowserUrlPolicy,
} from "../features/browser/policy";

const router = Router();

router.get("/api/browser/allowlist", isAuthenticated, (_req, res) => {
  res.json({ hosts: browserAllowedHosts() });
});

router.get("/api/browser/resolve", isAuthenticated, (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  res.json(resolveBrowserUrlPolicy(url));
});

export default router;
