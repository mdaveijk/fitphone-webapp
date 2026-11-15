export type Platform = "ios" | "android";
export type PickupMetric = "pickups" | "unlocks" | "activations";
export type Period = "daily" | "weekly" | "average" | "unknown";
export interface AppUsage {
  name: string;
  durationMinutes: number;
}
export interface PartialDate {
  month: number;
  day: number;
  weekday: number | null;
}
export interface Measurement {
  date: string;
  screenTimeMinutes: number | null;
  pickups: number | null;
  pickupMetric: PickupMetric | null;
  apps: AppUsage[];
  source: "screenshot" | "manual";
  platform: Platform;
}
export interface ParsedScreenshot {
  date: string | null;
  partialDate?: PartialDate | null;
  period: Period;
  screenTimeMinutes: number | null;
  pickups: number | null;
  pickupMetric: PickupMetric | null;
  apps: AppUsage[];
  warnings: string[];
}
export interface UsageDraft {
  name: string;
  hours: string;
  minutes: string;
}
export interface MeasurementDraft {
  date: string;
  hours: string;
  minutes: string;
  pickups: string;
  pickupMetric: PickupMetric | "";
  apps: UsageDraft[];
  confirmed: boolean;
  dailyConfirmed: boolean;
}
