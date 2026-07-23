import tenant from "./tenant.js";
import { presentation as studioCut } from "./demos/studio-cut.js";
import { presentation as lumiere } from "./demos/lumiere.js";

// A apresentação da vertical ativa. Em build fixado, a outra vira `absent.js`
// (presentation = null) e não entra no bundle. As chaves aqui são slugs em
// minúsculo, não a identidade de marca, então não disparam a guarda de bundle.
const presentations = { "studio-cut": studioCut, lumiere };

const presentation = tenant ? presentations[tenant.slug] || null : null;

export default presentation;
