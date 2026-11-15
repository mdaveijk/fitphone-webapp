import { describe, expect, it } from "vitest";
import type { MeasurementDraft } from "./types";
import {
  durationFields,
  localDate,
  MAX_FILE_SIZE,
  toMeasurement,
  validateDraft,
  validateFiles,
} from "./validation";

const draft = (): MeasurementDraft => ({
  date: "2026-01-15",
  hours: "4",
  minutes: "32",
  pickups: "",
  pickupMetric: "",
  apps: [],
  confirmed: true,
  dailyConfirmed: true,
});
describe("file validation", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("accepts %s", (type) =>
    expect(validateFiles([{ name: "test", type, size: 1024 }])).toEqual([]),
  );
  it("rejects empty selections and too many files", () => {
    expect(validateFiles([])).not.toEqual([]);
    expect(
      validateFiles(
        Array(6).fill({ name: "image.png", type: "image/png", size: 2 }),
      ),
    ).not.toEqual([]);
  });
  it("rejects unsupported, oversized and empty files", () => {
    expect(
      validateFiles([{ name: "evil.png", type: "text/html", size: 1 }])[0],
    ).toContain("PNG");
    expect(
      validateFiles([
        { name: "large.png", type: "image/png", size: MAX_FILE_SIZE + 1 },
      ])[0],
    ).toContain("10 MB");
    expect(
      validateFiles([{ name: "empty.png", type: "image/png", size: 0 }])[0],
    ).toContain("leeg");
  });
});
describe("confirmation and duration validation", () => {
  it("converts to minutes and preserves unknown versus zero", () => {
    expect(durationFields("4", "32")).toBe(272);
    expect(durationFields("", "")).toBeNull();
    expect(durationFields("", "0")).toBe(0);
    expect(toMeasurement(draft(), "ios", "screenshot")).toMatchObject({
      screenTimeMinutes: 272,
      pickups: null,
      pickupMetric: null,
    });
  });
  it.each([
    ["-1", "0"],
    ["1.5", "0"],
    ["0", "60"],
    ["24", "1"],
    ["25", "0"],
    ["1e2", "0"],
  ])("rejects invalid %sh %sm", (h, m) =>
    expect(durationFields(h, m)).toBe("invalid"),
  );
  it("requires explicit verification and daily confirmation", () => {
    expect(validateDraft({ ...draft(), confirmed: false })).toContain(
      "Controleer en bevestig je gegevens voordat je opslaat.",
    );
    expect(validateDraft({ ...draft(), dailyConfirmed: false })).not.toEqual(
      [],
    );
    expect(() =>
      toMeasurement({ ...draft(), confirmed: false }, "ios", "screenshot"),
    ).toThrow();
  });
  it("requires a metric for entered counts including zero", () =>
    expect(validateDraft({ ...draft(), pickups: "0" })).not.toEqual([]));
  it("allows an unknown screen total with a known count", () =>
    expect(
      validateDraft({
        ...draft(),
        hours: "",
        minutes: "",
        pickups: "0",
        pickupMetric: "unlocks",
      }),
    ).toEqual([]));
  it("validates calendar dates, future dates and app durations", () => {
    expect(validateDraft({ ...draft(), date: "2026-02-30" })).not.toEqual([]);
    expect(validateDraft({ ...draft(), date: "2099-01-01" })).not.toEqual([]);
    expect(
      validateDraft({
        ...draft(),
        apps: [{ name: "Instagram", hours: "5", minutes: "" }],
      }),
    ).not.toEqual([]);
    expect(
      validateDraft({
        ...draft(),
        apps: [{ name: "Instagram", hours: "", minutes: "" }],
      }),
    ).not.toEqual([]);
  });
  it("requires at least one value and rejects repeated apps", () => {
    expect(validateDraft({ ...draft(), hours: "", minutes: "" })).not.toEqual(
      [],
    );
    expect(
      validateDraft({
        ...draft(),
        apps: [
          { name: "Test", hours: "0", minutes: "1" },
          { name: "test", hours: "0", minutes: "2" },
        ],
      }),
    ).not.toEqual([]);
  });
  it("uses the local calendar date", () =>
    expect(localDate(new Date(2026, 10, 15, 0, 30))).toBe("2026-11-15"));
});
