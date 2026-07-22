import { generateKeyPair, SignJWT } from "jose";
import type { AdminEnv } from "../../shared/src/types";
import { createAdminHandler } from "./index";

// Entrada exclusiva do smoke local. Em produção o Cloudflare Access verifica a
// identidade na borda e injeta `Cf-Access-Jwt-Assertion`; nenhuma máquina local
// consegue emitir esse token. Aqui um par de chaves efêmero assume esse papel
// para que o painel possa ser exercitado de ponta a ponta antes da publicação.
//
// Este arquivo NÃO é o `main` de `wrangler.admin.jsonc`: o Worker publicado
// continua sendo `index.ts`, sem nenhuma destas linhas.

interface DevEnv extends AdminEnv {
  ACCESS_DEV_EMAIL?: string;
}

let keys: Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> | null = null;

function keyPair() {
  keys ??= generateKeyPair("RS256").then((pair) => ({
    privateKey: pair.privateKey as CryptoKey,
    publicKey: pair.publicKey as CryptoKey
  }));
  return keys;
}

async function devAssertion(env: DevEnv, email: string): Promise<string> {
  const { privateKey } = await keyPair();
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(`https://${env.ACCESS_TEAM_DOMAIN.replace(/^https:\/\//, "")}`)
    .setAudience(env.ACCESS_POLICY_AUD)
    .setExpirationTime("30m")
    .sign(privateKey);
}

export default {
  async fetch(request: Request, env: DevEnv, ctx: ExecutionContext): Promise<Response> {
    const devEmail = env.ACCESS_DEV_EMAIL;
    if (!devEmail) {
      return new Response("ACCESS_DEV_EMAIL ausente: esta entrada só serve ao smoke local.", { status: 500 });
    }

    const { publicKey } = await keyPair();
    const url = new URL(request.url);
    let forwarded = request;

    // A identidade simulada pode ser trocada por query para exercitar 401, 403
    // e a troca de painel sem reiniciar o servidor. O valor fica num cookie
    // para que as chamadas do próprio painel herdem a mesma identidade.
    const requested = url.searchParams.get("devIdentity");
    const cookie = /(?:^|;\s*)devIdentity=([^;]+)/.exec(request.headers.get("Cookie") || "")?.[1];
    const email = requested || (cookie && decodeURIComponent(cookie)) || devEmail;

    if (url.pathname.startsWith("/api/")) {
      const headers = new Headers(request.headers);
      if (email !== "anonimo") headers.set("Cf-Access-Jwt-Assertion", await devAssertion(env, email));
      else headers.delete("Cf-Access-Jwt-Assertion");
      forwarded = new Request(request, { headers }) as typeof request;
    }

    const response = await createAdminHandler({ jwtKey: publicKey }).fetch!(forwarded as never, env, ctx);
    if (!requested) return response;

    const withCookie = new Response(response.body, response);
    withCookie.headers.append("Set-Cookie", `devIdentity=${encodeURIComponent(email)}; Path=/; SameSite=Lax`);
    return withCookie;
  }
} satisfies ExportedHandler<DevEnv>;
