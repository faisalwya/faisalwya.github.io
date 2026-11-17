// Elemental Proving Ground VR, draft v02
// The fire playground: everything you can hit, burn, topple or melt, plus the physics.
// Player stands at the origin facing -Z.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COL, rnd, lambert, glow, sphereGeo, makeFlame, updateFlame, makeGlow } from './fx.js';

export const WT = {
  gravity: { fireball: 5, blast: 1.5, jet: 2 },
  radius: { fireball: 0.12, blast: 0.2, jet: 0.06 },
  life: { fireball: 6, blast: 3, jet: 0.42 },
  heat: { fireball: 1, blast: 3, jet: 0.05, ground: 0.5 },
  impulse: { fireball: 10, blast: 34, jet: 0.15 },
  assist: { fireball: { yaw: 18, up: 40, down: 22, blend: 0.85 }, blast: { yaw: 20, up: 30, down: 25, blend: 0.9 } },
  spreadEvery: 1.2, spreadDist: 0.95,
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;
const T = V(0.2, 0, -3.6);     // crate tower
const CS = 0.5;                // crate size
const SCROLL_TOP = 2.6, STRIP_H = 0.17, STRIPS = 8;

const crateGeo = new THREE.BoxGeometry(CS, CS, CS), crateEdges = new THREE.EdgesGeometry(crateGeo);
const edgeMat = new THREE.LineBasicMaterial({ color: COL.ink });
const stripGeo = new THREE.PlaneGeometry(0.5, STRIP_H * 0.98);
const shardGeo = new THREE.BoxGeometry(0.16, 0.12, 0.05);

export function createWorld(scene, fx) {
  const W = { shots: [], events: [], check: {}, sealTried: false, wetTried: false, t: 0 };
  const emit = (type, data = {}) => W.events.push(Object.assign({ type }, data));
  const P = fx.particles;
  let root, phys, crates, stone, rope, fuse, candles, rockets, scrolls, ice, urn, dummies, groundFires, shards, extra, spreadT;

  /* ---------- permanent pieces: the two fire bowls and the gong ---------- */
  const braziers = [V(-0.55, 0.96, -0.45), V(0.55, 0.96, -0.45)].map(p => {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, p.y - 0.1, 6), lambert(COL.ink));
      leg.position.set(p.x + Math.cos(a) * 0.15, (p.y - 0.1) / 2, p.z + Math.sin(a) * 0.15); leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); scene.add(leg);
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.13, 0.17, 14), lambert(0x30323c)); bowl.position.set(p.x, p.y - 0.1, p.z); scene.add(bowl);
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a22 })); coals.position.set(p.x, p.y - 0.012, p.z); scene.add(coals);
    const flames = [0, 1, 2].map(i => { const f = makeFlame(rnd(0.2, 0.3), scene, true); f.position.set(p.x + (i - 1) * 0.1, p.y - 0.02, p.z + (i % 2) * 0.08 - 0.04); return f; });
    const light = new THREE.PointLight(COL.fire, 3.5, 7, 2); light.position.set(p.x, p.y + 0.35, p.z); scene.add(light);
    return { pos: p, r: 0.24, flames, light };
  });
  const gong = { pos: V(2.3, 1.4, -0.9), r: 0.42, swing: 0 };
  {
    const g = new THREE.Group(); g.position.set(gong.pos.x, 0, gong.pos.z); g.lookAt(0, 0, 0); scene.add(g);
    const post = new THREE.BoxGeometry(0.07, gong.pos.y + 0.6, 0.07);
    [-0.6, 0.6].forEach(x => { const m = new THREE.Mesh(post, lambert(COL.red)); m.position.set(x, (gong.pos.y + 0.6) / 2, 0); g.add(m); });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.1), lambert(COL.red)); top.position.set(0, gong.pos.y + 0.6, 0); g.add(top);
    gong.disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28).rotateX(Math.PI / 2), lambert(COL.bronze, { emissive: 0x4a3508 }));
    gong.disc.position.set(0, gong.pos.y, 0); g.add(gong.disc);
  }

  /* ---------- building the playground (again on every reset) ---------- */
  function build() {
    if (root) scene.remove(root);
    root = new THREE.Group(); scene.add(root);
    phys = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.8, 0) });
    phys.allowSleep = true; phys.broadphase = new CANNON.SAPBroadphase(phys); phys.solver.iterations = 12;
    phys.defaultContactMaterial.friction = 0.5; phys.defaultContactMaterial.restitution = 0.08;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); phys.addBody(ground);
    W.shots.length = 0; groundFires = []; shards = []; extra = []; spreadT = WT.spreadEvery;
    W.check = { tower: false, rope: false, fuse: false, scroll: false, ice: false, seal: false, wet: false };
    W.sealTried = false; W.wetTried = false;
    buildTower(); buildRope(); buildFuse(); buildScrolls(); buildIce(); buildUrn(); buildDummies();
    root.updateMatrixWorld(true);
  }

  function flammable(o) { return Object.assign(o, { heat: 0, state: 'dry', burnT: 0, wet: o.wet || 0 }); }

  function buildTower() {
    crates = [[-0.52, 0], [0, 0], [0.52, 0], [-0.26, 1], [0.26, 1], [0, 2]].map(([x, row]) => {
      const p = V(T.x + x, CS / 2 + row * (CS + 0.004), T.z);
      const mat = lambert(COL.wood), m = new THREE.Mesh(crateGeo, mat);
      m.add(new THREE.LineSegments(crateEdges, edgeMat)); m.position.copy(p); root.add(m);
      const body = new CANNON.Body({ mass: 2, shape: new CANNON.Box(new CANNON.Vec3(CS / 2, CS / 2, CS / 2)), position: new CANNON.Vec3(p.x, p.y, p.z) });
      body.sleepSpeedLimit = 0.15; body.sleepTimeLimit = 0.5; phys.addBody(body); body.sleep();
      body.addEventListener('collide', e => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v > 1.5) emit('thud', { v }); });
      return flammable({ kind: 'crate', mesh: m, body, mat, start: p.clone(), half: CS / 2, life: 9, charT: 0, gone: false,
        flames: [makeFlame(0.42, root), makeFlame(0.32, root)] });
    });
  }

  function buildRope() {
    const top = 3.7, x0 = T.x;
    const postGeo = new THREE.BoxGeometry(0.12, top, 0.12);
    [-1.15, 1.15].forEach(dx => {
      const m = new THREE.Mesh(postGeo, lambert(COL.wood)); m.position.set(x0 + dx, top / 2, T.z); root.add(m);
      phys.addBody(new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.06, top / 2, 0.06)), position: new CANNON.Vec3(x0 + dx, top / 2, T.z) }));
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.14, 0.14), lambert(COL.wood)); beam.position.set(x0, top, T.z); root.add(beam);
    const sMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), lambert(COL.rock));
    sMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(sMesh.geometry), edgeMat));
    sMesh.position.set(x0, 2.45, T.z); root.add(sMesh);
    stone = { mesh: sMesh, body: null, half: 0.31 };
    const a = V(x0, top - 0.07, T.z), b = V(x0, 2.76, T.z);
    const rMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), lambert(0xc8a46a));
    rMesh.position.copy(a).add(b).multiplyScalar(0.5); rMesh.scale.y = a.y - b.y; root.add(rMesh);
    rope = { a, b, mesh: rMesh, state: 'intact', burnT: 0, at: b.y, flame: makeFlame(0.16, root) };
  }

  function buildFuse() {
    const pts = [V(-0.9, 0.03, -1.3), V(-1.6, 0.03, -1.7), V(-2.3, 0.03, -2.4), V(-2.8, 0.03, -3.3), V(-3.1, 0.03, -4.3)];
    const curve = new THREE.CatmullRomCurve3(pts), n = Math.round(curve.getLength() / 0.06);
    const samples = curve.getSpacedPoints(n);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.035, 0.07), lambert(0xffffff), samples.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color(0xb59466);
    samples.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); inst.setMatrixAt(i, m4); inst.setColorAt(i, c); });
    root.add(inst);
    fuse = { samples, inst, state: new Uint8Array(samples.length), timer: new Float32Array(samples.length), dirty: false };
    // a start marker so the fuse is easy to find
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.08, 10), lambert(COL.red)); cap.position.copy(samples[0]).setY(0.04); root.add(cap);
    candles = [0.25, 0.45, 0.65, 0.85].map((f, k) => {
      const i = Math.floor(f * (samples.length - 1)), p = samples[i], q = samples[Math.min(samples.length - 1, i + 1)];
      const side = V(q.z - p.z, 0, -(q.x - p.x)).normalize().multiplyScalar(k % 2 ? 0.24 : -0.24);
      const base = p.clone().add(side).setY(0);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 10), lambert(COL.paper)); stick.position.copy(base).setY(0.15); root.add(stick);
      const flame = makeFlame(0.12, root); flame.position.copy(base).setY(0.31);
      return { idx: i, pos: base.clone().setY(0.33), lit: false, flame };
    });
    const end = samples[samples.length - 1];
    rockets = [[-0.25, 0.1], [0.05, -0.15], [0.3, 0.12]].map(([dx, dz], k) => {
      const g = new THREE.Group(); g.position.set(end.x + dx, 0, end.z + dz);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), lambert([COL.red, 0x2f6fb3, 0xe0b23a][k])); tube.position.y = 0.35; g.add(tube);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 10), lambert(COL.paper)); tip.position.y = 0.67; g.add(tip);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), lambert(COL.wood)); stick.position.set(0.06, 0.2, 0); g.add(stick);
      root.add(g);
      return { g, state: 'idle', t: 0, delay: k * 0.45, vel: V(), color: [0xff5a4a, 0x7cc8ff, 0xffd27a][k] };
    });
  }

  function buildScrolls() {
    const group = new THREE.Group(); group.position.set(2.3, 0, -2.7); group.lookAt(0, 0, 0); root.add(group);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.1), lambert(COL.ink)); beam.position.set(0, SCROLL_TOP + 0.12, 0); group.add(beam);
    [-1.0, 1.0].forEach(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, SCROLL_TOP + 0.17, 0.08), lambert(COL.ink)); p.position.set(x, (SCROLL_TOP + 0.17) / 2, 0); group.add(p); });
    scrolls = [-0.6, 0, 0.6].map(x => {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8).rotateZ(Math.PI / 2), lambert(COL.wood)); roller.position.set(x, SCROLL_TOP + 0.03, 0); group.add(roller);
      const strips = Array.from({ length: STRIPS }, (_, i) => {
        const mat = lambert(COL.paper, { side: THREE.DoubleSide }), m = new THREE.Mesh(stripGeo, mat);
        m.position.set(x, SCROLL_TOP - STRIP_H * (i + 0.5), 0); group.add(m);
        return { mesh: m, mat, state: 0, t: 0 };
      });
      // a red mark on the middle of each scroll, so it reads as a target
      const mark = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), new THREE.MeshBasicMaterial({ color: COL.red, side: THREE.DoubleSide }));
      mark.position.set(x, SCROLL_TOP - STRIP_H * 3.5, 0.005); group.add(mark);
      return { x, strips, mark, done: false };
    });
    scrolls.group = group;
  }

  function buildIce() {
    const mat = lambert(COL.ice, { emissive: 0x2a4a66, transparent: true, opacity: 0.82 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xeaf6ff })));
    root.add(m);
    const seed = new THREE.Mesh(sphereGeo, glow(COL.fire, 0.95)); seed.scale.setScalar(0.07); root.add(seed);
    const seedGlow = makeGlow(COL.fire, 0.6, 0.6); root.add(seedGlow);
    ice = { mesh: m, mat, seed, seedGlow, hp: 1, pos: V(-1.9, 0, -0.9), size: 0.9, melted: false, hissT: 0, flame: makeFlame(0.22, root) };
    placeIce();
  }
  function placeIce() {
    const s = ice.size * (0.25 + 0.75 * ice.hp);
    ice.mesh.scale.setScalar(s); ice.mesh.position.set(ice.pos.x, s / 2, ice.pos.z);
    ice.seed.position.set(ice.pos.x, Math.max(0.08, s / 2), ice.pos.z); ice.seedGlow.position.copy(ice.seed.position);
    ice.half = s / 2;
  }

  function buildUrn() {
    const pts = [[0.0, 0], [0.22, 0.02], [0.34, 0.25], [0.36, 0.45], [0.26, 0.72], [0.15, 0.82], [0.17, 0.9], [0.0, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
    const mat = lambert(COL.clay);
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat); m.position.set(2.4, 0, -4.4); root.add(m);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 6, 24).rotateX(Math.PI / 2), lambert(COL.bronze)); band.position.set(2.4, 0.45, -4.4); root.add(band);
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 16), lambert(COL.red)); seal.position.set(2.4, 0.92, -4.4); root.add(seal);
    urn = { mesh: m, band, seal, mat, pos: V(2.4, 0.45, -4.4), r: 0.4, broken: false, hits: 0 };
  }

  function buildDummies() {
    dummies = [[V(-1.6, 0, -3.2), false], [V(-1.25, 0, -5.3), true]].map(([p, wet]) => {
      const g = new THREE.Group(); g.position.copy(p); root.add(g);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6), lambert(COL.ink)); post.position.y = 0.95; g.add(post);
      const mat = lambert(wet ? COL.wetStraw : COL.straw);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.85, 12), mat); torso.position.y = 1.15; g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9), mat); head.position.y = 1.78; g.add(head);
      const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6).rotateZ(Math.PI / 2), mat); arms.position.y = 1.4; g.add(arms);
      const flames = [makeFlame(0.45, root), makeFlame(0.32, root)];
      return flammable({ kind: 'dummy', g, mat, isWet: wet, wet: wet ? 3 : 0, pos: p, center: V(p.x, 1.25, p.z), life: 6, flames, dripT: 0 });
    });
  }

  /* ---------- helpers ---------- */
  const cv = new CANNON.Vec3(), cq = new CANNON.Quaternion();
  function inBody(body, half, p, r) {
    cv.set(p.x - body.position.x, p.y - body.position.y, p.z - body.position.z);
    body.quaternion.conjugate(cq); const l = cq.vmult(cv);
    return Math.abs(l.x) < half + r && Math.abs(l.y) < half + r && Math.abs(l.z) < half + r;
  }
  function segDist(p, a, b) {
    const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    return p.distanceTo(a.clone().addScaledVector(ab, t));
  }
  function push(body, dir, amount, at) {
    if (!body) return;
    body.wakeUp();
    body.applyImpulse(new CANNON.Vec3(dir.x * amount, dir.y * amount + amount * 0.15, dir.z * amount), new CANNON.Vec3(at.x - body.position.x, at.y - body.position.y, at.z - body.position.z));
  }
  const posOf = o => o.kind === 'crate' ? V(o.body.position.x, o.body.position.y, o.body.position.z) : o.center;
  let hissCool = 0;
  function hiss(p) { P.burst('steam', p, 6, 0.7); if (hissCool <= 0) { emit('hiss', { pos: p.clone() }); hissCool = 0.25; } }

  function heatUp(o, amount, at) {
    if (o.state !== 'dry' || o.gone) return;
    if (o.wet > 0) {
      o.wet = Math.max(0, o.wet - amount);
      if (o.kind === 'dummy' && o.isWet) W.wetTried = true;
      hiss(at || posOf(o));
      if (o.wet <= 0) { o.mat.color.set(o.kind === 'dummy' ? COL.straw : COL.wood); P.burst('steam', posOf(o), 20, 1.2); emit('dried', { pos: posOf(o) }); }
      return;
    }
    o.heat += amount;
    if (o.heat >= 1) ignite(o);
  }
  function ignite(o) {
    if (o.state !== 'dry' || o.wet > 0 || o.gone) return;
    o.state = 'burning'; o.burnT = 0;
    o.flames.forEach(f => { f.userData.target = 1; });
    P.burst('fire', posOf(o), 18, 1.2); emit('ignite', { pos: posOf(o) });
    if (o.kind === 'dummy' && o.isWet) W.check.wet = true;
  }

  function igniteFuseNear(p, r) {
    let best = -1, bd = r;
    fuse.samples.forEach((s, i) => { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd && p.y < 0.5) { bd = d; best = i; } });
    if (best >= 0 && fuse.state[best] === 0) { fuse.state[best] = 1; fuse.timer[best] = 0; fuse.dirty = true; emit('fuse', { pos: fuse.samples[best].clone() }); return true; }
    return false;
  }
  function lightCandle(c) { if (c.lit) return; c.lit = true; c.flame.userData.target = 1; P.burst('fire', c.pos, 6, 0.6); emit('candle', { pos: c.pos.clone() }); }
  function launchRocket(r, delay = 0) { if (r.state !== 'idle') return; r.state = 'lit'; r.t = -delay; }

  function burnStrip(s, sc) { if (s.state === 0) { s.state = 1; s.t = 0; if (sc.mark.visible) sc.mark.visible = false; } }

  function releaseStone() {
    if (stone.body) return;
    const p = stone.mesh.position;
    stone.body = new CANNON.Body({ mass: 60, shape: new CANNON.Box(new CANNON.Vec3(stone.half, stone.half, stone.half)), position: new CANNON.Vec3(p.x, p.y, p.z) });
    stone.body.addEventListener('collide', e => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v > 1.5) emit('thud', { v: v * 2 }); });
    phys.addBody(stone.body);
    W.check.rope = true; emit('snap', { pos: rope.b.clone() });
  }

  function melt(amount, at) {
    if (ice.melted) return;
    ice.hp = Math.max(0, ice.hp - amount);
    P.burst('steam', at, 4, 0.6); if (Math.random() < 0.5) P.burst('water', at, 3, 0.6);
    emit('melt', { pos: at.clone() });
    placeIce();
    if (ice.hp <= 0) {
      ice.melted = true; ice.mesh.visible = false; ice.seed.visible = false; ice.seedGlow.visible = false;
      ice.flame.position.set(ice.pos.x, 0.05, ice.pos.z); ice.flame.userData.target = 1;
      P.burst('steam', V(ice.pos.x, 0.4, ice.pos.z), 30, 1.4); P.burst('water', V(ice.pos.x, 0.3, ice.pos.z), 20, 1.2);
      extra.push({ pos: V(ice.pos.x, 0.2, ice.pos.z), r: 0.22 });
      W.check.ice = true; emit('freed', { pos: V(ice.pos.x, 0.3, ice.pos.z) });
    }
  }

  function shatterUrn(dir) {
    urn.broken = true; urn.mesh.visible = urn.band.visible = urn.seal.visible = false;
    for (let i = 0; i < 14; i++) {
      const a = rnd(Math.PI * 2), h = rnd(0.1, 0.85), r = 0.3;
      const p = V(urn.pos.x + Math.cos(a) * r, h, urn.pos.z + Math.sin(a) * r);
      const mesh = new THREE.Mesh(shardGeo, lambert(i % 5 ? COL.clay : COL.bronze)); root.add(mesh);
      const body = new CANNON.Body({ mass: 0.4, shape: new CANNON.Box(new CANNON.Vec3(0.08, 0.06, 0.025)), position: new CANNON.Vec3(p.x, p.y, p.z) });
      body.velocity.set(Math.cos(a) * rnd(2, 5) + dir.x * 3, rnd(2, 5), Math.sin(a) * rnd(2, 5) + dir.z * 3);
      body.angularVelocity.set(rnd(-10, 10), rnd(-10, 10), rnd(-10, 10));
      phys.addBody(body); shards.push({ mesh, body });
    }
    P.burst('fire', urn.pos, 40, 2.4); P.burst('smoke', urn.pos, 14, 1.2);
    W.check.seal = true; emit('shatter', { pos: urn.pos.clone() });
  }

  /* ---------- what a hit does, by target ---------- */
  function hitTest(s) {
    const p = s.pos, r = WT.radius[s.kind];
    for (const c of crates) if (!c.gone && inBody(c.body, c.half, p, r)) return { kind: 'crate', o: c };
    if (stone.body && inBody(stone.body, stone.half, p, r)) return { kind: 'stone' };
    if (rope.state !== 'cut' && segDist(p, rope.a, V(rope.b.x, rope.at, rope.b.z)) < 0.07 + r) return { kind: 'rope' };
    if (!stone.body && inBody({ position: stone.mesh.position, quaternion: new CANNON.Quaternion() }, stone.half, p, r)) return { kind: 'stone' };
    const l = scrolls.group.worldToLocal(p.clone());
    if (Math.abs(l.z) < 0.1 + r && l.y < SCROLL_TOP + r && l.y > SCROLL_TOP - STRIPS * STRIP_H - r) {
      for (const sc of scrolls) {
        if (Math.abs(l.x - sc.x) > 0.25 + r) continue;
        const i = Math.max(0, Math.min(STRIPS - 1, Math.floor((SCROLL_TOP - l.y) / STRIP_H)));
        if (sc.strips[i].state === 2) continue;
        return { kind: 'scroll', sc, i };
      }
    }
    if (!ice.melted && Math.abs(p.x - ice.pos.x) < ice.half + r && Math.abs(p.z - ice.pos.z) < ice.half + r && p.y < ice.half * 2 + r) return { kind: 'ice' };
    if (!urn.broken && p.distanceTo(urn.pos) < urn.r + r) return { kind: 'urn' };
    for (const d of dummies) if (Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 0.26 + r && p.y > 0.6 && p.y < 1.98) return { kind: 'dummy', o: d };
    for (const c of candles) if (c.pos.distanceTo(p) < 0.12 + r) return { kind: 'candle', o: c };
    for (const k of rockets) if (k.state === 'idle' && k.g.position.clone().setY(0.4).distanceTo(p) < 0.18 + r) return { kind: 'rocket', o: k };
    if (p.distanceTo(gong.pos) < gong.r + r) return { kind: 'gong' };
    return null;
  }

  function applyHit(s, h) {
    const heat = WT.heat[s.kind], dir = s.vel.clone().normalize(), p = s.pos, jet = s.kind === 'jet';
    const imp = WT.impulse[s.kind] * (s.kind === 'blast' ? s.power : s.kind === 'fireball' ? Math.min(1.5, s.vel.length() / 8) : 1);
    switch (h.kind) {
      case 'crate': push(h.o.body, dir, imp, p); heatUp(h.o, heat, p); break;
      case 'stone': if (stone.body) push(stone.body, dir, imp * 4, p); if (!jet) { P.burst('fire', p, 6, 0.8); emit('fizzle', { pos: p.clone() }); } break;
      case 'rope': if (rope.state === 'intact') { rope.state = 'burning'; rope.burnT = 0; rope.at = Math.min(Math.max(p.y, rope.b.y), rope.a.y); rope.flame.userData.target = 1; emit('ignite', { pos: p.clone() }); } break;
      case 'scroll': burnStrip(h.sc.strips[h.i], h.sc); if (!jet) emit('ignite', { pos: p.clone() }); break;
      case 'ice': melt(s.kind === 'blast' ? 0.5 * s.power : s.kind === 'fireball' ? 0.14 : 0.012, p); break;
      case 'urn':
        if (s.kind === 'blast' && s.power >= 0.9) shatterUrn(dir);
        else if (!jet || Math.random() < 0.05) { urn.hits++; W.sealTried = true; urn.mat.color.lerp(new THREE.Color(COL.char), 0.08); P.burst('fire', p, jet ? 2 : 8, 0.6); emit('clank', { pos: p.clone() }); }
        break;
      case 'dummy': heatUp(h.o, heat, p); break;
      case 'candle': lightCandle(h.o); break;
      case 'rocket': launchRocket(h.o); break;
      case 'gong': gong.swing = 1; emit('gong', { pos: p.clone() }); build(); return 'reset';
    }
    if (!jet) { P.burst('fire', p, s.kind === 'blast' ? 30 : 14, s.kind === 'blast' ? 2 : 1.1); emit('impact', { pos: p.clone(), kind: s.kind, power: s.power || 0 }); }
    return 'hit';
  }

  /* ---------- aim assist: bend a throw toward the nearest worthwhile thing ---------- */
  function aimPoints() {
    const pts = [];
    if (crates.some(c => !c.gone)) { const live = crates.filter(c => !c.gone); const top = live.reduce((a, c) => c.body.position.y > a.body.position.y ? c : a); pts.push(V(top.body.position.x, top.body.position.y, top.body.position.z)); live.forEach(c => pts.push(V(c.body.position.x, c.body.position.y, c.body.position.z))); }
    if (rope.state === 'intact') pts.push(V(rope.a.x, (rope.a.y + rope.b.y) / 2, rope.a.z));
    if (scrolls) scrolls.forEach(sc => { if (!sc.done) pts.push(scrolls.group.localToWorld(V(sc.x, SCROLL_TOP - STRIP_H * 3.5, 0))); });
    if (!ice.melted) pts.push(V(ice.pos.x, ice.half, ice.pos.z));
    if (!urn.broken) pts.push(urn.pos.clone());
    dummies.forEach(d => { if (d.state === 'dry') pts.push(d.center.clone()); });
    candles.forEach(c => { if (!c.lit) pts.push(c.pos.clone()); });
    pts.push(fuse.samples[0].clone());
    pts.push(gong.pos.clone());
    return pts;
  }
  function assist(pos, vel, kind) {
    const A = WT.assist[kind], speed = vel.length(); if (!A || speed < 0.01) return vel;
    const g = WT.gravity[kind];
    const yawV = Math.atan2(vel.x, -vel.z), elevV = Math.atan2(vel.y, Math.hypot(vel.x, vel.z));
    let best = null, bs = Infinity;
    for (const T2 of aimPoints()) {
      const d = T2.clone().sub(pos);
      let dy = Math.atan2(d.x, -d.z) - yawV; dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy))) / DEG;
      const de = (elevV - Math.atan2(d.y, Math.hypot(d.x, d.z))) / DEG;
      if (dy > A.yaw || de > A.up || de < -A.down) continue;
      const score = dy + 0.35 * Math.abs(de - 6);
      if (score < bs) { bs = score; best = T2; }
    }
    if (!best) return vel;
    const d = best.clone().sub(pos), t = Math.max(0.25, Math.min(1.6, d.length() / speed));
    const sol = V(d.x / t, d.y / t + 0.5 * g * t, d.z / t);
    return vel.clone().lerp(sol, A.blend);
  }

  /* ---------- public ---------- */
  W.addShot = (kind, pos, vel, power = 0) => {
    const p = V(pos.x, pos.y, pos.z); let v = V(vel.x, vel.y, vel.z);
    if (kind !== 'jet') v = assist(p, v, kind);
    W.shots.push({ kind, pos: p, vel: v, power, age: 0, id: Math.random() });
  };
  W.sources = () => {
    const s = braziers.map(b => ({ pos: b.pos, r: b.r }));
    extra.forEach(e => s.push(e));
    crates.forEach(c => { if (c.state === 'burning') s.push({ pos: posOf(c), r: 0.35 }); });
    dummies.forEach(d => { if (d.state === 'burning') s.push({ pos: d.center, r: 0.35 }); });
    return s;
  };
  W.dropFlame = pos => {
    const p = V(pos.x, Math.max(0.05, pos.y), pos.z);
    W.shots.push({ kind: 'fireball', pos: p, vel: V(0, -0.5, 0), power: 0, age: 0, id: Math.random(), dropped: true });
  };
  W.targets = () => ({
    tower: V(T.x, 1.3, T.z), rope: V(rope.a.x, 3.2, rope.a.z), fuse: fuse.samples[0].clone(),
    scroll: scrolls.group.localToWorld(V(0, SCROLL_TOP - STRIP_H * 3.5, 0)), ice: V(ice.pos.x, 0.45, ice.pos.z),
    urn: urn.pos.clone(), dummy: dummies[0].center.clone(), wet: dummies[1].center.clone(), gong: gong.pos.clone(),
  });
  W.status = () => ({
    crates: crates.map(c => c.state), rope: rope.state, fuseBurnt: fuse.state.filter(x => x > 0).length, fuseLen: fuse.samples.length,
    candles: candles.filter(c => c.lit).length, rockets: rockets.map(r => r.state), scrolls: scrolls.map(s => s.strips.filter(x => x.state === 2).length),
    ice: +ice.hp.toFixed(2), urn: urn.broken ? 'broken' : urn.hits, dummies: dummies.map(d => d.state + (d.wet > 0 ? ' wet' : '')), check: Object.assign({}, W.check),
  });

  /* ---------- per frame ---------- */
  W.update = (dt, t) => {
    W.t = t; hissCool -= dt;
    phys.step(1 / 72, dt, 3);

    // shots
    for (let i = W.shots.length - 1; i >= 0; i--) {
      const s = W.shots[i];
      s.vel.y -= WT.gravity[s.kind] * dt;
      s.pos.addScaledVector(s.vel, dt); s.age += dt;
      const h = hitTest(s);
      let gone = false;
      if (h) { const res = applyHit(s, h); if (res === 'reset') return; gone = true; }
      else if (s.pos.y < WT.radius[s.kind] * 0.6) {
        const at = V(s.pos.x, 0.02, s.pos.z);
        igniteFuseNear(at, s.kind === 'jet' ? 0.2 : 0.35);
        if (s.kind !== 'jet') {
          const gf = { pos: at, t: s.dropped ? 1.5 : 2.2, tick: 0, flame: makeFlame(s.kind === 'blast' ? 0.5 : 0.32, root, true) };
          gf.flame.position.copy(at); groundFires.push(gf);
          P.burst('fire', at, 12, 1); emit('land', { pos: at });
        } else if (Math.random() < 0.3) P.burst('fire', at, 1, 0.4);
        gone = true;
      }
      if (!gone && (s.age > WT.life[s.kind] || s.pos.length() > 20)) gone = true;
      if (gone) W.shots.splice(i, 1);
    }

    // ground fires heat what they touch
    for (let i = groundFires.length - 1; i >= 0; i--) {
      const g = groundFires[i]; g.t -= dt; g.tick -= dt;
      if (g.tick <= 0) {
        g.tick = 0.3;
        igniteFuseNear(g.pos, 0.3);
        candles.forEach(c => { if (Math.hypot(c.pos.x - g.pos.x, c.pos.z - g.pos.z) < 0.3) lightCandle(c); });
        [...crates, ...dummies].forEach(o => { const q = posOf(o); if (Math.hypot(q.x - g.pos.x, q.z - g.pos.z) < 0.6 && q.y < 1.6) heatUp(o, WT.heat.ground); });
        if (!ice.melted && Math.hypot(ice.pos.x - g.pos.x, ice.pos.z - g.pos.z) < ice.half + 0.3) melt(0.04, g.pos.clone().setY(0.1));
      }
      if (g.t < 0.4) g.flame.userData.target = 0;
      updateFlame(g.flame, dt, t);
      if (g.t <= 0) { root.remove(g.flame); groundFires.splice(i, 1); }
    }

    // crates and dummies burning, spreading, charring
    spreadT -= dt;
    const doSpread = spreadT <= 0; if (doSpread) spreadT = WT.spreadEvery;
    for (const o of [...crates, ...dummies]) {
      if (o.gone) continue;
      const q = posOf(o);
      if (o.state === 'burning') {
        o.burnT += dt;
        if (Math.random() < dt * 4) P.burst('ember', q.clone().setY(q.y + 0.2), 1, 0.6);
        if (Math.random() < dt * 3) P.burst('smoke', q.clone().setY(q.y + 0.6), 1, 0.6);
        if (doSpread) {
          for (const n of [...crates, ...dummies]) if (n !== o && n.state === 'dry' && posOf(n).distanceTo(q) < WT.spreadDist) heatUp(n, 1);
          igniteFuseNear(V(q.x, 0.02, q.z), 0.45);
          candles.forEach(c => { if (c.pos.distanceTo(q) < 0.5) lightCandle(c); });
          if (rope.state === 'intact' && segDist(q, rope.a, rope.b) < 0.5) { rope.state = 'burning'; rope.at = rope.b.y; rope.flame.userData.target = 1; }
        }
        if (o.burnT > o.life) { o.state = 'charred'; o.flames.forEach(f => { f.userData.target = 0; }); o.mat.color.set(COL.char); P.burst('smoke', q, 10, 0.8); emit('char', { pos: q }); }
      } else if (o.state === 'charred' && o.kind === 'crate') {
        o.charT += dt;
        if (o.charT > 4) { o.gone = true; root.remove(o.mesh); phys.removeBody(o.body); P.burst('ember', q, 26, 1.4); P.burst('smoke', q, 8, 1); emit('crumble', { pos: q }); }
      }
      if (o.kind === 'dummy' && o.wet > 0) { o.dripT -= dt; if (o.dripT <= 0) { o.dripT = rnd(0.3, 0.7); P.soft.spawn(q.x + rnd(-0.18, 0.18), 0.72, q.z + rnd(-0.18, 0.18), 0, 0, 0, 0.6, 0.025, COL.water, -5); } }
      // flames follow
      o.flames.forEach((f, k) => {
        if (o.kind === 'crate') f.position.set(q.x + (k ? 0.12 : -0.1), q.y + 0.2, q.z + (k ? 0.08 : -0.05));
        else f.position.set(q.x + (k ? 0.08 : -0.06), k ? 1.55 : 0.85, q.z);
        updateFlame(f, dt, t);
      });
    }

    // physics -> meshes
    crates.forEach(c => { if (!c.gone) { c.mesh.position.copy(c.body.position); c.mesh.quaternion.copy(c.body.quaternion); } });
    if (stone.body) { stone.mesh.position.copy(stone.body.position); stone.mesh.quaternion.copy(stone.body.quaternion); }
    shards.forEach(s => { s.mesh.position.copy(s.body.position); s.mesh.quaternion.copy(s.body.quaternion); });
    if (!W.check.tower) {
      const moved = crates.filter(c => c.gone || V(c.body.position.x, c.body.position.y, c.body.position.z).distanceTo(c.start) > 0.4).length;
      if (moved >= 3) { W.check.tower = true; emit('toppled', {}); }
    }

    // rope burning up toward the beam, then snapping
    if (rope.state === 'burning') {
      rope.burnT += dt;
      rope.flame.position.set(rope.a.x, rope.b.y + (rope.a.y - rope.b.y) * Math.min(1, rope.burnT / 1.6) * 0.6, rope.a.z);
      if (Math.random() < dt * 20) P.burst('ember', rope.flame.position, 1, 0.5);
      if (rope.burnT > 1.6) {
        rope.state = 'cut'; rope.flame.userData.target = 0;
        rope.mesh.scale.y = 0.35; rope.mesh.position.y = rope.a.y - 0.175;
        P.burst('fire', rope.flame.position, 16, 1); releaseStone();
      }
    }
    updateFlame(rope.flame, dt, t);

    // fuse
    const n = fuse.samples.length;
    for (let i = 0; i < n; i++) {
      if (fuse.state[i] !== 1) continue;
      fuse.timer[i] += dt;
      if (fuse.timer[i] > 0.08) {
        for (const j of [i - 1, i + 1]) if (j >= 0 && j < n && fuse.state[j] === 0) { fuse.state[j] = 1; fuse.timer[j] = -0.0001; fuse.dirty = true; }
      }
      if (Math.random() < 0.5) { const s = fuse.samples[i]; P.sparks.spawn(s.x, s.y + 0.03, s.z, rnd(-0.6, 0.6), rnd(0.6, 1.4), rnd(-0.6, 0.6), rnd(0.2, 0.4), rnd(0.012, 0.025), Math.random() < 0.5 ? COL.hot : COL.white, -3); }
      if (fuse.timer[i] > 0.45) { fuse.state[i] = 2; fuse.dirty = true; }
      candles.forEach(c => { if (c.idx === i) lightCandle(c); });
      if (i === n - 1) rockets.forEach(r => launchRocket(r, r.delay));
    }
    if (fuse.dirty) {
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) fuse.inst.setColorAt(i, c.set(fuse.state[i] === 0 ? 0xb59466 : fuse.state[i] === 1 ? 0xffb050 : 0x2a2622));
      fuse.inst.instanceColor.needsUpdate = true; fuse.dirty = false;
    }
    if (fuse.state.some(x => x === 1) && Math.random() < dt * 8) emit('sizzle', {});
    candles.forEach(c => updateFlame(c.flame, dt, t));

    // rockets
    for (const r of rockets) {
      if (r.state === 'lit') { r.t += dt; if (r.t > 0) { r.state = 'fly'; r.t = 0; r.vel.set(rnd(-0.6, 0.6), 4, rnd(-0.6, 0.6)); W.check.fuse = true; emit('launch', { pos: r.g.position.clone() }); } }
      else if (r.state === 'fly') {
        r.t += dt; r.vel.y = Math.min(22, r.vel.y + 30 * dt);
        r.g.position.addScaledVector(r.vel, dt);
        const p = r.g.position;
        for (let k = 0; k < 3; k++) P.sparks.spawn(p.x, p.y, p.z, rnd(-0.4, 0.4), rnd(-2, -0.5), rnd(-0.4, 0.4), rnd(0.3, 0.6), rnd(0.02, 0.05), k ? COL.hot : COL.fire, -2);
        if (r.t > 1.15) { r.state = 'done'; r.g.visible = false; P.burst('firework', p, 140, 1, r.color); P.burst('firework', p, 40, 1, COL.white); emit('boom', { pos: p.clone() }); }
      }
    }

    // scrolls
    for (const sc of scrolls) {
      sc.strips.forEach((s, i) => {
        if (s.state !== 1) return;
        s.t += dt;
        const k = Math.min(1, s.t / 0.7);
        s.mat.color.setRGB(0.93 * (1 - k) + 0.12 * k + (k < 0.5 ? 0.1 : 0), 0.9 * (1 - k * 1.2) + 0.08, 0.85 * (1 - k * 1.4) + 0.08);
        s.mat.emissive.setRGB(Math.sin(Math.PI * k) * 0.9, Math.sin(Math.PI * k) * 0.35, 0);
        if (Math.random() < dt * 14) { const wp = scrolls.group.localToWorld(s.mesh.position.clone().add(V(rnd(-0.22, 0.22), rnd(-0.08, 0.08), 0))); P.burst('ember', wp, 1, 0.5); }
        if (s.t > 0.28) for (const j of [i - 1, i + 1]) if (j >= 0 && j < STRIPS && sc.strips[j].state === 0) burnStrip(sc.strips[j], sc);
        if (s.t > 0.8) { s.state = 2; s.mesh.visible = false; const wp = scrolls.group.localToWorld(s.mesh.position.clone()); P.burst('ember', wp, 10, 0.8); P.burst('smoke', wp, 2, 0.5); }
      });
      if (!sc.done && sc.strips.every(s => s.state === 2)) { sc.done = true; W.check.scroll = true; emit('scrollGone', {}); }
    }

    // ice glow, freed seed flame
    if (!ice.melted) { ice.seedGlow.material.opacity = 0.45 + Math.sin(t * 3) * 0.15; }
    updateFlame(ice.flame, dt, t);

    // permanent pieces
    braziers.forEach(b => { b.flames.forEach(f => updateFlame(f, dt, t)); b.light.intensity = 3.5 + Math.sin(t * 11 + b.pos.x) * 0.5; });
    gong.swing *= Math.exp(-1.5 * dt); gong.disc.rotation.x = Math.sin(t * 9) * 0.35 * gong.swing;
  };

  W.reset = build;
  build();
  return W;
}
