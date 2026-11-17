// A scripted pair of "ghost hands" that plays the level through the same rules a
// real player uses. It runs on screens without a headset, and in the automated test.

import { TUNE, v, add, sub, scale, len, lerp, copy } from './rules.js';

const REST = [v(-0.28, 1.15, -0.25), v(0.28, 1.15, -0.25)];
const smooth = k => k * k * (3 - 2 * k);

export function createDemo() {
  const hands = [0, 1].map(i => ({ pos: copy(REST[i]), grab: false, q: [], from: copy(REST[i]), t: 0 }));
  let idle = 1.2, doneWait = 0;

  const push = (i, to, dur, grab, linear) => hands[i].q.push({ to: copy(to), dur, grab, linear: !!linear });

  // Wind up and swing so the release velocity lands the element on the target without help.
  function swing(i, target, el) {
    const side = i === 0 ? -1 : 1;
    const W = add(REST[i], v(side * 0.1, 0.2, 0.3));
    const g = TUNE.gravity[el], T = 0.16;
    let P = W, u = v();
    for (let n = 0; n < 3; n++) {
      const d = sub(target, P);
      const t = Math.max(0.5, Math.min(1.2, len(d) / 5.5));
      const launch = v(d.x / t, d.y / t + 0.5 * g * t, d.z / t);
      u = scale(launch, 1 / TUNE.throwGain);
      P = add(W, scale(u, T));
    }
    push(i, W, 0.5, true);
    push(i, W, 0.12, true);
    push(i, P, T, true, true);                       // the throw
    push(i, add(P, scale(u, 0.05)), 0.05, false, true); // let go mid-swing
    push(i, REST[i], 0.55, false);
  }

  function throwFrom(w, i, el, target) {
    const src = w.sources.find(s => s.el === el);
    push(i, src.pos, 0.55, false);
    push(i, src.pos, 0.15, true);
    swing(i, target, el);
  }

  function steamThrow(w, target) {
    const pond = w.sources.find(s => s.el === 'water'), fire = w.sources.find(s => s.el === 'fire');
    push(0, pond.pos, 0.55, false); push(1, fire.pos, 0.55, false);
    push(0, pond.pos, 0.15, true); push(1, fire.pos, 0.15, true);
    push(0, v(-0.07, 1.25, -0.35), 0.6, true); push(1, v(0.07, 1.25, -0.35), 0.6, true);
    push(0, v(-0.07, 1.25, -0.35), 0.5, true); push(1, v(0.07, 1.25, -0.35), 0.2, true);
    push(1, REST[1], 0.5, false);
    swing(0, target, 'steam');
  }

  function plan(w) {
    if (w.stats.done) { throwFrom(w, 1, 'fire', w.gong.pos); return; }
    const dry = w.lanterns.find(l => !l.lit && !l.soaked && l.wet <= 0);
    if (dry) { throwFrom(w, 1, 'fire', dry.pos); return; }
    const soaked = w.lanterns.find(l => l.soaked);
    if (soaked) steamThrow(w, soaked.pos);
  }

  function update(w, dt) {
    const busy = hands.some(h => h.q.length);
    if (!busy) {
      if (w.stats.done && doneWait < 5) doneWait += dt;
      else { idle -= dt; if (idle <= 0) { plan(w); idle = 0.5; if (w.stats.done) doneWait = 0; } }
    }
    return hands.map(h => {
      if (h.q.length) {
        const k = h.q[0];
        h.t += dt;
        const f = Math.min(1, h.t / k.dur);
        h.pos = lerp(h.from, k.to, k.linear ? f : smooth(f));
        h.grab = k.grab;
        if (f >= 1) { h.q.shift(); h.from = copy(h.pos); h.t = 0; }
      }
      return { pos: copy(h.pos), dir: v(0, 0, -1), grab: h.grab, tracked: true };
    });
  }

  return { update };
}
