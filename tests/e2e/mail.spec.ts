import { sendChat, resetDemo } from "./helpers";
import { test, expect, demoApprove } from "./helpers";

test("mail evidence is visible before consent and invoices wait for consent", async ({
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
  await page.getByText("View source email", { exact: true }).first().click();
  await expect(
    page.getByText(
      "Please find attached the invoice for September design services totaling JPY 200,000. Payment is due by October 1 at 12:00 JST.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Automatic payment proposal", { exact: true }),
  ).toBeVisible();
  await page.goto("/invoices");
  await expect(
    page.getByText(
      "Eligible invoices appear here once you approve the payment terms.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/td-bank-mail.png", fullPage: true });
});
