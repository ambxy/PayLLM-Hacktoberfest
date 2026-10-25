import { sendChat, resetDemo } from "./helpers";
import { test, expect, demoApprove } from "./helpers";
import { test as unauthenticated } from "@playwright/test";

unauthenticated(
  "explicit demo login hides private UI until selected and logout removes it",
  async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Log in to Agent Bank" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Agent chat" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: "/private/tmp/td-auth-login.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continue as demo" }).click();
    await expect(
      page.getByRole("heading", { name: "Accounts", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
        cookie: document.cookie,
      })),
    ).toEqual({ local: 0, session: 0, cookie: "" });
    const cookie = (await page.context().cookies()).find(
      (c) => c.name === "bank_session",
    );
    expect(cookie?.httpOnly).toBe(true);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(
      page.getByRole("heading", { name: "Log in to Agent Bank" }),
    ).toBeVisible();
  },
);

test("World unavailable permits explicit scoped demo consent; OK alone changes nothing", async ({
  page,
}) => {
  await page.goto("/");
  const reset = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/demo/reset") &&
      response.request().method() === "POST",
  );
  await resetDemo(page);
  expect((await reset).ok()).toBeTruthy();
  await page.reload();
  await expect(
    page.locator("main").getByText("¥1,000,000", { exact: true }),
  ).toBeVisible();

  await sendChat(
    page,
    "I allow access to my emails. Please check the invoices.",
  );
  const mail = page.getByRole("region", { name: "Email access confirmation" });
  const proposal = page.getByText("Automatic payment proposal");
  await Promise.race([mail.waitFor(), proposal.waitFor()]);
  if (await mail.isVisible()) {
    await expect(
      mail.getByText(
        /Email access: Aoba Design sample email, Sakura Office sample email/,
      ),
    ).toBeVisible();
    await expect(mail.getByText(/Agent: bank-agent/)).toBeVisible();
    await mail.getByRole("button", { name: "Authorize and review" }).click();
  }
  await expect(proposal).toBeVisible();

  await sendChat(page, "Confirm these settings");
  expect(await (await page.request.get("/api/rules")).json()).toEqual([]);
  const panel = page.getByRole("region", { name: "World approval" });
  const begun = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/demo/approvals") &&
      response.request().postDataJSON().action === "begin",
  );
  await panel.getByRole("button", { name: "Continue as demo" }).click();
  const cancelledChallenge = await (await begun).json();
  await expect(
    panel.getByRole("heading", { name: "Payments on due dates" }),
  ).toBeVisible();
  await expect(panel.getByText("Sakura Office", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: /^Investing in / }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Cancel" }).click();
  const replay = await page.request.post("/api/demo/approvals", {
    data: { action: "confirm", id: cancelledChallenge.id },
  });
  expect(replay.status()).toBe(409);
  expect(await (await page.request.get("/api/rules")).json()).toEqual([]);

  await sendChat(page, "Confirm these settings");
  await demoApprove(page);
  await expect(
    page.getByText(/Approval method: Demo approval \(without World\)/),
  ).toHaveCount(2);
  await page.goto("/rules");
  await page.getByRole("button", { name: "Revoke permission" }).first().click();
  await expect(page.getByText(/Revoked/)).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/td-auth-permissions.png",
    fullPage: true,
  });
});

test("session invalidation hides loaded banking data", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await page.request.post("/api/auth/logout", {
    data: {},
    headers: { Origin: baseURL! },
  });
  await page
    .getByRole("link", { name: "Automation rules", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Log in to Agent Bank" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Agent chat" }),
  ).toHaveCount(0);
});

unauthenticated(
  "world mode presentation offers no demo continuation",
  async ({ page }) => {
    await page.route("**/api/auth/session", (r) =>
      r.fulfill({ json: { authenticated: false, authMode: "world" } }),
    );
    await page.route("**/api/world", (r) =>
      r.fulfill({
        json: {
          authMode: "world",
          required: true,
          enrolled: false,
          configured: false,
        },
      }),
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Log in to Agent Bank" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue as demo" }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "World is not configured. Standard mode requires World setup.",
      ),
    ).toBeVisible();
  },
);

test("World begin failure still offers explicit demo approval", async ({
  page,
}) => {
  await page.goto("/");
  await resetDemo(page);
  await expect(
    page.locator("main").getByText("¥1,000,000", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/world", async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({
        json: {
          authMode: "local-demo",
          required: false,
          enrolled: true,
          configured: true,
          mode: "live",
        },
      });
    else
      await route.fulfill({
        status: 503,
        json: { error: "Verifier unavailable" },
      });
  });

  await sendChat(
    page,
    "I allow access to my emails. Please check the invoices.",
  );
  const mail = page.getByRole("region", { name: "Email access confirmation" });
  await mail.getByRole("button", { name: "Authorize and review" }).click();
  await expect(page.getByText("Automatic payment proposal")).toBeVisible();

  await sendChat(page, "Confirm these settings");
  const panel = page.getByRole("region", { name: "World approval" });
  await expect(panel.getByRole("alert")).toBeVisible();
  await panel.getByRole("button", { name: "Continue as demo" }).click();
  await expect(
    panel.getByText("bank-agent can act only within these terms."),
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/td-auth-approval.png",
    fullPage: true,
  });
  await panel
    .getByRole("button", { name: "Approve these terms in demo" })
    .click();
  await expect(page.getByText("Approval", { exact: true })).toHaveCount(2);
});
