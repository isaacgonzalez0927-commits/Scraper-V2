/** Deployment feature gate. A safe manager does nothing until deliberately enabled. */
export function novaManagerEnabled(): boolean {
  return process.env.NOVA_MANAGER_ENABLED?.trim().toLowerCase() === "true";
}
