import { useState, useEffect, useRef } from "react";
import Calendar from "./Calendar";
import ParsePanel from "./ParsePanel";
import ConflictPanel from "./ConflictPanel";
import CalendarUpload from "./CalendarUpload";
import SharePanel from "./SharePanel";
import TopBar from "./TopBar";
import TaskModal from "./TaskModal";
import Avatar from "./Avatar";
import { NoteIcon, PencilIcon } from "./icons";
import { PriorityDot, PriorityPill } from "./PriorityBadge";
import { Button, Card, Chip, Field, Section, Segmented } from "./ui";
import { CATEGORIES, DAYS, PRIORITY_ORDER, describeSchedule, formatError } from "./taskOptions";
import { PRIORITY_STYLES } from "./priorities";
import { petColorFor } from "./petColors";
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

const JSON_HEADERS = { "Content-Type": "application/json" };

// The manual form's pet choice when the task is for every pet.
const ALL_PETS = "all";

const REPEATS = [
  ["once", "Just once"],
  ["daily", "Every day"],
  ["weekly", "Weekly"],
];

const TASKS_PER_PAGE = 5;

// The calendar's date choices. The keys (except default and custom) match showPreset.
const RANGE_OPTIONS = [
  ["default", "Default view"],
  ["week", "This week"],
  ["two", "Next 2 weeks"],
  ["month", "This month"],
  ["three", "Next 3 months"],
  ["custom", "Custom dates…"],
];

const HOURS_OPTIONS = [
  ["all", "All hours"],
  ["day", "Daytime (7 AM to 9 PM)"],
  ["custom", "Custom hours…"],
];

const ALL_HOURS = { from: 0, to: 24 };
const DAYTIME = { from: 7, to: 21 };

// The calendar's Day / Week / Month switcher (values are FullCalendar view names).
const VIEW_OPTIONS = [
  { value: "timeGridDay", label: "Day" },
  { value: "timeGridWeek", label: "Week" },
  { value: "dayGridMonth", label: "Month" },
];

// What the calendar heading calls the period on screen when it includes today.
const PERIOD_NAMES = {
  timeGridDay: "Today",
  timeGridWeek: "This week",
  dayGridMonth: "This month",
  customRange: "Your dates",
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ["Luna", "Max", "Bella"] -> "Luna, Max & Bella"
const joinNames = (names) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;

function hourLabel(h) {
  if (h === 24) return "12 AM (end of day)";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? "AM" : "PM"}`;
}

function App() {
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pets, setPets] = useState([]);
  const [newPet, setNewPet] = useState(EMPTY_PET);
  const [selectedPetId, setSelectedPetId] = useState(null); // pet the tasks list shows (null = all)
  const [calendarPetId, setCalendarPetId] = useState(null); // pet the calendar shows (null = all)
  const [tasks, setTasks] = useState([]);
  const [taskPage, setTaskPage] = useState(0);
  const [editingTask, setEditingTask] = useState(null); // task open in the edit popup
  const [newTask, setNewTask] = useState(EMPTY_TASK);
  const [submitting, setSubmitting] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [calendarVersion, setCalendarVersion] = useState(0);
  const calendarRef = useRef(null);
  const [calInfo, setCalInfo] = useState(null); // what the calendar is showing, reported by Calendar
  const [rangeMode, setRangeMode] = useState("default");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [hoursMode, setHoursMode] = useState("all");
  const [customHours, setCustomHours] = useState({ from: 8, to: 18 });
  const [taskPetId, setTaskPetId] = useState(null); // pet picked in the manual form (or ALL_PETS)
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
          headers: JSON_HEADERS,
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

  // Which pet the tasks list shows (null = all pets).
  function pickPet(id) {
    setSelectedPetId(id);
    setTaskPage(0);
  }

  // The calendar reports each change of what it shows; keep the old object if nothing differs.
  function handleViewChange(next) {
    setCalInfo((prev) =>
      prev &&
      prev.type === next.type &&
      prev.title === next.title &&
      prev.isCurrent === next.isCurrent &&
      prev.canPrev === next.canPrev &&
      prev.canNext === next.canNext
        ? prev
        : next
    );
  }

  async function handleAddPet(e) {
    e.preventDefault();
    await apiFetch(`/owners/${owner.id}/pets`, {
      method: "POST",
      headers: JSON_HEADERS,
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
    if (selectedPetId === petId) pickPet(null);
    if (calendarPetId === petId) setCalendarPetId(null);
    if (taskPetId === petId) setTaskPetId(null);
    refreshPets();
    refreshTasks();
    setCalendarVersion((v) => v + 1);
  }

  // Adds the task for the chosen pet, or for every pet and links the copies into one event.
  async function handleAddTask(e) {
    e.preventDefault();
    setSubmitting(true);
    setTaskError("");
    const targets = formPetId === ALL_PETS ? pets : pets.filter((p) => p.id === formPetId);
    const body = JSON.stringify({
      name: newTask.name,
      category: newTask.category,
      priority: newTask.priority,
      duration_minutes: parseInt(newTask.duration_minutes),
      scheduled_time: newTask.scheduled_time,
      start_date: newTask.start_date,
      end_date: newTask.end_date || null,
      frequency: newTask.frequency,
      scheduled_day: newTask.frequency === "weekly" ? newTask.scheduled_day : null,
    });
    const created = [];
    try {
      for (const pet of targets) {
        const res = await apiFetch(`/pets/${pet.id}/tasks`, {
          method: "POST",
          headers: JSON_HEADERS,
          body,
        });
        if (!res.ok) {
          const msg = formatError(await res.json());
          const done = targets.slice(0, created.length).map((p) => p.name).join(", ");
          setTaskError(
            targets.length > 1
              ? `Couldn't add it for ${pet.name}: ${msg}` +
                  (done ? ` It was already added for ${done}.` : "")
              : msg
          );
          break;
        }
        created.push((await res.json()).id);
      }

      if (created.length > 1) {
        const link = await apiFetch(`/tasks/link`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ task_ids: created }),
        });
        if (!link.ok) {
          setTaskError("Added the tasks, but couldn't link them, so they show as separate events.");
        }
      }

      if (created.length > 0) {
        setCalendarVersion((v) => v + 1);
        refreshTasks();
      }
      if (created.length === targets.length) setNewTask(EMPTY_TASK);
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
  const colorOf = (id) => petColorFor(pets, id);

  // "All pets" plus one option per pet, for the pet switchers.
  const petOptions = [
    { value: null, label: "All pets" },
    ...pets.map((p) => ({
      value: p.id,
      label: p.name,
      icon: <Avatar name={p.name} color={colorOf(p.id)} size={28} />,
    })),
  ];

  const petCount = new Set(tasks.map((t) => t.pet_id)).size;
  const tasksSubtitle =
    tasks.length === 0
      ? "Nothing scheduled yet"
      : selectedPetId === null
        ? `${plural(tasks.length, "task")} across ${plural(petCount, "pet")}`
        : `${plural(tasks.length, "task")} for ${petName(selectedPetId)}`;

  // One page of the tasks list. The page is clamped, so deleting the last task on the
  // last page lands on the new last page.
  const pageCount = Math.max(1, Math.ceil(tasks.length / TASKS_PER_PAGE));
  const page = Math.min(taskPage, pageCount - 1);
  const firstTask = page * TASKS_PER_PAGE;
  const visibleTasks = tasks.slice(firstTask, firstTask + TASKS_PER_PAGE);

  // The calendar heading: "This week with Luna & Max", or "Calendar for Luna & Max" when
  // browsing another period. The subtitle is the date range the calendar reports.
  const calendarPets =
    calendarPetId !== null
      ? petName(calendarPetId)
      : pets.length === 0
        ? "your pets"
        : pets.length <= 3
          ? joinNames(pets.map((p) => p.name))
          : "all your pets";
  const calendarHeading =
    calInfo && (calInfo.isCurrent || calInfo.type === "customRange")
      ? `${PERIOD_NAMES[calInfo.type] ?? "This period"} with ${calendarPets}`
      : `Calendar for ${calendarPets}`;

  // The hours the calendar shows, from the Hours dropdown.
  const hours = hoursMode === "all" ? ALL_HOURS : hoursMode === "day" ? DAYTIME : customHours;

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

  // The Dates dropdown: presets apply right away, "custom" waits for the From/To dates.
  function chooseRange(value) {
    setRangeMode(value);
    if (value === "default") calendarRef.current.clearRange();
    else if (value !== "custom") showPreset(value);
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
                <span className="ak-pet-line">
                  <Avatar name={pet.name} color={colorOf(pet.id)} size={36} />
                  <span>
                    {pet.name} — {pet.species}, age {pet.age}
                    {pet.health_notes && ` · ${pet.health_notes}`}
                  </span>
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

        <Section
          title="Add tasks"
          subtitle="Say it in your own words, or fill it in yourself. Both end up on the same calendar."
        >
          <CalendarUpload
            ownerId={owner.id}
            onChanged={() => setCalendarVersion((v) => v + 1)}
          />

          <div className="ak-row">
            <Card title="Note-style" icon={<NoteIcon />} iconColor="#FAE7A2">
              <p className="ak-card-desc">
                Type it like you'd tell a friend or write in notes. Akita fills in the pet, time and repeats.
              </p>
              <ParsePanel
                ownerId={owner.id}
                pets={pets}
                selectedPetId={selectedPetId}
                onSaved={() => { setCalendarVersion((v) => v + 1); refreshTasks(); }}
              />
            </Card>

            <Card title="Fill it in yourself" icon={<PencilIcon />} iconColor="#DCCFF8">
              {pets.length === 0 ? (
                <p>Add a pet first, then you can add tasks.</p>
              ) : (
                <form className="ak-form ak-form-stack" onSubmit={handleAddTask}>
                  <div className="ak-choice" role="group" aria-labelledby="mt-pet">
                    <span id="mt-pet" className="ak-field-label">Pet</span>
                    <div className="ak-chips">
                      {pets.map((p) => (
                        <Chip
                          key={p.id}
                          className="ak-chip-avatar"
                          icon={<Avatar name={p.name} color={colorOf(p.id)} size={28} />}
                          selected={p.id === formPetId}
                          onClick={() => setTaskPetId(p.id)}
                        >
                          {p.name}
                        </Chip>
                      ))}
                      {pets.length > 1 && (
                        <Chip
                          selected={formPetId === ALL_PETS}
                          onClick={() => setTaskPetId(ALL_PETS)}
                        >
                          All pets
                        </Chip>
                      )}
                    </div>
                    {formPetId === ALL_PETS && (
                      <span className="ak-hint">
                        Adds the same task for every pet and shows it as one event on the calendar.
                      </span>
                    )}
                  </div>

                  <div className="ak-fields">
                    <Field label="Task name">
                      <input required value={newTask.name}
                        onChange={(e) => setTaskField("name", e.target.value)} />
                    </Field>
                    <Field label="Kind">
                      <select value={newTask.category} onChange={(e) => setTaskField("category", e.target.value)}>
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Start time">
                      <input type="time" required value={newTask.scheduled_time}
                        onChange={(e) => setTaskField("scheduled_time", e.target.value)} />
                    </Field>
                    <Field label="How long (minutes)">
                      <input type="number" min="1" max="240" required value={newTask.duration_minutes}
                        onChange={(e) => setTaskField("duration_minutes", e.target.value)} />
                    </Field>
                  </div>

                  <div className="ak-choice" role="group" aria-labelledby="mt-priority">
                    <span id="mt-priority" className="ak-field-label">Priority</span>
                    <div className="ak-chips">
                      {PRIORITY_ORDER.map((p) => {
                        const s = PRIORITY_STYLES[p];
                        const selected = newTask.priority === p;
                        return (
                          <Chip
                            key={p}
                            icon={<PriorityDot priority={p} />}
                            selected={selected}
                            style={selected && s ? { background: s.bg, borderColor: s.border } : undefined}
                            onClick={() => setTaskField("priority", p)}
                          >
                            {s?.label ?? p}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>

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
                    {newTask.frequency === "weekly" && (
                      <div className="ak-chips" role="group" aria-label="Day of the week">
                        {DAYS.map((d) => (
                          <Chip
                            key={d}
                            className="ak-day"
                            aria-label={d}
                            selected={newTask.scheduled_day === d}
                            onClick={() => setTaskField("scheduled_day", d)}
                          >
                            {d.slice(0, 3)}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="ak-fields">
                    <Field label="Starts on">
                      <input type="date" required value={newTask.start_date}
                        onChange={(e) => setTaskField("start_date", e.target.value)} />
                    </Field>
                    <Field label="Ends on (optional)">
                      <input type="date" value={newTask.end_date}
                        onChange={(e) => setTaskField("end_date", e.target.value)} />
                    </Field>
                  </div>

                  <Button variant="primary" type="submit" className="ak-btn-block" disabled={submitting}>
                    {submitting ? "Adding..." : formPetId === ALL_PETS ? "Add for all pets" : "Add task"}
                  </Button>
                  {taskError && <p className="ak-error" role="alert">{taskError}</p>}
                </form>
              )}
            </Card>
          </div>
        </Section>

        <ConflictPanel
          ownerId={owner.id}
          version={calendarVersion}
          onChanged={() => { setCalendarVersion((v) => v + 1); refreshTasks(); }}
        />

        <Section
          title="Your tasks"
          subtitle={tasksSubtitle}
          actions={
            <Segmented
              label="Show tasks for"
              options={petOptions}
              value={selectedPetId}
              onChange={pickPet}
            />
          }
        >
          <Card className="ak-card-tight">
            {tasks.length === 0 && <p className="ak-hint">No tasks yet. Add one above.</p>}
            <ul className="ak-tasks">
              {visibleTasks.map((task) => (
                <li key={task.id} className="ak-trow">
                  <span className="ak-trow-pet">
                    <Avatar name={petName(task.pet_id)} color={colorOf(task.pet_id)} size={36} />
                    {petName(task.pet_id)}
                  </span>
                  <div className="ak-trow-main">
                    <div className="ak-trow-name">
                      <PriorityDot priority={task.priority} />
                      {task.name}
                      <PriorityPill priority={task.priority} />
                    </div>
                    <div className="ak-trow-meta">
                      {describeSchedule(task)} · {task.duration_minutes} min
                    </div>
                  </div>
                  <div className="ak-trow-actions">
                    <Button
                      size="sm"
                      aria-label={`Edit task ${task.name}`}
                      onClick={() => setEditingTask(task)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label={`Delete task ${task.name}`}
                      onClick={() => handleDeleteTask(task.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {tasks.length > TASKS_PER_PAGE && (
              <nav className="ak-pager" aria-label="Task pages">
                <Button
                  size="sm"
                  aria-label="Previous page"
                  disabled={page === 0}
                  onClick={() => setTaskPage(page - 1)}
                >
                  ←
                </Button>
                <span className="ak-pager-info">
                  {firstTask + 1}–{Math.min(firstTask + TASKS_PER_PAGE, tasks.length)} of {tasks.length}
                </span>
                <Button
                  size="sm"
                  aria-label="Next page"
                  disabled={page === pageCount - 1}
                  onClick={() => setTaskPage(page + 1)}
                >
                  →
                </Button>
              </nav>
            )}
          </Card>
        </Section>

        <Section title={calendarHeading} subtitle={calInfo?.title}>
          <div className="ak-cal-controls">
            <Segmented
              label="Show calendar for"
              options={petOptions}
              value={calendarPetId}
              onChange={setCalendarPetId}
            />
            <Segmented
              label="Calendar view"
              options={VIEW_OPTIONS}
              value={calInfo?.type ?? null}
              onChange={(type) => calendarRef.current.setView(type)}
            />
          </div>

          <Card>
            <div className="ak-toolbar">
              <div className="ak-nav" role="group" aria-label="Move the calendar">
                <Button
                  size="sm"
                  aria-label="Previous"
                  disabled={!calInfo?.canPrev}
                  onClick={() => calendarRef.current.prev()}
                >
                  ←
                </Button>
                <Button
                  size="sm"
                  aria-label="Next"
                  disabled={!calInfo?.canNext}
                  onClick={() => calendarRef.current.next()}
                >
                  →
                </Button>
                <Button size="sm" onClick={() => calendarRef.current.today()}>Today</Button>
              </div>

              <label className="ak-inline">
                Dates
                <select value={rangeMode} onChange={(e) => chooseRange(e.target.value)}>
                  {RANGE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              {rangeMode === "custom" && (
                <>
                  <label className="ak-inline">
                    From
                    <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                  </label>
                  <label className="ak-inline">
                    To
                    <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                  </label>
                  <Button
                    size="sm"
                    onClick={showCustomRange}
                    disabled={!rangeStart || !rangeEnd || rangeEnd < rangeStart}
                  >
                    Show range
                  </Button>
                </>
              )}

              <label className="ak-inline">
                Hours
                <select value={hoursMode} onChange={(e) => setHoursMode(e.target.value)}>
                  {HOURS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              {hoursMode === "custom" && (
                <>
                  <label className="ak-inline">
                    From
                    <select
                      value={customHours.from}
                      onChange={(e) => {
                        const from = Number(e.target.value);
                        setCustomHours({ from, to: Math.max(customHours.to, from + 1) });
                      }}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{hourLabel(h)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="ak-inline">
                    To
                    <select
                      value={customHours.to}
                      onChange={(e) => setCustomHours({ ...customHours, to: Number(e.target.value) })}
                    >
                      {Array.from({ length: 24 - customHours.from }, (_, i) => customHours.from + 1 + i).map((h) => (
                        <option key={h} value={h}>{hourLabel(h)}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            {(hours.from !== 0 || hours.to !== 24) && (
              <p className="ak-hint">Tasks outside these hours are hidden in the week and day views.</p>
            )}

            <Calendar
              ref={calendarRef}
              ownerId={owner.id}
              petId={calendarPetId}
              version={calendarVersion}
              hours={hours}
              onViewChange={handleViewChange}
              onChanged={() => { setCalendarVersion((v) => v + 1); refreshTasks(); }}
            />

            <div className="ak-share">
              <SharePanel ownerId={owner.id} />
            </div>
          </Card>
        </Section>
      </main>

      {editingTask && (
        <TaskModal
          key={editingTask.id}
          ownerId={owner.id}
          taskId={editingTask.id}
          petName={petName(editingTask.pet_id)}
          startInEdit
          onClose={() => setEditingTask(null)}
          onChanged={() => { setCalendarVersion((v) => v + 1); refreshTasks(); }}
        />
      )}
    </div>
  );
}

export default App;