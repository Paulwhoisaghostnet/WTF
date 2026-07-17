import type { Router } from "express";
import {
  registerAdminUserDeletionRoutes,
  type AdminUserDeletionRouteDeps,
} from "./deletion-routes";
import {
  registerAdminUserDossierRoutes,
  type AdminUserDossierRouteDeps,
} from "./dossier-routes";
import {
  registerAdminUserIdentityProfileRoutes,
  type AdminUserIdentityProfileRouteDeps,
} from "./identity-profile-routes";
import {
  registerAdminUserResyncRoutes,
  type AdminUserResyncRouteDeps,
} from "./resync-routes";
import {
  registerAdminUserTempPasswordRoutes,
  type AdminUserTempPasswordRouteDeps,
} from "./temp-password-routes";
import {
  registerAdminUserXpRoutes,
  type AdminUserXpRouteDeps,
} from "./xp-routes";
import { registerAdminUserPassportRoutes } from "./passport-routes";

export type AdminUserRoutesDeps = Partial<{
  identityProfile: AdminUserIdentityProfileRouteDeps;
  xp: AdminUserXpRouteDeps;
  deletion: AdminUserDeletionRouteDeps;
  tempPassword: AdminUserTempPasswordRouteDeps;
  dossier: AdminUserDossierRouteDeps;
  resync: AdminUserResyncRouteDeps;
}>;

export function registerAdminUsersRoutes(
  router: Router,
  deps: AdminUserRoutesDeps = {}
) {
  registerAdminUserIdentityProfileRoutes(router, deps.identityProfile);
  registerAdminUserXpRoutes(router, deps.xp);
  registerAdminUserDeletionRoutes(router, deps.deletion);
  registerAdminUserTempPasswordRoutes(router, deps.tempPassword);
  registerAdminUserDossierRoutes(router, deps.dossier);
  registerAdminUserResyncRoutes(router, deps.resync);
  registerAdminUserPassportRoutes(router);
}

export * from "./deletion-routes";
export * from "./dossier-routes";
export * from "./identity-profile-routes";
export * from "./resync-routes";
export * from "./passport-routes";
export * from "./temp-password-routes";
export * from "./xp-routes";
