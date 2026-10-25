import "server-only";
import { tables } from "./tables";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { eq } from "drizzle-orm";
export const instances = sqliteTable("demo_instances", {
  id: text("id").primaryKey(),
  state: text("state").notNull(),
  status: text("status").notNull(),
});
const filename = process.env.DEMO_DB ?? ".data/demo.sqlite";
const shared = globalThis as typeof globalThis & {
  demoSqlite?: Database.Database;
};
function connect() {
  if (shared.demoSqlite) return shared.demoSqlite;
  mkdirSync(dirname(filename), { recursive: true });
  const connection = new Database(filename, { timeout: 10000 });
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.exec(
    `CREATE TABLE IF NOT EXISTS demo_instances (id TEXT PRIMARY KEY,state TEXT NOT NULL,status TEXT NOT NULL); CREATE TABLE IF NOT EXISTS control (id INTEGER PRIMARY KEY CHECK(id=1), active_instance TEXT, active_run TEXT); INSERT OR IGNORE INTO control(id) VALUES(1);`,
  );
  for (const table of tables)
    connection.exec(
      `CREATE TABLE IF NOT EXISTS ${table} (instance_id TEXT NOT NULL REFERENCES demo_instances(id), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(instance_id,id))`,
    );
  shared.demoSqlite = connection;
  return connection;
}
export const sqlite = new Proxy({} as Database.Database, {
  get(_target, property) {
    const connection = connect();
    const value = Reflect.get(connection, property);
    return typeof value === "function" ? value.bind(connection) : value;
  },
});
let orm: ReturnType<typeof drizzle> | undefined;
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, property) {
    orm ??= drizzle(connect());
    const value = Reflect.get(orm, property);
    return typeof value === "function" ? value.bind(orm) : value;
  },
});
export type DemoState = {
  id: string;
  clock: string;
  token: `0x${string}`;
  vault: `0x${string}`;
  customer: `0x${string}`;
  recipient: `0x${string}`;
  [key: string]: unknown;
};
export function current(): DemoState | null {
  const control = sqlite
    .prepare("SELECT active_instance FROM control WHERE id=1")
    .get() as { active_instance: string | null };
  if (!control.active_instance) return null;
  const row = db
    .select()
    .from(instances)
    .where(eq(instances.id, control.active_instance))
    .get();
  return row ? JSON.parse(row.state) : null;
}
export function save(state: DemoState) {
  db.update(instances)
    .set({ state: JSON.stringify(state) })
    .where(eq(instances.id, state.id))
    .run();
}
export function acquire(id: string) {
  const result = sqlite
    .prepare(
      "UPDATE control SET active_run=? WHERE id=1 AND active_run IS NULL",
    )
    .run(id);
  if (result.changes !== 1) throw new Error("Another operation is active");
}
export function release(id: string) {
  sqlite
    .prepare("UPDATE control SET active_run=NULL WHERE id=1 AND active_run=?")
    .run(id);
}
