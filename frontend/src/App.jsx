import { useState, useEffect } from "react";
import Calendar from "./Calendar";

const API_BASE = "http://localhost:8000";

const CATEGORIES = ["meds", "vet", "feeding", "walk", "grooming", "play", "training", "general"];
const PRIORITIES = ["non-negotiable", "high", "medium", "low"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CODE_TO_DAY = { MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday" };

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

function describeRecurrence(rrule) {
  if (!rrule) return "One time";
  if (rrule.includes("FREQ=DAILY")) return "Daily";
  const code = rrule.split("BYDAY=")[1];
  return `Weekly on ${CODE_TO_DAY[code] ?? code}`;
}

function formatError(err) {
  if (Array.isArray(err.detail)) return err.detail.map((d) => d.msg).join("; ");
  return err.detail || "Something went wrong";
}

function App() {
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pets, setPets] = useState([]);
  const [newPet, setNewPet] = useState({ name: "", species: "", age: "" });
  const [selectedPetId, setSelectedPetId] = useState(null); // null = All Pets
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState(EMPTY_TASK);
  const [submitting, setSubmitting] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [calendarVersion, setCalendarVersion] = useState(0);

  useEffect(() => {
    async function loadOwner() {
      const storedId = localStorage.getItem("ownerId");
      let ownerData;
      if (storedId) {
        const res = await fetch(`${API_BASE}/owners/${storedId}`);
        ownerData = await res.json();
      } else {
        const res = await fetch(`${API_BASE}/owners`, {
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
    const res = await fetch(`${API_BASE}/owners/${owner.id}/pets`);
    setPets(await res.json());
  }

  async function fetchTasks() {
    const url =
      selectedPetId === null
        ? `${API_BASE}/owners/${owner.id}/tasks`
        : `${API_BASE}/pets/${selectedPetId}/tasks`;
    const res = await fetch(url);
    setTasks(await res.json());
  }

  async function handleAddPet(e) {
    e.preventDefault();
    await fetch(`${API_BASE}/owners/${owner.id}/pets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPet.name,
        species: newPet.species,
        age: parseInt(newPet.age),
      }),
    });
    setNewPet({ name: "", species: "", age: "" });
    fetchPets();
  }

  async function handleDeletePet(petId) {
    await fetch(`${API_BASE}/pets/${petId}`, { method: "DELETE" });
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
      const res = await fetch(`${API_BASE}/pets/${selectedPetId}/tasks`, {
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
    await fetch(`${API_BASE}/tasks/${taskId}`, { method: "DELETE" });
    fetchTasks();
    setCalendarVersion((v) => v + 1);
  }

  function setTaskField(field, value) {
    setNewTask({ ...newTask, [field]: value });
  }

  if (loading) return <p>Loading...</p>;

  const petName = (id) => pets.find((p) => p.id === id)?.name ?? "Unknown";

  return (
    <div>
      <h1>Welcome, {owner.name}</h1>

      <h2>Your Pets</h2>
      <ul>
        {pets.map((pet) => (
          <li key={pet.id}>
            {pet.name} — {pet.species}, age {pet.age}
            <button onClick={() => handleDeletePet(pet.id)}>Delete</button>
          </li>
        ))}
      </ul>

      <h3>Add a Pet</h3>
      <form onSubmit={handleAddPet}>
        <input placeholder="Name" value={newPet.name}
          onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} />
        <input placeholder="Species" value={newPet.species}
          onChange={(e) => setNewPet({ ...newPet, species: e.target.value })} />
        <input placeholder="Age" type="number" value={newPet.age}
          onChange={(e) => setNewPet({ ...newPet, age: e.target.value })} />
        <button type="submit">Add Pet</button>
      </form>

      <h2>Tasks</h2>
      <label>
        Show tasks for:{" "}
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

      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {selectedPetId === null && `[${petName(task.pet_id)}] `}
            {task.name} — {task.category}, {task.priority}, {task.scheduled_time} for{" "}
            {task.duration_minutes} min ({describeRecurrence(task.rrule)})
            <button onClick={() => handleDeleteTask(task.id)}>Delete</button>
          </li>
        ))}
      </ul>

      <h3>Add a Task</h3>
      {selectedPetId === null ? (
        <p>Select a pet above to add a task.</p>
      ) : (
        <form onSubmit={handleAddTask}>
          <input placeholder="Task name" required value={newTask.name}
            onChange={(e) => setTaskField("name", e.target.value)} />
          <select value={newTask.category} onChange={(e) => setTaskField("category", e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={newTask.priority} onChange={(e) => setTaskField("priority", e.target.value)}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input type="number" min="1" max="240" required value={newTask.duration_minutes}
            onChange={(e) => setTaskField("duration_minutes", e.target.value)} /> min
          <input type="time" required value={newTask.scheduled_time}
            onChange={(e) => setTaskField("scheduled_time", e.target.value)} />
          <label>Start <input type="date" required value={newTask.start_date}
            onChange={(e) => setTaskField("start_date", e.target.value)} /></label>
          <label>End (optional) <input type="date" value={newTask.end_date}
            onChange={(e) => setTaskField("end_date", e.target.value)} /></label>
          <select value={newTask.frequency} onChange={(e) => setTaskField("frequency", e.target.value)}>
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          {newTask.frequency === "weekly" && (
            <select value={newTask.scheduled_day} onChange={(e) => setTaskField("scheduled_day", e.target.value)}>
              {DAYS.map((d) => <option key={d}>{d}</option>)}
            </select>
          )}
          <button type="submit" disabled={submitting}>
            {submitting ? "Adding..." : "Add Task"}
          </button>
          {taskError && <p>{taskError}</p>}
        </form>
      )}

      <h2>Calendar</h2>
      <Calendar ownerId={owner.id} petId={selectedPetId} version={calendarVersion} />
    </div>
  );
}

export default App;