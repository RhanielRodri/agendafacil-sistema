export interface Tenant {
  id: string;
  slug: string;
  name: string;
}

// `TENANT_SLUG` fixa o deployment em uma única vertical. Quando presente, ele é
// a única autoridade sobre o tenant: qualquer slug divergente na rota vira 404.
// Ausente, o Worker continua atendendo todos os tenants ativos.
export interface PublicEnv {
  DB: D1Database;
  TENANT_SLUG?: string;
  ASSETS?: Fetcher;
}

export interface AdminEnv {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_POLICY_AUD: string;
  TENANT_SLUG?: string;
  ASSETS?: Fetcher;
}

export interface AdminIdentity {
  id: string;
  email: string;
  name: string | null;
}

export interface AdminContext {
  identity: AdminIdentity;
  tenant: Tenant;
  role: "ADMIN";
}
