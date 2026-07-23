// Teste de ponta a ponta do ciclo de vida: validar → provisionar → operar →
// backup → reconciliar → restaurar, com SQL real em node:sqlite. Prova que as
// capacidades compõem sem perder dado operacional nem cruzar tenants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { validatePack } from "../client-packs/schema.mjs";
import { compileSeedSql } from "../client-packs/seed.mjs";
import { buildBackup, verifyBackup, restoreStatements, EXPORT_TABLES } from "../client-packs/backup.mjs";

// Lê as tabelas do tenant a partir de um handle em memória (a CLI usa a versão
// baseada em arquivo, source.mjs; aqui a fonte é o próprio db do teste).
function readTenantTablesInMemory(db, tenant) {
  const tables = {};
  for (const { table } of EXPORT_TABLES) {
    tables[table] = db.prepare(`SELECT * FROM ${table} WHERE tenant_id = ?`).all(tenant);
  }
  return tables;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dirname, "..");

async function schema() {
  return readFile(join(CF, "migrations", "0001_full_schema.sql"), "utf8");
}
async function pack(slug) {
  return JSON.parse(await readFile(join(CF, "client-packs", `${slug}.json`), "utf8"));
}
const count = (db, sql) => db.prepare(sql).get().c;

test("ciclo de vida completo preserva dados e isola o tenant", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(await schema());

  // 1. Validar e provisionar dois tenants.
  const studio = await pack("studio-cut");
  const lumiere = await pack("lumiere");
  assert.equal(validatePack(studio).ok, true);
  db.exec(compileSeedSql(studio, { now: "2026-07-22T00:00:00.000Z" }));
  db.exec(compileSeedSql(lumiere, { now: "2026-07-22T00:00:00.000Z" }));

  // 2. Operar: cliente + agendamento no serviço que será removido depois.
  db.exec(`INSERT INTO clients (id, tenant_id, name, phone, normalized_phone) VALUES ('cli-1','studio-cut','Ana','27988887777','27988887777');`);
  db.exec(`INSERT INTO appointments (id, tenant_id, service_id, professional_id, client_id, client_name, client_phone, appointment_date, start_time, end_time)
    VALUES ('apt-1','studio-cut','service-studio-combo','professional-studio-1','cli-1','Ana','27988887777','2026-08-01','09:00','10:00');`);

  // 3. Backup íntegro.
  const backup = buildBackup({ tenant: "studio-cut", tables: readTenantTablesInMemory(db, "studio-cut"), now: "2026-07-22T12:00:00.000Z" });
  assert.equal(verifyBackup(backup).ok, true);

  // 4. Atualizar: remove o serviço-combo e adiciona um novo. Reconciliação
  //    idempotente (roda duas vezes).
  const updated = JSON.parse(JSON.stringify(studio));
  updated.catalog.services = updated.catalog.services.filter((s) => s.id !== "service-studio-combo");
  updated.catalog.services.push({ id: "service-studio-kids", name: "Corte infantil", description: "Corte para crianças.", durationMinutes: 30, priceCents: 4000, active: true, displayOrder: 3, requiresEvaluation: false });
  updated.catalog.associations = updated.catalog.associations
    .filter((a) => a.serviceId !== "service-studio-combo")
    .concat([{ professionalId: "professional-studio-1", serviceId: "service-studio-kids" }]);
  assert.equal(validatePack(updated).ok, true);
  const reconcile = compileSeedSql(updated, { now: "2026-07-23T00:00:00.000Z", reconcile: true });
  db.exec(reconcile);
  db.exec(reconcile); // idempotência

  assert.equal(db.prepare("SELECT active FROM services WHERE id='service-studio-combo'").get().active, 0, "removido inativado");
  assert.equal(count(db, "SELECT count(*) c FROM appointments WHERE id='apt-1'"), 1, "atendimento preservado");
  assert.equal(count(db, "SELECT count(*) c FROM services WHERE id='service-studio-kids'"), 1, "novo serviço criado");
  assert.equal(count(db, "SELECT count(*) c FROM services WHERE tenant_id='lumiere' AND active=1"), lumiere.catalog.services.length, "Lumière intacta");

  // 5. Perda de dados + restauração a partir do backup.
  db.exec("DELETE FROM appointments WHERE tenant_id='studio-cut';");
  db.exec("DELETE FROM clients WHERE tenant_id='studio-cut';");
  assert.equal(count(db, "SELECT count(*) c FROM appointments WHERE tenant_id='studio-cut'"), 0);
  db.exec(restoreStatements(backup, "studio-cut").join("\n"));
  assert.equal(count(db, "SELECT count(*) c FROM appointments WHERE id='apt-1'"), 1, "atendimento restaurado");
  assert.equal(db.prepare("SELECT name FROM clients WHERE id='cli-1'").get().name, "Ana");

  // 6. Restore recusa alvo de outro tenant.
  assert.throws(() => restoreStatements(backup, "lumiere"), /recusado/);
  db.close();
});
