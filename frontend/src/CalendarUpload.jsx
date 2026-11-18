import { useEffect, useId, useRef, useState } from "react";
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
  const tipId = useId();

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
    <div className="ak-up">
      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        onChange={handleFile}
        disabled={working}
        hidden
      />

      <div className="ak-up-row">
        <Button onClick={() => inputRef.current?.click()} disabled={working}>
          Upload my calendar
        </Button>
        <span className="ak-up-caption">
          Optional: upload an .ics export of your calendar so Akita can build around your busy times.
        </span>
        <span className="ak-info">
          <button
            type="button"
            className="ak-info-btn"
            aria-label="More about uploading your calendar"
            aria-describedby={tipId}
          >
            i
          </button>
          <div id={tipId} role="tooltip" className="ak-info-tip">
            <div className="ak-info-box">
              <p>
                Only start and end times are kept: event titles and details are never stored or sent to
                the AI. It covers the next {WINDOW_DAYS} days, so upload again to refresh.
              </p>
              <strong>How do I get an .ics file?</strong>
              <ul>
                <li>Google Calendar: Settings, then Import &amp; export, then Export. It downloads a .zip; unzip it and use one of the .ics files inside.</li>
                <li>Apple Calendar: File, then Export, then Export…</li>
                <li>Outlook: publish or export the calendar as an .ics file.</li>
              </ul>
            </div>
          </div>
        </span>
      </div>

      {(periods > 0 || working) && (
        <div className="ak-up-status">
          {periods > 0 && (
            <>
              <span className="ak-ok">{periods} busy periods loaded.</span>
              <Button size="sm" variant="danger" onClick={handleRemove} disabled={working}>
                Remove calendar
              </Button>
            </>
          )}
          {working && <span>Working...</span>}
        </div>
      )}
      {message && <div className="ak-ok ak-up-msg" role="status">{message}</div>}
      {error && <div className="ak-error ak-up-msg" role="alert">{error}</div>}
    </div>
  );
}