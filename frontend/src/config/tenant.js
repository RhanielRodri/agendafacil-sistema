import studioCut from "./demos/studio-cut.js";
import lumiere from "./demos/lumiere.js";

export const businesses = {
  "studio-cut": studioCut,
  lumiere
};

const routes = {
  "/studio-cut": { page: "home", businessId: "studio-cut" },
  "/studio-cut/admin": { page: "admin", businessId: "studio-cut" },
  "/lumiere": { page: "home", businessId: "lumiere" },
  "/lumiere/admin": { page: "admin", businessId: "lumiere" }
};

const legacyRedirects = {
  "/demo/studio-cut": "/studio-cut",
  "/demo/studio-cut/admin": "/studio-cut/admin",
  "/demo/lumiere": "/lumiere",
  "/demo/lumiere/admin": "/lumiere/admin",
  "/admin": "/studio-cut/admin"
};

function normalizePath(pathname) {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

const requestedPath = normalizePath(window.location.pathname);
const canonicalPath = legacyRedirects[requestedPath] || requestedPath;

if (canonicalPath !== requestedPath) {
  window.history.replaceState({}, "", canonicalPath);
}

export const currentRoute = routes[canonicalPath] || {
  page: "neutral",
  businessId: null
};

const tenant = currentRoute.businessId ? businesses[currentRoute.businessId] : null;

export const homePath = tenant ? `/${tenant.slug}` : "/";
export const adminPath = tenant ? `/${tenant.slug}/admin` : "/";
export const isNeutralRoute = tenant === null;

export default tenant;
