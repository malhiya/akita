import { useState, useEffect, useRef } from "react";
import Calendar from "./Calendar";
import ParsePanel from "./ParsePanel";
import ConflictPanel from "./ConflictPanel";
import CalendarUpload from "./CalendarUpload";
import SharePanel from "./SharePanel";
import TopBar from "./TopBar";
import PriorityBadge from "./PriorityBadge";
import { Button, Card, Chip, Field } from "./ui";
import { CATEGORIES, PRIORITIES, DAYS, describeRecurrence, formatError } from "./taskOptions";
import { PRIORITY_STYLES } from "./priorities";
import { apiFetch } from "./api";

const EMPTY_TASK = {
  name: "",
  category: "walk",
  priority: "medium",
  duration_minutes: "30",
  scheduled_time: "08:00",
  start_date: "",
  end_date: "",
  frequency: "daily",
  scheduled_day: "Monday",
};

const EMPTY_PET = { name: "", species: "", age: "", health_notes: "" };

const REPEATS = [
  ["once", "Once"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
];

function App() {
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pets, setPets] = useState([]);
  const [newPet, setNewPet] = useState(EMPTY_PET);
  const [selectedPetId, setSelectedPetId] = useState(null); // null = All Pets
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState(EMPTY_TASK);
  const [submitting, setSubmitting] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [calendarVersion, setCalendarVersion] = useState(0);
  const calendarRef = useRef(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [taskPetId, setTaskPetId] = useState(null); // pet picked in the manual form
  // The manual form's pet: the one picked there, else the filtered pet, else the first pet.
  const formPetId = taskPetId ?? selectedPetId ?? pets[0]?.id ?? null;

  // Bumping a version re-runs the matching load effect below.
  const [petsVersion, setPetsVersion] = useState(0);
  const [tasksVersion, setTasksVersion] = useState(0);
  const refreshPets = () => setPetsVersion((v) => v + 1);
  const refreshTasks = () => setTasksVersion((v) => v + 1);

  useEffect(() => {
    async function loadOwner() {
      const storedId = localStorage.getItem("ownerId");
      let ownerData;
      if (storedId) {
        const res = await apiFetch(`/owners/${storedId}`);
        ownerData = await res.json();
      } else {
        const res = await apiFetch(`/owners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Owner" }),
        });
        ownerData = await res.json();
        localStorage.setItem("ownerId", ownerData.id);
      }
      setOwner(ownerData);
      setLoading(false);
    }
    loadOwner();
  }, []);

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    async function load() {
      const res = await apiFetch(`/owners/${owner.id}/pets`);
      const data = await res.json();
      if (!cancelled) setPets(data);
    }
    load();
    return () => { cancelled = true; };
  }, [owner, petsVersion]);

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    async function load() {
      const path =
        selectedPetId === null
          ? `/owners/${owner.id}/tasks`
          : `/pets/${selectedPetId}/tasks`;
      const res = await apiFetch(path);
      const data = await res.json();
      if (!cancelled) setTasks(data);
    }
    load();
    return () => { cancelled = true; };
  }, [owner, selectedPetId, tasksVersion]);

  async function handleAddPet(e) {
    e.preventDefault();
    await apiFetch(`/owners/${owner.id}/pets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPet.name,
        species: newPet.species,
        age: parseInt(newPet.age),
        health_notes: newPet.health_notes.trim() || null,
      }),
    });
    setNewPet(EMPTY_PET);
    refreshPets();
  }

  async function handleDeletePet(petId) {
    await apiFetch(`/pets/${petId}`, { method: "DELETE" });
    if (selectedPetId === petId) setSelectedPetId(null);
    if (taskPetId === petId) setTaskPetId(null);
    refreshPets();
    refreshTasks();
    setCalendarVersion((v) => v + 1);
  }

  async function handleAddTask(e) {
    e.preventDefault();
    setSubmitting(true);
    setTaskError("");
    try {
      const res = await apiFetch(`/pets/${formPetId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTask.name,
          category: newTask.category,
          priority: newTask.priority,
          duration_minutes: parseInt(newTask.duration_minutes),
          scheduled_time: newTask.scheduled_time,
          start_date: newTask.start_date,
          end_date: newTask.end_date || null,
          frequency: newTask.frequency,
          scheduled_day: newTask.frequency === "weekly" ? newTask.scheduled_day : null,
        }),
      });
      if (!res.ok) {
        setTaskError(formatError(await res.json()));
        return;
      }
      setNewTask(EMPTY_TASK);
      setCalendarVersion((v) => v + 1);
      refreshTasks();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteTask(taskId) {
    await apiFetch(`/tasks/${taskId}`, { method: "DELETE" });
    refreshTasks();
    setCalendarVersion((v) => v + 1);
  }

  function setTaskField(field, value) {
    setNewTask({ ...newTask, [field]: value });
  }

  if (loading) {
    return (
      <div className="ak-app">
        <p className="ak-main">Loading...</p>
      </div>
    );
  }

  const petName = (id) => pets.find((p) => p.id === id)?.name ?? "Unknown";

  const iso = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const parseLocal = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const addDays = (d, n) => {
    const x = typeof d === "string" ? parseLocal(d) : new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  function showPreset(kind) {
    const today = new Date();
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    if (kind === "week") calendarRef.current.showRange(iso(monday), iso(addDays(monday, 7)));
    if (kind === "two") calendarRef.current.showRange(iso(monday), iso(addDays(monday, 14)));
    if (kind === "month") {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      calendarRef.current.showRange(iso(first), iso(next));
    }
    if (kind === "three") {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const later = new Date(today.getFullYear(), today.getMonth() + 3, 1);
      calendarRef.current.showRange(iso(first), iso(later));
    }
  }

  function showCustomRange() {
    if (!rangeStart || !rangeEnd) return;
    if (rangeEnd < rangeStart) return;
    calendarRef.current.showRange(rangeStart, iso(addDays(rangeEnd, 1)));
  }

  return (
    <div className="ak-app">
      <TopBar ownerName={owner.name} />

      <main className="ak-main">
        <Card title="Your pets">
          {pets.length === 0 && <p className="ak-hint">No pets yet. Add your first pet below.</p>}
          <ul className="ak-list">
            {pets.map((pet) => (
              <li key={pet.id}>
                <span>
                  {pet.name} — {pet.species}, age {pet.age}
                  {pet.health_notes && ` · ${pet.health_notes}`}
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Delete ${pet.name}`}
                  onClick={() => handleDeletePet(pet.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>

          <h3>Add a pet</h3>
          <form className="ak-form" onSubmit={handleAddPet}>
            <Field label="Name">
              <input required value={newPet.name}
                onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} />
            </Field>
            <Field label="Species">
              <input required value={newPet.species}
                onChange={(e) => setNewPet({ ...newPet, species: e.target.value })} />
            </Field>
            <Field label="Age in years">
              <input type="number" min="0" required value={newPet.age}
                onChange={(e) => setNewPet({ ...newPet, age: e.target.value })} />
            </Field>
            <Field label="Health notes (optional)" hint="Used when choosing task priorities.">
              <input value={newPet.health_notes}
                onChange={(e) => setNewPet({ ...newPet, health_notes: e.target.value })} />
            </Field>
            <Button variant="primary" type="submit">Add pet</Button>
          </form>
        </Card>

        <Card title="Add tasks with Akita">
          <div className="ak-stack">
            <ParsePanel
              ownerId={owner.id}
              pets={pets}
              selectedPetId={selectedPetId}
              onSaved={() => { setCalendarVersion((v) => v + 1); refreshTasks(); }}
            />
            <CalendarUpload
              ownerId={owner.id}
              onChanged={() => setCalendarVersion((v) => v + 1)}
            />
          </div>
        </Card>

        <Card title="Fill it in yourself">
          {pets.length === 0 ? (
            <p>Add a pet first, then you can add tasks.</p>
          ) : (
            <form className="ak-form" onSubmit={handleAddTask}>
              <div className="ak-choice" role="group" aria-labelledby="mt-pet">
                <span id="mt-pet" className="ak-field-label">Pet</span>
                <div className="ak-chips">
                  {pets.map((p) => (
                    <Chip key={p.id} selected={p.id === formPetId} onClick={() => setTaskPetId(p.id)}>
                      {p.name}
                    </Chip>
                  ))}
                </div>
              </div>

              <Field label="Task name">
                <input required value={newTask.name}
                  onChange={(e) => setTaskField("name", e.target.value)} />
              </Field>
              <Field label="Kind">
                <select value={newTask.category} onChange={(e) => setTaskField("category", e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>

              <div className="ak-choice" role="group" aria-labelledby="mt-priority">
                <span id="mt-priority" className="ak-field-label">Priority</span>
                <div className="ak-chips">
                  {PRIORITIES.map((p) => (
                    <Chip key={p} selected={newTask.priority === p}
                      onClick={() => setTaskField("priority", p)}>
                      {PRIORITY_STYLES[p]?.label ?? p}
                    </Chip>
                  ))}
                </div>
              </div>

              <Field label="Minutes">
                <input type="number" min="1" max="240" required value={newTask.duration_minutes}
                  onChange={(e) => setTaskField("duration_minutes", e.target.value)} />
              </Field>
              <Field label="Start time">
                <input type="time" required value={newTask.scheduled_time}
                  onChange={(e) => setTaskField("scheduled_time", e.target.value)} />
              </Field>
              <Field label="Starts on">
                <input type="date" required value={newTask.start_date}
                  onChange={(e) => setTaskField("start_date", e.target.value)} />
              </Field>
              <Field label="Ends on (optional)">
                <input type="date" value={newTask.end_date}
                  onChange={(e) => setTaskField("end_date", e.target.value)} />
              </Field>

              <div className="ak-choice" role="group" aria-labelledby="mt-repeat">
                <span id="mt-repeat" className="ak-field-label">Repeats</span>
                <div className="ak-chips">
                  {REPEATS.map(([value, label]) => (
                    <Chip key={value} selected={newTask.frequency === value}
                      onClick={() => setTaskField("frequency", value)}>
                      {label}
                    </Chip>
                  ))}
                </div>
              </div>
              {newTask.frequency === "weekly" && (
                <div className="ak-choice" role="group" aria-labelledby="mt-day">
                  <span id="mt-day" className="ak-field-label">On</span>
                  <div className="ak-chips">
                    {DAYS.map((d) => (
                      <Chip key={d} selected={newTask.scheduled_day === d}
                        onClick={() => setTaskField("scheduled_day", d)}>
                        {d}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? "Adding..." : "Add task"}
              </Button>
              {taskError && <p className="ak-error" role="alert">{taskError}</p>}
            </form>
          )}
        </Card>

        <Card title="Scheduling conflicts">
          <ConflictPanel
            ownerId={owner.id}
            version={calendarVersion}
            onChanged={() => { setCalendarVersion((v) => v + 1); refreshTasks(); }}
          />
        </Card>

        <Card title="Your tasks">
          <div className="ak-toolbar" role="group" aria-label="Show tasks for">
            <Chip selected={selectedPetId === null} onClick={() => setSelectedPetId(null)}>
              All pets
            </Chip>
            {pets.map((pet) => (
              <Chip key={pet.id} selected={selectedPetId === pet.id}
                onClick={() => setSelectedPetId(pet.id)}>
                {pet.name}
              </Chip>
            ))}
          </div>

          {tasks.length === 0 && <p className="ak-hint">No tasks yet. Add one above.</p>}
          <ul className="ak-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <div className="ak-task-main">
                  <div className="ak-task-name">{task.name}</div>
                  <div className="ak-task-meta">
                    {selectedPetId === null && `${petName(task.pet_id)} · `}
                    {task.scheduled_time} for {task.duration_minutes} min ·{" "}
                    {describeRecurrence(task.rrule)} · {task.category}
                  </div>
                </div>
                <PriorityBadge priority={task.priority} />
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Delete task ${task.name}`}
                  onClick={() => handleDeleteTask(task.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Calendar">
          <div className="ak-toolbar">
            <Button size="sm" onClick={() => showPreset("week")}>This week</Button>
            <Button size="sm" onClick={() => showPreset("two")}>Next 2 weeks</Button>
            <Button size="sm" onClick={() => showPreset("month")}>This month</Button>
            <Button size="sm" onClick={() => showPreset("three")}>Next 3 months</Button>
          </div>
          <div className="ak-toolbar">
            <label className="ak-inline">From <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} /></label>
            <label className="ak-inline">To <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} /></label>
            <Button size="sm" onClick={showCustomRange} disabled={!rangeStart || !rangeEnd || rangeEnd < rangeStart}>
              Show range
            </Button>
            <Button size="sm" onClick={() => calendarRef.current.clearRange()}>Clear range</Button>
          </div>

          <div className="ak-stack">
            <SharePanel ownerId={owner.id} />
          </div>

          <Calendar
            ref={calendarRef}
            ownerId={owner.id}
            petId={selectedPetId}
            version={calendarVersion}
            onChanged={() => { setCalendarVersion((v) => v + 1); refreshTasks(); }}
          />
        </Card>
      </main>
    </div>
  );
}

export default App;