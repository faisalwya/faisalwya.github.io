// Elemental Proving Ground VR, draft v04 · fire only
// Rendering, headset input, wrist labels, the sign, sound and the loop.
// Game logic lives in gestures.js (what your hand is doing), fire.js (what the flame does) and world.js (the playground).

import * as THREE from 'three';
import { COL, rnd, lambert, glow, sphereGeo, makeFlame, updateFlame, makeGlow, createParticles, createAudio } from './fx.js';
import { readHand } from './gestures.js';
import { createHand, stepHand } from './fire.js';
import { createWorld } from './world.js';
import { createDemo } from './demo.js';
import { SETTINGS, tune, load as loadTune, save as saveTune, reset as resetTune, code as tuneCode } from './tune.js';
loadTune();

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.sky);
scene.fog = new THREE.Fog(COL.sky, 10, 30);
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 90);
function resize() {
  if (renderer.xr.isPresenting) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 80 : 62; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ---------- surroundings ---------- */
scene.add(new THREE.HemisphereLight(0x9db0e6, 0x23252f, 1.5));
const moonLight = new THREE.DirectionalLight(0xc6d4ff, 1.2); moonLight.position.set(-4, 8, 3); scene.add(moonLight);
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2), lambert(COL.stone)); scene.add(floor);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 2.8, 32, 1, true), lambert(COL.stoneDark, { side: THREE.BackSide })); wall.position.y = 1.4; scene.add(wall);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL.paper, transparent: true, opacity: 0.3 })); ring.position.y = 0.01; scene.add(ring);
  const moon = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xf2efe2, fog: false })); moon.position.set(-9, 15, -22); moon.scale.setScalar(1.3); scene.add(moon);
  const n = 260, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = rnd(Math.PI * 2), e = rnd(0.12, 1.5), r = 55; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 0.35, fog: false })));
}

const particles = createParticles(scene);
const audio = createAudio(() => renderer.xr.isPresenting);
const world = createWorld(scene, { particles, audio });
const hands = { left: createHand('left'), right: createHand('right') };

/* ---------- text on a canvas, for the sign and the wrist labels ---------- */
function textPlane(w, h, pxW, pxH) {
  const canvas = document.createElement('canvas'); canvas.width = pxW; canvas.height = pxH;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
  return { mesh, canvas, tex, key: '' };
}
const FONT = '"Barlow Condensed","Arial Narrow",sans-serif';

/* ---------- the sign: seven things to try ---------- */
const ITEMS = [['tower', 'Topple the crate tower'], ['rope', 'Burn the rope'], ['fuse', 'Light the fuse'], ['scroll', 'Burn away a scroll'],
  ['ice', 'Melt the ice block'], ['seal', 'Break the sealed urn'], ['wet', 'Burn the wet dummy']];
const sign = textPlane(3.0, 1.5, 1600, 800);
sign.mesh.position.set(2.75, 3.6, -2.9); sign.mesh.lookAt(0, 1.6, 0.3); scene.add(sign.mesh);
const seen = { take: false, throw: false, charge: false, jet: false };
function hintText() {
  const c = world.check, done = ITEMS.filter(([k]) => c[k]).length;
  if (done === ITEMS.length) return 'All seven. Throw fire at the gong on your right to rebuild the yard.';
  if (!seen.take) return tune.style === 'yank' ? 'Reach an open hand toward a fire bowl until it glows, then yank your hand back to pull the flame.' : 'Reach an open hand toward a fire bowl until it glows, then close your hand to pull the flame.';
  if (!seen.throw) return 'Swing your arm to throw, any way you like. Look at what you want to hit. Practice discs are on your left.';
  if (!seen.charge) return 'Make a fist to charge the flame. Open it toward a target to blast.';
  if (!seen.jet) return 'Pinch your index finger and thumb to pour a jet of flame.';
  if (world.sealTried && !c.seal) return 'The seal only breaks to a full charge. Hold the fist until the flame turns white.';
  if (world.wetTried && !c.wet) return 'The wet dummy has to dry before it burns. Keep the heat on it.';
  return 'You can pull fire out of anything that is burning. The gong on your right resets the yard.';
}
function drawSign() {
  const c = world.check, hint = hintText(), key = JSON.stringify(c) + hint;
  if (key === sign.key) return; sign.key = key;
  const g = sign.canvas.getContext('2d'), W = sign.canvas.width, H = sign.canvas.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#ece6d8'; g.fillRect(0, 0, W, H); g.strokeStyle = '#14161d'; g.lineWidth = 14; g.strokeRect(7, 7, W - 14, H - 14);
  const done = ITEMS.filter(([k]) => c[k]).length;
  g.fillStyle = '#d8322a'; g.fillRect(48, 46, 24, 84);
  g.fillStyle = '#14161d'; g.font = `700 96px ${FONT}`; g.fillText(`FIRE YARD  ${done} / ${ITEMS.length}`, 96, 122);
  g.font = `600 54px ${FONT}`;
  ITEMS.forEach(([k, label], i) => {
    const col = i < 4 ? 0 : 1, row = i < 4 ? i : i - 4, x = 60 + col * 790, y = 214 + row * 76;
    g.strokeStyle = '#14161d'; g.lineWidth = 5; g.strokeRect(x, y - 40, 42, 42);
    if (c[k]) { g.fillStyle = '#d8322a'; g.fillRect(x + 8, y - 32, 26, 26); }
    g.fillStyle = c[k] ? '#5d5a4f' : '#14161d'; g.fillText(label, x + 62, y);
  });
  g.fillStyle = '#14161d'; g.fillRect(48, 548, W - 96, 4);
  g.font = `600 56px ${FONT}`; g.fillStyle = '#2a2823';
  let line = '', y = 628;
  for (const word of hint.split(' ')) { if (g.measureText(line + word).width > W - 110) { g.fillText(line, 56, y); y += 66; line = ''; } line += word + ' '; }
  g.fillText(line, 56, y);
  sign.tex.needsUpdate = true;
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sign.key = ''; Object.values(views).forEach(v => { v.label.key = ''; }); });

/* ---------- each hand: joints or a mitt, the carried flame, the jet, the wrist label ---------- */
const skinMat = lambert(COL.paper), mittGeo = new THREE.SphereGeometry(0.045, 12, 8).scale(0.8, 0.65, 1.2);
const jetGeo = new THREE.ConeGeometry(0.035, 1, 8, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
const threadGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6, 1, true).translate(0, 0.5, 0), UPV = new V3(0, 1, 0);
const views = {};
for (const side of ['left', 'right']) {
  const flame = makeFlame(0.16, scene, false);
  const core = new THREE.Mesh(sphereGeo, glow(COL.hot, 0.95)); core.visible = false; scene.add(core);
  const halo = makeGlow(COL.fire, 0.35, 0); scene.add(halo);
  const light = new THREE.PointLight(COL.fire, 0, 5, 2); scene.add(light);
  const jet = new THREE.Mesh(jetGeo, glow(COL.hot, 0.6)); jet.visible = false; scene.add(jet);
  const label = textPlane(0.2, 0.04, 512, 104); label.mesh.renderOrder = 10; scene.add(label.mesh);
  const ghost = new THREE.Mesh(mittGeo, skinMat); ghost.scale.setScalar(1.7); ghost.visible = false; scene.add(ghost);
  const thread = new THREE.Mesh(threadGeo, glow(COL.hot, 0.6)); thread.visible = false; scene.add(thread);
  const ring = makeGlow(COL.hot, 0.8, 0); scene.add(ring);
  views[side] = { flame, core, halo, light, jet, label, ghost, thread, ring, k: 0 };
}
function drawLabel(lb, text, color) {
  if (lb.key === text + color) return; lb.key = text + color;
  const g = lb.canvas.getContext('2d'), W = lb.canvas.width, H = lb.canvas.height;
  g.clearRect(0, 0, W, H);
  if (!text) { lb.tex.needsUpdate = true; return; }
  g.fillStyle = 'rgba(20,22,29,.82)'; g.fillRect(0, 0, W, H);
  g.fillStyle = color; g.fillRect(0, 0, 14, H);
  g.fillStyle = '#ece6d8'; g.font = `700 60px ${FONT}`; g.textBaseline = 'middle'; g.fillText(text, 30, H / 2 + 3);
  lb.tex.needsUpdate = true;
}
const tmpV = new V3(), headPos = new V3(), tmpA = new V3(), tmpB = new V3(), gazeV = new V3();
function updateView(side, h, inp, dt, t) {
  const vw = views[side], st = h.state, carrying = st !== 'empty';
  vw.k += ((carrying ? 1 : 0) - vw.k) * Math.min(1, dt * 8);
  const target = h.flamePos || (inp && inp.flamePos);
  if (target) {
    if (!vw.sp) vw.sp = new V3(target.x, target.y, target.z);
    vw.sp.lerp(tmpV.set(target.x, target.y, target.z), 1 - Math.exp(-28 * dt));   // steady the flame against tracking jitter
  }
  let p = vw.sp;
  if (st === 'pulling' && h.pullFrom && p) {
    // the flame travels from the fire to your hand in a low arc, leaving a stream behind it
    const k = h.pullK * h.pullK * (3 - 2 * h.pullK), f = h.pullFrom;
    const at = k2 => new V3(f.x + (p.x - f.x) * k2, f.y + (p.y - f.y) * k2 + Math.sin(Math.PI * k2) * 0.18, f.z + (p.z - f.z) * k2);
    p = at(k);
    for (let i = 0; i < 4; i++) { const q = at(k * Math.random()); particles.sparks.spawn(q.x, q.y, q.z, rnd(-0.15, 0.15), rnd(0, 0.4), rnd(-0.15, 0.15), rnd(0.2, 0.4), rnd(0.02, 0.05), i % 2 ? COL.fire : COL.hot, 0.5); }
  }
  if (p) { vw.flame.position.set(p.x, p.y - 0.03, p.z); vw.core.position.set(p.x, p.y + 0.02, p.z); vw.halo.position.copy(vw.core.position); vw.light.position.copy(vw.core.position); }
  const charge = st === 'charge' ? h.charge : 0;
  vw.flame.userData.target = carrying && st !== 'charge' ? 1 : 0;
  vw.flame.userData.size = st === 'jet' ? 0.12 : st === 'pulling' ? 0.1 + h.pullK * 0.06 : 0.16;
  updateFlame(vw.flame, dt, t);
  vw.core.visible = st === 'charge';
  if (st === 'charge') {
    const s = 0.035 + charge * 0.05 + Math.sin(t * 40) * 0.004 * charge;
    vw.core.scale.setScalar(s);
    vw.core.material.color.setRGB(1, 0.75 + charge * 0.25, 0.4 + charge * 0.6);
    if (p && Math.random() < 0.3 + charge) particles.sparks.spawn(p.x + rnd(-0.12, 0.12), p.y + rnd(-0.1, 0.12), p.z + rnd(-0.12, 0.12), 0, 0, 0, 0.18, 0.012, charge > 0.9 ? COL.white : COL.hot, 0);
  }
  vw.halo.material.opacity = vw.k * (0.35 + charge * 0.5); vw.halo.scale.setScalar(0.3 + charge * 0.45);
  vw.halo.material.color.set(charge > 0.9 ? COL.white : COL.fire);
  vw.light.intensity = vw.k * (2.2 + charge * 3);
  vw.jet.visible = st === 'jet' && !!inp;
  if (vw.jet.visible) {
    const from = inp.pinchPoint || inp.palm, d = h.jetDir;
    vw.jet.position.set(from.x, from.y, from.z);
    vw.jet.lookAt(from.x + d.x, from.y + d.y, from.z + d.z);
    vw.jet.scale.set(1 + Math.sin(t * 50) * 0.2, 1 + Math.sin(t * 37) * 0.2, 0.55 + Math.sin(t * 29) * 0.08);
  }
  // lock-on: the targeted fire glows (faintly while you are still settling on it), and a thread joins it to your palm
  const src = h.lockSrc, palm = inp && inp.palm;
  const settling = st === 'empty' && h.reachT > 0 && src, locked = st === 'locked' && src && palm;
  const want = locked ? 0.6 + 0.25 * Math.sin(t * 10) : settling ? 0.35 * Math.min(1, h.reachT / Math.max(0.05, tune.lock)) : 0;
  vw.ring.material.opacity += (want - vw.ring.material.opacity) * Math.min(1, dt * 12);
  if (src) { vw.ring.position.set(src.pos.x, src.pos.y + 0.12, src.pos.z); vw.ring.scale.setScalar(locked ? 0.8 + Math.sin(t * 10) * 0.06 : 0.6); }
  vw.thread.visible = !!locked;
  if (locked) {
    const a = tmpA.set(src.pos.x, src.pos.y + 0.12, src.pos.z), d = tmpB.set(palm.x, palm.y, palm.z).sub(a), L = d.length();
    vw.thread.position.copy(a); vw.thread.quaternion.setFromUnitVectors(UPV, d.normalize()); vw.thread.scale.set(1 + Math.sin(t * 30) * 0.3, L, 1);
    for (let i = 0; i < 2; i++) { const k = Math.random(); particles.sparks.spawn(a.x + d.x * L * k, a.y + d.y * L * k, a.z + d.z * L * k, d.x * 1.5, d.y * 1.5, d.z * 1.5, 0.25, 0.018, COL.hot, 0); }
  }

  // wrist label, just above the palm, turned toward your eyes
  const lp = inp && inp.palm;
  vw.label.mesh.visible = !!lp && showLabels && !!h.label;
  if (lp) {
    vw.label.mesh.position.set(lp.x, lp.y + 0.13, lp.z);
    vw.label.mesh.lookAt(headPos);
    const color = st === 'charge' ? (h.charge > 0.9 ? '#fff1d0' : '#ffd27a') : st === 'jet' ? '#ff8a3a' : carrying ? '#d8322a' : '#6a6658';
    drawLabel(vw.label, h.label, color);
  }
}
let showLabels = true;

/* ---------- tuning board on your left: poke the sliders with a fingertip ---------- */
const board = (() => {
  const BW = 0.56, BH = 0.66, PW = 1024, PH = 1206, X0 = 60, TW = 904, ROW0 = 150, ROWH = 118;
  const tp = textPlane(BW, BH, PW, PH);
  tp.mesh.material.transparent = false; tp.mesh.material.depthWrite = true;
  tp.mesh.position.set(-0.6, 1.18, 0.3); tp.mesh.lookAt(0.2, 1.45, 0.1); scene.add(tp.mesh);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(BW + 0.02, BH + 0.02), new THREE.MeshBasicMaterial({ color: COL.ink })); back.position.copy(tp.mesh.position); back.quaternion.copy(tp.mesh.quaternion); back.translateZ(-0.004); scene.add(back);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 6), lambert(COL.ink)); stand.position.set(-0.6, 0.42, 0.3); scene.add(stand);
  tp.mesh.updateMatrixWorld(true);
  const B = { dirty: true, touching: [false, false], active: -1 };
  const rowY = i => ROW0 + i * ROWH;
  const resetY = rowY(SETTINGS.length) + 6;
  function draw() {
    const g = tp.canvas.getContext('2d');
    g.fillStyle = '#ece6d8'; g.fillRect(0, 0, PW, PH);
    g.fillStyle = '#d8322a'; g.fillRect(40, 38, 18, 70);
    g.fillStyle = '#14161d'; g.font = `700 72px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillText('TUNING', 78, 100);
    g.font = `600 28px ${FONT}`; g.fillStyle = '#5d5a4f'; g.textAlign = 'right'; g.fillText(tuneCode(), PW - 40, 98); g.textAlign = 'left';
    SETTINGS.forEach((d, i) => {
      const y = rowY(i), v = tune[d.key], hot = B.active === i;
      g.fillStyle = '#14161d'; g.font = `700 46px ${FONT}`; g.fillText(d.label, X0, y + 40);
      if (d.options) {
        const w = TW / d.options.length;
        d.options.forEach((o, k) => {
          const on = v === o, x = X0 + k * w;
          g.fillStyle = on ? '#14161d' : '#ece6d8'; g.fillRect(x + 4, y + 54, w - 8, 52);
          g.strokeStyle = '#14161d'; g.lineWidth = 4; g.strokeRect(x + 4, y + 54, w - 8, 52);
          g.fillStyle = on ? '#ece6d8' : '#14161d'; g.font = `700 38px ${FONT}`; g.textAlign = 'center'; g.fillText(d.names[k], x + w / 2, y + 93); g.textAlign = 'left';
        });
      } else {
        const k = (v - d.min) / (d.max - d.min);
        g.textAlign = 'right'; g.fillStyle = '#d8322a'; g.font = `700 46px ${FONT}`; g.fillText(d.fmt(v), X0 + TW, y + 40); g.textAlign = 'left';
        g.fillStyle = '#c9c2b2'; g.fillRect(X0, y + 72, TW, 14);
        g.fillStyle = '#14161d'; g.fillRect(X0, y + 72, TW * k, 14);
        const def = (d.def - d.min) / (d.max - d.min); g.fillStyle = '#5d5a4f'; g.fillRect(X0 + TW * def - 2, y + 62, 4, 34);
        g.beginPath(); g.arc(X0 + TW * k, y + 79, hot ? 30 : 24, 0, Math.PI * 2); g.fillStyle = hot ? '#d8322a' : '#14161d'; g.fill();
      }
    });
    g.strokeStyle = '#14161d'; g.lineWidth = 4; g.strokeRect(X0 + 4, resetY, 340, 56);
    g.fillStyle = '#14161d'; g.font = `700 36px ${FONT}`; g.fillText('Reset to defaults', X0 + 24, resetY + 40);
    g.font = `600 32px ${FONT}`; g.fillStyle = '#5d5a4f'; g.fillText('poke with a fingertip · saved on the headset', X0 + 370, resetY + 40);
    const L = world.practice.log, hits = L.filter(e => e.hit).length;
    const misses = L.filter(e => !e.hit), avg = misses.length ? misses.reduce((a, e) => a + e.miss, 0) / misses.length : 0;
    g.fillStyle = '#14161d'; g.fillRect(40, resetY + 78, PW - 80, 4);
    g.font = `700 42px ${FONT}`; g.fillText(L.length ? `Discs: ${hits} of last ${L.length} hit · misses ${avg.toFixed(2)} m off` : 'Discs: throw at the 2, 4 and 7 m discs', X0, resetY + 136);
    tp.tex.needsUpdate = true; B.dirty = false;
  }
  const local = new V3();
  B.update = tips => {
    tips.forEach((tip, i) => {
      let touch = false;
      if (tip) {
        local.set(tip.x, tip.y, tip.z); tp.mesh.worldToLocal(local);
        const px = (local.x / BW + 0.5) * PW, py = (0.5 - local.y / BH) * PH;
        if (Math.abs(local.z) < 0.035 && px > 0 && px < PW && py > 0 && py < PH) {
          touch = true;
          const row = Math.floor((py - ROW0) / ROWH), d = SETTINGS[row];
          if (d && py - rowY(row) > 45) {
            if (d.options) { if (!B.touching[i]) { const o = d.options[Math.max(0, Math.min(d.options.length - 1, Math.floor((px - X0) / (TW / d.options.length))))]; if (o !== tune[d.key]) { tune[d.key] = o; changed(); } } }
            else {
              const k = Math.max(0, Math.min(1, (px - X0) / TW)), raw = d.min + k * (d.max - d.min);
              const v = Math.round(raw / (d.key === 'speed' || d.key === 'power' ? 0.1 : 0.05)) * (d.key === 'speed' || d.key === 'power' ? 0.1 : 0.05);
              if (Math.abs(v - tune[d.key]) > 1e-6) { tune[d.key] = +v.toFixed(2); changed(); }
            }
            B.active = row;
          } else if (!B.touching[i] && py > resetY && py < resetY + 56 && px < X0 + 350) { resetTune(); changed(); }
        }
      }
      B.touching[i] = touch;
    });
    if (!B.touching.some(Boolean) && B.active !== -1) { B.active = -1; B.dirty = true; }
    if (B.dirty) draw();
  };
  function changed() { saveTune(); loadTune(); B.dirty = true; audio.tick(); sign.key = ''; }
  return B;
})();

/* ---------- what is in flight: fireballs, blasts and the jet stream ---------- */
const fireCoreMat = glow(COL.hot, 0.95), blastCoreMat = glow(COL.white, 0.95);
const shotViews = new Map(), shotPool = [];
const shotLight = new THREE.PointLight(COL.fire, 0, 7, 2); scene.add(shotLight);   // one light, always present, so shaders never recompile
const JET_MAX = 160;
const jetMesh = new THREE.InstancedMesh(sphereGeo, glow(0xffffff, 0.7), JET_MAX);
jetMesh.frustumCulled = false; jetMesh.count = 0; scene.add(jetMesh);
{ const c = new THREE.Color(0xffffff); for (let i = 0; i < JET_MAX; i++) jetMesh.setColorAt(i, c); }
const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sv = new V3(), jc = new THREE.Color(), cHot = new THREE.Color(COL.hot), cFire = new THREE.Color(COL.fire), cDeep = new THREE.Color(0xc0381a);
function drawShots(t) {
  let ji = 0, lit = false;
  const live = new Set();
  for (const s of world.shots) {
    if (s.kind === 'jet') {
      if (ji >= JET_MAX) continue;
      const a = Math.min(1, s.age / 0.42), size = 0.03 + a * 0.1;
      m4.compose(s.pos, q0, sv.set(size, size, size)); jetMesh.setMatrixAt(ji, m4);
      jc.copy(a < 0.5 ? cHot : cFire).lerp(a < 0.5 ? cFire : cDeep, a < 0.5 ? a * 2 : (a - 0.5) * 2); jetMesh.setColorAt(ji, jc);
      ji++;
      if (Math.random() < 0.08) particles.burst('ember', s.pos, 1, 0.3);
      continue;
    }
    live.add(s.id);
    let v = shotViews.get(s.id);
    if (!v) {
      v = shotPool.pop() || (() => { const core = new THREE.Mesh(sphereGeo, fireCoreMat), halo = makeGlow(COL.fire, 0.6, 0.9); scene.add(core, halo); return { core, halo }; })();
      v.core.material = s.kind === 'blast' ? blastCoreMat : fireCoreMat; v.core.visible = v.halo.visible = true; shotViews.set(s.id, v);
    }
    const blast = s.kind === 'blast', big = blast ? 1 + s.power * 0.8 : 1, flick = 1 + Math.sin(t * 35 + s.id * 99) * 0.12;
    v.core.position.copy(s.pos); v.core.scale.setScalar((blast ? 0.1 : 0.085) * big * flick);
    v.halo.position.copy(s.pos); v.halo.scale.setScalar((blast ? 0.85 : 0.6) * big * flick);
    v.halo.material.color.set(blast ? (s.power > 0.9 ? COL.white : COL.hot) : COL.fire);
    // a fat trail of fire and a little smoke behind it
    const n = blast ? 7 : 5;
    for (let k = 0; k < n; k++) particles.sparks.spawn(s.pos.x + rnd(-0.05, 0.05), s.pos.y + rnd(-0.05, 0.05), s.pos.z + rnd(-0.05, 0.05),
      -s.vel.x * 0.07 + rnd(-0.3, 0.3), -s.vel.y * 0.07 + rnd(0, 0.5), -s.vel.z * 0.07 + rnd(-0.3, 0.3), rnd(0.25, 0.55), rnd(0.04, 0.09) * big, k % 2 ? COL.fire : COL.hot, 1);
    if (Math.random() < 0.3) particles.burst('smoke', s.pos, 1, 0.3);
    if (!lit) { shotLight.position.copy(s.pos); shotLight.intensity = 3.5 * big; lit = true; }
  }
  if (!lit) shotLight.intensity = 0;
  jetMesh.count = ji; if (ji) { jetMesh.instanceMatrix.needsUpdate = true; jetMesh.instanceColor.needsUpdate = true; }
  for (const [id, v] of shotViews) if (!live.has(id)) { v.core.visible = v.halo.visible = false; shotViews.delete(id); shotPool.push(v); }
}

/* ---------- headset input: hands or controllers ---------- */
const xr = [0, 1].map(i => {
  const s = { ray: renderer.xr.getController(i), grip: renderer.xr.getControllerGrip(i), hand: renderer.xr.getHand(i), src: null, sel: false, sqz: false, prev: null, labelBtn: false };
  s.ray.addEventListener('connected', e => { s.src = e.data; });
  s.ray.addEventListener('disconnected', () => { s.src = null; s.sel = s.sqz = false; s.prev = null; });
  s.ray.addEventListener('selectstart', () => { s.sel = true; }); s.ray.addEventListener('selectend', () => { s.sel = false; });
  s.ray.addEventListener('squeezestart', () => { s.sqz = true; }); s.ray.addEventListener('squeezeend', () => { s.sqz = false; });
  scene.add(s.ray, s.grip, s.hand);
  s.mitt = new THREE.Mesh(mittGeo, skinMat); s.grip.add(s.mitt);
  s.joints = Array.from({ length: 25 }, () => { const m = new THREE.Mesh(sphereGeo, skinMat); m.visible = false; scene.add(m); return m; });
  return s;
});
const P3 = o => ({ x: o.x, y: o.y, z: o.z });
function readXR(i, head, gaze) {
  const s = xr[i], side = (s.src && s.src.handedness) || (i ? 'right' : 'left');
  const isHand = !!(s.src && s.src.hand);
  let inp = { tracked: false }, n = 0;
  if (isHand && s.hand.visible) {
    const J = {};
    for (const name in s.hand.joints) { const j = s.hand.joints[name]; if (j.visible !== false) J[name] = P3(j.position); }
    const r = readHand(J, side, s.prev);
    s.prev = r;
    if (r) {
      inp = { tracked: true, mode: 'hand', palm: r.palm, normal: r.normal, pinchPoint: r.pinchPoint,
        flamePos: { x: r.palm.x + r.normal.x * 0.03, y: r.palm.y + 0.07 + r.normal.y * 0.03, z: r.palm.z + r.normal.z * 0.03 }, gesture: r.gesture, curl: r.curl, head, gaze,
        tip: J['index-finger-tip'] || null };
      for (const name in s.hand.joints) { const j = s.hand.joints[name], m = s.joints[n++]; if (!m) break; m.visible = j.visible !== false; m.position.copy(j.position); m.scale.setScalar(j.jointRadius || 0.008); }
    }
  } else if (s.src && s.grip.visible) {
    tmpV.set(0, 0, -1).applyQuaternion(s.ray.quaternion);
    const gp = s.src.gamepad, bt = gp && gp.buttons ? gp.buttons : [];
    const labelBtn = !!(bt[5] && bt[5].pressed);
    if (labelBtn && !s.labelBtn) showLabels = !showLabels;
    s.labelBtn = labelBtn;
    const g = P3(s.grip.position);
    inp = { tracked: true, mode: 'controller', palm: g, normal: P3(tmpV), pinchPoint: { x: s.ray.position.x + tmpV.x * 0.06, y: s.ray.position.y + tmpV.y * 0.06, z: s.ray.position.z + tmpV.z * 0.06 },
      flamePos: { x: g.x, y: g.y + 0.09, z: g.z }, gesture: s.sel ? 'pinch' : s.sqz ? 'fist' : 'open', head, gaze,
      tip: { x: s.ray.position.x + tmpV.x * 0.08, y: s.ray.position.y + tmpV.y * 0.08, z: s.ray.position.z + tmpV.z * 0.08 } };
  }
  for (; n < s.joints.length; n++) s.joints[n].visible = false;
  s.mitt.visible = !isHand;
  return { side, inp };
}
function buzz(side, strength, ms) {
  for (const s of xr) {
    if (!s.src || s.src.handedness !== side) continue;
    try { const a = s.src.gamepad && s.src.gamepad.hapticActuators; if (a && a[0]) a[0].pulse(strength, ms); } catch (e) { /* no haptics here */ }
  }
}

/* ---------- what the hands report ---------- */
function onHandEvent(type, d) {
  switch (type) {
    case 'lock': audio.lockOn(); buzz(d.side, 0.2, 30); break;
    case 'pullStart': particles.burst('fire', d.from, 16, 1); if (d.how === 'yank') audio.yank(); else audio.take(); buzz(d.side, 0.6, 60); break;
    case 'summon': seen.take = true; if (d.near) { particles.burst('fire', d.from, 8, 0.6); audio.take(); } buzz(d.side, 0.6, 70); break;
    case 'throw': if (window.__log) window.__log.push('THROW ' + d.side + ' v=' + [d.vel.x, d.vel.y, d.vel.z].map(n => n.toFixed(1)).join(',')); seen.throw = true; world.addShot('fireball', d.pos, d.vel, 0, d.gaze); audio.whoosh(); buzz(d.side, 0.7, 80); break;
    case 'blast': seen.charge = true; world.addShot('blast', d.pos, d.vel, d.power, d.gaze); audio.blast(d.power); audio.loop('hum-' + d.side, 'hum', false); buzz(d.side, 1, 160); break;
    case 'chargeStart': break;
    case 'jetStart': seen.jet = true; audio.loop('jet-' + d.side, 'roar', true); break;
    case 'jetDrop': world.addShot('jet', d.pos, { x: d.vel.x + rnd(-0.25, 0.25), y: d.vel.y + rnd(-0.25, 0.25), z: d.vel.z + rnd(-0.25, 0.25) }); break;
    case 'jetStop': audio.loop('jet-' + d.side, 'roar', false); break;
  }
}
let lastDone = 0, meltCool = 0;
function onWorldEvent(e) {
  const p = e.pos;
  switch (e.type) {
    case 'thud': audio.thud(e.v); break;
    case 'hiss': audio.hiss(); break;
    case 'dried': audio.puff(); break;
    case 'ignite': audio.whoomp(); break;
    case 'fuse': case 'candle': case 'fizzle': audio.fizzle(); break;
    case 'launch': audio.launch(); break;
    case 'boom': audio.boom(); break;
    case 'snap': audio.snap(); break;
    case 'clank': audio.clank(); break;
    case 'shatter': audio.shatter(); break;
    case 'melt': if (meltCool <= 0) { audio.melt(); meltCool = 0.35; } break;
    case 'freed': audio.chime(); break;
    case 'impact': if (e.kind === 'fireball') audio.puff(); break;
    case 'land': audio.puff(); break;
    case 'crumble': audio.thud(4); break;
    case 'gong': audio.gong(); break;
    case 'ding': audio.ding(e.center); break;
    case 'practice': board.dirty = true; break;
  }
}

/* ---------- page chrome ---------- */
let demo = createDemo(world);
const statusEl = $('status'), enterBtn = $('enter');
function resetHands() { for (const s of ['left', 'right']) { Object.assign(hands[s], createHand(s)); audio.loop('jet-' + s, 'roar', false); audio.loop('hum-' + s, 'hum', false); } }
async function enterVR() {
  audio.init();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
  } catch (err) { statusEl.textContent = 'Could not start VR: ' + (err && err.message ? err.message : err); }
}
renderer.xr.addEventListener('sessionstart', () => { world.reset(); world.events.length = 0; resetHands(); document.body.classList.add('in-vr'); });
renderer.xr.addEventListener('sessionend', () => { world.reset(); resetHands(); demo = createDemo(world); document.body.classList.remove('in-vr'); resize(); });
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (ok) { enterBtn.hidden = false; enterBtn.addEventListener('click', enterVR); statusEl.textContent = 'Clear an arm\'s length of space around you, then enter. You stay standing in one spot.'; }
  }).catch(() => {});
}

/* ---------- loop ---------- */
let last = 0, simT = 0;
const EYE = location.search.includes('eye');
resize();
renderer.setAnimationLoop(ms => {
  const t = ms / 1000, dt = Math.min(0.05, Math.max(0.001, t - last)); last = t;
  const inVR = renderer.xr.isPresenting;
  simT += dt; meltCool -= dt;
  if (inVR) { const xc = renderer.xr.getCamera(); xc.getWorldPosition(headPos); xc.getWorldDirection(gazeV); } else { headPos.copy(camera.position); camera.getWorldDirection(gazeV); }
  const head = P3(headPos), gaze = P3(gazeV);

  let inputs = {};
  if (inVR) { for (const i of [0, 1]) { const r = readXR(i, head, gaze); inputs[r.side] = r.inp; } }
  else inputs = demo.update(dt);

  const sources = world.sources();
  for (const side of ['left', 'right']) {
    const h = hands[side], inp = inputs[side];
    stepHand(h, inp, dt, simT, sources, (type, d) => onHandEvent(type, d));
    if (h.state === 'charge') audio.loop('hum-' + side, 'hum', true, h.charge);
    else audio.loop('hum-' + side, 'hum', false);
    updateView(side, h, inp && inp.tracked ? inp : null, dt, t);
    const gv = views[side].ghost; gv.visible = !inVR && !!inp; if (gv.visible) gv.position.set(inp.palm.x, inp.palm.y, inp.palm.z);
  }

  world.update(dt, t);
  for (const e of world.events) { onWorldEvent(e); if (window.__log && e.type !== 'thud' && e.type !== 'melt' && e.type !== 'hiss' && e.type !== 'sizzle') window.__log.push(e.type + (e.pos ? ' ' + [e.pos.x, e.pos.y, e.pos.z].map(n => n.toFixed(2)).join(',') : '')); }
  world.events.length = 0;
  const done = Object.values(world.check).filter(Boolean).length;
  if (done > lastDone) { audio.chime(); } lastDone = done;

  drawShots(t); particles.update(dt); drawSign();
  board.update(['left', 'right'].map(sd => inputs[sd] && inputs[sd].tracked && inputs[sd].tip ? inputs[sd].tip : null));
  if (!inVR) {
    const tall = camera.aspect < 1, sway = Math.sin(t * 0.2) * 0.15;
    if (location.search.includes('board')) { camera.position.set(0.15, 1.55, 0.25); camera.lookAt(-0.6, 1.2, 0.3); }
    else if (location.search.includes('discs')) { camera.position.set(0, 1.62, 0.3); camera.lookAt(-3, 2.0, -2.5); }
    else if (EYE) { camera.position.set(0, 1.62, 0.3); camera.lookAt(0, 1.4, -4); }
    else { camera.position.set(sway + (tall ? 0 : -0.6), tall ? 2.6 : 2.2, tall ? 6.2 : 3.2); camera.lookAt(tall ? 0 : -0.4, tall ? 1.0 : 1.5, -3.5); }
  }
  renderer.render(scene, camera);
});

// handle for the automated page check
window.__game = { world, hands, demo: () => demo };
