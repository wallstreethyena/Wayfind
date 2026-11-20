// A photo is "portrait" when it is clearly taller than wide. Near-square shots
// (up to 5% taller than wide) keep the normal crop so a 1000x1040 photo does
// not get letterboxed for a sliver.
export function isPortrait(width, height) {
  const w = Number(width), h = Number(height);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && h > w * 1.05;
}
