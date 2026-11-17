import { cloneElement, isValidElement, useEffect, useId, useRef } from "react";

export function Button({ variant = "secondary", size, type = "button", className = "", ...props }) {
  const cls = ["ak-btn", `ak-btn-${variant}`, size === "sm" ? "ak-btn-sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={cls} {...props} />;
}

export function Chip({ selected = false, className = "", ...props }) {
  const cls = ["ak-chip", selected ? "is-selected" : "", className].filter(Boolean).join(" ");
  return <button type="button" aria-pressed={selected} className={cls} {...props} />;
}

export function Card({ title, className = "", children }) {
  const titleId = useId();
  return (
    <section
      className={["ak-card", className].filter(Boolean).join(" ")}
      aria-labelledby={title ? titleId : undefined}
    >
      {title && (
        <h2 id={titleId} className="ak-card-title">
          {title}
        </h2>
      )}
      {children}
    </section>
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