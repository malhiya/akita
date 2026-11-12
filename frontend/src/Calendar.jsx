import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { PRIORITY_STYLES } from "./priorities";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import TaskModal from "./TaskModal";
import { apiFetch } from "./api";

const BUSY_COLOR = "#9ca3af";

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
    id: `${o.task_ids?.[0] ?? o.task_id}-${o.occurs_on}`,
    title: `${s.marker} ${o.pet_name}: ${o.name}`,
    start,
    end,
    backgroundColor: s.bg,
    borderColor: s.border,
    textColor: s.text,
    extendedProps: {
      taskId: o.task_id,
      taskIds: o.task_ids ?? [o.task_id],
      petName: o.pet_name,
      petNames: o.pet_names ?? [o.pet_name],
      eventName: o.name,
      occursOn: o.occurs_on,
    },
  };
}

// The owner's uploaded calendar: grey shading behind the pet events, no titles.
function toBusyEvent(b, i) {
  return {
    id: `busy-${i}-${b.start}`,
    start: b.start,
    end: b.end,
    display: "background",
    backgroundColor: BUSY_COLOR,
  };
}

const Calendar = forwardRef(function Calendar({ ownerId, petId, version, onChanged }, ref) {
  const calRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [busyEvents, setBusyEvents] = useState([]);
  const [viewType, setViewType] = useState("timeGridWeek");
  const [range, setRange] = useState(null);           // what's on screen
  const [validRange, setValidRange] = useState(null); // locked window: { start, end } (end exclusive)
  const [selected, setSelected] = useState(null);     // event whose popup is open

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
      setBusyEvents([]);
      return;
    }

    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ owner_id: ownerId, start, end });
      if (petId !== null) params.set("pet_id", petId);
      const busyParams = new URLSearchParams({ start, end });
      const [scheduleRes, busyRes] = await Promise.all([
        apiFetch(`/schedule?${params}`),
        apiFetch(`/owners/${ownerId}/busy?${busyParams}`),
      ]);
      if (cancelled) return;
      if (scheduleRes.ok) setEvents((await scheduleRes.json()).map(toEvent));
      if (busyRes.ok) setBusyEvents((await busyRes.json()).map(toBusyEvent));
    }
    load();
    return () => { cancelled = true; };
  }, [range, petId, version, ownerId, validRange]);

  function handleDatesSet(info) {
    const start = ymd(info.start);
    const end = ymd(info.end);
    setViewType(info.view.type);
    setRange((r) => (r && r.start === start && r.end === end ? r : { start, end }));
  }

  // In the month grid a background event would shade the whole day, which would
  // wrongly suggest you are busy all day, so busy time only shows in the hourly views.
  const shown = viewType === "dayGridMonth" ? events : [...events, ...busyEvents];

  return (
    <>
      <div style={{ display: "flex", gap: "0.75rem", margin: "0.5rem 0", flexWrap: "wrap" }}>
        {Object.entries(PRIORITY_STYLES).map(([key, s]) => (
          <span key={key} style={{
            background: s.bg, border: `1px solid ${s.border}`, color: s.text,
            padding: "2px 8px", borderRadius: 4,
          }}>
            {s.marker} {s.label}
          </span>
        ))}
        {busyEvents.length > 0 && (
          <span style={{
            background: BUSY_COLOR, border: "1px solid #6b7280", color: "#111",
            padding: "2px 8px", borderRadius: 4, opacity: 0.6,
          }}>
            Your calendar (busy)
          </span>
        )}
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
        events={shown}
        datesSet={handleDatesSet}
        eventClick={(info) => setSelected(info.event.extendedProps)}
        height="auto"
      />

      {selected && (
        <TaskModal
          {...selected}
          ownerId={ownerId}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
});

export default Calendar;