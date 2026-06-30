import studioCut from "./demos/studio-cut.js";
import lumiere from "./demos/lumiere.js";

export const demos = {
  "studio-cut": studioCut,
  lumiere
};

const routeSlug = window.location.pathname.match(/^\/demo\/([^/]+)/)?.[1];
const tenant = demos[routeSlug] || studioCut;

export const demoPath = `/demo/${tenant.slug}`;
export const adminPath = tenant.slug === "studio-cut" ? "/admin" : `${demoPath}/admin`;

export default tenant;
