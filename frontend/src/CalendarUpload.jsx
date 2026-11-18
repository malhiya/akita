import { useEffect, useRef, useState } from "react";
import { formatError } from "./taskOptions";
import { apiFetch } from "./api";
import { Button } from "./ui";

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

// How many busy periods are loaded, or null if we couldn't find out.
async function fetchPeriods(ownerId) {
  const today = new Date();
  const params = new URLSearchParams({ start: ymd(today), end: ymd(addDays(today, WINDOW_DAYS)) });
  try {
    const res = await apiFetch(`/owners/${ownerId}/busy?${params}`);
    return res.ok ? (await res.json()).length : null;
  } catch {
    return null;   // status stays unknown; uploading still works
  }
}

export default function CalendarUpload({ ownerId, onChanged }) {
  const [periods, setPeriods] = useState(null);   // null = not known yet
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchPeriods(ownerId).then((n) => {
      if (!cancelled && n !== null) setPeriods(n);
    });
    return () => {
      cancelled = true;
    };
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
      const res = await apiFetch(`/owners/${ownerId}/calendar`, {
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
      const n = await fetchPeriods(ownerId);
      if (n !== null) setPeriods(n);
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
      const res = await apiFetch(`/owners/${ownerId}/calendar`, { method: "DELETE" });
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

  return (
    <div className="ak-upload">
      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        onChange={handleFile}
        disabled={working}
        hidden
      />

      <div className="ak-upload-row">
        <Button onClick={() => inputRef.current?.click()} disabled={working}>
          Upload my calendar
        </Button>
        <p className="ak-upload-caption">
          Optional: upload an .ics export of your own calendar (for example from Google Calendar) so Akita
          can build around your busy times.
        </p>
      </div>

      {periods > 0 && (
        <div className="ak-upload-status">
          <span className="ak-ok">{periods} busy periods loaded.</span>
          <Button size="sm" variant="danger" onClick={handleRemove} disabled={working}>
            Remove calendar
          </Button>
        </div>
      )}
      {working && <span className="ak-hint">Working...</span>}
      {message && <div className="ak-ok" role="status">{message}</div>}
      {error && <div className="ak-error" role="alert">{error}</div>}

      <p className="ak-hint">
        Only start and end times are kept: event titles and details are never stored or sent to the AI. It
        covers the next {WINDOW_DAYS} days, so upload again to refresh.
      </p>
      <details>
        <summary>How do I get an .ics file?</summary>
        <ul>
          <li>Google Calendar: Settings, then Import &amp; export, then Export. It downloads a .zip; unzip it and use one of the .ics files inside.</li>
          <li>Apple Calendar: File, then Export, then Export…</li>
          <li>Outlook: publish or export the calendar as an .ics file.</li>
        </ul>
      </details>
    </div>
  );
}