import { useState } from "react";
import { CATEGORIES, PRIORITIES, DAYS, formatError } from "./taskOptions";
import PriorityBadge from "./PriorityBadge";
import { apiFetch } from "./api";
import { Button, Field } from "./ui";

const MAX_CHARS = 2000; // matches the backend limit
const FIELD_LABELS = {
  duration_minutes: "duration",
  scheduled_time: "time",
  frequency: "repeat",
  scheduled_day: "day",
  start_date: "start date",
};

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
      const res = await apiFetch(`/parse`, {
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
        const res = await apiFetch(`/pets/${d.pet_id}/tasks`, {
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
  const addCount = `Add ${ready.length} task${ready.length === 1 ? "" : "s"}`;

  return (
    <div>
      <textarea
        className="ak-note"
        rows={5}
        maxLength={MAX_CHARS}
        aria-label="Tasks, one per line"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"give Luna her medication at 8am\nwalk Max every morning for 30 minutes\nbrush Whiskers every Saturday"}
      />
      <div className="ak-meta">
        {text.length}/{MAX_CHARS} · one task per line
        {selectedPetName && ` · lines without a pet name go to ${selectedPetName}`}
      </div>
      <Button variant="primary" onClick={handlePreview} disabled={loading || saving || !text.trim()}>
        {loading ? "Parsing..." : "Preview with Akita"}
      </Button>

      {error && <p className="ak-error" role="alert">{error}</p>}
      {message && <p className="ak-status" role="status">{message}</p>}
      {notice && (
        <p className="ak-notice" role="status">
          {notice} Categories and priorities below came from keyword matching, so check them.
        </p>
      )}
      {warnings.map((w, i) => <p key={i} className="ak-meta">{w}</p>)}

      {drafts.length > 0 && (
        <>
          <ul className="ak-drafts">
            {drafts.map((d) => (
              <li key={d.key} className={`ak-draft${d.include ? "" : " is-off"}`}>
                <label className="ak-draft-title">
                  <input type="checkbox" checked={d.include} disabled={d.pet_id === null || saving}
                    onChange={(e) => update(d.key, { include: e.target.checked })} />
                  <span>{d.name}</span>
                </label>

                <div className="ak-draft-line">
                  <select aria-label={`Pet for ${d.name}`} value={d.pet_id ?? ""}
                    onChange={(e) => setPet(d.key, e.target.value)}>
                    <option value="">Choose a pet…</option>
                    {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <span>
                    {d.category} · <PriorityBadge priority={d.priority} /> · {d.scheduled_time} for{" "}
                    {d.duration_minutes} min · {describe(d)}
                  </span>
                </div>

                {d.assumed.length > 0 && (
                  <div className="ak-draft-note is-warn">
                    Guessed, not from your text: {d.assumed.map((f) => FIELD_LABELS[f] ?? f).join(", ")}. Check these.
                  </div>
                )}
                <div className="ak-draft-note">
                  {d.classification_source === "ai" ? "AI's explanation" : "Keyword match"}: {d.reason}
                </div>
                {d.wasUnassigned && d.pet_id !== null && (
                  <div className="ak-draft-note">
                    Priority was chosen without this pet's health notes, so double-check it.
                  </div>
                )}
                {d.rules_consulted.length > 0 && (
                  <details>
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
                {d.saveError && <div className="ak-error">Couldn't save: {d.saveError}</div>}

                <div className="ak-draft-actions">
                  <Button size="sm" aria-label={`${d.editing ? "Finish editing" : "Edit"} ${d.name}`}
                    onClick={() => update(d.key, { editing: !d.editing })}>
                    {d.editing ? "Done" : "Edit"}
                  </Button>
                  <Button size="sm" variant="danger" aria-label={`Remove ${d.name}`}
                    onClick={() => remove(d.key)}>
                    Remove
                  </Button>
                </div>

                {d.editing && (
                  <div className="ak-draft-edit">
                    <Field label="Task name">
                      <input value={d.name} onChange={(e) => update(d.key, { name: e.target.value })} />
                    </Field>
                    <Field label="Kind">
                      <select value={d.category} onChange={(e) => update(d.key, { category: e.target.value })}>
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Priority">
                      <select value={d.priority} onChange={(e) => update(d.key, { priority: e.target.value })}>
                        {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </Field>
                    <Field label="Minutes">
                      <input type="number" min="1" max="240" value={d.duration_minutes}
                        onChange={(e) => edit(d.key, "duration_minutes", e.target.value)} />
                    </Field>
                    <Field label="Start time">
                      <input type="time" value={d.scheduled_time}
                        onChange={(e) => edit(d.key, "scheduled_time", e.target.value)} />
                    </Field>
                    <Field label="Starts on">
                      <input type="date" value={d.start_date}
                        onChange={(e) => edit(d.key, "start_date", e.target.value)} />
                    </Field>
                    <Field label="Repeats">
                      <select value={d.frequency} onChange={(e) => edit(d.key, "frequency", e.target.value)}>
                        <option value="once">Once</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </Field>
                    {d.frequency === "weekly" && (
                      <Field label="Day">
                        <select value={d.scheduled_day ?? DAYS[0]}
                          onChange={(e) => edit(d.key, "scheduled_day", e.target.value)}>
                          {DAYS.map((day) => <option key={day}>{day}</option>)}
                        </select>
                      </Field>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="ak-actions">
            <p className="ak-actions-note">Nothing is saved until you click "{addCount}".</p>
            <Button onClick={() => { setDrafts([]); setWarnings([]); }} disabled={saving}>
              Discard all
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || ready.length === 0}>
              {saving ? "Adding..." : addCount}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}