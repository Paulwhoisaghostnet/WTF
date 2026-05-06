import type { Router } from "express";
import { registerAdminUsersRoutes } from "./users";

export function registerAdminUserRoutes(router: Router) {
  registerAdminUsersRoutes(router);
}
