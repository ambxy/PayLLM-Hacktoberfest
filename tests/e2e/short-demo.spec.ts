import { test, expect, resetDemo } from "./helpers";
for (const width of [1440, 390]) {
  test(`short card and invoice demo with four controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await resetDemo(page);
    await expect(
      page.locator("main").getByText("¥1,000,000", { exact: true }),
    ).toBeVisible();
    const open = async () =>
      page
        .getByRole("button", { name: "Open demo controls", exact: true })
        .click();
    const drawer = page.getByRole("dialog", { name: "Demo controls" });
    await open();
    await expect(drawer.locator(".demo-actions button")).toHaveCount(4);
    await expect(drawer.getByText("Invested principal")).toHaveCount(0);
    await drawer
      .getByRole("button", { name: "Grant card & invoice access", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Payments and investment plan" }),
    ).toBeVisible();
    await expect(page.locator(".payment-plan-card")).toContainText(
      "Harp Business Card",
    );
    await expect(page.locator(".payment-plan-card")).toContainText(
      "Card •••• 4242",
    );
    await expect(page.locator(".payment-plan-card")).toContainText(
      "¥1,000,000",
    );
    await expect(
      page
        .locator(".plan-investment-dates")
        .getByText("Payment: ¥200,000", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/agent-bank-short-proposal-${width}.png`,
      fullPage: true,
    });
    await page
      .locator(".chat-plan-actions")
      .getByRole("button", { name: "Yes", exact: true })
      .click();
    await expect(
      page.getByText(
        /Payments are scheduled. Started investing your full deposit/,
      ),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByRole("region", { name: "World approval" }),
    ).toHaveCount(0);
    let data = await (await page.request.get("/api/dashboard")).json();
    expect(data.td).toBe("0");
    expect(data.locked).toBe("1000000");
    await open();
    await page.screenshot({
      path: `/tmp/agent-bank-short-controls-${width}.png`,
      fullPage: true,
    });
    for (const [date, locked, paid] of [
      ["Sep 30", "1000000", "0"],
      ["Oct 1", "800000", "200000"],
      ["Oct 10", "700000", "300000"],
      ["Oct 20", "400000", "600000"],
    ]) {
      await drawer
        .getByRole("button", { name: "Change date · " + date, exact: true })
        .click();
      await expect(
        drawer.getByRole("button", { name: "Processing…", exact: true }),
      ).toHaveCount(0, { timeout: 60000 });
      data = await (await page.request.get("/api/dashboard")).json();
      expect(data.locked).toBe(locked);
      expect(data.recipientTd).toBe(paid);
    }
    await expect(
      drawer.getByRole("button", { name: "Change date", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await page.goto("/invoices");
    const card = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: "Harp Business Card" }),
    });
    await expect(card).toContainText("Paid");
    await expect(card).toContainText("¥300,000");
    await expect(card.getByText("View source email")).toHaveCount(0);
    await page.screenshot({
      path: `/tmp/agent-bank-short-payments-${width}.png`,
      fullPage: true,
    });
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  });
}
