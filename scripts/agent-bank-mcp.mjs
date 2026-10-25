import { createInterface } from "node:readline";
import { callBank } from "./agent-connection.mjs";

const path = process.argv[2] ?? process.env.AGENT_BANK_CONNECTION;
if (!path) {
  console.error(
    "Usage: node scripts/agent-bank-mcp.mjs /path/to/agent-bank-connection.json",
  );
  process.exit(1);
}

const tools = [
  {
    name: "get_balance",
    description:
      "Read the TD deposit balance of the bank account that a World-verified human connected to this agent. Returns available and locked (invested) amounts in JPY.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    call: () => callBank(path, "balance"),
  },
  {
    name: "redeem_approved_investments",
    description:
      "Redeem all invested funds back to the TD deposit account. Only works when the human approved this redemption when connecting the agent; the agent cannot choose amounts or recipients.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    call: () =>
      callBank(path, "redemptions", "POST", { action: "redeem-approved" }),
  },
  {
    name: "get_redemption_status",
    description:
      "Check the progress of the approved redemption. Use this before retrying if a redemption call was interrupted.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    call: () => callBank(path, "redemptions"),
  },
];

const denied = {
  401: "The bank rejected the connection: it expired, was revoked, or the demo account was reset. Ask the human to issue a new connection with World ID.",
  403: "This connection is not allowed to perform that operation. Only the human can grant more access, with a new World ID verification.",
};

async function callTool(params) {
  const tool = tools.find((t) => t.name === params?.name);
  if (!tool) throw Object.assign(new Error("Unknown tool"), { code: -32602 });
  if (params.arguments && Object.keys(params.arguments).length)
    throw Object.assign(new Error("This tool takes no arguments"), {
      code: -32602,
    });
  try {
    const r = await tool.call();
    return r.ok
      ? { content: [{ type: "text", text: JSON.stringify(r.body, null, 2) }] }
      : {
          isError: true,
          content: [
            {
              type: "text",
              text:
                denied[r.status] ??
                `The bank rejected the request (HTTP ${r.status}).`,
            },
          ],
        };
  } catch {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "Unable to reach the bank. Check the connection file and network, then check the status before retrying.",
        },
      ],
    };
  }
}

async function handle(msg) {
  switch (msg.method) {
    case "initialize":
      return {
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "agent-bank", version: "0.1.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: tools.map(({ call: _, ...t }) => t) };
    case "tools/call":
      return callTool(msg.params);
    default:
      throw Object.assign(new Error("Method not found"), { code: -32601 });
  }
}

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
  }
  if (msg.id === undefined) return;
  try {
    send({ jsonrpc: "2.0", id: msg.id, result: await handle(msg) });
  } catch (e) {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: e.code ?? -32603, message: e.message },
    });
  }
});
