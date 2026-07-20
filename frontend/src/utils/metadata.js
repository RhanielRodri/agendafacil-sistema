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

function setFavicon(mark, background, foreground) {
  let icon = document.querySelector('link[rel="icon"]');

  if (!icon) {
    icon = document.createElement("link");
    icon.setAttribute("rel", "icon");
    document.head.appendChild(icon);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${background}"/><text x="32" y="41" fill="${foreground}" font-family="Arial,sans-serif" font-size="25" font-weight="700" text-anchor="middle">${mark}</text></svg>`;
  icon.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(svg)}`);
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
  setFavicon(metadata.mark, metadata.background, metadata.foreground);
}
