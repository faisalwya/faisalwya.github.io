// Elemental Proving Ground VR, draft v04
// What one hand does with fire. Takes a gesture each frame and reports what happened.
// Works the same for tracked hands and for controllers (main.js maps buttons to gestures).
//
//   empty   --reach out, open palm facing a fire, hold-->  locked (the fire glows, a thread joins it to your hand)
//   locked  --close your hand, or yank it back toward you (setting)-->  pulling (the flame flies over)  -->  carry
//   empty   --reach right into a fire-->  carry
//   carry   --swing your arm, any style-->  throw, released at the fastest point of the swing
//   carry   --fist-->  charge  --open-->  blast (strength = how long you held)
//   carry   --pinch-->  jet (a stream while pinched)  --release-->  carry
//   tracking lost: the flame stays where it was and waits
//
// Values marked (tuned) are changed live by the tuning board in the headset.

export const FT = {
  pullFacing: 0.76,     // (tuned) how squarely the palm must face a fire to lock it (cosine)
  stayFacing: 0.6,      // once locked, it holds until the palm turns further away than this
  reach: 0.4,           // (tuned) hand at least this far from the shoulder counts as reaching out
  lockHold: 0.25,       // (tuned) seconds of steady reaching before the lock
  pullStyle: 'close',   // (tuned) 'close' | 'yank' | 'either'
  yankSpeed: 0.9,       // m/s of hand moving back toward you to count as a yank
  closeCurl: 0.078,     // fingers curled at least this much count as closing the hand
  unlockGrace: 0.25,    // seconds the palm may wander off before the lock breaks
  pullTime: 0.32,
  pullRange: 7,
  nearSummon: 0.2,
  throwSpeed: { hand: 1.6, controller: 2.1 },   // (tuned) swing speed that starts a throw
  throwGain: 2.6,       // (tuned) release speed multiplier
  minThrow: 4, maxThrow: 13,
  releaseDrop: 0.75,    // let go once the swing slows to this share of its peak
  maxSwing: 0.25,       // or after this long
  armDelay: 0.3,        // after the flame lands, before a swing can throw it
  chargeTime: 1.2, minCharge: 0.2, blastSpeed: 16,
  velWindow: 0.06,
  jetRate: 45, jetSpeed: 7.5,
  cooldown: 0.6,
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = a => Math.hypot(a.x, a.y, a.z);
const dist = (a, b) => len(sub(a, b));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const copy = a => ({ x: a.x, y: a.y, z: a.z });

export function createHand(side) {
  return { side, state: 'empty', armed: false, armT: 0, charge: 0, cool: 0, hist: [], vel: { x: 0, y: 0, z: 0 },
    flamePos: null, lastGesture: 'open', jetAcc: 0, label: '', jetDir: { x: 0, y: 0, z: -1 }, mode: 'hand',
    reachT: 0, lockSrc: null, offT: 0, pullFrom: null, pullK: 0, swing: null, wasClosed: false };
}

function shoulderOf(h, head) {
  const hd = head || { x: 0, y: 1.6, z: 0 };
  return { x: hd.x + (h.side === 'left' ? -0.17 : 0.17), y: hd.y - 0.2, z: hd.z + 0.05 };
}
function nearSource(palm, sources) {
  let best = null, bd = Infinity;
  for (const s of sources) { const d = dist(palm, s.pos); if (d < FT.nearSummon + (s.r || 0) && d < bd) { bd = d; best = s; } }
  return best;
}
function facing(palm, dir, src) { const to = sub(src.pos, palm), d = len(to); return d > FT.pullRange || d < 0.05 ? -1 : dot(norm(to), dir); }
function facedSource(palm, dir, sources) {
  let best = null, bc = FT.pullFacing;
  for (const s of sources) { const c = facing(palm, dir, s); if (c > bc) { bc = c; best = s; } }
  return best;
}

// inp: { tracked, mode:'hand'|'controller', palm, normal, pinchPoint, flamePos, gesture, curl, head, gaze }
// emit(type, data): lock, unlock, pullStart, summon, throw, blast, jetStart, jetDrop, jetStop, chargeStart
export function stepHand(h, inp, dt, t, sources, emit) {
  h.cool = Math.max(0, h.cool - dt);
  if (!inp || !inp.tracked) {
    if (h.state === 'jet') { h.state = 'carry'; emit('jetStop', { side: h.side }); }
    if (h.state === 'locked') { h.state = 'empty'; h.lockSrc = null; emit('unlock', { side: h.side }); }
    if (h.state === 'pulling') { h.state = 'empty'; h.pullFrom = null; }
    h.reachT = 0; h.hist.length = 0; h.vel = { x: 0, y: 0, z: 0 }; h.swing = null;
    h.label = '';
    return;
  }
  h.mode = inp.mode;
  h.flamePos = copy(inp.flamePos || inp.palm);
  h.hist.push({ t, p: copy(inp.palm) });
  while (h.hist.length > 2 && t - h.hist[0].t > FT.velWindow) h.hist.shift();
  const a = h.hist[0], b = h.hist[h.hist.length - 1];
  h.vel = b.t > a.t ? scale(sub(b.p, a.p), 1 / (b.t - a.t)) : { x: 0, y: 0, z: 0 };

  const g = inp.gesture;
  const shoulder = shoulderOf(h, inp.head);
  const ray = norm(sub(inp.pinchPoint || inp.palm, shoulder));
  const aim = inp.mode === 'hand' ? norm(add(scale(inp.normal, 0.6), scale(ray, 0.4))) : norm(inp.normal);
  const openish = g === 'open' || g === 'relaxed';
  const closed = inp.mode === 'controller' ? (g === 'fist' || g === 'pinch') : (g === 'fist' || g === 'pinch' || (inp.curl !== undefined && inp.curl < FT.closeCurl));
  const closing = closed && !h.wasClosed;
  h.wasClosed = closed;
  const reaching = dist(inp.palm, shoulder) > FT.reach;
  const palmDir = norm(inp.normal);

  switch (h.state) {
    case 'empty': {
      if (h.cool > 0) { h.reachT = 0; break; }
      const near = nearSource(inp.palm, sources);
      if (near) { land(h, openish); emit('summon', { side: h.side, from: copy(near.pos), near: true }); break; }
      const src = reaching && (openish || inp.mode === 'controller') && !closed ? facedSource(inp.palm, palmDir, sources) : null;
      if (src && h.lockSrc && dist(src.pos, h.lockSrc.pos) < 0.3) h.reachT += dt;
      else { h.reachT = src ? dt : 0; h.lockSrc = src; }
      if (src && h.reachT > FT.lockHold) { h.state = 'locked'; h.offT = 0; h.reachT = 0; emit('lock', { side: h.side, from: copy(h.lockSrc.pos) }); }
      break;
    }
    case 'locked': {
      // keep it while the palm still roughly faces it; refresh its position (burning things move)
      const live = sources.find(s => dist(s.pos, h.lockSrc.pos) < 0.5);
      if (live) h.lockSrc = live;
      const c = live ? facing(inp.palm, palmDir, live) : -1;
      if (c < FT.stayFacing || !reaching && !closed) h.offT += dt; else h.offT = 0;
      if (h.offT > FT.unlockGrace || !live) { h.state = 'empty'; emit('unlock', { side: h.side }); h.lockSrc = null; break; }
      const toMe = norm(sub(shoulder, inp.palm)), yank = dot(h.vel, toMe) > FT.yankSpeed;
      const byClose = closing && FT.pullStyle !== 'yank', byYank = yank && FT.pullStyle !== 'close';
      if (byClose || byYank) {
        h.state = 'pulling'; h.pullFrom = copy(h.lockSrc.pos); h.pullK = 0;
        emit('pullStart', { side: h.side, from: copy(h.pullFrom), how: byYank ? 'yank' : 'close' });
      }
      break;
    }
    case 'pulling': {
      h.pullK = Math.min(1, h.pullK + dt / FT.pullTime);
      if (h.pullK >= 1) { land(h, openish); emit('summon', { side: h.side, from: copy(h.pullFrom) }); h.pullFrom = null; h.lockSrc = null; }
      break;
    }
    case 'carry': {
      h.armT += dt;
      if (!h.armed) { if (openish) h.armed = true; break; }
      if (!h.swing) {
        if (g === 'fist') { h.state = 'charge'; h.charge = 0; emit('chargeStart', { side: h.side }); break; }
        if (g === 'pinch') { h.state = 'jet'; h.jetAcc = 0; emit('jetStart', { side: h.side }); break; }
      }
      const speed = len(h.vel), away = norm(sub(inp.palm, shoulder));
      if (!h.swing) {
        if (h.armT > FT.armDelay && speed > FT.throwSpeed[inp.mode] && dot(norm(h.vel), away) > -0.2) h.swing = { peak: speed, vel: copy(h.vel), t: 0 };
      } else {
        h.swing.t += dt;
        if (speed > h.swing.peak) { h.swing.peak = speed; h.swing.vel = copy(h.vel); }
        if (speed < h.swing.peak * FT.releaseDrop || h.swing.t > FT.maxSwing) {
          const dir = norm(h.swing.vel), s = Math.max(FT.minThrow, Math.min(FT.maxThrow, h.swing.peak * FT.throwGain));
          h.swing = null; h.state = 'empty'; h.cool = FT.cooldown;
          emit('throw', { side: h.side, pos: copy(h.flamePos), vel: scale(dir, s), gaze: inp.gaze || null });
        }
      }
      break;
    }
    case 'charge': {
      h.charge = Math.min(1, h.charge + dt / FT.chargeTime);
      if (g !== 'fist') {
        if (h.charge >= FT.minCharge) {
          emit('blast', { side: h.side, pos: copy(h.flamePos), vel: scale(aim, FT.blastSpeed), power: h.charge, gaze: inp.gaze || null });
          h.state = 'empty'; h.cool = FT.cooldown;
        } else h.state = 'carry';
        h.charge = 0;
      }
      break;
    }
    case 'jet': {
      if (g !== 'pinch') { h.state = 'carry'; emit('jetStop', { side: h.side }); break; }
      h.jetDir = inp.mode === 'hand' ? ray : norm(inp.normal);
      h.jetAcc += dt * FT.jetRate;
      const from = inp.pinchPoint || inp.palm;
      while (h.jetAcc >= 1) { h.jetAcc -= 1; emit('jetDrop', { side: h.side, pos: copy(from), vel: scale(h.jetDir, FT.jetSpeed) }); }
      break;
    }
  }
  h.lastGesture = g;
  h.label = h.state === 'charge' ? `charge ${Math.round(h.charge * 100)}%` : h.state === 'jet' ? 'jet' : '';
}

function land(h, openish) { h.state = 'carry'; h.armed = openish; h.armT = 0; h.swing = null; }
