// Elemental Proving Ground VR, draft v03
// Reads a tracked hand and names the gesture. Pure maths on joint positions, no browser APIs.

export const GT = {
  pinchOn: 0.022, pinchOff: 0.04,   // index tip to thumb tip, metres (with slack so it does not flicker)
  fistOn: 0.068, fistOff: 0.085,    // average fingertip distance to the palm centre
  openAbove: 0.085,                 // fingers this far out count as an open hand
  palmDownY: -0.75,                 // palm normal pointing this far down
};

const TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

// J: joint name -> {x,y,z}. side: 'left' | 'right'. prev: the last result for this hand (for hysteresis).
export function readHand(J, side, prev) {
  const w = J['wrist'], mp = J['middle-finger-phalanx-proximal'];
  const ik = J['index-finger-phalanx-proximal'], pk = J['pinky-finger-phalanx-proximal'];
  const it = J['index-finger-tip'], tt = J['thumb-tip'];
  if (!w || !mp || !ik || !pk || !it || !tt || TIPS.some(n => !J[n])) return null;
  const palm = mid(w, mp);
  let n = norm(cross(sub(ik, w), sub(pk, w)));      // for a right hand this points out of the palm
  if (side === 'left') n = { x: -n.x, y: -n.y, z: -n.z };
  const curl = TIPS.reduce((s, k) => s + dist(J[k], palm), 0) / TIPS.length;
  const pinchDist = dist(it, tt);
  const p = prev || {};
  const fist = p.fist ? curl < GT.fistOff : curl < GT.fistOn;
  const pinch = !fist && (p.pinch ? pinchDist < GT.pinchOff : pinchDist < GT.pinchOn);
  const gesture = fist ? 'fist' : pinch ? 'pinch' : curl > GT.openAbove ? 'open' : 'relaxed';
  return { palm, normal: n, pinchPoint: mid(it, tt), curl, pinchDist, fist, pinch, gesture, palmDown: n.y < GT.palmDownY };
}
