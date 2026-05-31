import {
  buildBrowserOnlyWtfOsCliCommands,
  buildWtfOsCliCommands,
  indexWtfOsCliCommands,
  type WtfOsCliCommand,
} from "@shared/wtfos-cli";

export function buildBrowserWtfOsCliCommands(): WtfOsCliCommand[] {
  return [...buildWtfOsCliCommands(), ...buildBrowserOnlyWtfOsCliCommands()];
}

export { indexWtfOsCliCommands };
