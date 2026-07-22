export interface Tenant {
  id: string;
  slug: string;
  name: string;
}

export interface PublicEnv {
  DB: D1Database;
  ASSETS?: Fetcher;
}

export interface AdminEnv {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_POLICY_AUD: string;
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
