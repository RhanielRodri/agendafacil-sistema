// Leitura escopada por tenant a partir de um arquivo SQLite (o D1 local do
// wrangler, ou um dump). Somente leitura. Alimenta backup/export sem que a
// lógica pura precise conhecer a fonte.

import { DatabaseSync } from "node:sqlite";
import { EXPORT_TABLES } from "./backup.mjs";

// Coluna de data usada no filtro de período, por tabela (quando faz sentido).
const PERIOD_COLUMN = {
  appointments: "appointment_date",
  appointment_history_events: "created_at",
  relationship_history_events: "created_at"
};

export function readTenantTables(sqlitePath, tenant, { from = null, to = null } = {}) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const tables = {};
    for (const { table } of EXPORT_TABLES) {
      let sql = `SELECT * FROM ${table} WHERE tenant_id = ?`;
      const params = [tenant];
      const dateCol = PERIOD_COLUMN[table];
      if (dateCol && from) {
        sql += ` AND ${dateCol} >= ?`;
        params.push(from);
      }
      if (dateCol && to) {
        sql += ` AND ${dateCol} <= ?`;
        params.push(to);
      }
      tables[table] = db.prepare(sql).all(...params);
    }
    return tables;
  } finally {
    db.close();
  }
}
