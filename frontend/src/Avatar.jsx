// A colored circle with the first letter of a name. The name is always shown next to it,
// so the circle is hidden from screen readers.
export default function Avatar({ name, color, size = 30 }) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="ak-avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.48) }}
    >
      {initial}
    </span>
  );
}