import { useState, useEffect, useRef } from "react";
import Calendar from "./Calendar";
import ParsePanel from "./ParsePanel";
import ConflictPanel from "./ConflictPanel";
import CalendarUpload from "./CalendarUpload";
import SharePanel from "./SharePanel";
import TopBar from "./TopBar";
import { Button, Card, Field } from "./ui";
import { CATEGORIES, PRIORITIES, DAYS, describeRecurrence, formatError } from "./taskOptions";
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
    if (owner) fetchPets();
  }, [owner]);

  useEffect(() => {
    if (owner) fetchTasks();
  }, [owner, selectedPetId]);

  async function fetchPets() {
    const res = await apiFetch(`/owners/${owner.id}/pets`);
    setPets(await res.json());
  }

  async function fetchTasks() {
    const path =
      selectedPetId === null
        ? `/owners/${owner.id}/tasks`
        : `/pets/${selectedPetId}/tasks`;
    const res = await apiFetch(path);
    setTasks(await res.json());
  }

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
    fetchPets();
  }

  async function handleDeletePet(petId) {
    await apiFetch(`/pets/${petId}`, { method: "DELETE" });
    if (selectedPetId === petId) setSelectedPetId(null);
    await fetchPets();
    fetchTasks();
    setCalendarVersion((v) => v + 1);
  }

  async function handleAddTask(e) {
    e.preventDefault();
    setSubmitting(true);
    setTaskError("");
    try {
      const res = await apiFetch(`/pets/${selectedPetId}/tasks`, {
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
      fetchTasks();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteTask(taskId) {
    await apiFetch(`/tasks/${taskId}`, { method: "DELETE" });
    fetchTasks();
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

        <Card title="Tasks">
          <label className="ak-inline">
            Show tasks for
            <select
              value={selectedPetId ?? "all"}
              onChange={(e) =>
                setSelectedPetId(e.target.value === "all" ? null : Number(e.target.value))
              }
            >
              <option value="all">All Pets</option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>{pet.name}</option>
              ))}
            </select>
          </label>

          <ul className="ak-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <span>
                  {selectedPetId === null && `[${petName(task.pet_id)}] `}
                  {task.name} — {task.category}, {task.priority}, {task.scheduled_time} for{" "}
                  {task.duration_minutes} min ({describeRecurrence(task.rrule)})
                </span>
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

        <Card title="Add tasks from text">
          <ParsePanel
            ownerId={owner.id}
            pets={pets}
            selectedPetId={selectedPetId}
            onSaved={() => { setCalendarVersion((v) => v + 1); fetchTasks(); }}
          />
        </Card>

        <Card title="Add a task">
          {selectedPetId === null ? (
            <p>Select a pet above to add a task.</p>
          ) : (
            <form className="ak-form" onSubmit={handleAddTask}>
              <input placeholder="Task name" aria-label="Task name" required value={newTask.name}
                onChange={(e) => setTaskField("name", e.target.value)} />
              <select aria-label="Category" value={newTask.category}
                onChange={(e) => setTaskField("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select aria-label="Priority" value={newTask.priority}
                onChange={(e) => setTaskField("priority", e.target.value)}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
              <input type="number" min="1" max="240" required aria-label="Minutes"
                value={newTask.duration_minutes}
                onChange={(e) => setTaskField("duration_minutes", e.target.value)} /> min
              <input type="time" required aria-label="Start time" value={newTask.scheduled_time}
                onChange={(e) => setTaskField("scheduled_time", e.target.value)} />
              <label className="ak-inline">Start <input type="date" required value={newTask.start_date}
                onChange={(e) => setTaskField("start_date", e.target.value)} /></label>
              <label className="ak-inline">End (optional) <input type="date" value={newTask.end_date}
                onChange={(e) => setTaskField("end_date", e.target.value)} /></label>
              <select aria-label="Repeats" value={newTask.frequency}
                onChange={(e) => setTaskField("frequency", e.target.value)}>
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              {newTask.frequency === "weekly" && (
                <select aria-label="Day of the week" value={newTask.scheduled_day}
                  onChange={(e) => setTaskField("scheduled_day", e.target.value)}>
                  {DAYS.map((d) => <option key={d}>{d}</option>)}
                </select>
              )}
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? "Adding..." : "Add task"}
              </Button>
              {taskError && <p className="ak-error" role="alert">{taskError}</p>}
            </form>
          )}
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
            <CalendarUpload
              ownerId={owner.id}
              onChanged={() => setCalendarVersion((v) => v + 1)}
            />
            <SharePanel ownerId={owner.id} />
            <ConflictPanel
              ownerId={owner.id}
              version={calendarVersion}
              onChanged={() => { setCalendarVersion((v) => v + 1); fetchTasks(); }}
            />
          </div>

          <Calendar
            ref={calendarRef}
            ownerId={owner.id}
            petId={selectedPetId}
            version={calendarVersion}
            onChanged={() => { setCalendarVersion((v) => v + 1); fetchTasks(); }}
          />
        </Card>
      </main>
    </div>
  );
}

export default App;