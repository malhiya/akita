import { useEffect, useState } from "react";
import { PRIORITY_STYLES } from "./priorities";
import { API_BASE, CATEGORIES, PRIORITIES, DAYS, describeRecurrence, formatError } from "./taskOptions";

const JSON_HEADERS = { "Content-Type": "application/json" };

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

export default function TaskModal({ ownerId, taskId, taskIds, petName, petNames, eventName, occursOn, onClose, onChanged }) {
  const [task, setTask] = useState(null);
  const [mode, setMode] = useState("view");
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // A merged event carries one task per pet; "scope" picks which ones an edit or delete touches.
  const ids = taskIds?.length ? taskIds : [taskId];
  const names = petNames?.length ? petNames : [petName];
  const grouped = ids.length > 1;
  const [scope, setScope] = useState("all");   // "all" | "one"
  const [onePet, setOnePet] = useState(0);     // index into ids/names when scope is "one"
  const targetIds = grouped && scope === "one" ? [ids[onePet]] : ids;

  // "Add pet": the owner's other pets that aren't already part of this event
  const [allPets, setAllPets] = useState([]);
  const [addPetId, setAddPetId] = useState("");
  const [adding, setAdding] = useState(false);
  const availablePets = allPets.filter((p) => !names.includes(p.name));

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
    if (ownerId == null) return;
    let cancelled = false;
    async function loadPets() {
      const res = await fetch(`${API_BASE}/owners/${ownerId}/pets`);
      if (!cancelled && res.ok) setAllPets(await res.json());
    }
    loadPets();
    return () => { cancelled = true; };
  }, [ownerId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setField = (field, value) => setForm({ ...form, [field]: value });

  function startEdit() {
    setForm({ ...toForm(task), name: grouped && eventName ? eventName : task.name });
    setError("");
    setMode("edit");
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = JSON.stringify({
      name: form.name,
      category: form.category,
      priority: form.priority,
      duration_minutes: parseInt(form.duration_minutes),
      scheduled_time: form.scheduled_time,
      start_date: form.start_date,
      end_date: form.end_date || null,
      frequency: form.frequency,
      scheduled_day: form.frequency === "weekly" ? form.scheduled_day : null,
    });
    try {
      const saved = [];
      for (const id of targetIds) {
        const res = await fetch(`${API_BASE}/tasks/${id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body,
        });
        if (!res.ok) {
          setError(formatError(await res.json()));
          if (saved.length) onChanged?.();   // some pets did change
          return;
        }
        saved.push(await res.json());
      }
      onChanged?.();
      if (grouped) {
        onClose();   // the event may have split or changed; reopen it to see the result
        return;
      }
      setTask(saved[0]);
      setMode("view");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const who = grouped && scope === "one" ? names[onePet] : grouped ? "all these pets" : null;
    const msg = who
      ? `Delete this task for ${who}, with all of its occurrences?`
      : "Delete this task and all of its occurrences?";
    if (!window.confirm(msg)) return;
    for (const id of targetIds) {
      const res = await fetch(`${API_BASE}/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't delete this task.");
        onChanged?.();
        return;
      }
    }
    onChanged?.();
    onClose();
  }

  // Copy this task for another pet, then link the copy to the event's tasks.
  async function handleAddPet() {
    setAdding(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/pets/${addPetId}/tasks`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          name: task.name,
          category: task.category,
          priority: task.priority,
          duration_minutes: task.duration_minutes,
          scheduled_time: task.scheduled_time,
          start_date: task.start_date,
          end_date: task.end_date,
          frequency: task.frequency,
          scheduled_day: task.scheduled_day,
        }),
      });
      if (!res.ok) {
        setError(formatError(await res.json()));
        return;
      }
      const created = await res.json();
      const link = await fetch(`${API_BASE}/tasks/link`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ task_ids: [...ids, created.id] }),
      });
      onChanged?.();
      if (!link.ok) {
        setError("Added the task, but couldn't link it, so it shows as a separate event.");
        return;
      }
      onClose();
    } finally {
      setAdding(false);
    }
  }

  const scopePicker = grouped && (
    <fieldset style={{ margin: "0.6rem 0", padding: "0.4rem 0.7rem" }}>
      <legend>Applies to</legend>
      <label style={{ display: "block" }}>
        <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />{" "}
        All pets ({petName})
      </label>
      <label style={{ display: "block" }}>
        <input type="radio" checked={scope === "one"} onChange={() => setScope("one")} />{" "}
        Just{" "}
        <select value={onePet} onChange={(e) => { setOnePet(Number(e.target.value)); setScope("one"); }}>
          {names.map((n, i) => <option key={ids[i]} value={i}>{n}</option>)}
        </select>
      </label>
    </fieldset>
  );

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
            <h3 style={{ marginTop: 0 }}>{grouped && eventName ? eventName : task.name}</h3>
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
            {scopePicker}
            {availablePets.length > 0 && (
              <div style={{ margin: "0.6rem 0" }}>
                <label>
                  Also do this for:{" "}
                  <select value={addPetId} onChange={(e) => setAddPetId(e.target.value)}>
                    <option value="">Choose a pet…</option>
                    {availablePets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>{" "}
                <button onClick={handleAddPet} disabled={!addPetId || adding}>
                  {adding ? "Adding..." : "Add pet"}
                </button>
              </div>
            )}
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
            {scopePicker}
            {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
            <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>{" "}
            <button type="button" onClick={() => { setMode("view"); setError(""); }}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  );
}