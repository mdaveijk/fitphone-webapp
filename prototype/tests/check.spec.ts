import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({ page }) => {
  page.on("pageerror", (error) =>
    console.error("Browser error:", error.message),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("Browser console:", message.text());
  });
  page.on("requestfailed", (request) =>
    console.error(
      "Request failed:",
      request.url(),
      request.failure()?.errorText,
    ),
  );
});

// Synthetic images are generated in memory. No personal screenshots are committed.
async function syntheticScreenshot(
  page: Page,
  lines: string[],
  type: "image/png" | "image/jpeg" | "image/webp" = "image/png",
) {
  const bytes = await page.evaluate(
    ({ lines, type }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 1150;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#111111";
      context.font = "36px Arial";
      lines.forEach((line, i) => context.fillText(line, 65, 100 + i * 78));
      return Array.from(
        Uint8Array.from(atob(canvas.toDataURL(type).split(",")[1]), (char) =>
          char.charCodeAt(0),
        ),
      );
    },
    { lines, type },
  );
  return {
    name: `synthetic.${type.split("/")[1]}`,
    mimeType: type,
    buffer: Buffer.from(bytes),
  };
}
async function confirmAndSave(page: Page) {
  await page
    .getByLabel("Deze gegevens horen bij één gekozen dag", { exact: false })
    .check();
  await page
    .getByLabel("Ik heb alle ingevulde gegevens", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Meting opslaan", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Je meting is opgeslagen",
  );
}
test("manual entry, explicit verification, persistence and zero", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Gegevens handmatig invullen" })
    .click();
  await page.locator('input[type="date"]').fill("2026-01-15");
  await page.getByLabel("Uren", { exact: true }).fill("2");
  await page.getByLabel("Minuten", { exact: true }).fill("15");
  await page.getByLabel("Type telling").selectOption("pickups");
  await page.getByLabel("Aantal", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Metingen" }).click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByLabel("Uren", { exact: true })).toHaveValue("2");
  await page
    .getByRole("button", { name: "Meting opslaan", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("bevestig");
  await confirmAndSave(page);
  await expect(page.locator(".measurement")).toContainText("2 u 15 min");
  await page.reload();
  await page.getByRole("button", { name: "Metingen" }).click();
  await expect(page.locator(".measurement")).toHaveCount(1);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fitphone.check.v1")!),
  );
  expect(stored.measurements[0]).toMatchObject({
    screenTimeMinutes: 135,
    pickups: 0,
    pickupMetric: "pickups",
    source: "manual",
  });
});
test("invalid file and corrupt image fail gracefully", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Screenshots kiezen").setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("PNG, JPEG of WebP");
  await page.getByLabel("Screenshots kiezen").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a png"),
  });
  await page.getByRole("button", { name: "Gegevens herkennen" }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 165_000 });
  await expect(
    page.getByRole("button", { name: "Gegevens handmatig invullen" }),
  ).toBeEnabled();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
for (const scenario of [
  {
    name: "English iOS-style",
    platform: "iPhone",
    type: "image/png" as const,
    lines: [
      "Screen Time",
      "2026-01-15",
      "Day",
      "Total 4h 32m",
      "Most Used",
      "Instagram 1h 45m",
      "TikTok 1h 24m",
      "Pickups 68",
    ],
    metric: "pickups",
  },
  {
    name: "Dutch Android-style",
    platform: "Android",
    type: "image/webp" as const,
    lines: [
      "Digitaal welzijn",
      "2026-01-15",
      "Vandaag",
      "Schermtijd 4 u 32 min",
      "Meest gebruikt",
      "Instagram 1 uur 45 minuten",
      "TikTok 1 uur 24 minuten",
      "Ontgrendelingen 68",
    ],
    metric: "unlocks",
  },
]) {
  test(`real Tesseract OCR: ${scenario.name} synthetic image`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("radio", { name: new RegExp(scenario.platform) })
      .check();
    const screenshot = await syntheticScreenshot(
      page,
      scenario.lines,
      scenario.type,
    );
    await page.getByLabel("Screenshots kiezen").setInputFiles(screenshot);
    await expect(
      page.getByAltText(`Voorbeeld van ${screenshot.name}`),
    ).toBeVisible();
    await page.getByRole("button", { name: "Gegevens herkennen" }).click();
    await expect(
      page.getByRole("heading", { name: "Klopt alles?" }),
    ).toBeVisible({ timeout: 165_000 });
    await expect(page.getByLabel("Uren", { exact: true })).toHaveValue("4");
    await expect(page.getByLabel("Minuten", { exact: true })).toHaveValue("32");
    await expect(page.getByLabel("Aantal", { exact: true })).toHaveValue("68");
    await expect(page.getByLabel("Type telling")).toHaveValue(scenario.metric);
    await expect(page.getByLabel("App 1", { exact: true })).toHaveValue(
      "Instagram",
    );
    await page.getByText("Vergelijk met je screenshots").click();
    await expect(
      page.getByAltText(`Voorbeeld van ${screenshot.name}`),
    ).toBeVisible();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.getByLabel("Minuten", { exact: true }).fill("30");
    await page.screenshot({
      path: `test-results/review-${scenario.metric}.png`,
      fullPage: true,
    });
    await confirmAndSave(page);
    await expect(page.locator(".measurement")).toContainText("4 u 30 min");
    await page.screenshot({
      path: `test-results/saved-${scenario.metric}.png`,
      fullPage: true,
    });
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("fitphone.check.v1")!),
    );
    expect(stored.measurements[0]).toMatchObject({
      date: "2026-01-15",
      screenTimeMinutes: 270,
      pickups: 68,
      pickupMetric: scenario.metric,
      source: "screenshot",
    });
    expect(stored.measurements[0].apps).toHaveLength(2);
    expect(JSON.stringify(stored)).not.toContain("base64");
  });
}
test("multiple screenshots recognize and merge complementary data", async ({
  page,
}) => {
  await page.goto("/");
  const total = await syntheticScreenshot(page, [
    "2026-01-15",
    "Today",
    "Screen Time 4h 32m",
  ]);
  const apps = await syntheticScreenshot(
    page,
    ["2026-01-15", "Today", "Most Used", "Instagram 1h 45m", "Pickups 68"],
    "image/jpeg",
  );
  await page.getByLabel("Screenshots kiezen").setInputFiles([total, apps]);
  await page.getByRole("button", { name: "Gegevens herkennen" }).click();
  await expect(page.getByRole("heading", { name: "Klopt alles?" })).toBeVisible(
    { timeout: 165_000 },
  );
  await expect(page.getByLabel("Uren", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Minuten", { exact: true })).toHaveValue("32");
  await expect(page.getByLabel("Aantal", { exact: true })).toHaveValue("68");
  await expect(page.getByLabel("App 1", { exact: true })).toHaveValue(
    "Instagram",
  );
  await confirmAndSave(page);
});

test("recognizes a date without a year and only asks for the missing year", async ({
  page,
}) => {
  await page.goto("/");
  const screenshot = await syntheticScreenshot(page, [
    "Sunday, 11 September",
    "PICKUPS",
    "First Pickup Total Pickups",
    "00:02 100",
  ]);
  await page.getByLabel("Screenshots kiezen").setInputFiles(screenshot);
  await page.getByRole("button", { name: "Gegevens herkennen" }).click();
  await expect(page.getByRole("heading", { name: "Klopt alles?" })).toBeVisible(
    { timeout: 165_000 },
  );
  await expect(page.locator(".partial-date")).toContainText(
    "11 september herkend",
  );
  await expect(page.getByLabel("Aantal", { exact: true })).toHaveValue("100");
  await expect(page.locator('input[type="date"]')).toHaveValue("");
  await page.getByLabel("Jaar van de meting").fill("2026");
  await expect(page.getByRole("status")).toContainText(
    "valt niet op de herkende zondag",
  );
  await page.locator('input[type="date"]').fill("2022-09-11");
  await expect(
    page.getByText("valt niet op de herkende zondag", { exact: false }),
  ).toHaveCount(0);
  await confirmAndSave(page);
  await expect(page.locator(".measurement")).toContainText("11 september 2022");
  await expect(page.locator(".measurement")).toContainText("100");
});
test("multiple images, cancellation and responsive layout", async ({
  page,
}) => {
  await page.goto("/");
  const first = await syntheticScreenshot(page, ["Today", "Total 4h"]);
  const second = await syntheticScreenshot(
    page,
    ["Today", "Pickups 68"],
    "image/jpeg",
  );
  await page.getByLabel("Screenshots kiezen").setInputFiles([first, second]);
  await expect(page.locator(".preview-item")).toHaveCount(2);
  await page.getByRole("button", { name: "Gegevens herkennen" }).click();
  await page.getByRole("button", { name: "Herkenning annuleren" }).click();
  await expect(
    page.getByRole("button", { name: "Gegevens herkennen", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/mobile-upload.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({
    path: "test-results/desktop-upload.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
