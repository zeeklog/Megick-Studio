export function backgroundWorkersEnabled() {
  const value = process.env.MEGICK_RUN_WORKERS;
  if (value === undefined) return true;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
