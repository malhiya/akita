import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { PRIORITY_STYLES } from "./priorities";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const API_BASE = "http://localhost:8000";

// Local YYYY-MM-DD (toISOString would shift the date into UTC)
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "2026-10-16" -> local midnight on Oct 16 (not UTC)
const parseLocal = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

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

const Calendar = forwardRef(function Calendar({ ownerId, petId, version }, ref) {
  const calRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [range, setRange] = useState(null);           // what's on screen
  const [validRange, setValidRange] = useState(null); // locked window: { start, end } (end exclusive)

  useImperativeHandle(ref, () => ({
    showRange(start, end) {
      setValidRange({ start, end });
      const api = calRef.current.getApi();
      const s = parseLocal(start);
      const e = parseLocal(end);
      const days = Math.round((e - s) / 86400000);
      if (days <= 21) {
        api.changeView("customRange", { start: s, end: e });
      } else {
        api.changeView("dayGridMonth", s);
      }
    },
    clearRange() {
      setValidRange(null);
      calRef.current.getApi().changeView("timeGridWeek", new Date());
    },
  }));

  // Refetch when the visible range, pet filter, task data, or locked range changes
  useEffect(() => {
    if (!range) return;

    // never fetch (or show) anything outside a locked range
    const start = validRange && validRange.start > range.start ? validRange.start : range.start;
    const end = validRange && validRange.end < range.end ? validRange.end : range.end;
    if (start >= end) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ owner_id: ownerId, start, end });
      if (petId !== null) params.set("pet_id", petId);
      const res = await fetch(`${API_BASE}/schedule?${params}`);
      if (!cancelled && res.ok) setEvents((await res.json()).map(toEvent));
    }
    load();
    return () => { cancelled = true; };
  }, [range, petId, version, ownerId, validRange]);

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
        ref={calRef}
        firstDay={1}
        plugins={[dayGridPlugin, timeGridPlugin]}
        initialView="timeGridWeek"
        views={{ customRange: { type: "timeGrid" } }}
        validRange={validRange ?? undefined}
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
});

export default Calendar;