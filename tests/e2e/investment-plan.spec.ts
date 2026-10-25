import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`investment plan lists dated actions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const invoices = [
      {
        id: "aoba",
        issuer: "Aoba Design",
        amountJpy: "200000",
        dueAt: "2026-10-01T03:00:00Z",
        status: "scheduled",
      },
      {
        id: "sakura",
        issuer: "Sakura Office",
        amountJpy: "100000",
        dueAt: "2026-10-10T03:00:00Z",
        status: "scheduled",
      },
      {
        id: "card",
        issuer: "Harp Card",
        source: "card",
        cardName: "Harp Business Card",
        amountJpy: "300000",
        dueAt: "2026-10-20T03:00:00Z",
        status: "scheduled",
      },
    ];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/session")
        return route.fulfill({ json: { authenticated: true } });
      if (path === "/api/world")
        return route.fulfill({ json: { authMode: "local-demo" } });
      if (path === "/api/chat/messages") return route.fulfill({ json: [] });
      if (path === "/api/invoices")
        return route.fulfill({ json: { invoices, emails: [] } });
      if (path === "/api/rules")
        return route.fulfill({
          json: [
            {
              id: "investment",
              enabled: true,
              maxInvestmentJpy: "1000000",
              approvedDemoDate: "2026-09-27T00:00:00.000Z",
              investmentAllocations: invoices.map((invoice) => ({
                id: invoice.id,
                paymentId: invoice.id,
                dueAt: invoice.dueAt,
                amountJpy: invoice.amountJpy,
              })),
            },
          ],
        });
      return route.fulfill({ status: 404, json: {} });
    });
    await page.goto("/investment");
    const schedule = page.getByRole("region", { name: "Investment schedule" });
    await expect(schedule.getByRole("columnheader")).toHaveText([
      "Date",
      "Action",
    ]);
    await expect(schedule.getByRole("rowheader")).toHaveText([
      "Sep 27",
      "Oct 1",
      "Oct 10",
      "Oct 20",
    ]);
    await expect(schedule.getByRole("row").nth(1)).toContainText(
      "Invest ¥1,000,000 in Aave.",
    );
    for (const [index, amount, recipient, remaining] of [
      [2, "200,000", "Aoba Design", "800,000"],
      [3, "100,000", "Sakura Office", "700,000"],
      [4, "300,000", "Harp Business Card", "400,000"],
    ] as const) {
      const row = schedule.getByRole("row").nth(index);
      await expect(row).toContainText(
        `Return ¥${amount} from Aave to your deposit account.`,
      );
      await expect(row).toContainText(`Pay ¥${amount} to ${recipient}.`);
      await expect(row).toContainText(`Keep ¥${remaining} invested in Aave.`);
    }
    await expect(
      page.getByRole("button", { name: "Demo: Check available funds" }),
    ).toHaveCount(0);
    invoices[0].status = "paid";
    await page.evaluate(() =>
      window.dispatchEvent(new Event("agent-bank:invoices-updated")),
    );
    await expect(schedule.getByRole("row").nth(2)).toContainText(
      "Paid ¥200,000 to Aoba Design.",
    );
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/agent-bank-investment-schedule-${width}.png`,
      fullPage: true,
    });
  });
}
