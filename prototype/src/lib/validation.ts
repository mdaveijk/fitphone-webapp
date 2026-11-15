import type { Measurement, MeasurementDraft, Platform } from "./types";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 5;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function validateFiles(
  files: readonly Pick<File, "name" | "type" | "size">[],
): string[] {
  const errors: string[] = [];
  if (!files.length) errors.push("Kies eerst een screenshot.");
  if (files.length > MAX_FILES)
    errors.push(`Kies maximaal ${MAX_FILES} screenshots per meting.`);
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type))
      errors.push(`${file.name}: gebruik PNG, JPEG of WebP.`);
    if (!file.size) errors.push(`${file.name}: dit bestand is leeg.`);
    if (file.size > MAX_FILE_SIZE)
      errors.push(`${file.name}: het bestand is groter dan 10 MB.`);
  }
  return errors;
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function durationFields(
  hours: string,
  minutes: string,
): number | null | "invalid" {
  if (hours === "" && minutes === "") return null;
  if (![hours, minutes].every((v) => v === "" || /^\d{1,4}$/.test(v)))
    return "invalid";
  const h = Number(hours || 0);
  const m = Number(minutes || 0);
  if (m > 59 || h * 60 + m > 1440) return "invalid";
  return h * 60 + m;
}

export function validateDraft(draft: MeasurementDraft): string[] {
  const errors: string[] = [];
  if (!isValidDate(draft.date) || draft.date > localDate())
    errors.push("Kies een geldige meetdatum die niet in de toekomst ligt.");
  const total = durationFields(draft.hours, draft.minutes);
  if (total === "invalid")
    errors.push(
      "Schermtijd: gebruik hele uren en 0–59 minuten, maximaal 24 uur.",
    );
  if (
    draft.pickups !== "" &&
    (!/^\d{1,5}$/.test(draft.pickups) || Number(draft.pickups) > 10000)
  )
    errors.push("Gebruik voor het aantal een heel getal tussen 0 en 10.000.");
  if (draft.pickups !== "" && !draft.pickupMetric)
    errors.push("Kies welk type telling je telefoon laat zien.");
  if (draft.apps.length > 30) errors.push("Voeg maximaal 30 apps toe.");
  const names = new Set<string>();
  for (const app of draft.apps) {
    const duration = durationFields(app.hours, app.minutes);
    if (
      !app.name.trim() ||
      app.name.trim().length > 100 ||
      duration === null ||
      duration === "invalid"
    ) {
      errors.push(
        "Vul bij elke app een naam en geldige gebruiksduur in, of verwijder de rij.",
      );
      continue;
    }
    if (names.has(app.name.trim().toLocaleLowerCase()))
      errors.push("Elke app mag maar één keer in de meting staan.");
    names.add(app.name.trim().toLocaleLowerCase());
    if (typeof total === "number" && duration > total)
      errors.push(
        "De gebruiksduur van een app kan niet hoger zijn dan de totale schermtijd.",
      );
  }
  if (total === null && draft.pickups === "" && !draft.apps.length)
    errors.push(
      "Vul ten minste één meting in. Ontbrekende waarden mogen leeg blijven.",
    );
  if (!draft.dailyConfirmed)
    errors.push("Bevestig dat de gegevens over één gekozen dag gaan.");
  if (!draft.confirmed)
    errors.push("Controleer en bevestig je gegevens voordat je opslaat.");
  return [...new Set(errors)];
}

export function toMeasurement(
  draft: MeasurementDraft,
  platform: Platform,
  source: Measurement["source"],
): Measurement {
  const errors = validateDraft(draft);
  if (errors.length) throw new Error(errors.join(" "));
  return {
    date: draft.date,
    screenTimeMinutes: durationFields(draft.hours, draft.minutes) as
      number | null,
    pickups: draft.pickups === "" ? null : Number(draft.pickups),
    pickupMetric: draft.pickups === "" ? null : draft.pickupMetric || null,
    apps: draft.apps.map((app) => ({
      name: app.name.trim(),
      durationMinutes: durationFields(app.hours, app.minutes) as number,
    })),
    source,
    platform,
  };
}
