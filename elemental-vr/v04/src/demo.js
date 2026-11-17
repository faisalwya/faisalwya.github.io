// Scripted "ghost hands" that play the v04 playground through the same gesture states a player uses.
// Runs on screens without a headset, and in the automated page check.

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a, s) => v(a.x * s, a.y * s, a.z * s);
const norm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return v(a.x / l, a.y / l, a.z / l); };
const lerp = (a, b, k) => v(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
const smooth = k => k * k * (3 - 2 * k);
const UP = v(0, 1, 0);
const SH = { left: v(-0.17, 1.4, 0.05), right: v(0.17, 1.4, 0.05) };
const REST = { left: v(-0.3, 1.1, -0.2), right: v(0.3, 1.1, -0.2) };
const BOWL = { left: v(-0.65, 0.96, -0.6), right: v(0.65, 0.96, -0.6) };

export function createDemo(world) {
  const H = {};
  for (const s of ['left', 'right']) H[s] = { pos: REST[s], normal: UP, gesture: 'open', q: [], from: REST[s], fromN: UP, t: 0, gaze: v(0, 0, -1) };
  const key = (s, to, dur, gesture, normal = UP, linear = false) => H[s].q.push({ to, dur, gesture, normal, linear });
  const dirTo = (s, target, lift = 0) => norm(sub(add(target, v(0, lift, 0)), SH[s]));

  // reach toward the bowl until it locks, close the hand to pull, open it again
  function take(s) {
    const d = norm(sub(BOWL[s], SH[s])), out = add(SH[s], scale(d, 0.45));
    key(s, out, 0.7, 'open', d); key(s, out, 0.45, 'open', d); key(s, out, 0.45, 'fist', d);
    key(s, add(SH[s], v(s === 'left' ? -0.1 : 0.1, -0.2, -0.25)), 0.5, 'open');
  }
  function throwAt(s, target, lift = 0.1) {
    take(s);
    // wind up beside the head, swing through, then slow down so the flame leaves at the fastest point
    const d = dirTo(s, target, lift), wind = add(SH[s], v(0, 0.04, 0.14)), through = add(SH[s], scale(d, 0.5));
    look(s, target);
    key(s, wind, 0.7, 'open'); key(s, wind, 0.15, 'open');
    key(s, through, 0.15, 'open', UP, true); key(s, add(through, scale(d, 0.06)), 0.15, 'open', UP, true);
    key(s, REST[s], 0.9, 'open');
  }
  function jetAt(s, target, secs, lift = 0.15) {
    take(s);
    const d = dirTo(s, target, lift), at = add(SH[s], scale(d, 0.5));
    key(s, at, 0.8, 'open'); key(s, at, secs, 'pinch'); key(s, at, 0.2, 'open');
    key(s, REST[s], 0.8, 'open');
  }
  function blastAt(s, target) {
    take(s);
    const d = dirTo(s, target, 0.1), at = add(SH[s], scale(d, 0.42));
    look(s, target);
    key(s, at, 0.8, 'open'); key(s, at, 0.3, 'open', d); key(s, at, 1.45, 'fist', d); key(s, at, 0.15, 'open', d);
    key(s, REST[s], 0.9, 'open');
  }
  function wait(secs) { key('left', REST.left, secs, 'open'); }
  function look(s, target) { H[s].gaze = norm(sub(target, v(0, 1.6, 0))); }

  const T = () => world.targets();
  const plan = [
    () => throwAt('left', T().rope, 0.25),
    () => wait(3),
    () => throwAt('right', T().tower),
    () => jetAt('left', T().fuse, 2.4, 0.05),
    () => blastAt('right', T().urn),
    () => jetAt('left', T().ice, 3.6, 0),
    () => throwAt('left', T().scroll, 0.05),
    () => blastAt('right', T().wet),
    () => throwAt('right', T().wet),
    () => throwAt('left', T().dummy),
    () => throwAt('right', T().disc2),
    () => throwAt('left', T().disc4),
    () => throwAt('right', T().disc7),
    () => wait(7),
    () => throwAt('right', T().gong, 0),
    () => wait(2),
  ];
  let step = 0, idle = 1.2;

  function update(dt) {
    if (!H.left.q.length && !H.right.q.length) {
      idle -= dt;
      if (idle <= 0) { plan[step % plan.length](); step++; idle = 0.4; }
    }
    const out = {};
    for (const s of ['left', 'right']) {
      const h = H[s];
      if (h.q.length) {
        const k = h.q[0]; h.t += dt;
        const f = Math.min(1, h.t / k.dur), e = k.linear ? f : smooth(f);
        h.pos = lerp(h.from, k.to, e); h.normal = norm(lerp(h.fromN, k.normal, Math.min(1, f * 3)));
        h.gesture = k.gesture;
        if (f >= 1) { h.q.shift(); h.from = h.pos; h.fromN = h.normal; h.t = 0; }
      }
      out[s] = { tracked: true, mode: 'hand', palm: h.pos, normal: h.normal, pinchPoint: h.pos, flamePos: add(add(h.pos, v(0, 0.07, 0)), scale(h.normal, 0.03)),
        gesture: h.gesture, curl: h.gesture === 'fist' ? 0.05 : 0.11, head: v(0, 1.6, 0), gaze: h.gaze };
    }
    return out;
  }
  return { update, step: () => step };
}
