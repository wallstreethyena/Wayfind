// Client-safe labels for the shared card's existing chips. The full verified
// window remains the chip title; compact copy never supplies missing dates.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(date) {
  const [, month, day] = String(date).split("-");
  return MONTHS[Number(month) - 1] ? `${MONTHS[Number(month) - 1]} ${Number(day)}` : date;
}
export function hospitalityDateChipLabel(value) {
  const text = String(value || "").trim();
  const range = /^(\d{4}-\d{2}-\d{2})\s*–\s*(\d{4}-\d{2}-\d{2})(; select dates)?$/.exec(text);
  if (range) {
    const window = range[1].slice(0, 7) === range[2].slice(0, 7)
      ? `${shortDate(range[1])}–${Number(range[2].slice(8))}`
      : `${shortDate(range[1])}–${shortDate(range[2])}`;
    return `${range[3] ? "Select " : ""}${window}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return shortDate(text);
  const point = /^(Next|Through|From) (\d{4}-\d{2}-\d{2})(?:; end not announced)?$/.exec(text);
  if (point) return `${point[1]} ${shortDate(point[2])}`;
  if (/dates pending/i.test(text)) return `${text.match(/\b20\d{2}\b/)?.[0] || ""} dates pending`.trim();
  if (text === "Seasonal offering; check service dates") return "Check dates";
  return text;
}
