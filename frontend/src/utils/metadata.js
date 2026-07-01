export const platformMetadata = {
  title: "AgendaFácil | Sistema de agendamento para pequenos negócios",
  description: "Organize serviços, profissionais, horários e atendimentos com uma página de agendamento e painel administrativo.",
  themeColor: "#2D6A4F",
  image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80",
  mark: "AF",
  background: "#2D6A4F",
  foreground: "#FAF6F0",
  siteName: "AgendaFácil"
};

function setMeta(selector, attribute, value) {
  let element = document.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    const [key, keyValue] = attribute;
    element.setAttribute(key, keyValue);
    document.head.appendChild(element);
  }
  element.setAttribute("content", value);
}

function setFavicon(mark, background, foreground) {
  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.setAttribute("rel", "icon");
    document.head.appendChild(icon);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${background}"/><text x="32" y="40" fill="${foreground}" font-family="Arial,sans-serif" font-size="24" font-weight="700" text-anchor="middle">${mark}</text></svg>`;
  icon.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(svg)}`);
}

export function applyMetadata(metadata) {
  document.title = metadata.title;
  setMeta('meta[name="description"]', ["name", "description"], metadata.description);
  setMeta('meta[name="theme-color"]', ["name", "theme-color"], metadata.themeColor);
  setMeta('meta[property="og:title"]', ["property", "og:title"], metadata.title);
  setMeta('meta[property="og:description"]', ["property", "og:description"], metadata.description);
  setMeta('meta[property="og:type"]', ["property", "og:type"], "website");
  setMeta('meta[property="og:image"]', ["property", "og:image"], metadata.image);
  setMeta('meta[property="og:url"]', ["property", "og:url"], window.location.href);
  setMeta('meta[property="og:site_name"]', ["property", "og:site_name"], metadata.siteName);
  setFavicon(metadata.mark, metadata.background, metadata.foreground);
}
