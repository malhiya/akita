import { useEffect, useRef, useState } from "react";
import { API_BASE, formatError } from "./taskOptions";

const WINDOW_DAYS = 120;      // how far ahead an uploaded calendar is kept
const MAX_BYTES = 2_000_000;
const JSON_HEADERS = { "Content-Type": "application/json" };

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

async function errorText(res) {
  try {
    const body = await res.json();
    return typeof body.detail === "string" ? body.detail : formatError(body);
  } catch {
    return "Something went wrong.";
  }
}

export default function CalendarUpload({ ownerId, onChanged }) {
  const [periods, setPeriods] = useState(null);   // null = not known yet
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const inputRef = useRef(null);

  async function loadStatus() {
    const today = new Date();
    const params = new URLSearchParams({ start: ymd(today), end: ymd(addDays(today, WINDOW_DAYS)) });
    try {
      const res = await fetch(`${API_BASE}/owners/${ownerId}/busy?${params}`);
      if (res.ok) setPeriods((await res.json()).length);
    } catch {
      /* status stays unknown; uploading still works */
    }
  }

  useEffect(() => {
    loadStatus();
  }, [ownerId]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";   // lets the same file be chosen again later
    if (!file) return;
    setMessage("");
    setError("");
    if (file.size > MAX_BYTES) {
      setError("That file is over 2 MB. Export a shorter date range and try again.");
      return;
    }
    setWorking(true);
    try {
      const ics = await file.text();
      const res = await fetch(`${API_BASE}/owners/${ownerId}/calendar`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ics,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          today: ymd(new Date()),
        }),
      });
      if (!res.ok) {
        setError(await errorText(res));
        return;
      }
      const data = await res.json();
      setMessage(`Imported ${data.blocks} busy period${data.blocks === 1 ? "" : "s"} through ${data.end}.`);
      await loadStatus();
      onChanged?.();
    } catch {
      setError("Couldn't read or upload that file.");
    } finally {
      setWorking(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm("Remove your uploaded calendar? Pet tasks will stop avoiding your busy times.")) return;
    setMessage("");
    setError("");
    setWorking(true);
    try {
      const res = await fetch(`${API_BASE}/owners/${ownerId}/calendar`, { method: "DELETE" });
      if (!res.ok) {
        setError(await errorText(res));
        return;
      }
      setPeriods(0);
      setMessage("Calendar removed.");
      onChanged?.();
    } finally {
      setWorking(false);
    }
  }

  const box = {
    border: "1px solid #d1d5db", background: "#f9fafb", color: "#111", borderRadius: 6,
    padding: "0.5rem 0.9rem", margin: "0.5rem 0", textAlign: "left",
  };

  return (
    <div style={box}>
      <strong>Your calendar (optional)</strong>
      <p style={{ margin: "0.3rem 0", color: "#444" }}>
        Upload an .ics export of your own calendar and fix suggestions will steer pet tasks away from your busy
        times. Only start and end times are kept: event titles and details are never stored or sent to the AI.
        It covers the next {WINDOW_DAYS} days, so upload again to refresh.
      </p>
      <details style={{ color: "#444", margin: "0.3rem 0" }}>
        <summary>How do I get an .ics file?</summary>
        <ul style={{ margin: "0.3rem 0" }}>
          <li>Google Calendar: Settings, then Import &amp; export, then Export. It downloads a .zip; unzip it and use one of the .ics files inside.</li>
          <li>Apple Calendar: File, then Export, then Export…</li>
          <li>Outlook: publish or export the calendar as an .ics file.</li>
        </ul>
      </details>
      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        onChange={handleFile}
        disabled={working}
      />{" "}
      {periods > 0 && (
        <>
          <span style={{ color: "#166534" }}>{periods} busy periods loaded.</span>{" "}
          <button onClick={handleRemove} disabled={working}>Remove calendar</button>
        </>
      )}
      {working && <span> Working...</span>}
      {message && <div style={{ color: "#166534" }}>{message}</div>}
      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
    </div>
  );
}