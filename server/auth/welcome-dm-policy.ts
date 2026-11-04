export const STARTER_WELCOME_DM_SOURCE = "wtfos-starter-welcome";

export function isStarterDesktopAppearance(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "desktopIconMode" in value &&
      value.desktopIconMode === "starter"
  );
}

export function starterWelcomeMessage(): string {
  return [
    "Welcome to wtfOS. Here are a few easy first steps:",
    "1. Open Profile and make it yours with a name and avatar.",
    "2. In Profile, verify a Tezos wallet or a social account to prove the identity you want to use.",
    "3. Open Mission Control to find verified actions that can earn EXP. Your EXP tier and title update as you progress.",
    "4. When the Green Room is active and you meet its milestones, completing it can unlock the contestant role and more challenges.",
    "Find the rest of your apps in Stuffs on the bottom bar. Click Paul if you need help using the desktop.",
  ].join("\n");
}
