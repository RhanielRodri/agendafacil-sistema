import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const cloudflareRoot = dirname(dirname(scriptPath));
const repositoryRoot = dirname(cloudflareRoot);
const stagingEnvPath = join(cloudflareRoot, ".env.staging");
const policyName = "Allow configured admin email";

export const targets = [
  {
    key: "STUDIO_CUT",
    label: "Studio Cut",
    name: "AgendaFácil Staging — Studio Cut Admin",
    domain: "agendafacil-staging-studio-cut-admin.sor-os-demos.workers.dev"
  },
  {
    key: "LUMIERE",
    label: "Lumière",
    name: "AgendaFácil Staging — Lumière Admin",
    domain: "agendafacil-staging-lumiere-admin.sor-os-demos.workers.dev"
  }
];

export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

function readEnvFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

export function loadEnvironment(processEnvironment = process.env) {
  return Object.assign(
    {},
    readEnvFile(join(repositoryRoot, "backend", ".env")),
    readEnvFile(join(repositoryRoot, ".env")),
    readEnvFile(join(repositoryRoot, ".env.local")),
    readEnvFile(stagingEnvPath),
    processEnvironment
  );
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}.`);
  return value;
}

function normalizeHostname(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function applicationHostnames(application) {
  const values = [application.domain];
  for (const item of application.self_hosted_domains || []) {
    values.push(typeof item === "string" ? item : item?.hostname);
  }
  for (const destination of application.destinations || []) {
    values.push(destination?.uri, destination?.hostname);
  }
  return [...new Set(values.map(normalizeHostname).filter(Boolean))];
}

export function isExactEmailPolicy(policy, email) {
  const include = Array.isArray(policy.include) ? policy.include : [];
  const emails = include
    .map((rule) => rule?.email?.email)
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase());
  return policy.name === policyName
    && policy.decision === "allow"
    && Number(policy.precedence) === 1
    && include.length === 1
    && emails.length === 1
    && emails[0] === email.toLowerCase()
    && (!policy.exclude || policy.exclude.length === 0)
    && (!policy.require || policy.require.length === 0);
}

export function updateEnvText(text, updates) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  for (const [name, value] of Object.entries(updates)) {
    const index = lines.findIndex((line) => new RegExp(`^\\s*${name}\\s*=`).test(line));
    const next = `${name}=${value}`;
    if (index === -1) lines.push(next);
    else lines[index] = next;
  }
  return `${lines.join(newline)}${newline}`;
}

export class CloudflareApi {
  constructor(accountId, token, fetchImplementation = fetch) {
    this.root = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
    this.token = token;
    this.fetch = fetchImplementation;
  }

  async request(path, options = {}) {
    const response = await this.fetch(`${this.root}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: "error"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) {
      const codes = Array.isArray(payload?.errors)
        ? payload.errors.map((error) => error?.code).filter(Boolean).join(", ")
        : "indisponível";
      throw new Error(`Cloudflare API recusou a operação (${response.status}; código ${codes}).`);
    }
    return payload;
  }

  async list(path) {
    const results = [];
    let page = 1;
    while (true) {
      const separator = path.includes("?") ? "&" : "?";
      const payload = await this.request(`${path}${separator}page=${page}&per_page=50`);
      if (!Array.isArray(payload.result)) throw new Error("Cloudflare API retornou uma lista ambígua.");
      results.push(...payload.result);
      const totalPages = Number(payload.result_info?.total_pages || 1);
      if (page >= totalPages) return results;
      page += 1;
    }
  }
}

function analyzeApplication(applications, target) {
  const byDomain = applications.filter((application) => applicationHostnames(application).includes(target.domain));
  const byName = applications.filter((application) => application.name === target.name);
  if (byDomain.length > 1) throw new Error(`${target.label}: mais de uma aplicação usa o domínio esperado.`);
  if (byName.some((application) => !byDomain.includes(application))) {
    throw new Error(`${target.label}: o nome esperado já está ligado a outro domínio.`);
  }
  const application = byDomain[0] || null;
  if (!application) return { application: null, applicationNeedsUpdate: false };
  if (application.type !== "self_hosted") {
    throw new Error(`${target.label}: o domínio está ligado a um tipo de aplicação incompatível.`);
  }
  const hostnames = applicationHostnames(application);
  if (hostnames.length !== 1 || hostnames[0] !== target.domain) {
    throw new Error(`${target.label}: a aplicação cobre destinos adicionais ou incompatíveis.`);
  }
  return {
    application,
    applicationNeedsUpdate: application.name !== target.name || application.session_duration !== "24h"
  };
}

function analyzePolicies(policies, target, email) {
  const named = policies.filter((policy) => policy.name === policyName);
  if (named.length > 1) throw new Error(`${target.label}: há policies duplicadas com o nome esperado.`);
  if (policies.some((policy) => policy.name !== policyName)) {
    throw new Error(`${target.label}: há policy adicional potencialmente conflitante.`);
  }
  const policy = named[0] || null;
  return { policy, policyNeedsUpdate: !policy || !isExactEmailPolicy(policy, email) };
}

function applicationBody(target) {
  return {
    name: target.name,
    type: "self_hosted",
    domain: target.domain,
    session_duration: "24h"
  };
}

function policyBody(email) {
  return {
    name: policyName,
    decision: "allow",
    precedence: 1,
    include: [{ email: { email } }],
    exclude: [],
    require: []
  };
}

function normalizeTeamDomain(value) {
  const normalized = value?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!normalized) return null;
  return normalized.includes(".") ? normalized : `${normalized}.cloudflareaccess.com`;
}

async function getTeamDomain(api, environment) {
  const local = normalizeTeamDomain(environment.ACCESS_TEAM_DOMAIN);
  let payload;
  try {
    payload = await api.request("/access/organizations");
  } catch {
    if (local && !local.startsWith("nao-configurado")) return local;
    return null;
  }
  const remote = normalizeTeamDomain(payload.result?.auth_domain);
  if (!remote) throw new Error("A organização Zero Trust não retornou auth_domain.");
  if (local && local !== remote) throw new Error("ACCESS_TEAM_DOMAIN local diverge da organização Zero Trust.");
  return remote;
}

async function discoverTeamDomain(fetchImplementation = fetch) {
  const response = await fetchImplementation(`https://${targets[0].domain}/api/admin/context`, {
    redirect: "manual"
  });
  const location = response.headers.get("location");
  const hostname = normalizeHostname(location);
  if (!hostname?.endsWith(".cloudflareaccess.com")) {
    throw new Error("O desafio real do Access não revelou um team domain válido.");
  }
  return hostname;
}

async function inspect(api, environment) {
  const applications = await api.list("/access/apps");
  const states = [];
  for (const target of targets) {
    const email = required(environment, `${target.key}_ADMIN_EMAIL`).toLowerCase();
    const applicationState = analyzeApplication(applications, target);
    let policyState = { policy: null, policyNeedsUpdate: true };
    if (applicationState.application) {
      const policies = await api.list(`/access/apps/${applicationState.application.id}/policies`);
      policyState = analyzePolicies(policies, target, email);
    }
    states.push({ target, email, ...applicationState, ...policyState });
  }
  return states;
}

async function apply(api, states) {
  for (const state of states) {
    let application = state.application;
    if (!application) {
      application = (await api.request("/access/apps", {
        method: "POST",
        body: applicationBody(state.target)
      })).result;
      console.log(`${state.target.label}: aplicação criada.`);
    } else if (state.applicationNeedsUpdate) {
      application = (await api.request(`/access/apps/${application.id}`, {
        method: "PUT",
        body: applicationBody(state.target)
      })).result;
      console.log(`${state.target.label}: aplicação atualizada.`);
    } else {
      console.log(`${state.target.label}: aplicação já estava correta.`);
    }

    if (!state.policy) {
      await api.request(`/access/apps/${application.id}/policies`, {
        method: "POST",
        body: policyBody(state.email)
      });
      console.log(`${state.target.label}: policy criada.`);
    } else if (state.policyNeedsUpdate) {
      await api.request(`/access/apps/${application.id}/policies/${state.policy.id}`, {
        method: "PUT",
        body: policyBody(state.email)
      });
      console.log(`${state.target.label}: policy atualizada.`);
    } else {
      console.log(`${state.target.label}: policy já estava correta.`);
    }
  }
}

async function verify(api, environment) {
  const states = await inspect(api, environment);
  for (const state of states) {
    if (!state.application || state.applicationNeedsUpdate || !state.policy || state.policyNeedsUpdate) {
      throw new Error(`${state.target.label}: configuração remota não converge para o estado esperado.`);
    }
    if (!state.application.aud) throw new Error(`${state.target.label}: a aplicação não retornou AUD.`);
  }
  if (states[0].application.aud === states[1].application.aud) {
    throw new Error("As duas aplicações retornaram o mesmo AUD.");
  }
  return states;
}

function persistEnvironment(teamDomain, states) {
  const current = existsSync(stagingEnvPath) ? readFileSync(stagingEnvPath, "utf8") : "";
  const next = updateEnvText(current, {
    ACCESS_TEAM_DOMAIN: teamDomain,
    STUDIO_CUT_ACCESS_POLICY_AUD: states[0].application.aud,
    LUMIERE_ACCESS_POLICY_AUD: states[1].application.aud
  });
  const temporary = `${stagingEnvPath}.tmp`;
  writeFileSync(temporary, next, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, stagingEnvPath);
  console.log("Configuração local ignorada atualizada sem exibir valores sensíveis.");
}

export async function run(options = {}) {
  const environment = options.environment || loadEnvironment();
  const token = required(environment, "CLOUDFLARE_ACCESS_API_TOKEN");
  const accountId = required(environment, "CLOUDFLARE_ACCOUNT_ID");
  required(environment, "STUDIO_CUT_ADMIN_EMAIL");
  required(environment, "LUMIERE_ADMIN_EMAIL");
  const api = options.api || new CloudflareApi(accountId, token, options.fetchImplementation);
  let teamDomain = await getTeamDomain(api, environment);
  const initial = await inspect(api, environment);
  if (options.check) {
    const verified = await verify(api, environment);
    teamDomain ||= await discoverTeamDomain(options.fetchImplementation);
    console.log("Cloudflare Access verificado: duas aplicações e duas policies estritas.");
    return verified;
  }
  await apply(api, initial);
  const verified = await verify(api, environment);
  teamDomain ||= await discoverTeamDomain(options.fetchImplementation);
  persistEnvironment(teamDomain, verified);
  console.log("Cloudflare Access configurado e verificado com sucesso.");
  return verified;
}

if (process.argv[1] && scriptPath === process.argv[1]) {
  run({ check: process.argv.includes("--check") }).catch((error) => {
    console.error(error instanceof Error ? error.message : "Falha inesperada ao configurar Cloudflare Access.");
    process.exitCode = 1;
  });
}
