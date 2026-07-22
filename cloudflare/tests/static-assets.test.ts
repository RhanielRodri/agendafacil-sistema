import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { serveAsset } from "../shared/src/assets";
import { adminCall, setupAdminAccess } from "./admin-harness";

const ORIGIN = "https://cf1d-assets.local";

// O binding real de Static Assets não existe no pool de testes, então o
// contrato de cache e fallback é verificado contra um servidor equivalente.
function assetServer(body = "<!doctype html>", status = 200): Fetcher {
  return {
    fetch: async () => new Response(body, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  } as unknown as Fetcher;
}

async function serve(path: string, audience: "public" | "admin") {
  return serveAsset(new Request(`${ORIGIN}${path}`), assetServer(), audience);
}

beforeAll(async () => {
  await setupAdminAccess();
});

describe("cache dos Static Assets", () => {
  it("marca arquivo versionado como imutável nas duas superfícies", async () => {
    const publicAsset = await serve("/assets/main-BEAL0Owd.js", "public");
    const adminAsset = await serve("/assets/main-DVXa5sHT.css", "admin");
    expect(publicAsset.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(adminAsset.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("revalida o HTML público e nunca guarda o painel em cache", async () => {
    const landing = await serve("/studio-cut", "public");
    const panel = await serve("/studio-cut/admin", "admin");

    expect(landing.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(panel.headers.get("Cache-Control")).toBe("no-store");
    expect(panel.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(landing.headers.get("X-Robots-Tag")).toBeNull();
    expect(landing.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("não trata caminho sem hash como versionado", async () => {
    const unhashed = await serve("/assets/logo.svg", "public");
    expect(unhashed.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  });
});

describe("fallback de SPA", () => {
  it("rota de API desconhecida responde 404 em JSON, sem cair no HTML", async () => {
    const publicApi = await SELF.fetch(`${ORIGIN}/api/tenants/studio-cut/inexistente`);
    const adminApi = await adminCall("/api/admin/tenants/studio-cut/inexistente");

    expect(publicApi.status).toBe(404);
    expect(publicApi.headers.get("Content-Type")).toContain("application/json");
    expect(await publicApi.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(adminApi.status).toBe(404);
    expect(adminApi.headers.get("Content-Type")).toContain("application/json");
  });

  it("API administrativa nunca é cacheável", async () => {
    const context = await adminCall("/api/admin/context");
    expect(context.headers.get("Cache-Control")).toBe("no-store");
  });

  it("API pública continua respondendo antes de qualquer asset", async () => {
    const live = await SELF.fetch(`${ORIGIN}/api/live`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ ok: true });
    expect(env.DB).toBeDefined();
  });
});
