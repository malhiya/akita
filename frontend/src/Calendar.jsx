import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";

const API_BASE = "http://localhost:8000";

// Local YYYY-MM-DD (toISOString would shift the date into UTC)
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function toEvent(o) {
  const start = new Date(`${o.occurs_on}T${o.time}:00`);
  const end = new Date(start.getTime() + o.duration_minutes * 60000);
  return { id: `${o.task_id}-${o.occurs_on}`, title: `${o.pet_name}: ${o.name}`, start, end };
}

export default function Calendar({ ownerId }) {
  const [events, setEvents] = useState([]);

  async function loadRange(info) {
    const res = await fetch(
      `${API_BASE}/schedule?owner_id=${ownerId}&start=${ymd(info.start)}&end=${ymd(info.end)}`
    );
    setEvents((await res.json()).map(toEvent));
  }

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin]}
      initialView="timeGridWeek"
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay",
      }}
      events={events}
      datesSet={loadRange}
      height="auto"
    />
  );
}