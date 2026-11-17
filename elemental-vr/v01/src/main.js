// Elemental Proving Ground VR, draft v01
// Everything you see and hear. The rules live in rules.js and know nothing about this file.

import * as THREE from 'three';
import { createWorld, step, hint } from './rules.js';
import { createDemo } from './demo.js';

const COL = {
  paper: 0xece6d8, ink: 0x14161d, red: 0xd8322a,
  water: 0x7cc8ff, fire: 0xff8a3a, hot: 0xffd27a, steam: 0xe4ebf4, smoke: 0x5a5f6c,
  sky: 0x0e1222, stone: 0x474d66, stoneDark: 0x2b3048, wood: 0x8a6a48, bronze: 0xb08a3a,
};
const V3 = THREE.Vector3;
const $ = id => document.getElementById(id);
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.sky);
scene.fog = new THREE.Fog(COL.sky, 9, 28);
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 80);
function resize() {
  if (renderer.xr.isPresenting) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 80 : 62;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ---------- lights (few, cheap, no shadows) ---------- */
scene.add(new THREE.HemisphereLight(0x9db0e6, 0x23252f, 1.5));
const moonLight = new THREE.DirectionalLight(0xc6d4ff, 1.3);
moonLight.position.set(-4, 8, 3);
scene.add(moonLight);

/* ---------- helpers ---------- */
const lambert = (color, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color }, o));
const glow = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
}
const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
const coneGeo = new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0);
const matFlameOuter = glow(COL.fire, 0.85), matFlameInner = glow(COL.hot, 0.9);

function makeFlame(size, parent, x, y, z, on) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(coneGeo, matFlameOuter));
  const inner = new THREE.Mesh(coneGeo, matFlameInner); inner.scale.set(0.55, 0.7, 0.55); g.add(inner);
  g.position.set(x, y, z);
  g.userData = { size, k: on ? 1 : 0, target: on ? 1 : 0, seed: rnd(10) };
  parent.add(g);
  return g;
}
function updateFlame(g, dt, t) {
  const u = g.userData;
  u.k += (u.target - u.k) * Math.min(1, dt * 5);
  const f = 1 + Math.sin(t * 13 + u.seed) * 0.12 + Math.sin(t * 23 + u.seed * 2) * 0.07;
  g.visible = u.k > 0.02;
  g.scale.set(u.size * u.k * (2 - f), u.size * u.k * f * 1.5, u.size * u.k * (2 - f));
}

/* ---------- courtyard ---------- */
mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2), lambert(COL.stone));
mesh(new THREE.CylinderGeometry(10, 10, 2.8, 32, 1, true), lambert(COL.stoneDark, { side: THREE.BackSide }), 0, 1.4, 0);
mesh(new THREE.RingGeometry(0.34, 0.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL.paper, transparent: true, opacity: 0.3 }), 0, 0.01, 0);
mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xf2efe2, fog: false }), -9, 15, -22).scale.setScalar(1.3);
{
  const n = 260, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd(Math.PI * 2), e = rnd(0.12, 1.5), r = 55;
    p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 0.35, sizeAttenuation: true, fog: false })));
}

const world = createWorld();

// pond: a stone basin at waist height on your left
const pond = world.sources[0], brazier = world.sources[1];
mesh(new THREE.CylinderGeometry(0.42, 0.34, pond.pos.y, 16), lambert(0x5a6078), pond.pos.x, pond.pos.y / 2, pond.pos.z);
const pondWater = mesh(new THREE.CircleGeometry(0.37, 24).rotateX(-Math.PI / 2), lambert(COL.water, { emissive: 0x1d5f96, transparent: true, opacity: 0.9 }), pond.pos.x, pond.pos.y + 0.005, pond.pos.z);
// brazier: a bowl of fire on your right
for (let i = 0; i < 3; i++) {
  const a = i * 2.094, leg = mesh(new THREE.CylinderGeometry(0.018, 0.018, brazier.pos.y - 0.1, 6), lambert(COL.ink), brazier.pos.x + Math.cos(a) * 0.15, (brazier.pos.y - 0.1) / 2, brazier.pos.z + Math.sin(a) * 0.15);
  leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
}
mesh(new THREE.CylinderGeometry(0.27, 0.13, 0.17, 14), lambert(0x30323c), brazier.pos.x, brazier.pos.y - 0.1, brazier.pos.z);
mesh(new THREE.CircleGeometry(0.24, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a22 }), brazier.pos.x, brazier.pos.y - 0.012, brazier.pos.z);
const brazierFlames = [0, 1, 2].map(i => makeFlame(rnd(0.2, 0.3), scene, brazier.pos.x + (i - 1) * 0.1, brazier.pos.y - 0.02, brazier.pos.z + (i % 2) * 0.08 - 0.04, true));
const brazierLight = new THREE.PointLight(COL.fire, 5, 8, 2);
brazierLight.position.set(brazier.pos.x, brazier.pos.y + 0.35, brazier.pos.z);
scene.add(brazierLight);

// lanterns
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const lanternGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.44, 12), capGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12);
const lanternViews = world.lanterns.map(L => {
  const g = new THREE.Group(); g.position.set(L.pos.x, L.pos.y, L.pos.z); scene.add(g);
  mesh(new THREE.CylinderGeometry(0.03, 0.04, L.pos.y - 0.25, 6), lambert(COL.ink), L.pos.x, (L.pos.y - 0.25) / 2, L.pos.z);
  const mat = lambert(COL.paper, { emissive: 0xffa040, emissiveIntensity: 0.05 });
  mesh(lanternGeo, mat, 0, 0, 0, g);
  mesh(capGeo, lambert(COL.ink), 0, 0.24, 0, g); mesh(capGeo, lambert(COL.ink), 0, -0.24, 0, g);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa550, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(1.5); g.add(halo);
  return { mat, halo, k: 0, drip: rnd(0.5) };
});

// crates
const crateGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6), crateEdges = new THREE.EdgesGeometry(crateGeo);
const crateViews = world.crates.map(c => {
  const mat = lambert(COL.wood);
  const m = mesh(crateGeo, mat, c.pos.x, c.pos.y, c.pos.z); m.rotation.y = rnd(-0.15, 0.15);
  m.add(new THREE.LineSegments(crateEdges, new THREE.LineBasicMaterial({ color: COL.ink })));
  const flames = [makeFlame(0.5, scene, c.pos.x - 0.12, c.pos.y + 0.25, c.pos.z), makeFlame(0.4, scene, c.pos.x + 0.14, c.pos.y + 0.25, c.pos.z + 0.1)];
  return { mat, flames, smoke: 0 };
});

// gong
const gongGroup = new THREE.Group();
{
  const gp = world.gong.pos; gongGroup.position.set(gp.x, 0, gp.z); gongGroup.lookAt(0, 0, 0); scene.add(gongGroup);
  const post = new THREE.BoxGeometry(0.07, gp.y + 0.6, 0.07);
  mesh(post, lambert(COL.red), -0.6, (gp.y + 0.6) / 2, 0, gongGroup); mesh(post, lambert(COL.red), 0.6, (gp.y + 0.6) / 2, 0, gongGroup);
  mesh(new THREE.BoxGeometry(1.5, 0.08, 0.1), lambert(COL.red), 0, gp.y + 0.6, 0, gongGroup);
}
const gongDisc = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28).rotateX(Math.PI / 2), lambert(COL.bronze, { emissive: 0x4a3508 }), 0, world.gong.pos.y, 0, gongGroup);
let gongSwing = 0;

/* ---------- sign: lantern count and one line of guidance ---------- */
const signCanvas = document.createElement('canvas'); signCanvas.width = 1536; signCanvas.height = 416;
const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace;
const sign = mesh(new THREE.PlaneGeometry(3.7, 1.0), new THREE.MeshBasicMaterial({ map: signTex, fog: false }), 0, 3.75, -5.6);
sign.rotation.x = 0.2;
let signKey = '';
function drawSign(force) {
  const lit = world.lanterns.filter(l => l.lit).length, text = hint(world), key = lit + '|' + text;
  if (key === signKey && !force) return;
  signKey = key;
  const c = signCanvas.getContext('2d'), W = signCanvas.width, H = signCanvas.height;
  c.fillStyle = '#ece6d8'; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#14161d'; c.lineWidth = 14; c.strokeRect(7, 7, W - 14, H - 14);
  c.fillStyle = '#d8322a'; c.fillRect(48, 50, 26, 92);
  c.fillStyle = '#14161d'; c.textBaseline = 'alphabetic';
  c.font = '700 104px "Barlow Condensed","Arial Narrow",sans-serif';
  c.fillText(`LANTERNS  ${lit} / ${world.lanterns.length}`, 100, 134);
  c.font = '600 64px "Barlow Condensed","Arial Narrow",sans-serif'; c.fillStyle = '#2a2823';
  let line = '', y = 228;
  for (const word of text.split(' ')) {
    if (c.measureText(line + word).width > W - 110) { c.fillText(line, 52, y); y += 74; line = ''; }
    line += word + ' ';
  }
  c.fillText(line, 52, y);
  signTex.needsUpdate = true;
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawSign(true));

/* ---------- particles ---------- */
function makeParticles(count, material) {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), material, count);
  m.frustumCulled = false; scene.add(m);
  const P = Array.from({ length: count }, () => ({ life: 0 })), col = new THREE.Color();
  const arr = m.instanceMatrix.array; arr.fill(0);
  let next = 0;
  for (let i = 0; i < count; i++) m.setColorAt(i, col.set(0xffffff));
  return {
    spawn(x, y, z, vx, vy, vz, life, size, color, gy, grow) {
      const p = P[next]; m.setColorAt(next, col.set(color)); m.instanceColor.needsUpdate = true;
      next = (next + 1) % count;
      Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, size, gy, grow: !!grow });
    },
    update(dt) {
      for (let i = 0; i < count; i++) {
        const p = P[i], o = i * 16; let s = 0;
        if (p.life > 0) {
          p.life -= dt; p.vy += p.gy * dt;
          const d = Math.exp(-1.6 * dt); p.vx *= d; p.vz *= d; if (p.grow) p.vy *= d;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.02 && p.gy < 0) { p.y = 0.02; p.vy = 0; }
          const k = Math.max(0, p.life / p.max);
          s = p.size * (p.grow ? Math.sin(Math.PI * Math.sqrt(1 - k)) * 1.3 + 0.2 * k : Math.sqrt(k));
        }
        arr[o] = arr[o + 5] = arr[o + 10] = s; arr[o + 12] = p.x || 0; arr[o + 13] = p.y || 0; arr[o + 14] = p.z || 0; arr[o + 15] = 1;
      }
      m.instanceMatrix.needsUpdate = true;
    },
  };
}
const sparks = makeParticles(260, glow(0xffffff, 0.9));
const soft = makeParticles(320, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }));
function burst(el, p, n, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = rnd(Math.PI * 2), u = rnd(-0.4, 1), r = Math.sqrt(1 - Math.min(1, u * u)), sp = rnd(0.4, 1.6) * power;
    const vx = Math.cos(a) * r * sp, vy = u * sp, vz = Math.sin(a) * r * sp;
    if (el === 'fire') sparks.spawn(p.x, p.y, p.z, vx, vy + 0.6, vz, rnd(0.4, 0.9), rnd(0.03, 0.08), Math.random() < 0.5 ? COL.fire : COL.hot, 1.2);
    else if (el === 'water') soft.spawn(p.x, p.y, p.z, vx * 1.3, vy * 1.3 + 0.8, vz * 1.3, rnd(0.4, 0.8), rnd(0.03, 0.06), COL.water, -6);
    else if (el === 'smoke') soft.spawn(p.x, p.y, p.z, vx * 0.3, 0.5 + vy * 0.2, vz * 0.3, rnd(1.2, 2.2), rnd(0.1, 0.2), COL.smoke, 0.3, true);
    else soft.spawn(p.x, p.y, p.z, vx * 0.5, vy * 0.4 + 0.5, vz * 0.5, rnd(0.9, 1.7), rnd(0.1, 0.2), COL.steam, 0.5, true);
  }
}

/* ---------- element materials ---------- */
const elMat = {
  water: lambert(COL.water, { emissive: 0x1d5f96, transparent: true, opacity: 0.9 }),
  fire: glow(COL.fire, 0.9),
  fireHot: glow(COL.hot, 0.95),
  steam: lambert(COL.steam, { emissive: 0x8f98a8, transparent: true, opacity: 0.5, depthWrite: false }),
};
const HELD = {
  water: { sizes: [0.075, 0.062, 0.05, 0.04, 0.03, 0.022], step: -0.034, light: [COL.water, 1.2] },
  fire: { sizes: [0.07, 0.062, 0.052, 0.042, 0.032, 0.02], step: 0.042, light: [COL.fire, 3.5] },
  steam: { sizes: [0.085, 0.1, 0.1, 0.09, 0.07, 0.05], step: 0.05, light: [COL.steam, 0.9] },
};

/* ---------- held element: a short chain of blobs that trails the hand ---------- */
const heldViews = [0, 1].map(() => {
  const blobs = Array.from({ length: 6 }, () => { const m = mesh(sphereGeo, elMat.water); m.visible = false; return m; });
  const light = new THREE.PointLight(0xffffff, 0, 5, 2); scene.add(light);
  return { blobs, light, el: null, emitT: 0 };
});
function updateHeld(view, h, dt, t) {
  const held = h.held, el = held && held.el;
  if (el !== view.el) {
    view.el = el;
    view.blobs.forEach((b, j) => { b.visible = !!el; if (el) b.material = el === 'fire' ? (j === 0 ? elMat.fireHot : elMat.fire) : elMat[el]; });
    if (!el) view.light.intensity = 0;
  }
  if (!el) return;
  const cfg = HELD[el], ax = h.pos.x, ay = h.pos.y + 0.08, az = h.pos.z;
  view.blobs.forEach((b, j) => {
    const prev = view.blobs[j - 1];
    const tx = j ? prev.position.x + Math.sin(t * 5 + j * 1.7) * 0.012 : ax;
    const ty = j ? prev.position.y + cfg.step : ay;
    const tz = j ? prev.position.z + Math.cos(t * 4 + j * 2.1) * 0.012 : az;
    const k = 1 - Math.exp(-(34 - j * 4.5) * dt);
    b.position.x += (tx - b.position.x) * k; b.position.y += (ty - b.position.y) * k; b.position.z += (tz - b.position.z) * k;
    const pulse = el === 'fire' ? 1 + Math.sin(t * 19 + j * 2) * 0.14 : 1 + Math.sin(t * 6 + j) * 0.06;
    b.scale.setScalar(cfg.sizes[j] * pulse * Math.min(1, 0.4 + held.age * 3));
  });
  view.light.color.set(cfg.light[0]); view.light.intensity = cfg.light[1]; view.light.position.set(ax, ay + 0.05, az);
  view.emitT -= dt;
  if (view.emitT <= 0) {
    const tip = view.blobs[el === 'water' ? 5 : 2].position;
    if (el === 'fire') { view.emitT = 0.05; sparks.spawn(tip.x, tip.y, tip.z, rnd(-0.1, 0.1), rnd(0.3, 0.7), rnd(-0.1, 0.1), rnd(0.3, 0.6), rnd(0.012, 0.03), COL.hot, 0.8); }
    else if (el === 'water') { view.emitT = 0.16; soft.spawn(tip.x, tip.y, tip.z, 0, -0.1, 0, 0.5, 0.02, COL.water, -5); }
    else { view.emitT = 0.11; soft.spawn(tip.x, tip.y, tip.z, rnd(-0.08, 0.08), rnd(0.15, 0.35), rnd(-0.08, 0.08), rnd(0.7, 1.2), rnd(0.05, 0.09), COL.steam, 0.3, true); }
  }
}

/* ---------- thrown elements ---------- */
const shotViews = new Map(), shotPool = [];
function updateShots(t) {
  for (const s of world.shots) {
    let m = shotViews.get(s.id);
    if (!m) {
      m = shotPool.pop() || mesh(sphereGeo, elMat.water);
      m.material = s.el === 'fire' ? elMat.fireHot : elMat[s.el]; m.visible = true; shotViews.set(s.id, m);
    }
    m.position.set(s.pos.x, s.pos.y, s.pos.z);
    m.scale.setScalar((s.el === 'steam' ? 0.17 : 0.12) * (1 + Math.sin(t * 30 + s.id) * 0.1));
    for (let i = 0; i < 2; i++) {
      const jx = rnd(-0.05, 0.05), jy = rnd(-0.05, 0.05), jz = rnd(-0.05, 0.05);
      if (s.el === 'fire') sparks.spawn(s.pos.x + jx, s.pos.y + jy, s.pos.z + jz, s.vel.x * 0.1, s.vel.y * 0.1 + 0.3, s.vel.z * 0.1, rnd(0.25, 0.5), rnd(0.04, 0.09), i ? COL.fire : COL.hot, 0.8);
      else if (s.el === 'water') soft.spawn(s.pos.x + jx, s.pos.y + jy, s.pos.z + jz, s.vel.x * 0.15, s.vel.y * 0.15, s.vel.z * 0.15, rnd(0.25, 0.45), rnd(0.04, 0.08), COL.water, -3);
      else soft.spawn(s.pos.x + jx, s.pos.y + jy, s.pos.z + jz, s.vel.x * 0.1, 0.2, s.vel.z * 0.1, rnd(0.6, 1), rnd(0.08, 0.14), COL.steam, 0.3, true);
    }
  }
  for (const [id, m] of shotViews) {
    if (!world.shots.some(s => s.id === id)) { m.visible = false; shotViews.delete(id); shotPool.push(m); }
  }
}

/* ---------- sound (synthesised, only while in the headset) ---------- */
const audio = (() => {
  let ctx = null, noise = null, master = null;
  function init() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function hush(type, f0, f1, dur, gain, q = 1) {
    if (!ctx || !renderer.xr.isPresenting) return;
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; src.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(f0, f1, dur, gain, type = 'sine', delay = 0) {
    if (!ctx || !renderer.xr.isPresenting) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  return {
    init,
    draw: () => hush('bandpass', 300, 1400, 0.35, 0.35, 2),
    whoosh: () => hush('bandpass', 1600, 350, 0.3, 0.5, 1.5),
    hiss: () => hush('highpass', 5000, 2500, 0.7, 0.4),
    splash: () => hush('lowpass', 2400, 500, 0.35, 0.6),
    whoomp: () => { tone(160, 50, 0.4, 0.7); hush('lowpass', 900, 200, 0.4, 0.4); },
    puff: () => hush('lowpass', 1200, 400, 0.5, 0.25),
    gong: () => { [110, 164, 221, 277].forEach((f, i) => tone(f, f * 0.985, 2.6 - i * 0.4, 0.4 - i * 0.07)); },
    chime: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.9, 0.3, 'triangle', i * 0.14)); },
  };
})();

/* ---------- headset input: controllers or bare hands, whichever is active ---------- */
const mittGeo = new THREE.SphereGeometry(0.045, 12, 8).scale(0.8, 0.65, 1.2), mittMat = lambert(COL.paper);
const xr = [0, 1].map(i => {
  const s = { ray: renderer.xr.getController(i), grip: renderer.xr.getControllerGrip(i), hand: renderer.xr.getHand(i), src: null, sel: false, sqz: false, pinch: false, fist: false };
  s.ray.addEventListener('connected', e => { s.src = e.data; });
  s.ray.addEventListener('disconnected', () => { s.src = null; s.sel = s.sqz = s.pinch = s.fist = false; });
  s.ray.addEventListener('selectstart', () => { s.sel = true; }); s.ray.addEventListener('selectend', () => { s.sel = false; });
  s.ray.addEventListener('squeezestart', () => { s.sqz = true; }); s.ray.addEventListener('squeezeend', () => { s.sqz = false; });
  scene.add(s.ray, s.grip, s.hand);
  s.mitt = mesh(mittGeo, mittMat, 0, 0, 0, s.grip);
  s.joints = Array.from({ length: 25 }, () => { const m = mesh(sphereGeo, mittMat); m.visible = false; return m; });
  s.demoMitt = mesh(mittGeo, mittMat); s.demoMitt.scale.setScalar(1.7);
  return s;
});
const tmpV = new V3();
const fallback = [{ x: -0.3, y: 1, z: -0.2 }, { x: 0.3, y: 1, z: -0.2 }];
function readXR(i) {
  const s = xr[i], J = s.hand.joints, isHand = !!(s.src && s.src.hand);
  let tracked = false, pos = fallback[i], grab = false, n = 0;
  if (isHand) {
    const wrist = J['wrist'], mid = J['middle-finger-phalanx-proximal'], it = J['index-finger-tip'], tt = J['thumb-tip'], mt = J['middle-finger-tip'];
    tracked = !!(s.hand.visible && wrist && mid && it && tt && mt && wrist.visible);
    if (tracked) {
      tmpV.copy(wrist.position).add(mid.position).multiplyScalar(0.5); // palm centre
      pos = { x: tmpV.x, y: tmpV.y, z: tmpV.z };
      const pd = it.position.distanceTo(tt.position), fd = mt.position.distanceTo(wrist.position);
      s.pinch = s.pinch ? pd < 0.04 : pd < 0.022;   // pinch, with some slack so it does not flicker
      s.fist = s.fist ? fd < 0.125 : fd < 0.095;    // or close your whole hand
      grab = s.sel || s.pinch || s.fist;
      for (const name in J) { const j = J[name], m = s.joints[n++]; if (!m) break; m.visible = j.visible !== false; m.position.copy(j.position); m.scale.setScalar(j.jointRadius || 0.008); }
    }
  } else if (s.src) {
    tracked = s.grip.visible;
    if (tracked) { pos = { x: s.grip.position.x, y: s.grip.position.y, z: s.grip.position.z }; grab = s.sel || s.sqz; }
  }
  for (; n < s.joints.length; n++) s.joints[n].visible = false;
  s.mitt.visible = !isHand;
  tmpV.set(0, 0, -1); if (s.ray.visible) tmpV.applyQuaternion(s.ray.quaternion);
  return { pos, dir: { x: tmpV.x, y: tmpV.y, z: tmpV.z }, grab, tracked };
}
function buzz(i, strength, ms) {
  try { const a = xr[i].src && xr[i].src.gamepad && xr[i].src.gamepad.hapticActuators; if (a && a[0]) a[0].pulse(strength, ms); } catch (e) { /* no haptics on this device */ }
}

/* ---------- reactions to what the rules report ---------- */
function onEvent(e) {
  switch (e.type) {
    case 'draw': heldViews[e.hand].blobs.forEach(b => b.position.set(e.from.x, e.from.y, e.from.z)); burst(e.el, e.from, 6, 0.6); audio.draw(); buzz(e.hand, 0.5, 60); break;
    case 'throw': audio.whoosh(); buzz(e.hand, Math.min(1, 0.4 + e.speed * 0.08), 90); break;
    case 'drop': buzz(e.hand, 0.2, 40); break;
    case 'steam': burst('steam', e.pos, 22, 1.2); burst('fire', e.pos, 6, 0.8); audio.hiss(); buzz(0, 0.8, 140); buzz(1, 0.8, 140); break;
    case 'light': burst('fire', e.pos, 22, 1.3); audio.whoomp(); break;
    case 'ignite': burst('fire', e.pos, 18, 1.2); audio.whoomp(); break;
    case 'hiss': burst('steam', e.pos, 12, 0.8); audio.hiss(); break;
    case 'douse': burst('steam', e.pos, 14, 1); burst('water', e.pos, 10, 1); audio.hiss(); break;
    case 'splash': burst('water', e.pos, 18, 1.3); audio.splash(); break;
    case 'dry': burst('steam', e.pos, 20, 1.2); audio.puff(); break;
    case 'puff': burst('steam', e.pos, 12, 1); audio.puff(); break;
    case 'fizz': burst(e.el, e.pos, 8, 0.8); break;
    case 'char': burst('smoke', e.pos, 14, 1); break;
    case 'land': burst(e.el, e.pos, e.el === 'steam' ? 10 : 14, 1); if (e.el === 'water') audio.splash(); else if (e.el === 'fire') audio.puff(); break;
    case 'gong': gongSwing = 1; audio.gong(); burst('fire', e.pos, 10, 1); break;
    case 'win': world.lanterns.forEach(L => burst('fire', L.pos, 16, 1.6)); audio.chime(); break;
  }
}

/* ---------- per-frame scenery updates ---------- */
const cWood = new THREE.Color(COL.wood), cWet = new THREE.Color(0x4f5a70), cChar = new THREE.Color(0x1c1b1e), cPaper = new THREE.Color(COL.paper), cSoak = new THREE.Color(0x86a9cc);
function updateScenery(dt, t) {
  world.lanterns.forEach((L, i) => {
    const view = lanternViews[i];
    view.k += ((L.lit ? 1 : 0) - view.k) * Math.min(1, dt * 6);
    const damp = L.soaked || L.wet > 0;
    view.mat.color.lerp(damp ? cSoak : cPaper, Math.min(1, dt * 4));
    view.mat.emissiveIntensity = 0.05 + view.k * (1.25 + Math.sin(t * 9 + i) * 0.12);
    view.halo.material.opacity = view.k * 0.75; view.halo.scale.setScalar(1.5 + Math.sin(t * 7 + i * 2) * 0.08);
    if (damp) { view.drip -= dt; if (view.drip <= 0) { view.drip = rnd(0.25, 0.6); soft.spawn(L.pos.x + rnd(-0.15, 0.15), L.pos.y - 0.26, L.pos.z + rnd(-0.15, 0.15), 0, 0, 0, 0.7, 0.025, COL.water, -5); } }
  });
  world.crates.forEach((c, i) => {
    const view = crateViews[i];
    view.mat.color.lerp(c.state === 'charred' ? cChar : c.wet > 0 ? cWet : cWood, Math.min(1, dt * 3));
    view.flames.forEach(f => { f.userData.target = c.state === 'burning' ? 1 : 0; updateFlame(f, dt, t); });
    if (c.state === 'burning') { view.smoke -= dt; if (view.smoke <= 0) { view.smoke = 0.25; soft.spawn(c.pos.x + rnd(-0.2, 0.2), c.pos.y + 0.7, c.pos.z, 0, 0.6, 0, rnd(1.2, 2), rnd(0.1, 0.18), COL.smoke, 0.3, true); } }
  });
  brazierFlames.forEach(f => updateFlame(f, dt, t));
  brazierLight.intensity = 5 + Math.sin(t * 11) * 0.6;
  pondWater.scale.setScalar(1 + Math.sin(t * 2.2) * 0.015);
  gongSwing *= Math.exp(-1.5 * dt); gongDisc.rotation.x = Math.sin(t * 9) * 0.35 * gongSwing;
}

/* ---------- page chrome: preview on a screen, Enter VR in the headset ---------- */
let demo = createDemo();
function freshStart() { Object.assign(world, createWorld()); demo = createDemo(); signKey = ''; heldViews.forEach(v => { v.el = null; v.blobs.forEach(b => { b.visible = false; }); v.light.intensity = 0; }); }
const statusEl = $('status'), enterBtn = $('enter');
async function enterVR() {
  audio.init();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
  } catch (err) { statusEl.textContent = 'Could not start VR: ' + (err && err.message ? err.message : err); }
}
renderer.xr.addEventListener('sessionstart', () => { freshStart(); document.body.classList.add('in-vr'); });
renderer.xr.addEventListener('sessionend', () => { freshStart(); document.body.classList.remove('in-vr'); resize(); });
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (ok) { enterBtn.hidden = false; enterBtn.addEventListener('click', enterVR); statusEl.textContent = 'Clear an arm\'s length of space around you, then enter. You stay standing in one spot.'; }
  }).catch(() => {});
}

/* ---------- main loop ---------- */
let last = 0;
const EYE = location.search.includes('eye'); // preview from the player's eye height, for checking the look
resize();
renderer.setAnimationLoop(ms => {
  const t = ms / 1000, dt = Math.min(0.05, Math.max(0.001, t - last)); last = t;
  const inVR = renderer.xr.isPresenting;
  const inputs = inVR ? [readXR(0), readXR(1)] : demo.update(world, dt);
  step(world, dt, inputs);
  for (const e of world.events) onEvent(e);
  world.events.length = 0;
  world.hands.forEach((h, i) => {
    updateHeld(heldViews[i], h, dt, t);
    const m = xr[i].demoMitt; m.visible = !inVR;
    if (!inVR) m.position.set(inputs[i].pos.x, inputs[i].pos.y, inputs[i].pos.z);
  });
  updateShots(t); updateScenery(dt, t); sparks.update(dt); soft.update(dt); drawSign();
  if (!inVR) { // preview camera, pulled back so the ghost hands and the whole arc are in frame
    const tall = camera.aspect < 1, sway = Math.sin(t * 0.25) * 0.15;
    if (EYE) { camera.position.set(0, 1.62, 0.25); camera.lookAt(0, 1.45, -4); }
    else { camera.position.set(sway + (tall ? 0 : -0.9), tall ? 2.5 : 1.95, tall ? 5.6 : 2.5); camera.lookAt(tall ? 0 : -0.9, tall ? 0.7 : 1.7, -3); }
  }
  renderer.render(scene, camera);
});

// handle for the automated page check
window.__game = { world };
