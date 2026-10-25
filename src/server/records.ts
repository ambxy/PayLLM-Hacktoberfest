import "server-only";
import { sqlite, current } from "./db";
import { tables } from "./tables";
export type Table = (typeof tables)[number];
export function instance() {
  const s = current();
  if (!s) throw new Error("Initialize demo first");
  return s;
}
export function all<T>(table: Table): T[] {
  return (
    sqlite
      .prepare(`SELECT data FROM ${table} WHERE instance_id=? ORDER BY rowid`)
      .all(instance().id) as { data: string }[]
  ).map((r) => JSON.parse(r.data));
}
export function get<T>(table: Table, id: string): T | undefined {
  const row = sqlite
    .prepare(`SELECT data FROM ${table} WHERE instance_id=? AND id=?`)
    .get(instance().id, id) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
}
export function put<T extends { id: string }>(table: Table, row: T) {
  sqlite
    .prepare(
      `INSERT INTO ${table}(instance_id,id,data) VALUES(?,?,?) ON CONFLICT(instance_id,id) DO UPDATE SET data=excluded.data`,
    )
    .run(instance().id, row.id, JSON.stringify(row));
  return row;
}
