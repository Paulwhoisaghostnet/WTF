import type { DesktopAppRegistrationView } from "@shared/desktop-apps";

export function isDesktopAppRuntimeAvailable(
  registration: Pick<DesktopAppRegistrationView, "enabled">
): boolean {
  return registration.enabled;
}
