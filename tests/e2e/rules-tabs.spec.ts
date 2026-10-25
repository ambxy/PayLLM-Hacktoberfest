import { test, expect } from "@playwright/test";
const authorization = {
  approvalId: "approved-plan",
  agentId: "bank-agent",
  scopes: ["payment", "investment"],
};
const baseRule = {
  version: 1,
  enabled: true,
  status: "active",
  recipientId: "aoba",
  maxPaymentJpy: "200000",
  monthlyLimitJpy: "200000",
  safetyBufferJpy: "100000",
  maxInvestmentJpy: "400000",
  minimumBalanceJpy: "0",
  payAt: "dueDate",
  consentId: "test",
  authorization,
};
for (const width of [1440, 390]) {
  test(`rules show one approved amount and compact data access at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const grants = [
      {
        id: "mail",
        status: "active",
        mailIds: ["aoba-mail"],
        authorization: {
          ...authorization,
          scopes: ["mail", "read", "propose"],
        },
      },
      { id: "operations", status: "active", mailIds: [], authorization },
    ];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/session")
        return route.fulfill({ json: { authenticated: true } });
      if (path === "/api/world")
        return route.fulfill({
          json: { authMode: "local-demo", configured: false },
        });
      if (path === "/api/rules")
        return route.fulfill({
          json: [
            { ...baseRule, id: "payment", investmentTarget: null },
            {
              ...baseRule,
              id: "investment",
              investmentTarget: {
                protocol: "Aave",
                mode: "stub",
                chainId: 31337,
              },
            },
          ],
        });
      if (path === "/api/delegations") return route.fulfill({ json: grants });
      if (path === "/api/delegations/mail/revoke") {
        grants[0].status = "revoked";
        return route.fulfill({ json: {} });
      }
      if (path === "/api/chat/messages") return route.fulfill({ json: [] });
      return route.fulfill({ status: 404, json: {} });
    });
    await page.goto("/rules");
    const agent = page.getByRole("region", {
      name: "Internal Agent",
      exact: true,
    });
    await expect(
      agent.getByRole("region", { name: "Manageable amount", exact: true }),
    ).toBeVisible();
    await expect(
      agent.getByRole("region", { name: "Data Access", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".automation-total")).toHaveText("¥600,000");
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Automatic payments" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("region", { name: "Data Access" }),
    ).toContainText("Emails & invoices · Account information");
    await page.screenshot({
      path: `/tmp/agent-bank-rules-simple-${width}.png`,
      fullPage: true,
    });
    await expect(
      page.getByText("Advanced settings", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Manageable amount",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Approved across all accounts · JPY", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Allowed", { exact: true })).toHaveCount(0);
    await page
      .getByRole("region", { name: "Data Access" })
      .getByRole("button", { name: "Revoke permission" })
      .click();
    await expect(
      page.getByRole("region", { name: "Data Access" }),
    ).toContainText("Revoked");
    await expect(
      page
        .getByRole("region", { name: "Data Access" })
        .getByRole("button", { name: "Revoke permission" }),
    ).toBeDisabled();
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  });
}
