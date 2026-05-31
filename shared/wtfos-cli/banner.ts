import { WTFOS_PLATFORM_LONG_NAME } from "../platform-branding";

export function wtfOsCliBanner(): string {
  return [
    " __      _____ _____   ___  ____ ",
    " \\ \\    / /_ _|  ___| / _ \\/ ___|",
    "  \\ \\  / / | || |_   | | | \\___ \\",
    "   \\ \\/ /  | ||  _|  | |_| |___) |",
    "    \\_/  |___|_|     \\___/|____/ ",
    "",
    `${WTFOS_PLATFORM_LONG_NAME} command line — safe, artistic, no arbitrary shell.`,
  ].join("\n");
}

export function wtfOsCliMotd(): string {
  const tips = [
    "Type `help` for allowlisted commands.",
    "Try `banner`, `theme`, or `motd` when you need vibes.",
    "Use `open /mission-control` instead of hunting menus.",
    "Switch back anytime with `desktop`.",
  ];
  const index = new Date().getDate() % tips.length;
  return tips[index] ?? tips[0]!;
}
