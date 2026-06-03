import type { NextFunction, Request, Response } from "express";
import {
  getSkywireRolloutConfig,
  userEligibleForSkywireRollout,
  userEligibleForWtfLive,
} from "@shared/skywire-rollout";
import type { UserRoleInput } from "@shared/types";

function roleInputFromRequest(req: Request): UserRoleInput {
  const user = req.user as { role?: string | null; roles?: UserRoleInput } | undefined;
  return user?.roles ?? user?.role ?? null;
}

export function skywireRolloutStatusForRole(role: UserRoleInput) {
  const config = getSkywireRolloutConfig();
  return {
    ...config,
    eligible: userEligibleForSkywireRollout(role, config),
    wtfLiveEligible: userEligibleForWtfLive(role, config),
  };
}

export function requireSkywireRollout(req: Request, res: Response, next: NextFunction) {
  const status = skywireRolloutStatusForRole(roleInputFromRequest(req));
  if (!status.eligible) {
    return res.status(403).json({
      error: "Skywire is not available for your account yet",
      code: "skywire_rollout_denied",
      rolloutMode: status.rolloutMode,
    });
  }
  return next();
}

export function requireWtfLiveRollout(req: Request, res: Response, next: NextFunction) {
  const status = skywireRolloutStatusForRole(roleInputFromRequest(req));
  if (!status.wtfLiveEligible) {
    return res.status(403).json({
      error: "WTF LIVE is not available for your account yet",
      code: "wtf_live_rollout_denied",
      rolloutMode: status.rolloutMode,
      wtfLiveEnabled: status.wtfLiveEnabled,
    });
  }
  return next();
}
