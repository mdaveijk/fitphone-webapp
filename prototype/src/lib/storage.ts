import type { Measurement, MeasurementDraft } from "./types";
import { validateDraft } from "./validation";

export const STORAGE_KEY = "fitphone.check.v1";
type StorageAccess = Pick<Storage, "getItem" | "setItem">;

function isMeasurement(value: unknown): value is Measurement {
  if (!value || typeof value !== "object") return false;
  const m = value as Measurement;
  if (
    !["ios", "android"].includes(m.platform) ||
    !["manual", "screenshot"].includes(m.source) ||
    !(
      m.screenTimeMinutes === null ||
      (Number.isInteger(m.screenTimeMinutes) && m.screenTimeMinutes >= 0)
    ) ||
    !(m.pickups === null || (Number.isInteger(m.pickups) && m.pickups >= 0)) ||
    !(
      m.pickupMetric === null ||
      ["pickups", "unlocks", "activations"].includes(m.pickupMetric)
    ) ||
    (m.pickups === null && m.pickupMetric !== null) ||
    !Array.isArray(m.apps) ||
    typeof m.date !== "string"
  )
    return false;
  if (
    !m.apps.every(
      (a) =>
        a &&
        typeof a.name === "string" &&
        Number.isInteger(a.durationMinutes) &&
        a.durationMinutes >= 0,
    )
  )
    return false;
  const draft: MeasurementDraft = {
    date: m.date,
    hours:
      m.screenTimeMinutes === null
        ? ""
        : String(Math.floor(m.screenTimeMinutes / 60)),
    minutes:
      m.screenTimeMinutes === null ? "" : String(m.screenTimeMinutes % 60),
    pickups: m.pickups === null ? "" : String(m.pickups),
    pickupMetric: m.pickupMetric ?? "",
    apps: m.apps.map((a) => ({
      name: a.name,
      hours: String(Math.floor(a.durationMinutes / 60)),
      minutes: String(a.durationMinutes % 60),
    })),
    confirmed: true,
    dailyConfirmed: true,
  };
  return validateDraft(draft).length === 0;
}

export function loadMeasurements(
  storage: StorageAccess = localStorage,
): Measurement[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const saved: unknown = JSON.parse(raw);
  if (
    !saved ||
    typeof saved !== "object" ||
    !("version" in saved) ||
    saved.version !== 1 ||
    !("measurements" in saved) ||
    !Array.isArray(saved.measurements) ||
    !saved.measurements.every(isMeasurement)
  ) {
    throw new Error(
      "Opgeslagen metingen konden niet worden gelezen. Bestaande gegevens zijn behouden.",
    );
  }
  return saved.measurements.sort((a, b) => b.date.localeCompare(a.date));
}

/** One confirmed measurement per day and platform; screenshot binaries and OCR text are never persisted. */
export function saveMeasurement(
  measurement: Measurement,
  storage: StorageAccess = localStorage,
): Measurement[] {
  if (!isMeasurement(measurement))
    throw new Error("Deze meting bevat ongeldige waarden.");
  const previous = loadMeasurements(storage);
  const measurements = [
    ...previous.filter(
      (m) => m.date !== measurement.date || m.platform !== measurement.platform,
    ),
    measurement,
  ].sort((a, b) => b.date.localeCompare(a.date));
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, measurements }));
  return measurements;
}
