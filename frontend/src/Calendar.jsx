import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PRIORITY_STYLES } from "./priorities";
import { PRIORITY_ORDER } from "./taskOptions";
import { PriorityDot } from "./PriorityBadge";
import TaskModal from "./TaskModal";
import { apiFetch } from "./api";

const BUSY_COLOR = "#9ca3af";

const pad = (n) => String(n).padStart(2, "0");

// Local YYYY-MM-DD (toISOString would shift the date into UTC)
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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
    title: `${o.pet_name} · ${o.name} · ${s.label}`,
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
      priority: o.priority,
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
    classNames: ["ak-busy"],
  };
}

// A day column header: a small weekday over a big date, today in a green circle.
function renderDayHeader(arg) {
  const weekday = arg.date.toLocaleDateString(undefined, { weekday: "short" });
  if (arg.view.type === "dayGridMonth") return weekday;
  return (
    <div className={`ak-dh${arg.isToday ? " is-today" : ""}`}>
      <div className="ak-dh-dow">{weekday}</div>
      <div className="ak-dh-num">{arg.date.getDate()}</div>
    </div>
  );
}

// An event's text: the title and its time (the time sits beside the title on short events).
function renderEvent(arg) {
  if (arg.event.display === "background") return <></>;
  const time = arg.timeText;
  if (arg.view.type === "dayGridMonth") {
    return (
      <>
        {time && <span className="ak-ev-time">{time} </span>}
        <span className="ak-ev-title">{arg.event.title}</span>
      </>
    );
  }
  return (
    <div className="ak-ev">
      <div className="ak-ev-title">{arg.event.title}</div>
      {time && <div className="ak-ev-time">{time}</div>}
    </div>
  );
}

const Calendar = forwardRef(function Calendar(
  { ownerId, petId, version, hours = { from: 0, to: 24 }, onChanged, onViewChange },
  ref
) {
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
    prev() {
      calRef.current.getApi().prev();
    },
    next() {
      calRef.current.getApi().next();
    },
    today() {
      calRef.current.getApi().today();
    },
    setView(type) {
      calRef.current.getApi().changeView(type);
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

    // Tell the page where we are, for its heading and its arrow buttons.
    const now = new Date();
    onViewChange?.({
      type: info.view.type,
      title: info.view.title,
      isCurrent: now >= info.view.currentStart && now < info.view.currentEnd,
      canPrev: !validRange || start > validRange.start,
      canNext: !validRange || end < validRange.end,
    });
  }

  // In the month grid a background event would shade the whole day, which would
  // wrongly suggest you are busy all day, so busy time only shows in the hourly views.
  const shown = viewType === "dayGridMonth" ? events : [...events, ...busyEvents];

  return (
    <>
      <div className="ak-legend">
        <span className="ak-legend-title">Color shows priority</span>
        <div className="ak-legend-items" role="list" aria-label="Priority colors">
          {PRIORITY_ORDER.map((p) => (
            <span key={p} role="listitem" className="ak-legend-item">
              <PriorityDot priority={p} />
              {PRIORITY_STYLES[p]?.label ?? p}
            </span>
          ))}
          {busyEvents.length > 0 && (
            <span role="listitem" className="ak-legend-item">
              <span className="ak-dot ak-dot-busy" aria-hidden="true" />
              Your calendar (busy)
            </span>
          )}
        </div>
      </div>

      <FullCalendar
        ref={calRef}
        firstDay={1}
        plugins={[dayGridPlugin, timeGridPlugin]}
        initialView="timeGridWeek"
        views={{
          customRange: { type: "timeGrid" },
          timeGrid: { displayEventEnd: true },
        }}
        validRange={validRange ?? undefined}
        headerToolbar={false}
        allDaySlot={false}
        slotMinTime={`${pad(hours.from)}:00:00`}
        slotMaxTime={`${pad(hours.to)}:00:00`}
        slotLabelFormat={{ hour: "numeric", minute: "2-digit", omitZeroMinute: true, meridiem: "short" }}
        eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
        dayHeaderContent={renderDayHeader}
        eventContent={renderEvent}
        eventDidMount={(info) => {
          if (info.event.display === "background") return;
          info.el.title = `${info.timeText} ${info.event.title}`.trim();
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