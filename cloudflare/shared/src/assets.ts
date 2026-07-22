// Os arquivos versionados pelo Vite (`/assets/<nome>-<hash>.<ext>`) nunca mudam
// de conteúdo, então podem ficar no cache por muito tempo. O HTML é o ponto de
// entrada e precisa revalidar sempre, senão uma publicação nova continua
// servindo o bundle antigo. O painel, além disso, não pode ficar em cache
// compartilhado: a página é sempre de alguém autenticado.
const IMMUTABLE_PATH = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

export type AssetAudience = "public" | "admin";

export async function serveAsset(
  request: Request,
  assets: Fetcher,
  audience: AssetAudience
): Promise<Response> {
  const response = await assets.fetch(request);
  const headers = new Headers(response.headers);
  const path = new URL(request.url).pathname;

  if (IMMUTABLE_PATH.test(path)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (audience === "admin") {
    headers.set("Cache-Control", "no-store");
  } else {
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  }

  if (audience === "admin") {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
