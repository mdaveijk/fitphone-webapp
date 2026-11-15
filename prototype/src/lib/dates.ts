import type { PartialDate } from "./types";
import { isValidDate } from "./validation";

const MONTHS = [
  ["january", "januari", "jan"],
  ["february", "februari", "feb"],
  ["march", "maart", "mar", "mrt"],
  ["april", "apr"],
  ["may", "mei"],
  ["june", "juni", "jun"],
  ["july", "juli", "jul"],
  ["august", "augustus", "aug"],
  ["september", "sept", "sep"],
  ["october", "oktober", "oct", "okt"],
  ["november", "nov"],
  ["december", "dec"],
];
const WEEKDAYS = [
  ["sunday", "zondag", "sun", "zo"],
  ["monday", "maandag", "mon", "ma"],
  ["tuesday", "dinsdag", "tue", "di"],
  ["wednesday", "woensdag", "wed", "wo"],
  ["thursday", "donderdag", "thu", "do"],
  ["friday", "vrijdag", "fri", "vr"],
  ["saturday", "zaterdag", "sat", "za"],
];
const monthPattern = MONTHS.flat().join("|");
const weekdayPattern = WEEKDAYS.flat().join("|");

export function completePartialDate(
  partial: PartialDate,
  year: string,
): string | null {
  if (!/^\d{4}$/.test(year) || Number(year) < 1900) return null;
  const date = `${year}-${String(partial.month).padStart(2, "0")}-${String(partial.day).padStart(2, "0")}`;
  return isValidDate(date) ? date : null;
}

export function weekdayMatches(date: string, partial: PartialDate): boolean {
  return (
    partial.weekday === null ||
    new Date(`${date}T12:00:00Z`).getUTCDay() === partial.weekday
  );
}

function namedDates(
  text: string,
): { parts: PartialDate; year: string | undefined }[] {
  const values: { parts: PartialDate; year: string | undefined }[] = [];
  // Month names distinguish day/month order without relying on the device's locale.
  const patterns = [
    new RegExp(
      `\\b(?:(${weekdayPattern})\\.?[, ]+)?(\\d{1,2})\\s+(${monthPattern})\\.?(?:[, ]+(\\d{4}))?\\b`,
      "gi",
    ),
    new RegExp(
      `\\b(?:(${weekdayPattern})\\.?[, ]+)?(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[, ]+(\\d{4}))?\\b`,
      "gi",
    ),
  ];
  patterns.forEach((pattern, index) => {
    for (const match of text.matchAll(pattern)) {
      const month = (index === 0 ? match[3] : match[2]).toLowerCase();
      const parts: PartialDate = {
        month: MONTHS.findIndex((names) => names.includes(month)) + 1,
        day: Number(index === 0 ? match[2] : match[3]),
        weekday: match[1]
          ? WEEKDAYS.findIndex((names) =>
              names.includes(match[1].toLowerCase()),
            )
          : null,
      };
      // Leap-year reference validates the day/month without claiming a measurement year.
      if (completePartialDate(parts, match[4] ?? "2000"))
        values.push({ parts, year: match[4] });
    }
  });
  return values;
}

export function extractDate(text: string): string | null {
  const matches = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((m) => m[0]);
  for (const m of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)) {
    if (Number(m[1]) > 12)
      matches.push(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  for (const { parts, year } of namedDates(text)) {
    if (year) matches.push(completePartialDate(parts, year)!);
  }
  const dates = [...new Set(matches.filter(isValidDate))];
  return dates.length === 1 ? dates[0] : null;
}

export function extractPartialDate(text: string): PartialDate | null {
  const matches = namedDates(text).filter((value) => !value.year);
  const days = new Set(
    matches.map(({ parts }) => `${parts.month}-${parts.day}`),
  );
  const weekdays = new Set(
    matches.map(({ parts }) => parts.weekday).filter((v) => v !== null),
  );
  if (days.size !== 1 || weekdays.size > 1) return null;
  return { ...matches[0].parts, weekday: [...weekdays][0] ?? null };
}
