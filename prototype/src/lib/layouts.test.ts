import { describe, expect, it } from "vitest";
import { mergeScreenshots, parseScreenshot } from "./parser";

describe("real-layout regressions with minimal non-personal text", () => {
  it("reads the Samsung overview total below the heading and app columns", () => {
    expect(
      parseScreenshot(
        "19:59\n< Digital Wellbeing Q ul :\n3h29m\n® Social 53m\n® Productivity and finance 45m\n© Video 42m\nMost used apps\nChrome Spotify ChatGPT\n42m 36m 35m\nScreen time goal\nSet goal",
      ),
    ).toMatchObject({
      screenTimeMinutes: 209,
      pickups: null,
      apps: [
        { name: "Chrome", durationMinutes: 42 },
        { name: "Spotify", durationMinutes: 36 },
        { name: "ChatGPT", durationMinutes: 35 },
      ],
    });
  });
  it("does not guess the total from a category, status-bar clock or goal", () => {
    expect(
      parseScreenshot(
        "Digital Wellbeing\nMost used apps\nExample 20m\nScreen time goal 3h",
      ).screenTimeMinutes,
    ).toBeNull();
    expect(
      parseScreenshot(
        "Social\nToday Weekly\n20m\n10m\n10 notifications\n41 app opens",
      ),
    ).toMatchObject({
      period: "daily",
      screenTimeMinutes: null,
      pickups: null,
      apps: [],
    });
  });
  it.each([
    "First Pickup Total Pickups\n« 00:02 100",
    "Total Pickups\n100",
    "100 Total Pickups",
    "PICKUPS\nSunday, 11 September\n100",
  ])("reads explicit iPhone pickups: %s", (text) =>
    expect(parseScreenshot(text)).toMatchObject({
      pickups: 100,
      pickupMetric: "pickups",
    }),
  );
  it("does not use the first pickup time, graph ticks, notifications or app opens as pickups", () => {
    expect(
      parseScreenshot(
        "First Pickup\n00:02\n180\n41 app opens\n10 notifications",
      ).pickups,
    ).toBeNull();
    expect(
      parseScreenshot("First Pickup Total Pickups\n00:02 100 180").pickups,
    ).toBeNull();
  });
  it("extracts the displayed iPhone date parts and count, ignoring pickup-frequency app lists", () => {
    expect(
      parseScreenshot(
        "Sunday, 11 September\nPICKUPS\nSunday, 11 September\nFirst Pickup Total Pickups\n« 00:02 100\nFIRST USED AFTER PICKUP\nWhatsApp\n46",
      ),
    ).toMatchObject({
      date: null,
      partialDate: { day: 11, month: 9, weekday: 0 },
      period: "daily",
      pickups: 100,
      apps: [],
      screenTimeMinutes: null,
    });
  });
  it.each([
    "Weekly report\n2 November — 8 November (Week 45)\n6h7m\nDaily average screen time",
    "Weekly report\n42h50m Total screen time\nMost used apps\nYouTube ChatGPT Chrome\n10h56m 10h16m 6h32m",
    "Week Day\nDaily Average\n7h24m\nTotal Screen Time 44h25m\nUpdated today at 9:41 AM",
  ])("continues to withhold weekly and average values: %s", (text) =>
    expect(parseScreenshot(text)).toMatchObject({
      screenTimeMinutes: null,
      pickups: null,
      apps: [],
    }),
  );
  it("merges compatible partial and full dates but rejects differing days", () => {
    expect(
      mergeScreenshots(
        [
          "Sunday, 11 September\nPickups 100",
          "11 September 2022\nTotal 4h",
        ].map(parseScreenshot),
      ),
    ).toMatchObject({
      date: "2022-09-11",
      pickups: 100,
      screenTimeMinutes: 240,
    });
    expect(
      mergeScreenshots(
        ["11 September\nPickups 100", "12 September\nTotal 4h"].map(
          parseScreenshot,
        ),
      ),
    ).toMatchObject({ date: null, pickups: null, screenTimeMinutes: null });
  });
});
