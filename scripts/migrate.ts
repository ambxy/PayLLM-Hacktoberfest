import { sqlite } from "../src/server/db";
sqlite.prepare("SELECT 1").get();
console.log("SQLite schema ready");
