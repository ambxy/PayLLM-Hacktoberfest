import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Mail } from "../src/shared/domain";

process.env.AI_MODE = "local";
process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:11434";
process.env.LOCAL_LLM_MODEL = "gemma4:e4b";

const { extract, classifyRequest } = await import("../src/integrations/ai");

const mail: Mail = {
  id: "aoba-mail",
  sender: "billing@aoba.example",
  subject: "Invoice",
  body: "Invoice for September",
  attachment: {
    number: "AOBA-202609-001",
    issuer: "Aoba Design",
    recipientId: "aoba",
    amountJpy: "200000",
    dueAt: "2026-10-01T03:00:00.000Z",
    recurrenceKey: "aoba-services",
  },
};

afterEach(() => mock.restoreAll());

test("Local AI extraction accepts a matching invoice", async () => {
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init?: RequestInit) => {
      assert.equal(url, "http://127.0.0.1:11434/api/generate");
      const body = JSON.parse(init?.body as string);
      assert.equal(body.model, "gemma4:e4b");
      assert.equal(body.format, "json");
      return Response.json({
        response: JSON.stringify(mail.attachment),
      });
    },
  );
  const invoice = await extract(mail);
  assert.equal(invoice.id, "aoba:AOBA-202609-001");
  assert.equal(invoice.amountJpy, "200000");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("Local AI extraction rejects a changed payment amount", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json({
      response: JSON.stringify({
        ...mail.attachment,
        amountJpy: "300000",
      }),
    }),
  );
  await assert.rejects(extract(mail), /differs from source: amountJpy/);
});

test("Local AI classification returns valid action", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json({
      response: JSON.stringify({ action: "read_mail" }),
    }),
  );
  const action = await classifyRequest("メールを見せて");
  assert.equal(action, "read_mail");
});

test("Local AI rejects non-loopback base URL", async () => {
  process.env.LOCAL_LLM_BASE_URL = "http://evil.example.com";
  await assert.rejects(extract(mail), /loopback address/);
  process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:11434";
});
