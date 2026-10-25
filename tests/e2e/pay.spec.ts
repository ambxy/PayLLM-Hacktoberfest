import { runDemoEvent, sendChat, resetDemo } from "./helpers";
import { test, expect, demoApprove } from "./helpers";
test("due date pays once with receipt and current monthly usage", async ({
  page,
}) => {
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
  await expect(
    page.getByText("Automatic payment proposal", { exact: true }),
  ).toBeVisible();
  await page.getByText("View source email", { exact: true }).first().click();
  await expect(
    page.getByText(
      "Please find attached the invoice for September design services totaling JPY 200,000. Payment is due by October 1 at 12:00 JST.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto("/invoices");
  await expect(
    page.getByText(
      "Eligible invoices appear here once you approve the payment terms.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await page.goto("/chat");

  await sendChat(page, "Confirm these settings");
  await demoApprove(page);
  await expect(page.getByText("Approval", { exact: true })).toHaveCount(2);
  await page.goto("/invoices");
  await expect(
    page.getByRole("heading", { name: "Sakura Office", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Scheduled", { exact: true })).toHaveCount(2);
  await page.goto("/chat");

  await runDemoEvent(page, "due_date_reached");
  await expect(
    page.getByText("Paid ¥200,000 to Aoba Design.", {
      exact: true,
    }),
  ).toBeVisible();
  const first = await (await page.request.get("/api/dashboard")).json();
  expect(first.td).toBe("400000");
  expect(first.recipientTd).toBe("200000");

  await runDemoEvent(page, "due_date_reached");

  const second = await (await page.request.get("/api/dashboard")).json();
  expect(second.td).toBe("400000");
  await page.screenshot({ path: "/tmp/td-bank-pay.png", fullPage: true });
});
