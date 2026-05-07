export function getCollektModuleUrl(env: NodeJS.ProcessEnv = process.env) {
  const moduleUrl = env.COLLEKT_MODULE_URL?.trim();
  return moduleUrl || null;
}
