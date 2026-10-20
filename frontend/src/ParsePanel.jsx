import { useState } from "react";
import { API_BASE, CATEGORIES, PRIORITIES, DAYS, formatError } from "./taskOptions";
import { PRIORITY_STYLES } from "./priorities";

const MAX_CHARS = 2000; // matches the backend limit
const FIELD_LABELS = {
  duration_minutes: "duration",
  scheduled_time: "time",
  frequency: "repeat",
  scheduled_day: "day",
  start_date: "start date",
};
const muted = { fontSize: 13, color: "#555", marginTop: 4 };
const bad = { color: "#b91c1c" };

// The user's local date, not the server's: "tomorrow" must mean their tomorrow.
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAYS[(new Date(y, m - 1, d).getDay() + 6) % 7]; // DAYS starts on Monday
}

function describe(d) {
  if (d.frequency === "once") return `once on ${d.start_date}`;
  if (d.frequency === "weekly") return `every ${d.scheduled_day} from ${d.start_date}`;
  return `daily from ${d.start_date}`;
}

function PriorityBadge({ priority }) {
  const s = PRIORITY_STYLES[priority];
  if (!s) return <span>{priority}</span>;
  return (
    <span style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text,
                   borderRadius: 4, padding: "0 6px", fontSize: 13 }}>
      {s.marker} {s.label}
    </span>
  );
}

export default function ParsePanel({ ownerId, pets, selectedPetId, onSaved }) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handlePreview() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const body = { owner_id: ownerId, text, today: todayLocal() };
      if (selectedPetId !== null) body.pet_id = selectedPetId;
      const res = await fetch(`${API_BASE}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(formatError(await res.json()));
        return;
      }
      const data = await res.json();
      setDrafts(
        data.drafts.map((d, i) => ({
          ...d,
          key: i,
          include: !d.needs_pet,   // a draft with no pet can't be included yet
          wasUnassigned: d.needs_pet,
          editing: false,
          saveError: "",
        }))
      );
      setWarnings(data.warnings);
      if (data.drafts.length === 0) setMessage("No task lines found.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  function update(key, changes) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...changes } : d)));
  }

  // Editing a field confirms it, so it stops being flagged as a guess.
  function edit(key, field, value) {
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key) return d;
        const next = { ...d, [field]: value, assumed: d.assumed.filter((f) => f !== field) };
        if (field === "frequency") {
          next.scheduled_day =
            value === "weekly"
              ? d.scheduled_day ?? (d.start_date ? weekdayOf(d.start_date) : DAYS[0])
              : null;
        }
        return next;
      })
    );
  }

  function setPet(key, value) {
    const id = value === "" ? null : Number(value);
    const pet = pets.find((p) => p.id === id);
    update(key, { pet_id: id, pet_name: pet?.name ?? null, needs_pet: id === null, include: id !== null });
  }

  function remove(key) {
    setDrafts((ds) => ds.filter((d) => d.key !== key));
  }

  const ready = drafts.filter((d) => d.include && d.pet_id !== null && d.name.trim());
  const notice = drafts.find((d) => d.notice)?.notice;

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    const failed = [];
    let saved = 0;
    for (const d of ready) {
      try {
        const res = await fetch(`${API_BASE}/pets/${d.pet_id}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: d.name.trim(),
            category: d.category,
            priority: d.priority,
            duration_minutes: parseInt(d.duration_minutes, 10),
            scheduled_time: d.scheduled_time,
            start_date: d.start_date,
            end_date: null,
            frequency: d.frequency,
            scheduled_day: d.frequency === "weekly" ? d.scheduled_day : null,
            group_id: d.group_id ?? null,
          }),
        });
        if (res.ok) saved++;
        else failed.push({ ...d, saveError: formatError(await res.json()) });
      } catch {
        failed.push({ ...d, saveError: "Could not reach the server." });
      }
    }
    // Saved drafts are done and unchecked ones count as rejected; only failures stay.
    setDrafts(failed);
    if (failed.length === 0) {
      setText("");
      setWarnings([]);
    }
    setMessage(
      `Added ${saved} task${saved === 1 ? "" : "s"}.` +
        (failed.length ? ` ${failed.length} couldn't be saved. Fix and retry below.` : "")
    );
    setSaving(false);
    if (saved > 0) onSaved();
  }

  const selectedPetName = pets.find((p) => p.id === selectedPetId)?.name;

  return (
    <div>
      <textarea
        rows={5}
        cols={60}
        maxLength={MAX_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"give Luna her medication at 8am\nwalk Max every morning for 30 minutes\nbrush Whiskers every Saturday"}
      />
      <div style={muted}>
        {text.length}/{MAX_CHARS} · one task per line
        {selectedPetName && ` · lines without a pet name go to ${selectedPetName}`}
      </div>
      <button onClick={handlePreview} disabled={loading || saving || !text.trim()}>
        {loading ? "Parsing..." : "Preview tasks"}
      </button>

      {error && <p style={bad}>{error}</p>}
      {message && <p>{message}</p>}
      {notice && (
        <p style={{ background: "#fef9c3", border: "1px solid #a16207", padding: 8 }}>
          ⚠ {notice} Categories and priorities below came from keyword matching, so check them.
        </p>
      )}
      {warnings.map((w, i) => <p key={i} style={muted}>{w}</p>)}

      {drafts.length > 0 && (
        <>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {drafts.map((d) => (
              <li key={d.key} style={{ border: "1px solid #ccc", borderRadius: 6, padding: 10,
                                       margin: "8px 0", opacity: d.include ? 1 : 0.6 }}>
                <label>
                  <input type="checkbox" checked={d.include} disabled={d.pet_id === null || saving}
                    onChange={(e) => update(d.key, { include: e.target.checked })} />{" "}
                  <strong>{d.name}</strong>
                </label>

                <div>
                  <select value={d.pet_id ?? ""} onChange={(e) => setPet(d.key, e.target.value)}>
                    <option value="">Choose a pet…</option>
                    {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>{" "}
                  {d.category} · <PriorityBadge priority={d.priority} /> · {d.scheduled_time} for{" "}
                  {d.duration_minutes} min · {describe(d)}
                </div>

                {d.assumed.length > 0 && (
                  <div style={muted}>
                    Guessed, not from your text: {d.assumed.map((f) => FIELD_LABELS[f] ?? f).join(", ")}. Check these.
                  </div>
                )}
                <div style={muted}>
                  {d.classification_source === "ai" ? "AI's explanation" : "Keyword match"}: {d.reason}
                </div>
                {d.wasUnassigned && d.pet_id !== null && (
                  <div style={muted}>
                    Priority was chosen without this pet's health notes, so double-check it.
                  </div>
                )}
                {d.rules_consulted.length > 0 && (
                  <details style={muted}>
                    <summary>Rules consulted ({d.rules_consulted.length})</summary>
                    <ul>
                      {d.rules_consulted.map((r, i) => (
                        <li key={i}>
                          {r.text} <em>({r.source}{r.location ? `, ${r.location}` : ""})</em>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {d.saveError && <div style={bad}>Couldn't save: {d.saveError}</div>}

                <div style={{ marginTop: 6 }}>
                  <button onClick={() => update(d.key, { editing: !d.editing })}>
                    {d.editing ? "Done" : "Edit"}
                  </button>
                  <button onClick={() => remove(d.key)}>Remove</button>
                </div>

                {d.editing && (
                  <div style={{ marginTop: 6 }}>
                    <input value={d.name} onChange={(e) => update(d.key, { name: e.target.value })} />
                    <select value={d.category} onChange={(e) => update(d.key, { category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <select value={d.priority} onChange={(e) => update(d.key, { priority: e.target.value })}>
                      {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <input type="number" min="1" max="240" value={d.duration_minutes}
                      onChange={(e) => edit(d.key, "duration_minutes", e.target.value)} /> min
                    <input type="time" value={d.scheduled_time}
                      onChange={(e) => edit(d.key, "scheduled_time", e.target.value)} />
                    <label>Start <input type="date" value={d.start_date}
                      onChange={(e) => edit(d.key, "start_date", e.target.value)} /></label>
                    <select value={d.frequency} onChange={(e) => edit(d.key, "frequency", e.target.value)}>
                      <option value="once">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                    {d.frequency === "weekly" && (
                      <select value={d.scheduled_day ?? DAYS[0]}
                        onChange={(e) => edit(d.key, "scheduled_day", e.target.value)}>
                        {DAYS.map((day) => <option key={day}>{day}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <button onClick={handleSave} disabled={saving || ready.length === 0}>
            {saving ? "Adding..." : `Add ${ready.length} task${ready.length === 1 ? "" : "s"}`}
          </button>
          <button onClick={() => { setDrafts([]); setWarnings([]); }} disabled={saving}>
            Discard all
          </button>
        </>
      )}
    </div>
  );
}