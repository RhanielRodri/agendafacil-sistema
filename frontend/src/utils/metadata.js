export const rootMetadata = {
  title: "Acesso direto | Experiências independentes",
  description: "As experiências públicas deste projeto são acessadas por seus endereços diretos.",
  themeColor: "#f5f5f3",
  mark: "·",
  background: "#171717",
  foreground: "#ffffff",
  canonical: `${window.location.origin}/`
};

function setMeta(selector, attribute, value) {
  const current = document.querySelector(selector);

  if (!value) {
    current?.remove();
    return;
  }

  const element = current || document.createElement("meta");

  if (!current) {
    const [key, keyValue] = attribute;
    element.setAttribute(key, keyValue);
    document.head.appendChild(element);
  }

  element.setAttribute("content", value);
}

function setCanonical(href) {
  let canonical = document.querySelector('link[rel="canonical"]');

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }

  canonical.setAttribute("href", href);
}

function ensureLink(rel, extra = {}) {
  const selectorParts = [`link[rel="${rel}"]`];
  let link = document.querySelector(selectorParts.join(""));
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", rel);
    Object.entries(extra).forEach(([key, value]) => link.setAttribute(key, value));
    document.head.appendChild(link);
  }
  return link;
}

// O favicon vive como SVG data-URI: um por vertical, sem arquivo físico e sem
// risco de 404 ou de vazamento cross-tenant no bundle. O mesmo desenho serve de
// apple-touch-icon. `variant` diferencia a linguagem: monograma reto e
// geométrico no Studio Cut, marca serifada e circular na Lumière.
export function faviconSvg(mark, background, foreground, variant) {
  if (variant === "serif") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${background}"/><circle cx="32" cy="32" r="21" fill="none" stroke="${foreground}" stroke-width="1.5" opacity="0.55"/><text x="32" y="43" fill="${foreground}" font-family="Georgia,'Times New Roman',serif" font-size="34" font-style="italic" text-anchor="middle">${mark}</text></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${background}"/><rect x="6" y="6" width="52" height="52" fill="none" stroke="${foreground}" stroke-width="2"/><text x="32" y="42" fill="${foreground}" font-family="'Arial Narrow',Arial,sans-serif" font-size="26" font-weight="800" letter-spacing="1" text-anchor="middle">${mark}</text></svg>`;
}

// O símbolo oficial da marca é literalmente o mesmo vetor do favicon: o header
// público e a sidebar do painel consomem este data-URI, então aba do navegador,
// site e admin exibem exatamente o mesmo desenho, sem PNG ampliado nem redesenho.
export function markDataUri(logo, variant) {
  if (!logo) return "";
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(logo.mark, logo.background, logo.foreground, variant))}`;
}

function setFavicon(mark, background, foreground, variant) {
  const href = markDataUri({ mark, background, foreground }, variant);
  ensureLink("icon", { type: "image/svg+xml" }).setAttribute("href", href);
  ensureLink("apple-touch-icon").setAttribute("href", href);
}

// Fontes por vertical só entram em runtime porque o build Cloudflare compartilha
// um único index.html: injetar aqui garante que o Studio Cut carregue apenas
// Barlow/Inter e a Lumière apenas Cormorant/Manrope.
function setFonts(href) {
  if (!href) return;
  const existing = document.querySelector("link[data-vertical-fonts]");
  if (existing) {
    if (existing.getAttribute("href") === href) return;
    existing.remove();
  }
  ensureLink("preconnect", { href: "https://fonts.googleapis.com" });
  ensureLink("preconnect", { href: "https://fonts.gstatic.com", crossorigin: "" });
  const link = document.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("href", href);
  link.setAttribute("data-vertical-fonts", "");
  document.head.appendChild(link);
}

export function applyMetadata(metadata) {
  const canonical = metadata.canonical || window.location.href;

  document.title = metadata.title;
  setMeta('meta[name="description"]', ["name", "description"], metadata.description);
  setMeta('meta[name="theme-color"]', ["name", "theme-color"], metadata.themeColor);
  setMeta('meta[property="og:title"]', ["property", "og:title"], metadata.title);
  setMeta('meta[property="og:description"]', ["property", "og:description"], metadata.description);
  setMeta('meta[property="og:type"]', ["property", "og:type"], "website");
  setMeta('meta[property="og:image"]', ["property", "og:image"], metadata.image);
  setMeta('meta[property="og:url"]', ["property", "og:url"], canonical);
  setMeta('meta[property="og:site_name"]', ["property", "og:site_name"], metadata.siteName);
  setCanonical(canonical);
  setFavicon(metadata.mark, metadata.background, metadata.foreground, metadata.faviconVariant);
  setFonts(metadata.fonts);
}
