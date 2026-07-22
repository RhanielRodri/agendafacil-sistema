export async function executeSqlScript(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => db.prepare(statement));
  await db.batch(statements);
}
