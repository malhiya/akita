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