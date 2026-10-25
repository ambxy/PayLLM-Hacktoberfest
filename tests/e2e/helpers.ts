import { conditions } from "../../src/shared/rule-conditions";
import type { Rule } from "../../src/shared/domain";
import {
  test as base,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    await page.context().setExtraHTTPHeaders({ Origin: origin });
    const response = await page.request.post("/api/auth/demo-login", {
      data: {},
      headers: { Origin: origin },
    });
    expect(response.ok()).toBeTruthy();
    const dashboard = await (await page.request.get("/api/dashboard")).json();
    if (BigInt(dashboard.locked ?? "0") > 0n) {
      const result = await page.request.post("/api/chat/messages", {
        data: { text: "Redeem all investments to TD" },
        headers: { Origin: origin },
      });
      expect(result.ok()).toBeTruthy();
    }
    await use(page);
  },
});
export { expect };
export async function demoApprove(page: Page) {
  await page
    .getByRole("region", { name: /World approval|Email access confirmation/ })
    .waitFor();
  const mail = page.getByRole("region", { name: "Email access confirmation" });
  if (await mail.isVisible()) {
    await mail.getByRole("button", { name: "Authorize and review" }).click();
    await expect(mail).not.toBeVisible();
    return;
  }
  const panel = page.getByRole("region", { name: "World approval" });
  await panel
    .getByRole("button", { name: "Continue as demo", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Approve these terms in demo", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
}
export async function approveApi(
  request: APIRequestContext,
  input: object,
  origin: string,
) {
  const begun = await request.post("/api/demo/approvals", {
    data: { action: "begin", input },
    headers: { Origin: origin },
  });
  expect(begun.ok()).toBeTruthy();
  const { id } = await begun.json();
  const completed = await request.post("/api/demo/approvals", {
    data: { action: "confirm", id },
    timeout: 120000,
    headers: { Origin: origin },
  });
  expect(completed.ok()).toBeTruthy();
  return completed.json();
}
export async function sendChat(page: Page, text: string) {
  await expect(
    page.getByRole("status", { name: "Agent is preparing a reply" }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Message the agent", exact: true })
    .fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Agent is preparing a reply" }),
  ).toHaveCount(0);
}
export async function runDemoEvent(page: Page, type: string, succeeds = true) {
  const response = await page.request.post("/api/demo/events", {
    data: { type, requestId: crypto.randomUUID() },
  });
  expect(response.ok()).toBe(succeeds);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("agent-bank:invoices-updated"));
    window.dispatchEvent(new Event("agent-bank:messages-updated"));
  });
}

export async function resetDemo(page: Page) {
  await page
    .getByRole("button", { name: "Open demo controls", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Demo controls" });
  await drawer.getByRole("button", { name: /(Initialize|Reset) demo/ }).click();
  await expect(drawer).not.toBeVisible({ timeout: 60000 });
}
export async function ruleFromApi(page: Page, id: Rule["id"]) {
  const response = await page.request.get("/api/rules");
  expect(response.ok()).toBeTruthy();
  const rules: (Rule & { status: string })[] = await response.json();
  const rule = rules.find((rule) => rule.id === id);
  expect(rule).toBeDefined();
  return rule!;
}
export async function changeRuleViaApi(
  page: Page,
  id: Rule["id"],
  patch: Partial<Rule>,
) {
  const rule = await ruleFromApi(page, id);
  await approveApi(
    page.request,
    {
      purpose: "change",
      change: {
        baseVersion: rule.version,
        conditions: conditions.parse({ ...rule, ...patch }),
      },
    },
    new URL(page.url()).origin,
  );
  return ruleFromApi(page, id);
}
export async function pauseRuleViaApi(page: Page, id: Rule["id"]) {
  const response = await page.request.post(`/api/rules/${id}/disable`, {
    data: {},
  });
  expect(response.ok()).toBeTruthy();
  return ruleFromApi(page, id);
}
