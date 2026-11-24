// Match the shared sort menu's whole-mile distance slider.
export const THANKSGIVING_MIN_MI = 1;
export const THANKSGIVING_MAX_MI = 60;

export function validThanksgivingRadius(value) {
  const radius = typeof value === "number" ? value
    : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(radius) && radius >= THANKSGIVING_MIN_MI && radius <= THANKSGIVING_MAX_MI;
}
