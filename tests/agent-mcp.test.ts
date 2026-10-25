import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import type { AddressInfo } from "node:net";

const token = `abg.${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}.${"a".repeat(64)}`;
const seen: { method?: string; url?: string; auth?: string; body: string }[] =
  [];
let status = 200;
const bank = createServer((req: IncomingMessage, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push({
      method: req.method,
      url: req.url,
      auth: req.headers.authorization,
      body,
    });
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ route: req.url }));
  });
});
await new Promise<void>((r) => bank.listen(0, "127.0.0.1", r));
const port = (bank.address() as AddressInfo).port;
const dir = mkdtempSync(tmpdir() + "/agent-mcp-");
const connection = dir + "/connection.json";
writeFileSync(
  connection,
  JSON.stringify({
    endpoint: `http://127.0.0.1:${port}/api/external-agent/balance`,
    token,
  }),
);

function mcp(file: string) {
  const child = spawn(process.execPath, ["scripts/agent-bank-mcp.mjs", file]);
  const lines = createInterface({ input: child.stdout })[
    Symbol.asyncIterator
  ]();
  let id = 0;
  return {
    async request(method: string, params?: object) {
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) + "\n",
      );
      const { value } = await lines.next();
      assert.ok(value, "MCP server closed stdout");
      return JSON.parse(value);
    },
    close: () => child.kill(),
  };
}

test("MCP server exposes only the external agent bank tools", async () => {
  const s = mcp(connection);
  try {
    const init = await s.request("initialize", {
      protocolVersion: "2025-06-18",
    });
    assert.deepEqual(init.result.capabilities, { tools: {} });
    const list = await s.request("tools/list");
    assert.deepEqual(
      list.result.tools.map((t: { name: string }) => t.name),
      ["get_balance", "redeem_approved_investments", "get_redemption_status"],
    );
    assert.equal((await s.request("unknown")).error.code, -32601);
  } finally {
    s.close();
  }
});

test("MCP tools call the bank with the connection credential", async () => {
  seen.length = 0;
  status = 200;
  const s = mcp(connection);
  try {
    const balance = await s.request("tools/call", { name: "get_balance" });
    assert.equal(balance.result.isError, undefined);
    assert.match(balance.result.content[0].text, /balance/);
    await s.request("tools/call", { name: "redeem_approved_investments" });
    await s.request("tools/call", { name: "get_redemption_status" });
    assert.deepEqual(
      seen.map((r) => [r.method, r.url, r.auth, r.body]),
      [
        ["GET", "/api/external-agent/balance", `Bearer ${token}`, ""],
        [
          "POST",
          "/api/external-agent/redemptions",
          `Bearer ${token}`,
          '{"action":"redeem-approved"}',
        ],
        ["GET", "/api/external-agent/redemptions", `Bearer ${token}`, ""],
      ],
    );
    const extra = await s.request("tools/call", {
      name: "redeem_approved_investments",
      arguments: { amountJpy: "1" },
    });
    assert.equal(extra.error.code, -32602);
    assert.equal(seen.length, 3);
  } finally {
    s.close();
  }
});

test("MCP tools report bank rejections and invalid connections as errors", async () => {
  status = 403;
  const s = mcp(connection);
  try {
    const r = await s.request("tools/call", {
      name: "redeem_approved_investments",
    });
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /Only the human can grant/);
  } finally {
    s.close();
  }
  const bad = dir + "/bad.json";
  writeFileSync(
    bad,
    JSON.stringify({
      endpoint: "http://example.com/api/external-agent/balance",
      token,
    }),
  );
  const b = mcp(bad);
  try {
    const r = await b.request("tools/call", { name: "get_balance" });
    assert.equal(r.result.isError, true);
    assert.doesNotMatch(r.result.content[0].text, new RegExp(token));
  } finally {
    b.close();
    bank.close();
  }
});
