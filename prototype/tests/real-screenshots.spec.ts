import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// Opt-in private fixtures. Originals and OCR reports stay outside tracked source.
const directory = process.env.FITPHONE_SCREENSHOT_DIR;
test.skip(
  !directory,
  "Set FITPHONE_SCREENSHOT_DIR to a private screenshot directory.",
);
const fixtures = [
  {
    filename: "Screenshot_20261115_200041_Digital Wellbeing.jpg",
    hours: "",
    minutes: "",
    pickups: "",
    apps: [],
  },
  {
    filename: "Screenshot_20261115_195917_Digital Wellbeing.jpg",
    hours: "3",
    minutes: "29",
    pickups: "",
    apps: ["Chrome", "Spotify", "ChatGPT"],
  },
  {
    filename: "Screenshot_20261115_195925_Digital Wellbeing.jpg",
    hours: "",
    minutes: "",
    pickups: "",
    apps: [],
    weekly: true,
  },
  {
    filename: "Screenshot_20261115_195938_Digital Wellbeing.jpg",
    hours: "",
    minutes: "",
    pickups: "",
    apps: [],
    weekly: true,
  },
  {
    filename: "iPhone_Screentime.jpg",
    hours: "",
    minutes: "",
    pickups: "100",
    apps: [],
    partialDate: true,
  },
  {
    filename: "iPhone_Screentime_2.jpg",
    hours: "",
    minutes: "",
    pickups: "",
    apps: [],
    weekly: true,
  },
];

test("recognizes supplied real screenshots privately", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  const results = [];
  for (const fixture of fixtures) {
    const { filename } = fixture;
    await page.goto("/");
    if (!filename.startsWith("iPhone"))
      await page.getByRole("radio", { name: /Android/ }).check();
    await page
      .getByLabel("Screenshots kiezen")
      .setInputFiles(path.join(directory!, filename));
    await page.getByRole("button", { name: "Gegevens herkennen" }).click();
    await expect(
      page.getByRole("heading", { name: "Klopt alles?" }),
    ).toBeVisible({ timeout: 165_000 });
    const result = {
      filename,
      text: await page.locator(".ocr-details pre").textContent(),
      date: await page.locator('input[type="date"]').inputValue(),
      hours: await page.getByLabel("Uren", { exact: true }).inputValue(),
      minutes: await page.getByLabel("Minuten", { exact: true }).inputValue(),
      pickups: await page.getByLabel("Aantal", { exact: true }).inputValue(),
      apps: await page
        .locator(".app-name input")
        .evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value),
        ),
    };
    results.push(result);
    await writeFile(
      testInfo.outputPath("real-ocr-report.json"),
      JSON.stringify(results, null, 2),
    );
    expect(result.hours, filename).toBe(fixture.hours);
    expect(result.minutes, filename).toBe(fixture.minutes);
    expect(result.pickups, filename).toBe(fixture.pickups);
    expect(result.apps, filename).toEqual(fixture.apps);
    expect(
      result.date,
      "No fixture shows a year; never silently invent one",
    ).toBe("");
    if (fixture.weekly)
      await expect(page.locator(".notice").first()).toContainText(
        "Weekoverzicht of gemiddelde",
      );
    if (fixture.partialDate) {
      await expect(page.locator(".partial-date")).toContainText(
        "11 september herkend",
      );
      await page.getByLabel("Jaar van de meting").fill("2022");
      await expect(page.locator('input[type="date"]')).toHaveValue(
        "2022-09-11",
      );
      await page
        .getByLabel("Deze gegevens horen bij één gekozen dag", { exact: false })
        .check();
      await page
        .getByLabel("Ik heb alle ingevulde gegevens", { exact: false })
        .check();
      await page
        .getByRole("button", { name: "Meting opslaan", exact: true })
        .click();
      await expect(page.locator(".measurement")).toContainText(
        "11 september 2022",
      );
      await expect(page.locator(".measurement")).toContainText("100");
      await expect(page.locator(".measurement")).toContainText("Onbekend");
    }
    await page.evaluate(() => localStorage.clear());
  }
  await writeFile(
    testInfo.outputPath("real-ocr-report.json"),
    JSON.stringify(results, null, 2),
  );
});
