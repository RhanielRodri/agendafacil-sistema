// Backup, export e restore de dados de UM tenant. Lógica pura sobre conjuntos
// de linhas: a CLI pluga a fonte (SQLite local ou dump do wrangler). Nunca
// exporta segredos, tokens ou identidades do Access; nunca cruza tenants.

import { createHash } from "node:crypto";

export const FORMAT = "agendafacil-backup";
export const FORMAT_VERSION = 1;

// Domínios exportados, em ordem de dependência (para restaurar respeitando FKs).
export const EXPORT_TABLES = [
  { domain: "configuracoes", table: "tenant_settings" },
  { domain: "catalogo", table: "services" },
  { domain: "profissionais", table: "professionals" },
  { domain: "profissionais", table: "professional_services" },
  { domain: "horarios", table: "business_hours" },
  { domain: "horarios", table: "professional_schedules" },
  { domain: "bloqueios", table: "blocked_dates" },
  { domain: "bloqueios", table: "schedule_blocks" },
  { domain: "leads", table: "leads" },
  { domain: "clientes", table: "clients" },
  { domain: "agendamentos", table: "appointments" },
  { domain: "agendamentos", table: "appointment_slots" },
  { domain: "followups", table: "follow_ups" },
  { domain: "historico", table: "appointment_history_events" },
  { domain: "historico", table: "relationship_history_events" }
];

// Tabelas que jamais entram num export/backup: tokens de acesso e identidade/
// membership do Access. Segredos ficam fora do artefato por princípio.
export const EXCLUDED_TABLES = ["appointment_access_tokens", "admin_identities", "admin_memberships"];

// Campos com dado pessoal, mascarados quando o export pede.
const MASK_FIELDS = new Set([
  "name", "phone", "email", "normalized_phone", "normalized_email",
  "client_name", "client_phone", "client_email", "notes"
]);

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function checksumTables(tables) {
  return "sha256:" + createHash("sha256").update(stableStringify(tables)).digest("hex");
}

// Monta o objeto de backup a partir de {table: rows[]} já escopado no tenant.
export function buildBackup({ tenant, tables, packVersion = null, now = new Date().toISOString() }) {
  const ordered = {};
  for (const { table } of EXPORT_TABLES) ordered[table] = tables[table] ?? [];
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    tenant,
    packVersion,
    createdAt: now,
    checksum: checksumTables(ordered),
    tables: ordered
  };
}

// Verifica formato, integridade (checksum) e que nenhuma linha pertence a outro
// tenant. Retorna { ok, errors }.
export function verifyBackup(backup) {
  const errors = [];
  if (!backup || typeof backup !== "object") return { ok: false, errors: ["backup ausente"] };
  if (backup.format !== FORMAT) errors.push("formato inválido");
  if (backup.formatVersion !== FORMAT_VERSION) errors.push("versão de formato incompatível");
  if (typeof backup.tenant !== "string" || !backup.tenant) errors.push("tenant ausente");
  if (!backup.tables || typeof backup.tables !== "object") errors.push("tabelas ausentes");
  if (errors.length === 0) {
    if (checksumTables(backup.tables) !== backup.checksum) errors.push("checksum não confere");
    for (const [table, rows] of Object.entries(backup.tables)) {
      if (EXCLUDED_TABLES.includes(table)) errors.push(`tabela proibida no backup: ${table}`);
      for (const row of rows) {
        if ("tenant_id" in row && row.tenant_id !== backup.tenant) {
          errors.push(`linha de outro tenant em ${table}`);
          break;
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function q(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

// SQL de restauração escopado ao tenant alvo. Recusa fechado se o backup for de
// outro tenant. Apaga (filhos→pais) e reinsere só o tenant alvo; jamais toca
// outro tenant.
export function restoreStatements(backup, targetTenant, { now = new Date().toISOString() } = {}) {
  const check = verifyBackup(backup);
  if (!check.ok) throw new Error(`backup inválido: ${check.errors.join("; ")}`);
  if (backup.tenant !== targetTenant) {
    throw new Error(`restore recusado: backup é de "${backup.tenant}", alvo é "${targetTenant}"`);
  }
  const statements = [`-- Restore de ${targetTenant} — ${now} — checksum ${backup.checksum}`];
  // DELETE em ordem reversa (filhos primeiro), sempre escopado.
  for (const { table } of [...EXPORT_TABLES].reverse()) {
    statements.push(`DELETE FROM ${table} WHERE tenant_id = ${q(targetTenant)};`);
  }
  // INSERT em ordem de dependência.
  for (const { table } of EXPORT_TABLES) {
    const rows = backup.tables[table] ?? [];
    for (const row of rows) {
      if (row.tenant_id !== targetTenant) throw new Error(`linha de outro tenant em ${table}`);
      const cols = Object.keys(row);
      statements.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => q(row[c])).join(", ")});`);
    }
  }
  return statements;
}

function maskValue(field, value) {
  if (value === null || value === undefined || value === "") return value;
  const s = String(value);
  if (field.includes("email")) {
    const [local, domain] = s.split("@");
    return domain ? `${local.slice(0, 1)}***@${domain}` : "***";
  }
  if (field.includes("phone")) return s.length > 2 ? `${"*".repeat(s.length - 2)}${s.slice(-2)}` : "**";
  if (field === "notes") return "***";
  // nomes: iniciais
  return s.split(/\s+/).map((w) => (w ? `${w[0]}.` : "")).join(" ").trim() || "***";
}

export function maskRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = MASK_FIELDS.has(k) ? maskValue(k, v) : v;
  return out;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV de um domínio (lista de linhas). Cabeçalho pela união de colunas.
export function toCsv(rows, { mask = false } = {}) {
  const data = mask ? rows.map(maskRow) : rows;
  if (data.length === 0) return "";
  const cols = data.reduce((set, r) => {
    Object.keys(r).forEach((k) => set.add(k));
    return set;
  }, new Set());
  const header = [...cols];
  const lines = [header.map(csvCell).join(",")];
  for (const row of data) lines.push(header.map((c) => csvCell(row[c])).join(","));
  return lines.join("\n") + "\n";
}

// Agrupa as linhas exportadas por domínio (para gerar um CSV por domínio).
export function groupByDomain(tables) {
  const groups = {};
  for (const { domain, table } of EXPORT_TABLES) {
    groups[domain] = (groups[domain] || []).concat((tables[table] ?? []).map((r) => ({ _table: table, ...r })));
  }
  return groups;
}
