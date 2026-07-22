import studioCut from "./demos/studio-cut.js";
import lumiere from "./demos/lumiere.js";

export const businesses = {
  "studio-cut": studioCut,
  lumiere
};

// Deployment fixado em uma vertical: a raiz é a landing (ou o painel) daquela
// demo e a outra sequer existe no bundle. Comparação com literais para que o
// valor seja dobrado no build.
export const fixedTenantSlug = import.meta.env.VITE_CF_TENANT === "studio-cut"
  ? "studio-cut"
  : import.meta.env.VITE_CF_TENANT === "lumiere" ? "lumiere" : "";

// `full` mantém o comportamento único do build atual (Vercel). Em Cloudflare a
// mesma aplicação é publicada duas vezes: o Public Worker só expõe as rotas
// públicas e o Admin Worker só expõe os painéis.
// Comparação direta com literais para que o valor seja dobrado no build e as
// duas superfícies possam ser separadas por eliminação de código morto.
export const surface = import.meta.env.VITE_CF_SURFACE === "admin"
  ? "admin"
  : import.meta.env.VITE_CF_SURFACE === "public" ? "public" : "full";

const routes = fixedTenantSlug
  ? {
      "/": { page: "home", businessId: fixedTenantSlug },
      "/admin": { page: "admin", businessId: fixedTenantSlug }
    }
  : {
      "/studio-cut": { page: "home", businessId: "studio-cut" },
      "/studio-cut/admin": { page: "admin", businessId: "studio-cut" },
      "/lumiere": { page: "home", businessId: "lumiere" },
      "/lumiere/admin": { page: "admin", businessId: "lumiere" }
    };

// Os endereços antigos continuam abrindo a mesma tela; só o pathname é
// reescrito, então `?m=` e `#agendamento=` sobrevivem ao redirecionamento.
const legacyRedirects = fixedTenantSlug
  ? {
      [`/${fixedTenantSlug}`]: "/",
      [`/${fixedTenantSlug}/admin`]: "/admin",
      [`/demo/${fixedTenantSlug}`]: "/",
      [`/demo/${fixedTenantSlug}/admin`]: "/admin"
    }
  : {
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

function surfacePath(path) {
  // No painel, o endereço público do mesmo negócio é atalho para o painel.
  if (surface !== "admin" || routes[path]?.page !== "home") return path;
  return path === "/" ? "/admin" : `${path}/admin`;
}

const requestedPath = normalizePath(window.location.pathname);
const canonicalPath = surfacePath(legacyRedirects[requestedPath] || requestedPath);

if (canonicalPath !== requestedPath) {
  window.history.replaceState({}, "", canonicalPath);
}

const matched = routes[canonicalPath];
const allowedHere = matched
  && (surface === "full" || (surface === "admin" ? matched.page === "admin" : matched.page === "home"));

export const currentRoute = allowedHere ? matched : { page: "neutral", businessId: null };

const tenant = currentRoute.businessId ? businesses[currentRoute.businessId] : null;

export const homePath = fixedTenantSlug ? "/" : tenant ? `/${tenant.slug}` : "/";
export const adminPath = fixedTenantSlug ? "/admin" : tenant ? `/${tenant.slug}/admin` : "/";
export const isNeutralRoute = tenant === null;

export default tenant;
