import { describe, expect, it } from "vitest";
import {
  completePartialDate,
  extractDate,
  extractPartialDate,
  weekdayMatches,
} from "./dates";

describe("dates displayed in Screen Time", () => {
  it.each([
    ["Sunday, 11 September 2022", "2022-09-11"],
    ["zondag 11 september 2022", "2022-09-11"],
    ["September 11, 2022", "2022-09-11"],
    ["15 november 2026", "2026-11-15"],
    ["11 sep. 2022", "2022-09-11"],
  ])("reads %s", (text, expected) => expect(extractDate(text)).toBe(expected));
  it("preserves a repeated day/month/weekday without inventing a year", () => {
    const text = "Sunday, 11 September\nPICKUPS\nSunday, 11 September\n100";
    expect(extractDate(text)).toBeNull();
    expect(extractPartialDate(text)).toEqual({ month: 9, day: 11, weekday: 0 });
  });
  it("completes only a year supplied by the user and checks the weekday", () => {
    const partial = { month: 9, day: 11, weekday: 0 };
    expect(completePartialDate(partial, "2022")).toBe("2022-09-11");
    expect(completePartialDate(partial, "22")).toBeNull();
    expect(weekdayMatches("2022-09-11", partial)).toBe(true);
    expect(weekdayMatches("2026-09-11", partial)).toBe(false);
  });
  it.each([
    "31 September",
    "30 February",
    "2026-02-30",
    "2 November — 8 November",
    "11 September\n12 September",
  ])("does not turn invalid or conflicting dates into one day: %s", (text) => {
    expect(extractDate(text)).toBeNull();
    expect(extractPartialDate(text)).toBeNull();
  });
  it("validates leap days once the year is known", () => {
    const partial = extractPartialDate("29 februari")!;
    expect(completePartialDate(partial, "2024")).toBe("2024-02-29");
    expect(completePartialDate(partial, "2025")).toBeNull();
  });
});
