/** Keep public PDS provisioning closed while allowing an explicit service-account rollout. */
export function wtfosPdsProvisioningEnabledForUser(
  userId: number,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.WTFOS_PDS_PROVISIONING_ENABLED === "true") return true;
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;
  return String(env.WTFOS_PDS_PROVISIONING_ALLOWED_USER_IDS || "")
    .split(",")
    .some((value) => {
      const candidate = value.trim();
      return /^[1-9][0-9]*$/.test(candidate) && Number(candidate) === userId;
    });
}
