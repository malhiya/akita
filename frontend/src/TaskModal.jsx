import { useEffect, useState } from "react";
import { PRIORITY_STYLES } from "./priorities";
import { API_BASE, CATEGORIES, PRIORITIES, DAYS, describeRecurrence, formatError } from "./taskOptions";

function toForm(t) {
  return {
    name: t.name,
    category: t.category,
    priority: t.priority,
    duration_minutes: String(t.duration_minutes),
    scheduled_time: t.scheduled_time,
    start_date: t.start_date,
    end_date: t.end_date ?? "",
    frequency: t.frequency,
    scheduled_day: t.scheduled_day ?? "Monday",
  };
}

// "2026-10-10" -> a local date (new Date("2026-10-10") would be UTC and can show the wrong day)
function prettyDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

export default function TaskModal({ taskId, petName, occursOn, onClose, onChanged }) {
  const [task, setTask] = useState(null);
  const [mode, setMode] = useState("view");
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Couldn't load this task. It may have been deleted.");
        return;
      }
      setTask(await res.json());
    }
    load();
    return () => { cancelled = true; };
  }, [taskId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setField = (field, value) => setForm({ ...form, [field]: value });

  function startEdit() {
    setForm(toForm(task));
    setError("");
    setMode("edit");
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          priority: form.priority,
          duration_minutes: parseInt(form.duration_minutes),
          scheduled_time: form.scheduled_time,
          start_date: form.start_date,
          end_date: form.end_date || null,
          frequency: form.frequency,
          scheduled_day: form.frequency === "weekly" ? form.scheduled_day : null,
        }),
      });
      if (!res.ok) {
        setError(formatError(await res.json()));
        return;
      }
      setTask(await res.json());
      setMode("view");
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this task and all of its occurrences?")) return;
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Couldn't delete this task.");
      return;
    }
    onChanged?.();
    onClose();
  }

  const backdrop = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const panel = {
    background: "#fff", color: "#111", padding: "1rem 1.25rem", borderRadius: 8,
    width: "min(440px, 92vw)", maxHeight: "90vh", overflow: "auto", textAlign: "left",
  };
  const row = { display: "block", margin: "0.4rem 0" };

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {!task && !error && <p>Loading...</p>}
        {!task && error && (
          <>
            <p>{error}</p>
            <button onClick={onClose}>Close</button>
          </>
        )}

        {task && mode === "view" && (
          <>
            <h3 style={{ marginTop: 0 }}>{task.name}</h3>
            <p style={{
              display: "inline-block", margin: "0 0 0.5rem", padding: "2px 8px", borderRadius: 4,
              background: PRIORITY_STYLES[task.priority].bg,
              border: `1px solid ${PRIORITY_STYLES[task.priority].border}`,
              color: PRIORITY_STYLES[task.priority].text,
            }}>
              {PRIORITY_STYLES[task.priority].marker} {PRIORITY_STYLES[task.priority].label}
            </p>
            <p><strong>Pet:</strong> {petName}</p>
            <p><strong>Category:</strong> {task.category}</p>
            <p><strong>Time:</strong> {task.scheduled_time}, {task.duration_minutes} min</p>
            <p><strong>Repeats:</strong> {describeRecurrence(task.rrule)}</p>
            <p><strong>Starts:</strong> {prettyDate(task.start_date)}</p>
            <p><strong>Ends:</strong> {task.end_date ? prettyDate(task.end_date) : "No end date"}</p>
            <p style={{ color: "#555" }}>You clicked the occurrence on {prettyDate(occursOn)}.</p>
            {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
            <button onClick={startEdit}>Edit</button>{" "}
            <button onClick={handleDelete}>Delete</button>{" "}
            <button onClick={onClose}>Close</button>
          </>
        )}

        {task && mode === "edit" && form && (
          <form onSubmit={handleSave}>
            <h3 style={{ marginTop: 0 }}>Edit task ({petName})</h3>
            <p style={{ color: "#555" }}>Changes apply to every occurrence of this task, not just one day.</p>
            <label style={row}>Name
              <input required value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </label>
            <label style={row}>Category
              <select value={form.category} onChange={(e) => setField("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label style={row}>Priority
              <select value={form.priority} onChange={(e) => setField("priority", e.target.value)}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label style={row}>Duration (min)
              <input type="number" min="1" max="240" required value={form.duration_minutes}
                onChange={(e) => setField("duration_minutes", e.target.value)} />
            </label>
            <label style={row}>Time
              <input type="time" required value={form.scheduled_time}
                onChange={(e) => setField("scheduled_time", e.target.value)} />
            </label>
            <label style={row}>Starts
              <input type="date" required value={form.start_date}
                onChange={(e) => setField("start_date", e.target.value)} />
            </label>
            <label style={row}>Ends (optional)
              <input type="date" value={form.end_date}
                onChange={(e) => setField("end_date", e.target.value)} />
            </label>
            <label style={row}>Repeats
              <select value={form.frequency} onChange={(e) => setField("frequency", e.target.value)}>
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            {form.frequency === "weekly" && (
              <label style={row}>On
                <select value={form.scheduled_day} onChange={(e) => setField("scheduled_day", e.target.value)}>
                  {DAYS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </label>
            )}
            {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
            <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>{" "}
            <button type="button" onClick={() => { setMode("view"); setError(""); }}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  );
}