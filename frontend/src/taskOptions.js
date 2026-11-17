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

// "16:00" -> "4:00 pm"
export function formatTime12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// A task as one short line: "8:00 am, every day" / "4:00 pm, Wednesdays" / "9:30 am, once on Nov 12"
export function describeSchedule(task) {
  const time = formatTime12(task.scheduled_time);
  const rule = task.rrule;
  let when;
  if (!rule) {
    const [y, mo, d] = task.start_date.split("-").map(Number);
    const date = new Date(y, mo - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    when = `once on ${date}`;
  } else if (rule.includes("FREQ=DAILY")) {
    when = "every day";
  } else {
    const code = rule.split("BYDAY=")[1]?.split(";")[0];
    when = CODE_TO_DAY[code] ? `${CODE_TO_DAY[code]}s` : "every week";
  }
  return `${time}, ${when}`;
}

export function formatError(err) {
  if (Array.isArray(err.detail)) return err.detail.map((d) => d.msg).join("; ");
  return err.detail || "Something went wrong";
}