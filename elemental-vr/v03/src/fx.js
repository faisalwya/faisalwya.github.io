// Elemental Proving Ground VR, draft v03
// Shared look and sound: colours, flames, particles, synthesised audio.

import * as THREE from 'three';

export const COL = {
  paper: 0xece6d8, ink: 0x14161d, red: 0xd8322a,
  fire: 0xff8a3a, hot: 0xffd27a, white: 0xfff1d0, steam: 0xe4ebf4, smoke: 0x5a5f6c, water: 0x7cc8ff,
  sky: 0x0e1222, stone: 0x474d66, stoneDark: 0x2b3048, rock: 0x6b7088, wood: 0x8a6a48, straw: 0xd9b25c,
  wetStraw: 0x6f7a6a, ice: 0xbfe6ff, clay: 0xa0583a, bronze: 0xb08a3a, char: 0x1c1b1e,
};
export const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const lambert = (color, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color }, o));
export const glow = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
export const sphereGeo = new THREE.SphereGeometry(1, 14, 10);

/* ---------- flames: two additive cones that flicker ---------- */
const coneGeo = new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0);
const matOuter = glow(COL.fire, 0.85), matInner = glow(COL.hot, 0.9);
export function makeFlame(size, parent, on = false) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(coneGeo, matOuter));
  const inner = new THREE.Mesh(coneGeo, matInner); inner.scale.set(0.55, 0.7, 0.55); g.add(inner);
  g.userData = { size, k: on ? 1 : 0, target: on ? 1 : 0, seed: rnd(10) };
  g.visible = on;
  parent.add(g);
  return g;
}
export function updateFlame(g, dt, t) {
  const u = g.userData;
  u.k += (u.target - u.k) * Math.min(1, dt * 5);
  const f = 1 + Math.sin(t * 13 + u.seed) * 0.12 + Math.sin(t * 23 + u.seed * 2) * 0.07;
  g.visible = u.k > 0.02;
  if (g.visible) g.scale.set(u.size * u.k * (2 - f), u.size * u.k * f * 1.5, u.size * u.k * (2 - f));
}

/* ---------- soft round glow ---------- */
export const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
export function makeGlow(color, size, opacity = 0) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/* ---------- particles: one instanced mesh per pool ---------- */
function makePool(scene, count, material) {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), material, count);
  m.frustumCulled = false; scene.add(m);
  const P = Array.from({ length: count }, () => ({ life: 0 })), col = new THREE.Color(), arr = m.instanceMatrix.array;
  arr.fill(0);
  for (let i = 0; i < count; i++) m.setColorAt(i, col.set(0xffffff));
  let next = 0;
  return {
    spawn(x, y, z, vx, vy, vz, life, size, color, gy, grow) {
      const p = P[next]; m.setColorAt(next, col.set(color)); m.instanceColor.needsUpdate = true;
      next = (next + 1) % count;
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.size = size; p.gy = gy; p.grow = !!grow;
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

export function createParticles(scene) {
  const sparks = makePool(scene, 700, glow(0xffffff, 0.9));
  const soft = makePool(scene, 420, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }));
  function burst(kind, p, n, power = 1, color) {
    for (let i = 0; i < n; i++) {
      const a = rnd(Math.PI * 2), u = rnd(-0.4, 1), r = Math.sqrt(1 - Math.min(1, u * u)), sp = rnd(0.4, 1.6) * power;
      const vx = Math.cos(a) * r * sp, vy = u * sp, vz = Math.sin(a) * r * sp;
      if (kind === 'fire') sparks.spawn(p.x, p.y, p.z, vx, vy + 0.6, vz, rnd(0.4, 0.9), rnd(0.03, 0.08), Math.random() < 0.5 ? COL.fire : COL.hot, 1.2);
      else if (kind === 'ember') sparks.spawn(p.x, p.y, p.z, vx * 0.5, vy * 0.5 + 0.4, vz * 0.5, rnd(0.8, 1.6), rnd(0.015, 0.035), Math.random() < 0.6 ? COL.fire : 0xff5a1a, -1.5);
      else if (kind === 'water') soft.spawn(p.x, p.y, p.z, vx * 1.2, vy * 1.2 + 0.6, vz * 1.2, rnd(0.4, 0.8), rnd(0.02, 0.05), COL.water, -6);
      else if (kind === 'smoke') soft.spawn(p.x, p.y, p.z, vx * 0.3, 0.5 + vy * 0.2, vz * 0.3, rnd(1.2, 2.2), rnd(0.1, 0.2), COL.smoke, 0.3, true);
      else if (kind === 'firework') { const s2 = rnd(5, 8); sparks.spawn(p.x, p.y, p.z, Math.cos(a) * r * s2, u * s2, Math.sin(a) * r * s2, rnd(1, 1.8), rnd(0.05, 0.09), color, -2.5); }
      else soft.spawn(p.x, p.y, p.z, vx * 0.5, vy * 0.4 + 0.5, vz * 0.5, rnd(0.9, 1.7), rnd(0.1, 0.2), COL.steam, 0.5, true);
    }
  }
  return { sparks, soft, burst, update(dt) { sparks.update(dt); soft.update(dt); } };
}

/* ---------- sound: everything synthesised, only plays while in the headset ---------- */
export function createAudio(isLive) {
  let ctx = null, noise = null, master = null;
  const loops = {};
  function init() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const ok = () => ctx && isLive();
  function hush(type, f0, f1, dur, gain, q = 1, delay = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; src.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(f0, f1, dur, gain, type = 'sine', delay = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  // a continuous sound per key (jet roar, charge hum) that can be started, retuned and stopped
  function loop(key, kind, on, level = 0) {
    if (!ok()) { if (loops[key]) { try { loops[key].stop(); } catch (e) { /* already stopped */ } delete loops[key]; } return; }
    let L = loops[key];
    if (on && !L) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
      if (kind === 'roar') {
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
        src.buffer = noise; src.loop = true; f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7;
        src.connect(f).connect(g); src.start();
        L = loops[key] = { g, f, stop: () => src.stop() };
      } else {
        const o = ctx.createOscillator(), o2 = ctx.createOscillator(); o.type = 'sawtooth'; o2.type = 'sine';
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
        o.connect(f); o2.connect(f); f.connect(g); o.start(); o2.start();
        L = loops[key] = { g, f, o, o2, stop: () => { o.stop(); o2.stop(); } };
      }
    }
    if (!L) return;
    const t = ctx.currentTime;
    if (!on) { L.g.gain.setTargetAtTime(0, t, 0.05); const s = L.stop; delete loops[key]; setTimeout(() => { try { s(); } catch (e) { /* already stopped */ } }, 300); return; }
    if (kind === 'roar') { L.g.gain.setTargetAtTime(0.35, t, 0.05); L.f.frequency.setTargetAtTime(500 + Math.random() * 500, t, 0.05); }
    else { L.g.gain.setTargetAtTime(0.06 + level * 0.12, t, 0.05); L.o.frequency.setTargetAtTime(70 + level * 160, t, 0.05); L.o2.frequency.setTargetAtTime(140 + level * 320, t, 0.05); L.f.frequency.setTargetAtTime(400 + level * 2200, t, 0.05); }
  }
  return {
    init, loop,
    take: () => hush('bandpass', 300, 1400, 0.35, 0.35, 2),
    whoosh: () => hush('bandpass', 1600, 350, 0.3, 0.5, 1.5),
    blast: p => { tone(120, 40, 0.6, 0.5 + p * 0.4); hush('lowpass', 3000, 200, 0.7, 0.4 + p * 0.4); },
    hiss: () => hush('highpass', 5000, 2500, 0.6, 0.35),
    whoomp: () => { tone(160, 50, 0.4, 0.7); hush('lowpass', 900, 200, 0.4, 0.4); },
    puff: () => hush('lowpass', 1200, 400, 0.4, 0.22),
    thud: v => tone(90, 45, 0.18, Math.min(0.6, 0.1 + v * 0.08), 'triangle'),
    snap: () => { hush('highpass', 4000, 1500, 0.15, 0.6); tone(300, 80, 0.2, 0.3, 'square'); },
    clank: () => { tone(220, 200, 0.4, 0.35, 'triangle'); tone(330, 310, 0.3, 0.2, 'triangle'); },
    shatter: () => { hush('highpass', 6000, 1800, 0.5, 0.7); tone(180, 60, 0.4, 0.5); },
    fizzle: () => hush('bandpass', 2500, 900, 0.25, 0.2, 3),
    launch: () => hush('bandpass', 600, 3000, 0.9, 0.35, 2),
    boom: () => { tone(80, 30, 1.2, 0.8); hush('lowpass', 1800, 100, 1.4, 0.6, 1, 0.02); hush('highpass', 6000, 3000, 1.6, 0.15, 1, 0.1); },
    melt: () => hush('bandpass', 1800, 2600, 0.5, 0.15, 6),
    gong: () => { [110, 164, 221, 277].forEach((f, i) => tone(f, f * 0.985, 2.6 - i * 0.4, 0.4 - i * 0.07)); },
    chime: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.9, 0.3, 'triangle', i * 0.14)); },
  };
}
