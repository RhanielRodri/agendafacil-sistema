// Testes de backup/export/restore. Fonte real em SQLite; provam integridade
// (checksum), round-trip de restauração, recusa cross-tenant, exclusão de
// tabelas sensíveis e mascaramento.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { compileSeedSql } from "../client-packs/seed.mjs";
import {
  buildBackup, verifyBackup, restoreStatements, toCsv, EXCLUDED_TABLES, EXPORT_TABLES
} from "../client-packs/backup.mjs";
import { readTenantTables } from "../client-packs/source.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dirname, "..");

async function schema() {
  return readFile(join(CF, "migrations", "0001_full_schema.sql"), "utf8");
}
async function pack(slug) {
  return JSON.parse(await readFile(join(CF, "client-packs", `${slug}.json`), "utf8"));
}

function tmpFile() {
  return join(mkdtempSync(join(tmpdir(), "afbk-")), "d1.sqlite");
}

async function seededDb(withAppointment = true) {
  const path = tmpFile();
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(await schema());
  db.exec(compileSeedSql(await pack("studio-cut"), { now: "2026-07-22T00:00:00.000Z" }));
  db.exec(compileSeedSql(await pack("lumiere"), { now: "2026-07-22T00:00:00.000Z" }));
  if (withAppointment) {
    db.exec(`INSERT INTO clients (id, tenant_id, name, phone, normalized_phone, email) VALUES ('cli-1','studio-cut','Maria Silva','27988887777','27988887777','maria@exemplo.com');`);
    db.exec(`INSERT INTO appointments (id, tenant_id, service_id, professional_id, client_id, client_name, client_phone, appointment_date, start_time, end_time)
      VALUES ('apt-1','studio-cut','service-studio-cut','professional-studio-1','cli-1','Maria Silva','27988887777','2026-08-01','09:00','09:30');`);
  }
  db.close();
  return path;
}

test("backup tem checksum íntegro e não inclui tabelas sensíveis", async () => {
  const path = await seededDb();
  const tables = readTenantTables(path, "studio-cut");
  const backup = buildBackup({ tenant: "studio-cut", tables, now: "2026-07-22T10:00:00.000Z" });
  assert.equal(verifyBackup(backup).ok, true);
  for (const t of EXCLUDED_TABLES) assert.ok(!(t in backup.tables), `${t} não deve estar no backup`);
  assert.equal(backup.tables.appointments.length, 1);
  assert.equal(backup.tables.clients.length, 1);
});

test("checksum adulterado reprova", async () => {
  const path = await seededDb();
  const backup = buildBackup({ tenant: "studio-cut", tables: readTenantTables(path, "studio-cut") });
  backup.tables.clients[0].name = "Adulterado";
  assert.equal(verifyBackup(backup).ok, false);
});

test("backup com tabela proibida reprova", async () => {
  const path = await seededDb();
  const backup = buildBackup({ tenant: "studio-cut", tables: readTenantTables(path, "studio-cut") });
  backup.tables.appointment_access_tokens = [{ tenant_id: "studio-cut", token: "x" }];
  backup.checksum = "sha256:forjado";
  const res = verifyBackup(backup);
  assert.equal(res.ok, false);
});

test("restore round-trip reconstrói os dados no destino", async () => {
  const src = await seededDb(true);
  const backup = buildBackup({ tenant: "studio-cut", tables: readTenantTables(src, "studio-cut") });

  // Destino: schema + provisão (cria tenant e estrutura, sem atendimento).
  const dstPath = tmpFile();
  const dst = new DatabaseSync(dstPath);
  dst.exec("PRAGMA foreign_keys = ON;");
  dst.exec(await schema());
  dst.exec(compileSeedSql(await pack("studio-cut"), { now: "2026-07-22T00:00:00.000Z" }));
  assert.equal(dst.prepare("SELECT count(*) c FROM appointments").get().c, 0);

  dst.exec(restoreStatements(backup, "studio-cut").join("\n"));
  assert.equal(dst.prepare("SELECT count(*) c FROM appointments WHERE tenant_id='studio-cut'").get().c, 1);
  assert.equal(dst.prepare("SELECT name FROM clients WHERE id='cli-1'").get().name, "Maria Silva");

  // O re-export do destino tem o mesmo checksum do backup original.
  const rebuilt = buildBackup({ tenant: "studio-cut", tables: readTenantTables(dstPath, "studio-cut"), now: backup.createdAt });
  assert.equal(rebuilt.checksum, backup.checksum);
  dst.close();
});

test("restore recusa backup de outro tenant", async () => {
  const path = await seededDb();
  const backup = buildBackup({ tenant: "studio-cut", tables: readTenantTables(path, "studio-cut") });
  assert.throws(() => restoreStatements(backup, "lumiere"), /recusado/);
});

test("export CSV mascara dados pessoais quando pedido", async () => {
  const path = await seededDb();
  const tables = readTenantTables(path, "studio-cut");
  const csv = toCsv(tables.clients, { mask: true });
  assert.ok(!csv.includes("27988887777"), "telefone bruto não deve aparecer");
  assert.ok(!csv.includes("maria@exemplo.com"), "email bruto não deve aparecer");
  assert.ok(csv.includes("77"), "sufixo do telefone preservado");
});

test("filtro de período limita agendamentos", async () => {
  const path = await seededDb();
  const before = readTenantTables(path, "studio-cut", { from: "2027-01-01" });
  assert.equal(before.appointments.length, 0, "nenhum agendamento após o corte");
  const within = readTenantTables(path, "studio-cut", { from: "2026-01-01", to: "2026-12-31" });
  assert.equal(within.appointments.length, 1);
});
