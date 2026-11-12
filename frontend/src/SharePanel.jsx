import { useEffect, useRef, useState } from "react";
import { API_BASE, formatError } from "./taskOptions";

async function errorText(res) {
  try {
    const body = await res.json();
    return typeof body.detail === "string" ? body.detail : formatError(body);
  } catch {
    return "Something went wrong.";
  }
}

export default function SharePanel({ ownerId }) {
  const [token, setToken] = useState(null);       // null = no link
  const [loaded, setLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const url = token ? `${API_BASE}/share/${token}/calendar.ics` : "";

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setToken(null);
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/owners/${ownerId}/share`);
        if (res.ok && !cancelled) setToken((await res.json()).token);
      } catch {
        /* link status stays unknown; creating one still works */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ownerId]);

  async function handleCreate() {
    setMessage("");
    setError("");
    setWorking(true);
    try {
      const res = await fetch(`${API_BASE}/owners/${ownerId}/share`, { method: "POST" });
      if (!res.ok) {
        setError(await errorText(res));
        return;
      }
      setToken((await res.json()).token);
    } catch {
      setError("Couldn't create the link.");
    } finally {
      setWorking(false);
    }
  }

  async function handleStop() {
    if (!window.confirm("Stop sharing? The current link will stop working for everyone who has it.")) return;
    setMessage("");
    setError("");
    setWorking(true);
    try {
      const res = await fetch(`${API_BASE}/owners/${ownerId}/share`, { method: "DELETE" });
      if (!res.ok) {
        setError(await errorText(res));
        return;
      }
      setToken(null);
      setMessage("Sharing is off. The old link no longer works.");
    } catch {
      setError("Couldn't turn sharing off.");
    } finally {
      setWorking(false);
    }
  }

  async function handleCopy() {
    setMessage("");
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      inputRef.current?.select();   // clipboard blocked: leave it selected for Ctrl/Cmd+C
      setMessage("Press Ctrl+C (Cmd+C on Mac) to copy.");
    }
  }

  const box = {
    border: "1px solid #d1d5db", background: "#f9fafb", color: "#111", borderRadius: 6,
    padding: "0.5rem 0.9rem", margin: "0.5rem 0", textAlign: "left",
  };

  return (
    <div style={box}>
      <strong>Share your schedule (optional)</strong>
      <p style={{ margin: "0.3rem 0", color: "#444" }}>
        Get a private link that other people can subscribe to in Google Calendar, Apple Calendar or Outlook.
        They see your pets' task names and times, and nothing else. Your uploaded calendar is never included.
        Anyone with the link can see the schedule, so only send it to people you trust.
      </p>

      {!loaded && <span style={{ color: "#444" }}>Checking...</span>}

      {loaded && !token && (
        <button onClick={handleCreate} disabled={working}>
          {working ? "Working..." : "Create share link"}
        </button>
      )}

      {loaded && token && (
        <>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              ref={inputRef}
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              aria-label="Calendar subscription link"
              style={{ flex: "1 1 18rem", minWidth: 0, padding: "0.3rem" }}
            />
            <button onClick={handleCopy} disabled={working}>Copy link</button>
            <a href={url} target="_blank" rel="noreferrer">Open</a>
            <button onClick={handleStop} disabled={working}>Stop sharing</button>
          </div>
          <details style={{ color: "#444", margin: "0.3rem 0" }}>
            <summary>How do people use this link?</summary>
            <ul style={{ margin: "0.3rem 0" }}>
              <li>Google Calendar: Other calendars (+), then From URL, then paste the link.</li>
              <li>Apple Calendar: File, then New Calendar Subscription, then paste the link.</li>
              <li>Outlook: Add calendar, then Subscribe from web, then paste the link.</li>
              <li>The calendar app refreshes it on its own, usually within a few hours.</li>
            </ul>
          </details>
        </>
      )}

      {message && <div style={{ color: "#166534" }}>{message}</div>}
      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
    </div>
  );
}