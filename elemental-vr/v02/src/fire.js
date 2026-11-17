// Elemental Proving Ground VR, draft v02
// What one hand does with fire. Takes a gesture each frame and reports what happened.
// Works the same for tracked hands and for controllers (main.js maps buttons to gestures).
//
//   empty  --grab near or pointing at fire-->  carry (must relax the grab once before acting)
//   carry  --push palm forward fast-->  throw a fireball, empty
//   carry  --fist-->  charge  --open-->  blast (strength = how long you held), empty
//   carry  --pinch-->  jet (a stream while pinched)  --release-->  carry
//   carry  --palm down, held-->  dismiss, empty
//   tracking lost: the flame stays where it was and waits

export const FT = {
  pushSpeed: { hand: 1.3, controller: 1.8 }, // m/s of the palm to count as a throw
  pushAlign: 0.35,      // hands: palm must face the direction of the push
  throwGain: 3,
  minThrow: 4, maxThrow: 12,
  chargeTime: 1.2,      // seconds of fist to reach a full charge
  minCharge: 0.2,       // less than this and opening the fist just goes back to carrying
  blastSpeed: 16,
  dismissHold: 0.5,
  nearSummon: 0.32,
  pointDeg: 16, pointRange: 7,
  velWindow: 0.08,
  jetRate: 45, jetSpeed: 7.5,
  cooldown: 0.7,        // after a throw, blast or dismiss, before you can take fire again
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
  return { side, state: 'empty', armed: false, charge: 0, downT: 0, cool: 0, hist: [], vel: { x: 0, y: 0, z: 0 },
    flamePos: null, lastGesture: 'open', jetAcc: 0, label: '', jetDir: { x: 0, y: 0, z: -1 }, mode: 'hand' };
}

function shoulderOf(h, head) {
  const hd = head || { x: 0, y: 1.6, z: 0 };
  return { x: hd.x + (h.side === 'left' ? -0.17 : 0.17), y: hd.y - 0.2, z: hd.z + 0.05 };
}

function findSource(inp, sources, ray, shoulder, rising) {
  let best = null, bd = Infinity;
  for (const s of sources) {
    const d = dist(inp.palm, s.pos);
    if (d < FT.nearSummon + (s.r || 0) && d < bd) { bd = d; best = s; }
  }
  if (best || !rising) return best;
  let ba = FT.pointDeg * Math.PI / 180;
  for (const s of sources) {
    const to = sub(s.pos, shoulder), d = len(to);
    if (d > FT.pointRange) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(norm(to), ray))));
    if (ang < ba) { ba = ang; best = s; }
  }
  return best;
}

// inp: { tracked, mode:'hand'|'controller', palm, normal, pinchPoint, flamePos, gesture, palmDown, head }
// sources: [{ pos, r }]. emit(type, data) receives: summon, throw, blast, jetStart, jetDrop, jetStop, chargeStart, dismiss
export function stepHand(h, inp, dt, t, sources, emit) {
  h.cool = Math.max(0, h.cool - dt);
  if (!inp || !inp.tracked) {
    if (h.state === 'jet') { h.state = 'carry'; emit('jetStop', { side: h.side }); }
    h.hist.length = 0; h.vel = { x: 0, y: 0, z: 0 };
    h.label = h.state === 'empty' ? '' : 'tracking lost · holding';
    return;
  }
  h.mode = inp.mode;
  h.flamePos = copy(inp.flamePos || inp.palm);
  h.hist.push({ t, p: copy(inp.palm) });
  while (h.hist.length > 2 && t - h.hist[0].t > FT.velWindow) h.hist.shift();
  const a = h.hist[0], b = h.hist[h.hist.length - 1];
  h.vel = b.t > a.t ? scale(sub(b.p, a.p), 1 / (b.t - a.t)) : { x: 0, y: 0, z: 0 };

  const g = inp.gesture, rising = g !== h.lastGesture && (g === 'fist' || g === 'pinch');
  const shoulder = shoulderOf(h, inp.head);
  const ray = norm(sub(inp.pinchPoint || inp.palm, shoulder));
  const aim = inp.mode === 'hand' ? norm(add(scale(inp.normal, 0.6), scale(ray, 0.4))) : norm(inp.normal);

  switch (h.state) {
    case 'empty': {
      if (h.cool > 0) break;
      const src = findSource(inp, sources, ray, shoulder, rising);
      if (src) { h.state = 'carry'; h.armed = g === 'open' || g === 'relaxed'; h.downT = 0; emit('summon', { side: h.side, from: copy(src.pos) }); }
      break;
    }
    case 'carry': {
      if (!h.armed) { if (g === 'open' || g === 'relaxed') h.armed = true; break; }
      if (g === 'fist') { h.state = 'charge'; h.charge = 0; emit('chargeStart', { side: h.side }); break; }
      if (g === 'pinch') { h.state = 'jet'; h.jetAcc = 0; emit('jetStart', { side: h.side }); break; }
      if (inp.palmDown) { h.downT += dt; if (h.downT > FT.dismissHold) { h.state = 'empty'; h.cool = FT.cooldown; emit('dismiss', { side: h.side, pos: copy(h.flamePos) }); } break; }
      h.downT = 0;
      const speed = len(h.vel);
      if (speed > FT.pushSpeed[inp.mode]) {
        const dir = norm(h.vel), away = norm(sub(inp.palm, shoulder));
        const facing = inp.mode === 'controller' || dot(dir, norm(inp.normal)) > FT.pushAlign;
        if (dot(dir, away) > 0.2 && facing) {
          const s = Math.max(FT.minThrow, Math.min(FT.maxThrow, speed * FT.throwGain));
          h.state = 'empty'; h.cool = FT.cooldown;
          emit('throw', { side: h.side, pos: copy(h.flamePos), vel: scale(dir, s) });
        }
      }
      break;
    }
    case 'charge': {
      h.charge = Math.min(1, h.charge + dt / FT.chargeTime);
      if (g !== 'fist') {
        if (h.charge >= FT.minCharge) {
          emit('blast', { side: h.side, pos: copy(h.flamePos), vel: scale(aim, FT.blastSpeed), power: h.charge });
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
  h.label = labelFor(h, g, inp);
}

const NAMES = { hand: { open: 'OPEN', relaxed: 'RELAXED', fist: 'FIST', pinch: 'PINCH' }, controller: { open: 'NO BUTTON', relaxed: 'NO BUTTON', fist: 'GRIP', pinch: 'TRIGGER' } };
function labelFor(h, g, inp) {
  const name = inp.palmDown ? (inp.mode === 'hand' ? 'PALM DOWN' : 'A / X') : NAMES[inp.mode][g] || g;
  const what = h.state === 'empty' ? (h.cool > 0 ? 'cooling' : 'empty')
    : h.state === 'carry' ? (!h.armed ? 'relax your hand' : inp.palmDown ? 'dropping…' : 'carrying')
    : h.state === 'charge' ? `charge ${Math.round(h.charge * 100)}%` : 'jet';
  return `${name} · ${what}`;
}
