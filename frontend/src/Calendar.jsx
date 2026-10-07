import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { PRIORITY_STYLES } from "./priorities";

const API_BASE = "http://localhost:8000";

// Local YYYY-MM-DD (toISOString would shift the date into UTC)
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function toEvent(o) {
  const s = PRIORITY_STYLES[o.priority];
  const start = new Date(`${o.occurs_on}T${o.time}:00`);
  const end = new Date(start.getTime() + o.duration_minutes * 60000);
  return {
    id: `${o.task_id}-${o.occurs_on}`,
    title: `${s.marker} ${o.pet_name}: ${o.name}`,
    start,
    end,
    backgroundColor: s.bg,
    borderColor: s.border,
    textColor: s.text,
  };
}

export default function Calendar({ ownerId, petId, version }) {
  const [events, setEvents] = useState([]);
  const [range, setRange] = useState(null);

  // Refetch whenever the visible range, pet filter, or task data changes
  useEffect(() => {
    if (!range) return;
    let cancelled = false;

    async function load() {
      const params = new URLSearchParams({ owner_id: ownerId, start: range.start, end: range.end });
      if (petId !== null) params.set("pet_id", petId);
      const res = await fetch(`${API_BASE}/schedule?${params}`);
      if (!cancelled && res.ok) setEvents((await res.json()).map(toEvent));
    }

    load();
    return () => { cancelled = true; };
  }, [range, petId, version, ownerId]);

  function handleDatesSet(info) {
    const start = ymd(info.start);
    const end = ymd(info.end);
    setRange((r) => (r && r.start === start && r.end === end ? r : { start, end }));
  }

  return (
    <>
      <div style={{ display: "flex", gap: "0.75rem", margin: "0.5rem 0" }}>
        {Object.entries(PRIORITY_STYLES).map(([key, s]) => (
          <span key={key} style={{
            background: s.bg, border: `1px solid ${s.border}`, color: s.text,
            padding: "2px 8px", borderRadius: 4,
          }}>
            {s.marker} {s.label}
          </span>
        ))}
      </div>

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={events}
        datesSet={handleDatesSet}
        height="auto"
      />
    </>
  );
}