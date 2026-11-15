import { describe, expect, it } from "vitest";
import {
  detectPeriod,
  extractDate,
  mergeScreenshots,
  parseDuration,
  parseScreenshot,
} from "./parser";

describe("explicit durations", () => {
  it.each([
    ["4h 32m", 272],
    ["4 u 32 min", 272],
    ["4 uur 32 minuten", 272],
    ["4 hours 32 minutes", 272],
    ["1 hr 5 mins", 65],
    ["32 min", 32],
    ["0m", 0],
    ["24 uur", 1440],
  ])("%s → %s minutes", (text, minutes) =>
    expect(parseDuration(text)).toBe(minutes),
  );
  it.each([
    "9:41",
    "68",
    "42%",
    "4h 99m",
    "25h",
    "3.5h",
    "1,5 uur",
    "4h 2h",
    "12 maandag",
  ])("rejects unrelated or ambiguous %s", (text) =>
    expect(parseDuration(text)).toBeNull(),
  );
});
describe("daily screenshot parsing", () => {
  it("reads English iOS-style lines including split app rows", () => {
    expect(
      parseScreenshot(
        "Screen Time\n2026-11-15\nDay\n4h 32m\nTotal\nMost Used\nInstagram 1h 45m\nTikTok\n1h 24m\nPickups\n68",
      ),
    ).toMatchObject({
      date: "2026-11-15",
      period: "daily",
      screenTimeMinutes: 272,
      pickups: 68,
      pickupMetric: "pickups",
      apps: [
        { name: "Instagram", durationMinutes: 105 },
        { name: "TikTok", durationMinutes: 84 },
      ],
    });
  });
  it("reads Dutch Android-style labels without equating unlocks with pickups", () => {
    expect(
      parseScreenshot(
        "Digitaal welzijn\nVandaag\nSchermtijd 4 u 32 min\nMeest gebruikt\nWhatsApp 32 minuten\nYouTube 1 uur 10 minuten\nOntgrendelingen 68\nMeldingen 134",
      ),
    ).toMatchObject({
      screenTimeMinutes: 272,
      pickups: 68,
      pickupMetric: "unlocks",
      apps: [
        { name: "WhatsApp", durationMinutes: 32 },
        { name: "YouTube", durationMinutes: 70 },
      ],
    });
  });
  it("distinguishes activations", () =>
    expect(parseScreenshot("Dag\nActiveringen: 7")).toMatchObject({
      pickups: 7,
      pickupMetric: "activations",
      screenTimeMinutes: null,
    }));
  it("recognizes Dutch iOS pakmomenten", () =>
    expect(parseScreenshot("Dag\nPakmomenten 68")).toMatchObject({
      pickups: 68,
      pickupMetric: "pickups",
    }));
  it("allows app names containing the word App", () =>
    expect(parseScreenshot("Day\nMost Used\nApp Store 5m").apps).toEqual([
      { name: "App Store", durationMinutes: 5 },
    ]));
  it("leaves missing data empty and keeps explicit zero", () => {
    expect(parseScreenshot("Today\nInstagram 20m")).toMatchObject({
      screenTimeMinutes: null,
      pickups: null,
      pickupMetric: null,
    });
    expect(parseScreenshot("Today\nScreen Time 0m\nUnlocks 0")).toMatchObject({
      screenTimeMinutes: 0,
      pickups: 0,
      pickupMetric: "unlocks",
    });
  });
  it("does not use chart ticks, notifications, categories or a clock as totals/apps", () => {
    expect(
      parseScreenshot(
        "9:41\nToday\nNotifications 52\nMost used\nSocial 2h\nEntertainment 1h\n6\n12\n18",
      ),
    ).toMatchObject({ screenTimeMinutes: null, pickups: null, apps: [] });
  });
  it("does not infer totals from app durations or goals", () => {
    expect(
      parseScreenshot("Today\nScreen Time Goal 2h\nInstagram 40m"),
    ).toMatchObject({ screenTimeMinutes: null });
  });
  it("does not import ambiguous totals or mixed metrics", () => {
    expect(
      parseScreenshot(
        "Today\nTotal 4h\nScreen Time 3h\nPickups 42\nUnlocks 40",
      ),
    ).toMatchObject({
      screenTimeMinutes: null,
      pickups: null,
      pickupMetric: null,
    });
  });
  it("does not infer counts from percentages or malformed OCR", () => {
    expect(
      parseScreenshot("Today\nScreen Time Ah B2m\nPickups 68%\n5O"),
    ).toMatchObject({ screenTimeMinutes: null, pickups: null });
  });
  it("supports duration preceding app name on a separate line", () => {
    expect(parseScreenshot("Today\nMost used\n32 min\nSpotify")).toMatchObject({
      apps: [{ name: "Spotify", durationMinutes: 32 }],
    });
  });
  it("rejects different durations for the same app", () => {
    expect(parseScreenshot("Today\nInstagram 1h\nInstagram 2h").apps).toEqual(
      [],
    );
  });
  it("keeps multiple duration-first app rows paired correctly", () => {
    expect(
      parseScreenshot("Day\nMost Used\n32 min\nSpotify\n1h\nInstagram").apps,
    ).toEqual([
      { name: "Spotify", durationMinutes: 32 },
      { name: "Instagram", durationMinutes: 60 },
    ]);
  });
});
describe("periods and dates", () => {
  it.each([
    "Week\nScreen Time 20h\nPickups 100",
    "Daily Average\n4h 32m\nInstagram 1h",
    "Dagelijks gemiddelde\nSchermtijd 4u",
    "Deze week\nTotaal 23h",
    "Last 7 days\nTotal 20h",
  ])("withholds non-daily values: %s", (text) =>
    expect(parseScreenshot(text)).toMatchObject({
      screenTimeMinutes: null,
      pickups: null,
      apps: [],
    }),
  );
  it.each([
    ["Today", "daily"],
    ["Gisteren", "daily"],
    ["Weekly", "weekly"],
    ["Gemiddelde", "average"],
    ["unlabelled", "unknown"],
  ])("detects %s", (label, period) => expect(detectPeriod(label)).toBe(period));
  it("only parses unambiguous valid full dates", () => {
    expect(extractDate("15-11-2026")).toBe("2026-11-15");
    expect(extractDate("11/12/2026")).toBeNull();
    expect(extractDate("2026-02-30")).toBeNull();
    expect(extractDate("2026-11-14 2026-11-15")).toBeNull();
  });
  it("never guesses a calendar date from today/yesterday", () =>
    expect(parseScreenshot("Today\nTotal 4h").date).toBeNull());
  it("does not mistake visible Day/Week tab controls for an explicit weekly period", () => {
    expect(detectPeriod("Day\nWeek\nTotal 4h")).toBe("unknown");
    expect(detectPeriod("Dag Week\nVandaag\nTotaal 4u")).toBe("daily");
    expect(detectPeriod("Day Week\nDaily Average\n4h")).toBe("average");
  });
});
describe("multiple screenshots", () => {
  it("combines compatible values and deduplicates apps", () => {
    const result = mergeScreenshots(
      [
        "Today\nTotal 4h\nInstagram 1h",
        "Today\nUnlocks 68\nInstagram 1h\nTikTok 30m",
      ].map(parseScreenshot),
    );
    expect(result).toMatchObject({
      screenTimeMinutes: 240,
      pickups: 68,
      pickupMetric: "unlocks",
      apps: [
        { name: "Instagram", durationMinutes: 60 },
        { name: "TikTok", durationMinutes: 30 },
      ],
    });
  });
  it("withholds conflicting totals and apps instead of adding them", () => {
    expect(
      mergeScreenshots(
        ["Today\nTotal 4h\nInstagram 1h", "Today\nTotal 5h\nInstagram 2h"].map(
          parseScreenshot,
        ),
      ),
    ).toMatchObject({ screenTimeMinutes: null, apps: [] });
  });
  it("refuses to merge different explicit dates", () => {
    expect(
      mergeScreenshots(
        ["2026-11-14\nTotal 4h", "2026-11-15\nPickups 50"].map(parseScreenshot),
      ),
    ).toMatchObject({
      date: null,
      screenTimeMinutes: null,
      pickups: null,
      apps: [],
    });
  });
  it("does not import a weekly screenshot alongside a daily one", () => {
    expect(
      mergeScreenshots(
        ["Today\nTotal 4h", "Week\nPickups 500\nInstagram 12h"].map(
          parseScreenshot,
        ),
      ),
    ).toMatchObject({ screenTimeMinutes: 240, pickups: null, apps: [] });
  });
});
