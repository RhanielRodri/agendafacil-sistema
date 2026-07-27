import site from "../config/site.js";

export function professionalDisplayName(professional) {
  if (!professional) return "";
  if (site.slug !== "studio-cut") return professional.name;
  return site.professionals?.[professional.id]?.name || professional.name;
}
