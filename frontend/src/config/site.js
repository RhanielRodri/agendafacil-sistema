import tenant from "./tenant.js";
import presentation from "./presentation.js";

// Visão pública combinada: o conteúdo do Client Pack (tenant) acrescido da
// camada de apresentação só-frontend. Componentes públicos consomem `site`; o
// `tenant.js` segue puro para o gate de paridade e para o restante do app.
const site = tenant
  ? {
      ...tenant,
      nav: presentation?.nav || null,
      differentials: presentation?.differentials || null,
      gallery: presentation?.gallery || null,
      reviews: presentation?.reviews || null,
      contact: presentation?.contact || null,
      professionals: presentation?.professionals || null,
      treatmentPhotos: presentation?.treatmentPhotos || null,
      wordmark: presentation?.wordmark || null,
      panelSubtitle: presentation?.panelSubtitle || null,
      brandSymbol: presentation?.brandSymbol || false,
      logo: { ...tenant.logo, ...(presentation?.logo || {}) },
      hero: { ...tenant.hero, ...(presentation?.hero || {}) },
      copy: { ...tenant.copy, ...(presentation?.copy || {}) },
      process: { ...tenant.process, ...(presentation?.process || {}) },
      space: { ...tenant.space, ...(presentation?.space || {}) },
      metadata: {
        ...tenant.metadata,
        ...(presentation?.metadata || {}),
        fonts: presentation?.fonts,
        faviconVariant: presentation?.faviconVariant
      }
    }
  : tenant;

export default site;
