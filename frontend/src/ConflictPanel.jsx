import { useEffect, useState } from "react";
import { API_BASE, formatError } from "./taskOptions";

const JSON_HEADERS = { "Content-Type": "application/json" };

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

function prettyDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

function endTime(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const keyOf = (c) => `${c.a.task_ids.join(",")}|${c.b.task_ids.join(",")}`;

function describe(c) {
  const { a, b } = c;
  const label = (o) => `${o.pet_name}: ${o.name} (${o.time}–${endTime(o.time, o.duration_minutes)})`;
  if (c.kind === "identical") {
    return `${a.pet_name}'s "${a.name}" and ${b.pet_name}'s "${b.name}" are the same task at ${a.time}.`;
  }
  if (c.kind === "duplicate") {
    return `"${a.name}" for ${a.pet_name} is scheduled twice at ${a.time}.`;
  }
  return `${label(a)} overlaps ${label(b)} by ${c.overlap_minutes} min.`;
}

function whenText(dates) {
  if (dates.length === 1) return prettyDate(dates[0]);
  return `${prettyDate(dates[0])} and ${dates.length - 1} more day${dates.length > 2 ? "s" : ""}`;
}

export default function ConflictPanel({ ownerId, version, onChanged }) {
  const [conflicts, setConflicts] = useState([]);
  const [suggestions, setSuggestions] = useState({});
  const [errors, setErrors] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const today = new Date();
      const params = new URLSearchParams({
        owner_id: ownerId, start: ymd(today), end: ymd(addDays(today, 27)),
      });
      try {
        const res = await fetch(`${API_BASE}/conflicts?${params}`);
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        if (cancelled) return;
        setConflicts(data);
        setSuggestions({});
        setErrors({});
        setLoadError("");
      } catch {
        if (!cancelled) setLoadError("Couldn't check for scheduling conflicts.");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ownerId, version]);

  const setError = (key, msg) => setErrors((e) => ({ ...e, [key]: msg }));

  async function handleSuggest(c) {
    const key = keyOf(c);
    setBusyKey(key);
    setError(key, "");
    try {
      const res = await fetch(`${API_BASE}/conflicts/suggest`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          owner_id: ownerId, a_task_ids: c.a.task_ids, b_task_ids: c.b.task_ids, dates: c.dates,
        }),
      });
      if (!res.ok) {
        setError(key, formatError(await res.json()));
        return;
      }
      const data = await res.json();
      setSuggestions((s) => ({ ...s, [key]: data }));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleApply(c, s) {
    const key = keyOf(c);
    setBusyKey(key);
    setError(key, "");
    try {
      for (const id of s.move_task_ids) {
        const res = await fetch(`${API_BASE}/tasks/${id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ scheduled_time: s.new_time }),
        });
        if (!res.ok) {
          setError(key, formatError(await res.json()));
          onChanged?.();
          return;
        }
      }
      onChanged?.();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleLink(c) {
    const key = keyOf(c);
    setBusyKey(key);
    setError(key, "");
    try {
      const res = await fetch(`${API_BASE}/tasks/link`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ task_ids: [...c.a.task_ids, ...c.b.task_ids] }),
      });
      if (!res.ok) {
        setError(key, formatError(await res.json()));
        return;
      }
      onChanged?.();
    } finally {
      setBusyKey(null);
    }
  }

  const dismiss = (key) =>
    setSuggestions((s) => {
      const { [key]: _gone, ...rest } = s;
      return rest;
    });

  if (loadError) return <p style={{ color: "#b91c1c" }}>{loadError}</p>;
  if (conflicts.length === 0) {
    return <p style={{ color: "#166534" }}>No scheduling conflicts in the next 4 weeks.</p>;
  }

  return (
    <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", color: "#111", borderRadius: 6, padding: "0.5rem 0.9rem", margin: "0.5rem 0", textAlign: "left" }}>
      <strong>
        {conflicts.length} scheduling conflict{conflicts.length > 1 ? "s" : ""} in the next 4 weeks
      </strong>
      <ul style={{ margin: "0.4rem 0", paddingLeft: "1.1rem" }}>
        {conflicts.map((c) => {
          const key = keyOf(c);
          const s = suggestions[key];
          const busy = busyKey === key;
          return (
            <li key={key} style={{ margin: "0.5rem 0" }}>
              {describe(c)} <span style={{ color: "#555" }}>({whenText(c.dates)})</span>{" "}
              {c.kind === "identical" && (
                <button disabled={busy} onClick={() => handleLink(c)}>Link them</button>
              )}
              {c.kind === "overlap" && !s && (
                <button disabled={busy} onClick={() => handleSuggest(c)}>
                  {busy ? "Thinking..." : "Suggest a fix"}
                </button>
              )}
              {c.kind === "duplicate" && (
                <span style={{ color: "#555" }}>Click the event on the calendar to delete one.</span>
              )}

              {s && (
                <div style={{ margin: "0.3rem 0 0 0.5rem", padding: "0.4rem 0.6rem", background: "#fff", border: "1px solid #ddd", borderRadius: 4 }}>
                  {s.new_time ? (
                    <>
                      <div>
                        Move <strong>{s.task_name}</strong> ({s.pet_names.join(" & ")}) from {s.old_time} to{" "}
                        <strong>{s.new_time}</strong>.
                      </div>
                      <div style={{ color: "#555" }}>
                        {s.source === "ai" ? "AI suggestion" : "Rule-based suggestion"}: {s.reason}
                      </div>
                      {s.notice && <div style={{ color: "#92400e" }}>{s.notice}</div>}
                      <div style={{ color: "#555" }}>This changes every occurrence of the task.</div>
                      <button disabled={busy} onClick={() => handleApply(c, s)}>
                        {busy ? "Applying..." : "Apply"}
                      </button>{" "}
                      <button disabled={busy} onClick={() => dismiss(key)}>Dismiss</button>
                    </>
                  ) : (
                    <>
                      <div>{s.reason}</div>
                      <button onClick={() => dismiss(key)}>Dismiss</button>
                    </>
                  )}
                </div>
              )}
              {errors[key] && <div style={{ color: "#b91c1c" }}>{errors[key]}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}