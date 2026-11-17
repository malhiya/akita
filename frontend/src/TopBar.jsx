import { useEffect, useId, useRef, useState } from "react";

function Logo() {
  return (
    <div className="ak-brand-mark">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
        <circle cx="5.5" cy="10" r="2.2" />
        <circle cx="9.5" cy="5.5" r="2.2" />
        <circle cx="14.5" cy="5.5" r="2.2" />
        <circle cx="18.5" cy="10" r="2.2" />
        <path d="M12 11c-3 0-6 3.2-6 6 0 2 1.6 3 3.2 3 1 0 1.8-.4 2.8-.4s1.8.4 2.8.4c1.6 0 3.2-1 3.2-3 0-2.8-3-6-6-6z" />
      </svg>
    </div>
  );
}

export default function TopBar({ ownerName }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="ak-topbar">
      <div className="ak-topbar-inner">
        <div className="ak-brand">
          <Logo />
          <h1 className="ak-brand-name">Akita</h1>
        </div>

        <div className="ak-menu-wrap" ref={wrapRef}>
          <button
            type="button"
            className="ak-btn ak-btn-secondary"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
          >
            {ownerName} ▾
          </button>
          {open && (
            <div id={menuId} className="ak-menu" role="menu">
              <button type="button" role="menuitem" className="ak-menu-item" disabled>
                Show my access code
              </button>
              <button type="button" role="menuitem" className="ak-menu-item" disabled>
                Forget this device
              </button>
              <button type="button" role="menuitem" className="ak-menu-item is-danger" disabled>
                Delete all my data
              </button>
              <p className="ak-menu-note">These turn on when access codes are added.</p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}