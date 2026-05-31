import { hasPermission } from "../../lib/permissions";

export async function canUseWAdminControls(user: any): Promise<boolean> {
  if (!user?.role) return false;
  return (
    (await hasPermission(user.role, "access_admin_panel")) &&
    (await hasPermission(user.role, "manage_roles"))
  );
}
