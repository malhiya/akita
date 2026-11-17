import { useEffect, useState } from "react";
import { formatError } from "./taskOptions";
import { apiFetch } from "./api";
import { Button } from "./ui";

const JSON_HEADERS = { "Content-Type": "application/json" };
const CHECK_DAYS = 120;

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
  if (c.kind === "busy") {
    return `${label(a)} overlaps your calendar (busy ${b.time}–${endTime(b.time, b.duration_minutes)}) by ${c.overlap_minutes} min.`;
  }
  return `${label(a)} overlaps ${label(b)} by ${c.overlap_minutes} min.`;
}

function whenText(dates) {
  if (dates.length === 1) return prettyDate(dates[0]);
  return `${prettyDate(dates[0])} and ${dates.length - 1} more day${dates.length > 2 ? "s" : ""}`;
}

export default function ConflictPanel({ ownerId, version, onChanged }) {
  const [conflicts, setConflicts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState({});
  const [errors, setErrors] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const today = new Date();
      const params = new URLSearchParams({
        owner_id: ownerId, start: ymd(today), end: ymd(addDays(today, CHECK_DAYS)),
      });
      try {
        const res = await apiFetch(`/conflicts?${params}`);
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        if (cancelled) return;
        setConflicts(data);
        setLoaded(true);
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
      const res = await apiFetch(`/conflicts/suggest`, {
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
        const res = await apiFetch(`/tasks/${id}`, {
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
      const res = await apiFetch(`/tasks/link`, {
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
      const rest = { ...s };
      delete rest[key];
      return rest;
    });

  if (loadError) return <p className="ak-error" role="alert">{loadError}</p>;
  if (!loaded) return <p className="ak-hint">Checking for conflicts...</p>;
  if (conflicts.length === 0) {
    return <p className="ak-ok">No scheduling conflicts in the next {CHECK_DAYS} days.</p>;
  }

  return (
    <div>
      <p className="ak-status">
        {conflicts.length} scheduling conflict{conflicts.length > 1 ? "s" : ""} in the next {CHECK_DAYS} days
      </p>
      <ul className="ak-conflicts">
        {conflicts.map((c) => {
          const key = keyOf(c);
          const s = suggestions[key];
          const busy = busyKey === key;
          return (
            <li key={key} className="ak-conflict">
              <div>
                {describe(c)} <span className="ak-hint">({whenText(c.dates)})</span>
              </div>

              <div className="ak-draft-actions">
                {c.kind === "identical" && (
                  <Button size="sm" disabled={busy} onClick={() => handleLink(c)}>Link them</Button>
                )}
                {(c.kind === "overlap" || c.kind === "busy") && !s && (
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => handleSuggest(c)}>
                    {busy ? "Thinking..." : "Suggest a fix"}
                  </Button>
                )}
                {c.kind === "duplicate" && (
                  <span className="ak-hint">Click the event on the calendar to delete one.</span>
                )}
              </div>

              {s && (
                <div className="ak-suggest">
                  {s.new_time ? (
                    <>
                      <div>
                        Move <strong>{s.task_name}</strong> ({s.pet_names.join(" & ")}) from {s.old_time} to{" "}
                        <strong>{s.new_time}</strong>.
                      </div>
                      <div className="ak-draft-note">
                        {s.source === "ai" ? "AI suggestion" : "Rule-based suggestion"}: {s.reason}
                      </div>
                      {s.notice && <div className="ak-draft-note is-warn">{s.notice}</div>}
                      <div className="ak-draft-note">This changes every occurrence of the task.</div>
                      <div className="ak-draft-actions">
                        <Button size="sm" variant="primary" disabled={busy} onClick={() => handleApply(c, s)}>
                          {busy ? "Applying..." : "Apply"}
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => dismiss(key)}>Dismiss</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>{s.reason}</div>
                      <div className="ak-draft-actions">
                        <Button size="sm" onClick={() => dismiss(key)}>Dismiss</Button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {errors[key] && <div className="ak-error" role="alert">{errors[key]}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}