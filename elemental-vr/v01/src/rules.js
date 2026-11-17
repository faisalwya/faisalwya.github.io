// Elemental Proving Ground VR, draft v01
// Game rules only. No rendering, no browser APIs, so this file can be tested on its own.
// Units: metres and seconds. The player stands at the origin facing -Z.

export const TUNE = {
  gravity: { water: 5, fire: 5, steam: 2 }, // floaty on purpose, real gravity is 9.8
  throwGain: 1.5,      // hand speed is multiplied by this at release
  maxThrow: 12,
  minThrow: 0.9,       // slower than this at release is a drop, not a throw
  velWindow: 0.09,     // seconds of hand history used to measure throw speed
  nearGrab: 0.5,       // reach-in distance to a source
  pointGrabDeg: 14,    // or point at a source within this cone
  pointGrabDist: 5,
  assistYawDeg: 14,    // aim assist only helps throws already heading this close to a target
  assistUpDeg: 40,
  assistDownDeg: 18,
  assistBlend: 0.8,    // 0 = no help, 1 = always hits inside the cone
  shotR: 0.14,
  mixDist: 0.2,        // hands this close with water + fire make steam
  wetTime: 8,
  burnSpread: 2.5,
  burnLife: 9,
};

/* ---------- tiny vector helpers on plain {x,y,z} ---------- */
export const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const copy = a => ({ x: a.x, y: a.y, z: a.z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = a => Math.hypot(a.x, a.y, a.z);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
export const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DEG = 180 / Math.PI;

/* ---------- level layout ---------- */
// Five lanterns on an arc in front of the player. Two start soaked.
const LANTERNS = [
  { deg: -44, r: 3.5, y: 1.5, soaked: true },
  { deg: -22, r: 4.0, y: 1.9, soaked: false },
  { deg: 0, r: 4.4, y: 2.3, soaked: false },
  { deg: 22, r: 4.0, y: 1.9, soaked: true },
  { deg: 44, r: 3.5, y: 1.5, soaked: false },
];
const CRATES = [v(-0.78, 0.3, -3.0), v(-0.12, 0.3, -3.05), v(-0.45, 0.9, -3.02)];

function newHand() {
  return { pos: v(0, 1, 0), dir: v(0, 0, -1), vel: v(), grab: false, tracked: false, held: null, hist: [] };
}

function layout(w) {
  w.lanterns = LANTERNS.map((L, i) => {
    const a = L.deg / DEG;
    return { id: 'lantern' + i, kind: 'lantern', pos: v(Math.sin(a) * L.r, L.y, -Math.cos(a) * L.r), r: 0.3, lit: false, soaked: L.soaked, wet: 0 };
  });
  w.crates = CRATES.map((p, i) => ({ id: 'crate' + i, kind: 'crate', pos: copy(p), r: 0.4, state: 'dry', wet: 0, burnT: 0, spreadT: 0 }));
  w.shots = [];
  w.stats = { throws: 0, steamMade: 0, startT: null, time: 0, done: false, grabbed: false };
}

export function createWorld() {
  const w = {
    t: 0,
    sources: [
      { id: 'pond', el: 'water', pos: v(-0.62, 0.86, -0.5), r: 0.3 },
      { id: 'brazier', el: 'fire', pos: v(0.62, 0.96, -0.5), r: 0.24 },
    ],
    gong: { id: 'gong', kind: 'gong', pos: v(2.3, 1.4, -0.9), r: 0.42 },
    hands: [newHand(), newHand()],
    events: [],
    nextId: 1,
  };
  layout(w);
  return w;
}

export function resetWorld(w) {
  layout(w);
  w.events.push({ type: 'reset' });
}

const emit = (w, type, data) => w.events.push(Object.assign({ type }, data));

/* ---------- grabbing and throwing ---------- */
function findSource(w, h) {
  let best = null, bd = Infinity;
  for (const s of w.sources) { // reaching in wins
    const d = dist(h.pos, s.pos);
    if (d < TUNE.nearGrab + s.r && d < bd) { bd = d; best = s; }
  }
  if (best) return best;
  let ba = TUNE.pointGrabDeg / DEG;
  for (const s of w.sources) { // otherwise, pointing at it
    const to = sub(s.pos, h.pos), d = len(to);
    if (d > TUNE.pointGrabDist) continue;
    const ang = Math.acos(clamp(dot(norm(to), norm(h.dir)), -1, 1));
    if (ang < ba) { ba = ang; best = s; }
  }
  return best;
}

function tryGrab(w, h, i) {
  if (h.held) return;
  const s = findSource(w, h);
  if (!s) { emit(w, 'empty', { hand: i }); return; }
  h.held = { el: s.el, age: 0 };
  w.stats.grabbed = true;
  if (w.stats.startT === null) w.stats.startT = w.t;
  emit(w, 'draw', { hand: i, el: s.el, from: copy(s.pos) });
}

export function aimAssist(w, pos, vel, el) {
  const speed = len(vel);
  if (speed < 0.01) return vel;
  const g = TUNE.gravity[el];
  const yawV = Math.atan2(vel.x, -vel.z), elevV = Math.atan2(vel.y, Math.hypot(vel.x, vel.z));
  let best = null, bs = Infinity;
  const targets = [...w.lanterns, ...w.crates.filter(c => c.state !== 'charred'), w.gong];
  for (const T of targets) {
    const d = sub(T.pos, pos);
    let dy = Math.atan2(d.x, -d.z) - yawV;
    dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy))) * DEG;
    const de = (elevV - Math.atan2(d.y, Math.hypot(d.x, d.z))) * DEG;
    if (dy > TUNE.assistYawDeg || de > TUNE.assistUpDeg || de < -TUNE.assistDownDeg) continue;
    const score = dy + 0.4 * Math.abs(de - 8);
    if (score < bs) { bs = score; best = T; }
  }
  if (!best) return vel;
  const d = sub(best.pos, pos);
  const t = clamp(len(d) / speed, 0.35, 1.6);
  const sol = v(d.x / t, d.y / t + 0.5 * g * t, d.z / t);
  return lerp(vel, sol, TUNE.assistBlend);
}

function release(w, h, i) {
  const el = h.held.el;
  h.held = null;
  const speed = len(h.vel);
  let vel = copy(h.vel), thrown = false;
  if (speed >= TUNE.minThrow) {
    thrown = true;
    vel = scale(vel, TUNE.throwGain);
    const s = len(vel);
    if (s > TUNE.maxThrow) vel = scale(vel, TUNE.maxThrow / s);
    vel = aimAssist(w, h.pos, vel, el);
    w.stats.throws++;
  }
  w.shots.push({ id: w.nextId++, el, pos: copy(h.pos), vel, age: 0 });
  emit(w, thrown ? 'throw' : 'drop', { hand: i, el, speed });
}

function makeSteam(w, i, at) {
  w.hands[i].held = { el: 'steam', age: 0 };
  w.stats.steamMade++;
  emit(w, 'steam', { hand: i, pos: copy(at) });
}

function mixing(w) {
  const [a, b] = w.hands;
  // water in one hand, fire in the other, brought together
  if (a.held && b.held && dist(a.pos, b.pos) < TUNE.mixDist) {
    const pair = a.held.el + '+' + b.held.el;
    if (pair === 'water+fire' || pair === 'fire+water') {
      const wi = a.held.el === 'water' ? 0 : 1;
      w.hands[1 - wi].held = null;
      makeSteam(w, wi, lerp(a.pos, b.pos, 0.5));
    }
  }
  // or dip a held element into the opposite source
  w.hands.forEach((h, i) => {
    if (!h.held || h.held.el === 'steam') return;
    for (const s of w.sources) {
      if (s.el !== h.held.el && dist(h.pos, s.pos) < s.r + 0.1) { makeSteam(w, i, h.pos); break; }
    }
  });
}

/* ---------- what each element does to each thing ---------- */
function hit(w, shot, T) {
  const at = copy(shot.pos), el = shot.el;
  if (T.kind === 'gong') { emit(w, 'gong', { pos: at }); resetWorld(w); return; }
  if (T.kind === 'lantern') {
    if (el === 'fire') {
      if (T.lit) emit(w, 'fizz', { pos: at, el });
      else if (T.soaked || T.wet > 0) emit(w, 'hiss', { pos: at, id: T.id, soaked: T.soaked });
      else { T.lit = true; emit(w, 'light', { pos: copy(T.pos), id: T.id }); }
    } else if (el === 'water') {
      if (T.lit) { T.lit = false; emit(w, 'douse', { pos: copy(T.pos), id: T.id }); }
      else emit(w, 'splash', { pos: at });
      T.wet = TUNE.wetTime;
    } else {
      if (T.soaked || T.wet > 0) { T.soaked = false; T.wet = 0; emit(w, 'dry', { pos: copy(T.pos), id: T.id }); }
      else emit(w, 'puff', { pos: at });
    }
    return;
  }
  // crate
  if (el === 'fire') {
    if (T.state === 'charred' || T.state === 'burning') emit(w, 'fizz', { pos: at, el });
    else if (T.wet > 0) emit(w, 'hiss', { pos: at, id: T.id });
    else ignite(w, T, false);
  } else if (el === 'water') {
    if (T.state === 'burning') { T.state = 'dry'; emit(w, 'douse', { pos: copy(T.pos), id: T.id }); }
    else emit(w, 'splash', { pos: at });
    T.wet = TUNE.wetTime;
  } else {
    if (T.wet > 0) { T.wet = 0; emit(w, 'dry', { pos: copy(T.pos), id: T.id }); }
    else emit(w, 'puff', { pos: at });
  }
}

function ignite(w, c, spread) {
  c.state = 'burning'; c.burnT = 0; c.spreadT = TUNE.burnSpread;
  emit(w, 'ignite', { pos: copy(c.pos), id: c.id, spread });
}

function stepShots(w, dt) {
  const startStats = w.stats;
  for (let n = w.shots.length - 1; n >= 0; n--) {
    const s = w.shots[n];
    s.vel.y -= TUNE.gravity[s.el] * dt;
    s.pos = add(s.pos, scale(s.vel, dt));
    s.age += dt;
    let gone = false;
    for (const T of [...w.lanterns, ...w.crates, w.gong]) {
      if (dist(s.pos, T.pos) < T.r + TUNE.shotR) { hit(w, s, T); gone = true; break; }
    }
    if (w.stats !== startStats) return; // the gong reset the level and cleared all shots
    if (!gone) for (const src of w.sources) {
      if (src.el !== s.el && s.el !== 'steam' && dist(s.pos, src.pos) < src.r + TUNE.shotR) {
        emit(w, 'hiss', { pos: copy(s.pos) }); gone = true; break;
      }
    }
    if (!gone && s.pos.y < TUNE.shotR * 0.6) { emit(w, 'land', { pos: v(s.pos.x, 0.02, s.pos.z), el: s.el }); gone = true; }
    if (!gone && (s.age > 6 || len(s.pos) > 16)) gone = true;
    if (gone) w.shots.splice(n, 1);
  }
}

function stepThings(w, dt) {
  for (const L of w.lanterns) if (L.wet > 0) L.wet = Math.max(0, L.wet - dt);
  for (const c of w.crates) {
    if (c.wet > 0) c.wet = Math.max(0, c.wet - dt);
    if (c.state !== 'burning') continue;
    c.burnT += dt; c.spreadT -= dt;
    if (c.spreadT <= 0) {
      c.spreadT = TUNE.burnSpread;
      const next = w.crates.find(o => o !== c && o.state === 'dry' && o.wet <= 0 && dist(o.pos, c.pos) < 0.8);
      if (next) ignite(w, next, true);
    }
    if (c.burnT > TUNE.burnLife) { c.state = 'charred'; emit(w, 'char', { pos: copy(c.pos), id: c.id }); }
  }
}

function checkGoal(w) {
  const st = w.stats;
  if (!st.done && w.lanterns.every(L => L.lit)) {
    st.done = true; st.time = w.t - (st.startT ?? w.t);
    emit(w, 'win', { time: st.time, throws: st.throws });
  }
}

/* ---------- one simulation step ---------- */
// inputs: one entry per hand, { pos, dir, grab, tracked }
export function step(w, dt, inputs) {
  w.t += dt;
  w.hands.forEach((h, i) => {
    const inp = inputs[i];
    h.tracked = !!(inp && inp.tracked);
    if (!h.tracked) { h.hist.length = 0; return; }
    h.pos = copy(inp.pos); h.dir = copy(inp.dir);
    h.hist.push({ t: w.t, p: copy(h.pos) });
    while (h.hist.length > 2 && w.t - h.hist[0].t > TUNE.velWindow) h.hist.shift();
    const a = h.hist[0], b = h.hist[h.hist.length - 1];
    h.vel = b.t > a.t ? scale(sub(b.p, a.p), 1 / (b.t - a.t)) : v();
    const was = h.grab; h.grab = !!inp.grab;
    if (h.grab && !was) tryGrab(w, h, i);
    if (!h.grab && was && h.held) release(w, h, i);
    if (h.held) h.held.age += dt;
  });
  mixing(w);
  const sub2 = dt > 1 / 45 ? 2 : 1; // keep fast shots from skipping through targets on slow frames
  for (let k = 0; k < sub2; k++) stepShots(w, dt / sub2);
  stepThings(w, dt);
  checkGoal(w);
}

/* ---------- the line of guidance shown on the sign ---------- */
export function hint(w) {
  const st = w.stats, L = w.lanterns;
  const lit = L.filter(l => l.lit).length;
  if (st.done) {
    const s = Math.round(st.time);
    return `All five lit in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} with ${st.throws} throws. Hit the gong on your right to play again.`;
  }
  if (!st.grabbed) return 'Reach into the fire on your right, or point at it. Squeeze to grab, swing, let go to throw.';
  const holding = w.hands.map(h => h.held && h.held.el);
  if (holding.includes('steam')) return 'That is steam. Throw it at a soaked lantern to dry it out.';
  if (L.some(l => !l.lit && !l.soaked && l.wet <= 0)) return lit ? 'Keep going. Fire lights a dry lantern.' : 'Throw the fire at a lantern.';
  if (L.some(l => l.soaked)) return 'The dripping lanterns are soaked. Hold water in one hand and fire in the other, then bring your hands together.';
  return 'Wet lanterns dry out on their own in a few seconds. Then light them.';
}
