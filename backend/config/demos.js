export const DEFAULT_DEMO_ID = "studio-cut";

const demoIds = new Set([DEFAULT_DEMO_ID, "lumiere"]);

export function resolveDemoId(value) {
  const demoId = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_DEMO_ID;
  return demoIds.has(demoId) ? demoId : null;
}
