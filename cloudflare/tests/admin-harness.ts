import { env } from "cloudflare:test";
import { generateKeyPair, SignJWT } from "jose";
import { createAdminHandler } from "../admin-worker/src/index";

export const ISSUER = "https://example.cloudflareaccess.com";
export const AUDIENCE = "local-test-audience";
export const EMAIL_STUDIO = "admin-studio@access.invalid";
export const EMAIL_LUMIERE = "admin-lumiere@access.invalid";
export const IDENTITY_STUDIO = "admin-identity-studio";
export const IDENTITY_LUMIERE = "admin-identity-lumiere";

let privateKey: CryptoKey;
let publicKey: CryptoKey;

export async function setupAdminAccess(): Promise<void> {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO admin_identities (id, email, name, active) VALUES (?, ?, ?, 1)")
      .bind(IDENTITY_STUDIO, EMAIL_STUDIO, "Operador Studio"),
    env.DB.prepare("INSERT INTO admin_identities (id, email, name, active) VALUES (?, ?, ?, 1)")
      .bind(IDENTITY_LUMIERE, EMAIL_LUMIERE, "Operadora Lumière"),
    env.DB.prepare("INSERT INTO admin_memberships (identity_id, tenant_id, role, active) VALUES (?, 'studio-cut', 'ADMIN', 1)")
      .bind(IDENTITY_STUDIO),
    env.DB.prepare("INSERT INTO admin_memberships (identity_id, tenant_id, role, active) VALUES (?, 'lumiere', 'ADMIN', 1)")
      .bind(IDENTITY_LUMIERE)
  ]);
}

export async function accessToken(email = EMAIL_STUDIO): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime("5m")
    .sign(privateKey);
}

export interface AdminCallOptions {
  method?: string;
  body?: unknown;
  email?: string | null;
  headers?: Record<string, string>;
  // Um deployment fixado em uma vertical difere apenas no ambiente.
  envOverride?: Record<string, unknown>;
}

export async function adminCall(path: string, options: AdminCallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.email !== null) {
    headers["Cf-Access-Jwt-Assertion"] = await accessToken(options.email ?? EMAIL_STUDIO);
  }
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const request = new Request(`https://admin.cf1.local${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const callEnv = options.envOverride ? { ...env, ...options.envOverride } : env;
  return createAdminHandler({ jwtKey: publicKey }).fetch!(request as never, callEnv as never, {} as ExecutionContext);
}

export async function adminJson<T>(path: string, options: AdminCallOptions = {}): Promise<T> {
  const response = await adminCall(path, options);
  return await response.json() as T;
}

export function adminPath(tenant: string, resource: string): string {
  return `/api/admin/tenants/${tenant}/${resource}`;
}
