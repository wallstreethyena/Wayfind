def sub(path, old, new, label, n=1):
    s = open(path, encoding="utf-8").read()
    assert s.count(old) == n, f"{label}: expected {n}, found {s.count(old)}"
    open(path, "w", encoding="utf-8").write(s.replace(old, new, n))
    print("patched:", label)

# ══ THE CAT WATCHES YOU DECIDE ════════════════════════════════════════════
# Owner: "make the little guy seem excited but also track the movement on the
# mouse, anxious about the decision, shaking and looking like they can't wait
# for a decision, literally bouncing off the walls with excitement, but cute."
#
# Eyes follow the pointer, the whole cat leans after it, and it vibrates at a
# speed set by how long you have been deliberating. On a phone there is no
# pointer at all, so the lean follows the last TOUCH and the fidget carries the
# performance on its own — the mobile version cannot be the broken one, it is
# where this page is actually opened.
sub("app/ask/pixel.js",
'''/** One cat. `mood` selects the drawing AND the motion. */
export function Cat({ tone = "cream", mood = "hopeful", size = 96, flip = false, delay = 0 }) {
  const pal = P[tone] || P.cream;
  const m = MOODS[mood] || MOODS.hopeful;''',
'''/**
 * One cat. `mood` selects the drawing AND the motion.
 *
 * `look` is a unit vector (-1..1) toward whatever the person is doing — the
 * pointer on a desktop, the last touch on a phone. The eyes shift a pixel or two
 * along it and the whole body leans, which is the entire trick: a character that
 * tracks you reads as ALIVE and interested, and one that does not reads as a
 * sticker. `fidget` is 0..1 — how badly it wants an answer.
 */
export function Cat({ tone = "cream", mood = "hopeful", size = 96, flip = false, delay = 0, look, fidget = 0 }) {
  const pal = P[tone] || P.cream;
  const m = MOODS[mood] || MOODS.hopeful;
  const lx = look && typeof look.x === "number" ? Math.max(-1, Math.min(1, look.x)) : 0;
  const ly = look && typeof look.y === "number" ? Math.max(-1, Math.min(1, look.y)) : 0;''', "cat look params")

sub("app/ask/pixel.js",
'''    <svg width={box} height={box} viewBox={"0 0 " + box + " " + box} shapeRendering="crispEdges"
      className={"wfc " + m.anim}
      style={{ animationDelay: delay + "s", transform: flip ? "scaleX(-1)" : "none" }} aria-hidden="true">''',
'''    <svg width={box} height={box} viewBox={"0 0 " + box + " " + box} shapeRendering="crispEdges"
      className={"wfc " + m.anim + (fidget > 0 ? " wfc-eager" : "")}
      style={{
        animationDelay: delay + "s",
        // Whole-body lean, capped at one pixel cell so it never stops looking
        // drawn — a smooth 12px slide in a pixel scene is the thing that gives
        // the illusion away.
        "--lean": Math.round(lx * px) + "px",
        "--liftv": Math.round(ly * px * 0.6) + "px",
        // The fidget gets FASTER the longer they take, from a calm .5s down to a
        // frantic .18s. Cute, not a seizure: the travel stays under two pixels.
        "--fid": (0.5 - 0.32 * Math.max(0, Math.min(1, fidget))).toFixed(2) + "s",
        transform: flip ? "scaleX(-1)" : "none",
      }} aria-hidden="true">''', "cat look style")

# The eyes move independently of the lean — that is what sells the tracking.
sub("app/ask/pixel.js",
'''      <Eyes kind={m.eyes} />''',
'''      <g transform={"translate(" + (lx * px * 0.9).toFixed(2) + "," + (ly * px * 0.7).toFixed(2) + ")"}>
        <Eyes kind={m.eyes} />
      </g>''', "eyes follow")

# Eyes need the grid painter to accept an offset group — it already renders into
# whatever <g> wraps it, so only the wrapper above was missing.
sub("app/ask/pixel.js",
'''function Eyes({ kind }) {''',
'''// Rendered inside a translated <g> so the eyes can shift a pixel toward the
// pointer while the face stays put. Two pixels is the whole effect — more and
// the eyes detach from the head.
function Eyes({ kind }) {''', "eyes note")
