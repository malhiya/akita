import { cloneElement, isValidElement, useEffect, useId, useRef } from "react";

export function Button({ variant = "secondary", size, type = "button", className = "", ...props }) {
  const cls = ["ak-btn", `ak-btn-${variant}`, size === "sm" ? "ak-btn-sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={cls} {...props} />;
}

// A toggle button. An optional icon (a pet circle, a priority square) sits before the label.
export function Chip({ selected = false, icon, className = "", children, ...props }) {
  const cls = ["ak-chip", selected ? "is-selected" : "", icon ? "has-icon" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" aria-pressed={selected} className={cls} {...props}>
      {icon}
      {children}
    </button>
  );
}

// A white card. With an icon, the title gets a colored circle beside it (and becomes an h3).
export function Card({ title, icon, iconColor, className = "", children }) {
  const titleId = useId();
  let heading = null;
  if (title && icon) {
    heading = (
      <div className="ak-card-head">
        <span className="ak-icon-circle" aria-hidden="true" style={{ background: iconColor }}>
          {icon}
        </span>
        <h3 id={titleId} className="ak-card-title">
          {title}
        </h3>
      </div>
    );
  } else if (title) {
    heading = (
      <h2 id={titleId} className="ak-card-title">
        {title}
      </h2>
    );
  }
  return (
    <section
      className={["ak-card", className].filter(Boolean).join(" ")}
      aria-labelledby={title ? titleId : undefined}
    >
      {heading}
      {children}
    </section>
  );
}

// A big page heading with a subtitle, and an optional control on the right.
export function Section({ title, subtitle, actions, children }) {
  const titleId = useId();
  return (
    <section className="ak-section" aria-labelledby={titleId}>
      <div className="ak-section-head">
        <div>
          <h2 id={titleId} className="ak-section-title">
            {title}
          </h2>
          {subtitle && <p className="ak-section-sub">{subtitle}</p>}
        </div>
        {actions && <div className="ak-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

// A pill-shaped switcher. options: [{ value, label, icon? }]; one value is selected.
export function Segmented({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="ak-seg">
      {options.map((o) => {
        const selected = o.value === value;
        const cls = ["ak-seg-btn", selected ? "is-selected" : "", o.icon ? "has-icon" : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={selected}
            className={cls}
            onClick={() => onChange(o.value)}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A label around one input, with an optional hint or error underneath.
export function Field({ label, hint, error, children }) {
  const noteId = useId();
  const note = error || hint;
  const control = isValidElement(children)
    ? cloneElement(children, {
        ...(note ? { "aria-describedby": noteId } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;
  return (
    <div className="ak-field">
      <label className="ak-field-control">
        <span className="ak-field-label">{label}</span>
        {control}
      </label>
      {note && (
        <span
          id={noteId}
          className={error ? "ak-error" : "ak-hint"}
          role={error ? "alert" : undefined}
        >
          {note}
        </span>
      )}
    </div>
  );
}

// Uses the browser's <dialog>, which handles Escape and keyboard focus for us.
export function Modal({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ak-modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="ak-modal-inner">
        <h2 id={titleId} className="ak-modal-title">
          {title}
        </h2>
        <div>{children}</div>
        {footer && <div className="ak-modal-footer">{footer}</div>}
      </div>
    </dialog>
  );
}