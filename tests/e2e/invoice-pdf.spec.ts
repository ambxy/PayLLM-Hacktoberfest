import { test, expect, demoApprove } from "./helpers";
import mails from "../../fixtures/mail.json" with { type: "json" };

// Keep the running demo's bank state intact; PDFs and UI are served by the app.
test("invoice PDF preview, downloads, keyboard dismissal and mobile layout", async ({
  page,
  request,
}) => {
  await page.route("**/api/invoices", (route) =>
    route.fulfill({
      json: {
        emails: mails,
        invoices: mails.map((mail) => ({
          ...mail.attachment,
          emailId: mail.id,
          id: `${mail.attachment.recipientId}:${mail.attachment.number}`,
          status: "scheduled",
        })),
      },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/invoices");
  for (const mail of mails) {
    const invoice = mail.attachment;
    const open = page.getByRole("button", {
      name: `${invoice.issuer} invoice preview`,
    });
    await open.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toHaveText(
      `${invoice.issuer} invoice`,
    );
    const url = `/invoices/${invoice.number}.pdf`;
    await expect(dialog.locator("iframe")).toHaveAttribute(
      "src",
      `${url}#view=FitH`,
    );
    const response = await request.get(url);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(
      dialog.getByRole("link", { name: "Open in new tab" }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      dialog.getByRole("link", { name: "Open in new tab" }),
    ).toHaveAttribute("href", url);
    const downloadEvent = page.waitForEvent("download");
    await dialog.getByRole("link", { name: "Download" }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`${invoice.number}.pdf`);
    expect(await download.failure()).toBeNull();
    const popupEvent = page.waitForEvent("popup");
    await dialog.getByRole("link", { name: "Open in new tab" }).click();
    const popup = await popupEvent;
    await popup.close();
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `/tmp/td-${invoice.recipientId}-preview.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(open).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Aoba Design invoice preview" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "/tmp/td-invoice-mobile.png" });
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByText("View source email", { exact: true }).first().click();
  await expect(
    page.locator("main").getByText(mails[0].body, { exact: true }),
  ).toBeVisible();
});
