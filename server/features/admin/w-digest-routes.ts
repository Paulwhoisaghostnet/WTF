import type { Router } from "express";
import { registerAdminWDigestRoutes as register } from "../w/digest/routes";

export function registerAdminWDigestRoutes(router: Router): void {
  register(router);
}
