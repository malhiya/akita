export const API_BASE = "http://localhost:8000";
export const CATEGORIES = ["meds", "vet", "feeding", "walk", "grooming", "play", "training", "general"];
export const PRIORITIES = ["non-negotiable", "high", "medium", "low"];
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const CODE_TO_DAY = { MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday" };

export function describeRecurrence(rrule) {
  if (!rrule) return "One time";
  if (rrule.includes("FREQ=DAILY")) return "Daily";
  const code = rrule.split("BYDAY=")[1];
  return `Weekly on ${CODE_TO_DAY[code] ?? code}`;
}

export function formatError(err) {
  if (Array.isArray(err.detail)) return err.detail.map((d) => d.msg).join("; ");
  return err.detail || "Something went wrong";
}