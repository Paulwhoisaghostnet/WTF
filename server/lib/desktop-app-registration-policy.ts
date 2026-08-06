import {
  DESKTOP_APP_INSTALL_GRACE_HOURS,
  type DesktopAppDocStatus,
} from "@shared/desktop-apps";

type PermanentRegistrationPolicy = {
  registrationNeverExpires: boolean;
};

export function registrationExpiryFor(
  from: Date,
  registrationNeverExpires: boolean,
): Date | null {
  if (registrationNeverExpires) return null;
  return new Date(
    from.getTime() + DESKTOP_APP_INSTALL_GRACE_HOURS * 60 * 60 * 1000,
  );
}

export function isDesktopAppInstallKeyActive(
  row: PermanentRegistrationPolicy & {
    installKeyHash: string | null;
    installKeyRevokedAt: Date | null;
    installKeyExpiresAt: Date | null;
  },
  now: Date,
): boolean {
  if (!row.installKeyHash) return true;
  if (row.installKeyRevokedAt) return false;
  if (row.registrationNeverExpires) return true;
  return !row.installKeyExpiresAt || row.installKeyExpiresAt.getTime() >= now.getTime();
}

export function isDesktopAppDocsFresh(
  row: PermanentRegistrationPolicy & {
    docStatus: DesktopAppDocStatus;
    docsUpdatedAt: Date | null;
    docsExpiresAt: Date | null;
  },
  now: Date,
): boolean {
  if (row.docStatus === "revoked" || row.docStatus === "stale") return false;
  if (!row.docsUpdatedAt) return row.docStatus === "registered";
  if (row.registrationNeverExpires) return true;
  const expiresAt = row.docsExpiresAt ?? registrationExpiryFor(row.docsUpdatedAt, false)!;
  return expiresAt.getTime() >= now.getTime();
}
