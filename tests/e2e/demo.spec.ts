import { runDemoEvent, sendChat, resetDemo } from "./helpers";
import { test, expect, demoApprove } from "./helpers";
test("replay complete demo twice and inspect all five screens", async ({
  page,
}) => {
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.goto("/");
    await resetDemo(page);
    await expect(
      page.locator("main").getByText("¥1,000,000", { exact: true }),
    ).toBeVisible();
    await page.goto("/chat");

    await sendChat(
      page,
      "I allow access to my emails. Please check the invoices.",
    );
    await demoApprove(page);

    await sendChat(page, "Confirm these settings");
    await demoApprove(page);
    await expect(page.getByText("Approval", { exact: true })).toHaveCount(2);

    await runDemoEvent(page, "due_date_reached");
    await expect(page.getByText("Paid ¥200,000 to Aoba Design.")).toBeVisible();
    await page.goto("/invoices");
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
    await page.getByText("View source email").first().click();
    await page.screenshot({
      path: `/tmp/td-demo-invoices-${cycle}.png`,
      fullPage: true,
    });
    await page.goto("/chat");
    await page.goto("/investment");
    await expect(
      page.getByRole("region", { name: "Investment schedule" }),
    ).toContainText("Invest ¥400,000 in Aave.");
    await page.screenshot({
      path: `/tmp/td-demo-investment-${cycle}.png`,
      fullPage: true,
    });
    await page.goto("/rules");
    await expect(
      page.getByRole("heading", { name: "Manageable amount" }),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/td-demo-rules-${cycle}.png`,
      fullPage: true,
    });
    await page.goto("/chat");

    await sendChat(page, "Redeem all investments to TD");
    await expect(
      page.getByText(
        "Investments redeemed. ¥400,000 returned to your TD deposit.",
      ),
    ).toBeVisible();
    const result = await (await page.request.get("/api/dashboard")).json();
    expect(result.td).toBe("800000");
    expect(result.recipientTd).toBe("200000");
    expect(result.locked).toBe("0");
    expect(result.positionUsdc).toBe("0");
    expect(result.treasuryUsdc).toBe("10000000000");
    await expect(
      page.getByText("Execution details", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `/tmp/td-demo-chat-${cycle}.png`,
      fullPage: true,
    });
    await page.goto("/");
    await expect(
      page.locator("main").getByText("¥800,000", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/td-demo-home-${cycle}.png`,
      fullPage: true,
    });
  }
});
