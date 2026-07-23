// Testes do gerador de seed contra o schema real do D1, executando SQL de
// verdade em node:sqlite com foreign_keys ligado. Provam idempotência,
// reconciliação (inativa sem apagar) e isolamento entre tenants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { compileSeedSql } from "../client-packs/seed.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dirname, "..");
const PACKS = join(CF, "client-packs");

async function loadPack(slug) {
  return JSON.parse(await readFile(join(PACKS, `${slug}.json`), "utf8"));
}

async function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(await readFile(join(CF, "migrations", "0001_full_schema.sql"), "utf8"));
  return db;
}

const count = (db, sql) => db.prepare(sql).get().c;

test("provision é idempotente", async () => {
  const db = await freshDb();
  const pack = await loadPack("studio-cut");
  const sql = compileSeedSql(pack, { now: "2026-07-22T00:00:00.000Z" });
  db.exec(sql);
  const after1 = {
    services: count(db, "SELECT count(*) c FROM services"),
    professionals: count(db, "SELECT count(*) c FROM professionals"),
    hours: count(db, "SELECT count(*) c FROM business_hours"),
    assoc: count(db, "SELECT count(*) c FROM professional_services")
  };
  db.exec(sql); // reexecução
  const after2 = {
    services: count(db, "SELECT count(*) c FROM services"),
    professionals: count(db, "SELECT count(*) c FROM professionals"),
    hours: count(db, "SELECT count(*) c FROM business_hours"),
    assoc: count(db, "SELECT count(*) c FROM professional_services")
  };
  assert.deepEqual(after1, after2);
  assert.equal(after1.services, pack.catalog.services.length);
  assert.equal(after1.hours, 7);
});

test("reconciliação inativa serviço removido e preserva o atendimento", async () => {
  const db = await freshDb();
  const pack = await loadPack("studio-cut");
  db.exec(compileSeedSql(pack, { now: "2026-07-22T00:00:00.000Z" }));

  // Atendimento operacional real sobre o serviço que será removido do pack.
  db.exec(`INSERT INTO clients (id, tenant_id, name, phone, normalized_phone) VALUES ('cli-1','studio-cut','Cliente Teste','27999999999','27999999999');`);
  db.exec(`INSERT INTO appointments (id, tenant_id, service_id, professional_id, client_id, client_name, client_phone, appointment_date, start_time, end_time)
    VALUES ('apt-1','studio-cut','service-studio-combo','professional-studio-1','cli-1','Cliente Teste','27999999999','2026-08-01','09:00','10:00');`);

  // Pack sem o serviço-combo (e sem suas associações).
  const modified = JSON.parse(JSON.stringify(pack));
  modified.catalog.services = modified.catalog.services.filter((s) => s.id !== "service-studio-combo");
  modified.catalog.associations = modified.catalog.associations.filter((a) => a.serviceId !== "service-studio-combo");

  db.exec(compileSeedSql(modified, { now: "2026-07-23T00:00:00.000Z", reconcile: true }));

  const combo = db.prepare("SELECT active FROM services WHERE id='service-studio-combo'").get();
  assert.ok(combo, "serviço removido continua existindo (não apagado)");
  assert.equal(combo.active, 0, "serviço removido foi inativado");
  assert.equal(count(db, "SELECT count(*) c FROM appointments WHERE id='apt-1'"), 1, "atendimento preservado");
  const active = db.prepare("SELECT active FROM services WHERE id='service-studio-cut'").get();
  assert.equal(active.active, 1, "serviço mantido segue ativo");
  // Associações do combo removidas; profissional intacto.
  assert.equal(count(db, "SELECT count(*) c FROM professional_services WHERE service_id='service-studio-combo'"), 0);
  assert.equal(count(db, "SELECT count(*) c FROM professionals WHERE id='professional-studio-1'"), 1);
});

test("reconciliação de um tenant não toca o outro", async () => {
  const db = await freshDb();
  const studio = await loadPack("studio-cut");
  const lumiere = await loadPack("lumiere");
  db.exec(compileSeedSql(studio, { now: "2026-07-22T00:00:00.000Z" }));
  db.exec(compileSeedSql(lumiere, { now: "2026-07-22T00:00:00.000Z" }));

  const lumiereBefore = count(db, "SELECT count(*) c FROM services WHERE tenant_id='lumiere' AND active=1");

  // Reconcilia studio-cut com um pack esvaziado de estrutura opcional.
  const stripped = JSON.parse(JSON.stringify(studio));
  stripped.catalog.services = [stripped.catalog.services[0]];
  stripped.catalog.associations = stripped.catalog.associations.filter((a) => a.serviceId === stripped.catalog.services[0].id);
  stripped.schedule.professionalSchedules = [];
  stripped.schedule.scheduleBlocks = [];
  db.exec(compileSeedSql(stripped, { now: "2026-07-23T00:00:00.000Z", reconcile: true }));

  const lumiereAfter = count(db, "SELECT count(*) c FROM services WHERE tenant_id='lumiere' AND active=1");
  assert.equal(lumiereAfter, lumiereBefore, "serviços da Lumière inalterados");
  assert.equal(count(db, "SELECT count(*) c FROM professional_schedules WHERE tenant_id='lumiere'"), lumiere.schedule.professionalSchedules.length);
  assert.equal(count(db, "SELECT count(*) c FROM schedule_blocks WHERE tenant_id='lumiere'"), lumiere.schedule.scheduleBlocks.length);
});
