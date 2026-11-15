import type { AppUsage, ParsedScreenshot, Period, PickupMetric } from "./types";
import { extractDate, extractPartialDate } from "./dates";
export { extractDate } from "./dates";

// Explicit units only: a status-bar clock (4:32), percentages and chart ticks are not durations.
const DURATION =
  /(?<![\p{L}\d.,])(?:(\d{1,3})\s*(?:hours?|hrs?|h|uur|u)(?![\p{L}])(?:\s*(\d{1,2})\s*(?:minutes?|mins?|minuten|minuut|min|m)(?![\p{L}]))?|(\d{1,4})\s*(?:minutes?|mins?|minuten|minuut|min|m)(?![\p{L}]))/giu;
const TOTAL =
  /\b(screen\s*time|schermtijd|total(?:\s+(?:screen\s*time|today))?|totaal(?:\s+vandaag)?|vandaag|today)\b/i;
const APP_HEADER =
  /^(?:most\s*used(?:\s+apps)?|meest\s*gebruikte?(?:\s+apps)?|app\s*usage|appgebruik|apps?)\s*[:–-]?$/i;
const CATEGORY =
  /^(social(?:e)?(?:\s+(?:media|netwerken|networking))?|entertainment|amusement|video|productiviteit|productivity(?:\s*(?:&|and)\s*finance)?|games|gaming|creativity|creativiteit|utilities|hulpprogramma.?s|other|overig|education|onderwijs|information\s*&\s*reading|informatie\s+en\s+lezen|shopping\s*&\s*food|reizen|travel|gezondheid\s+en\s+fitness)$/i;
const PICKUP_LABEL =
  /\b(pick[ -]?ups?|pakmomenten|oppakken|(?:aantal\s+keer\s+)?opgepakt|ontgrendelingen|ontgrendeld|unlocks?|activations?|activeringen|geactiveerd)\b/i;
const NON_APP =
  /\b(screen\s*time|schermtijd|total|totaal|average|gemiddeld|daily|dagelijks|weekly|wekelijks|week|vandaag|today|yesterday|gisteren|notifications?|meldingen|pick[ -]?ups?|oppakken|ontgrendelingen|unlocks?|activations?|activeringen|all\s+apps|alle\s+apps|show\s+more|toon\s+meer|see\s+all|bekijk\s+alle|day|dag|last\s+7|afgelopen)\b/i;

export function findDurations(
  text: string,
): { minutes: number; start: number; end: number }[] {
  const values = [];
  for (const match of text.matchAll(new RegExp(DURATION))) {
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2] ?? match[3] ?? 0);
    if (match[2] !== undefined && minutes > 59) continue;
    const total = hours * 60 + minutes;
    if (total > 1440) continue;
    values.push({
      minutes: total,
      start: match.index!,
      end: match.index! + match[0].length,
    });
  }
  return values;
}

export function parseDuration(text: string): number | null {
  const found = findDurations(text);
  return found.length === 1 ? found[0].minutes : null;
}

export function detectPeriod(text: string): Period {
  // Samsung's daily detail screen displays a "Weekly" navigation link next to Today.
  // A report heading/average elsewhere still takes priority over this navigation row.
  const periodText = text.replace(
    /^\s*(Today|Vandaag)\s+(Weekly|Wekelijks)\s*$/gim,
    "$1",
  );
  if (/\b(average|gemiddeld\w*|daily\s+avg|daggemiddelde)\b/i.test(text))
    return "average";
  if (
    /\b(weekly|weekoverzicht|weektotaal|this\s+week|deze\s+week|last\s+7\s+days|afgelopen\s+7\s+dagen)\b/i.test(
      periodText,
    )
  )
    return "weekly";
  // Both tab labels are often visible. OCR cannot tell which tab is selected.
  const hasWeek = /\bweek\b/i.test(periodText);
  const hasDay = /\b(day|dag)\b/i.test(text);
  if (hasWeek && !hasDay) return "weekly";
  if (
    /\b(today|vandaag|yesterday|gisteren|daily|dagelijks)\b/i.test(text) ||
    extractDate(text) ||
    extractPartialDate(text)
  )
    return "daily";
  if (hasDay && !hasWeek) return "daily";
  return "unknown";
}

function metricOf(label: string): PickupMetric {
  if (/unlock|ontgrendel/i.test(label)) return "unlocks";
  if (/activat|activer|geactiveerd/i.test(label)) return "activations";
  return "pickups";
}

export function extractPickups(lines: string[]): {
  pickups: number | null;
  pickupMetric: PickupMetric | null;
} {
  const candidates: { value: number; metric: PickupMetric }[] = [];
  lines.forEach((line, i) => {
    // iOS lays the first-pickup time and total count in two columns. The clock is
    // explicitly excluded; only the trailing count under Total Pickups is used.
    if (
      /\b(first\s+pickup|eerste\s+pakmoment)\b.*\b(total\s+pickups|totaal\s+pakmomenten)\b/i.test(
        line,
      )
    ) {
      const count = lines[i + 1]?.match(/^[^\d]*\d{1,2}:\d{2}\s+(\d{1,5})\s*$/);
      if (count && Number(count[1]) <= 10000)
        candidates.push({ value: Number(count[1]), metric: "pickups" });
      return;
    }
    if (
      /\b(first\s+pickup|eerste\s+pakmoment|first\s+used\s+after)\b/i.test(line)
    )
      return;
    const label = line.match(PICKUP_LABEL);
    if (!label) return;
    const rest = line
      .replace(label[0], "")
      .replace(/\b(total|totaal)\b/gi, "")
      .replace(/^\s*[:–-]?\s*/, "")
      .trim();
    const nextValueIndex =
      extractDate(lines[i + 1] ?? "") || extractPartialDate(lines[i + 1] ?? "")
        ? i + 2
        : i + 1;
    const adjacent = [lines[nextValueIndex], lines[i - 1]]
      .filter(Boolean)
      .filter((v) => /^\d{1,5}$/.test(v.trim()));
    const raw = /^\d{1,5}$/.test(rest)
      ? rest
      : rest === "" && adjacent.length === 1
        ? adjacent[0]
        : null;
    if (raw !== null && Number(raw) <= 10000)
      candidates.push({ value: Number(raw), metric: metricOf(label[0]) });
  });
  const unique = [
    ...new Map(candidates.map((v) => [`${v.metric}:${v.value}`, v])).values(),
  ];
  return unique.length === 1
    ? { pickups: unique[0].value, pickupMetric: unique[0].metric }
    : { pickups: null, pickupMetric: null };
}

function cleanAppName(value: string): string | null {
  const name = value
    .replace(/^[^\p{L}\d]+/u, "")
    .replace(/[\s|•·:–-]+$/g, "")
    .trim();
  if (
    !/[\p{L}]/u.test(name) ||
    name.length > 100 ||
    NON_APP.test(name) ||
    CATEGORY.test(name) ||
    APP_HEADER.test(name) ||
    PICKUP_LABEL.test(name) ||
    findDurations(name).length > 0 ||
    /^\d/.test(name)
  )
    return null;
  return name;
}

export function extractApps(lines: string[]): AppUsage[] {
  const apps = new Map<string, AppUsage>();
  const ambiguous = new Set<string>();
  let inAppSection = false;
  let durationFirst: boolean | null = null;
  const add = (name: string, minutes: number) => {
    const key = name.toLocaleLowerCase();
    if (apps.has(key) && apps.get(key)!.durationMinutes !== minutes)
      ambiguous.add(key);
    apps.set(key, { name, durationMinutes: minutes });
  };
  lines.forEach((line, i) => {
    if (APP_HEADER.test(line)) {
      inAppSection = true;
      durationFirst = null;
    }
    if (
      PICKUP_LABEL.test(line) ||
      /\b(notifications?|meldingen|goals?|limits?|timers?|doel|limiet)\b/i.test(
        line,
      )
    )
      inAppSection = false;
    const durations = findDurations(line);
    // Samsung's overview lists app names horizontally, followed by the duration row.
    if (inAppSection && durations.length > 1 && i > 0) {
      let remainder = line;
      for (const duration of [...durations].reverse())
        remainder =
          remainder.slice(0, duration.start) + remainder.slice(duration.end);
      if (!remainder.replace(/[|•·]/g, "").trim()) {
        const nameLine = lines[i - 1];
        let names = nameLine.split(/\s{2,}|\t+/).map(cleanAppName);
        if (names.length !== durations.length)
          names = nameLine.split(/\s+/).map(cleanAppName);
        if (
          names.length === durations.length &&
          names.every((name): name is string => name !== null)
        ) {
          names.forEach((name, index) => add(name, durations[index].minutes));
        }
      }
      return;
    }
    if (durations.length !== 1 || TOTAL.test(line)) return;
    const duration = durations[0];
    const remainder =
      `${line.slice(0, duration.start)} ${line.slice(duration.end)}`.trim();
    let name = cleanAppName(remainder);
    if (!name && inAppSection && !remainder) {
      const previous = i > 0 ? cleanAppName(lines[i - 1]) : null;
      const next = i + 1 < lines.length ? cleanAppName(lines[i + 1]) : null;
      if (durationFirst === null && (previous || next))
        durationFirst = !previous;
      name = durationFirst ? next : previous;
    }
    if (!name) return;
    add(name, duration.minutes);
  });
  return [...apps]
    .filter(([key]) => !ambiguous.has(key))
    .map(([, value]) => value);
}

export function parseScreenshot(text: string): ParsedScreenshot {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const period = detectPeriod(text);
  const warnings: string[] = [];
  const result: ParsedScreenshot = {
    date: extractDate(text),
    partialDate: extractPartialDate(text),
    period,
    screenTimeMinutes: null,
    pickups: null,
    pickupMetric: null,
    apps: [],
    warnings,
  };
  if (period === "weekly" || period === "average") {
    result.partialDate = null;
    warnings.push(
      "Weekoverzicht of gemiddelde herkend. De gebruikswaarden zijn niet overgenomen. Upload een dagoverzicht of vul de dagwaarden zelf in.",
    );
    return result;
  }
  if (period === "unknown")
    warnings.push(
      "De periode is niet herkend. Controleer of dit een dagoverzicht is.",
    );
  const totals = new Set<number>();
  lines.forEach((line, i) => {
    if (
      !TOTAL.test(line) ||
      APP_HEADER.test(line) ||
      /^(?:today|vandaag)\s+(?:weekly|wekelijks)$/i.test(line) ||
      /\b(goal|limit|doel|limiet)\b/i.test(line)
    )
      return;
    const inline = findDurations(line);
    if (inline.length === 1) totals.add(inline[0].minutes);
    if (!inline.length) {
      const next = lines[i + 1] ?? "";
      const prev = lines[i - 1] ?? "";
      // A separate duration must be a standalone line directly beside an explicit total label.
      const standalone = (v: string) => {
        const d = findDurations(v);
        return d.length === 1 &&
          !`${v.slice(0, d[0].start)}${v.slice(d[0].end)}`.trim()
          ? d[0].minutes
          : null;
      };
      for (const v of [standalone(next), standalone(prev)])
        if (v !== null) totals.add(v);
    }
  });
  // The Samsung daily overview has a prominent standalone total immediately below
  // its Digital Wellbeing heading, before categories, charts, goals or app usage.
  lines.forEach((line, i) => {
    if (
      !/^(?:[^\p{L}\d]*)(?:digital\s+wellbeing|digitaal\s+welzijn)\b/iu.test(
        line,
      )
    )
      return;
    const next = lines[i + 1] ?? "";
    const duration = findDurations(next);
    if (
      duration.length === 1 &&
      !`${next.slice(0, duration[0].start)}${next.slice(duration[0].end)}`.trim()
    )
      totals.add(duration[0].minutes);
  });
  if (totals.size === 1) result.screenTimeMinutes = [...totals][0];
  if (totals.size > 1)
    warnings.push(
      "Meerdere verschillende totalen gevonden. Vul de juiste dagwaarde zelf in.",
    );
  Object.assign(result, extractPickups(lines));
  result.apps = extractApps(lines);
  if (result.screenTimeMinutes !== null)
    result.apps = result.apps.filter(
      (app) => app.durationMinutes <= result.screenTimeMinutes!,
    );
  if (result.screenTimeMinutes === null)
    warnings.push(
      "Totale schermtijd niet met zekerheid gevonden. Dit veld is leeg gelaten.",
    );
  if (result.pickups === null)
    warnings.push(
      "Geen eenduidige telling gevonden. Dit veld is leeg gelaten.",
    );
  if (
    result.pickups === null &&
    /\b(app\s+opens|app-openingen|notifications?|meldingen)\b/i.test(text)
  )
    warnings.push(
      "App-openingen en meldingen zijn geen telefoon-pakmomenten of ontgrendelingen. Die aantallen zijn daarom niet overgenomen.",
    );
  if (/\b(yesterday|gisteren|today|vandaag)\b/i.test(text) && !result.date)
    warnings.push(
      "Een relatieve datum is herkend. Kies zelf de datum waarop het screenshot betrekking heeft.",
    );
  return result;
}

export function mergeScreenshots(
  results: ParsedScreenshot[],
): ParsedScreenshot {
  const warnings = results.flatMap((r) => r.warnings);
  const safe = results.filter(
    (r) => r.period !== "weekly" && r.period !== "average",
  );
  const dates = new Set(
    safe.map((r) => r.date).filter((v): v is string => v !== null),
  );
  const empty: ParsedScreenshot = {
    date: null,
    period: "unknown",
    screenTimeMinutes: null,
    pickups: null,
    pickupMetric: null,
    apps: [],
    warnings,
  };
  const partials = safe
    .map((r) => r.partialDate)
    .filter((p) => p !== null && p !== undefined);
  const dayKeys = new Set([
    ...partials.map(
      (p) =>
        `${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
    ),
    ...[...dates].map((date) => date.slice(5)),
  ]);
  if (dayKeys.size > 1) {
    warnings.push(
      "De herkende dagen verschillen. Gegevens zijn niet gecombineerd; gebruik screenshots van dezelfde dag.",
    );
    return empty;
  }
  if (dates.size > 1) {
    warnings.push(
      "Screenshots met verschillende datums gevonden. Gegevens zijn niet gecombineerd; upload screenshots van dezelfde dag.",
    );
    return empty;
  }
  const uniqueTotal = new Set(
    safe.map((r) => r.screenTimeMinutes).filter((v) => v !== null),
  );
  const counts = new Map(
    safe
      .filter((r) => r.pickups !== null)
      .map((r) => [`${r.pickupMetric}:${r.pickups}`, r]),
  );
  if (uniqueTotal.size > 1)
    warnings.push(
      "Screenshots bevatten verschillende totalen. Vul de juiste schermtijd zelf in.",
    );
  if (counts.size > 1)
    warnings.push(
      "Verschillende tellingen gevonden. Kies het juiste type en aantal zelf.",
    );
  const apps = new Map<string, AppUsage>();
  const conflicts = new Set<string>();
  for (const result of safe)
    for (const app of result.apps) {
      const key = app.name.toLocaleLowerCase();
      if (
        apps.has(key) &&
        apps.get(key)!.durationMinutes !== app.durationMinutes
      )
        conflicts.add(key);
      apps.set(key, app);
    }
  if (conflicts.size)
    warnings.push(
      "Apps met verschillende gebruiksduren zijn leeg gelaten. Voeg deze zelf toe.",
    );
  const count = counts.size === 1 ? [...counts.values()][0] : null;
  const total = uniqueTotal.size === 1 ? [...uniqueTotal][0] : null;
  return {
    date: [...dates][0] ?? null,
    partialDate: partials[0] ?? null,
    period:
      safe.length && safe.every((r) => r.period === "daily")
        ? "daily"
        : "unknown",
    screenTimeMinutes: total,
    pickups: count?.pickups ?? null,
    pickupMetric: count?.pickupMetric ?? null,
    apps: [...apps]
      .filter(
        ([key, app]) =>
          !conflicts.has(key) &&
          (total === null || app.durationMinutes <= total),
      )
      .map(([, app]) => app),
    warnings: [...new Set(warnings)],
  };
}
