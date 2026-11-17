import { PRIORITY_STYLES } from "./priorities";

export default function PriorityBadge({ priority }) {
  const s = PRIORITY_STYLES[priority];
  if (!s) return <span>{priority}</span>;
  return (
    <span
      className="ak-badge"
      style={{ background: s.bg, borderColor: s.border, color: s.text }}
    >
      {s.marker} {s.label}
    </span>
  );
}

// The small colored square that stands for a priority.
export function PriorityDot({ priority }) {
  const s = PRIORITY_STYLES[priority];
  if (!s) return null;
  return (
    <span
      className="ak-dot"
      aria-hidden="true"
      style={{ background: s.bg, borderColor: s.border }}
    />
  );
}

// "Medium priority" on the priority's own color.
export function PriorityPill({ priority }) {
  const s = PRIORITY_STYLES[priority];
  if (!s) return null;
  const text = priority === "non-negotiable" ? s.label : `${s.label} priority`;
  return (
    <span className="ak-pill" style={{ background: s.bg }}>
      {text}
    </span>
  );
}