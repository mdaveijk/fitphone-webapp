import { beforeEach, describe, expect, it } from "vitest";
import { loadMeasurements, saveMeasurement, STORAGE_KEY } from "./storage";
import type { Measurement } from "./types";

const m: Measurement = {
  date: "2026-01-15",
  screenTimeMinutes: 272,
  pickups: 68,
  pickupMetric: "unlocks",
  apps: [{ name: "Instagram", durationMinutes: 105 }],
  source: "screenshot",
  platform: "android",
};
describe("temporary Check storage", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  beforeEach(() => data.clear());
  it("round-trips structured confirmed data without images or raw OCR", () => {
    saveMeasurement(m, storage);
    expect(loadMeasurements(storage)).toEqual([m]);
    expect(
      Object.keys(JSON.parse(data.get(STORAGE_KEY)!).measurements[0]),
    ).toEqual(Object.keys(m));
  });
  it("updates one day/platform without duplicating and preserves other measurements", () => {
    saveMeasurement(m, storage);
    saveMeasurement({ ...m, platform: "ios" }, storage);
    expect(
      saveMeasurement({ ...m, screenTimeMinutes: 300 }, storage),
    ).toHaveLength(2);
    expect(
      loadMeasurements(storage).find((v) => v.platform === "android")!
        .screenTimeMinutes,
    ).toBe(300);
  });
  it("does not overwrite corrupted existing data", () => {
    storage.setItem(STORAGE_KEY, "broken");
    expect(() => saveMeasurement(m, storage)).toThrow();
    expect(storage.getItem(STORAGE_KEY)).toBe("broken");
  });
  it("rejects invalid stored schemas and values", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        measurements: [{ ...m, screenTimeMinutes: -1 }],
      }),
    );
    expect(() => loadMeasurements(storage)).toThrow();
  });
  it("propagates storage failures to the form", () =>
    expect(() =>
      saveMeasurement(m, {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).toThrow("quota"));
});
