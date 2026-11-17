// Elemental Proving Ground VR, draft v04
// The settings you change on the tuning board, what each one controls, and where they are saved.

import { FT } from './fire.js';
import { WT } from './world.js';

export const SETTINGS = [
  { key: 'sens', label: 'Pull sensitivity', min: 0, max: 1, def: 0.5, fmt: v => v < 0.34 ? 'strict' : v < 0.67 ? 'medium' : 'loose', code: 'S' },
  { key: 'lock', label: 'Lock-on time', min: 0.05, max: 0.6, def: 0.25, fmt: v => `${v.toFixed(2)} s`, code: 'L' },
  { key: 'style', label: 'Pull by', options: ['close', 'yank', 'either'], names: ['Close hand', 'Yank back', 'Either'], def: 'close', code: 'P' },
  { key: 'speed', label: 'Swing speed to throw', min: 0.8, max: 3, def: 1.6, fmt: v => `${v.toFixed(1)} m/s`, code: 'T' },
  { key: 'power', label: 'Throw power', min: 1.5, max: 4, def: 2.6, fmt: v => `× ${v.toFixed(1)}`, code: 'W' },
  { key: 'assist', label: 'Aim help', min: 0, max: 1, def: 0.85, fmt: v => `${Math.round(v * 100)}%`, code: 'A' },
  { key: 'gaze', label: 'Aim where you look', min: 0, max: 1, def: 0.5, fmt: v => `${Math.round(v * 100)}%`, code: 'G' },
];

const KEY = 'epg-tune-v04';
export const tune = Object.fromEntries(SETTINGS.map(s => [s.key, s.def]));

export function apply() {
  FT.pullFacing = 0.92 - 0.3 * tune.sens;     // strict 0.92 (about 23 degrees) to loose 0.62 (about 52 degrees)
  FT.stayFacing = FT.pullFacing - 0.16;
  FT.reach = 0.47 - 0.14 * tune.sens;
  FT.lockHold = tune.lock;
  FT.pullStyle = tune.style;
  FT.throwSpeed.hand = tune.speed; FT.throwSpeed.controller = tune.speed * 1.3;
  FT.throwGain = tune.power;
  WT.assist.fireball.blend = tune.assist; WT.assist.blast.blend = Math.min(1, tune.assist + 0.1);
  WT.gazeWeight = tune.gaze;
}
export function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); for (const d of SETTINGS) if (s[d.key] !== undefined) tune[d.key] = s[d.key]; } catch (e) { /* storage unavailable: defaults */ }
  apply();
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(tune)); } catch (e) { /* storage unavailable */ } }
export function reset() { for (const d of SETTINGS) tune[d.key] = d.def; apply(); save(); }
// a short line you can read out: S0.50 L0.25 Pclose T1.6 W2.6 A0.75 G0.50
export function code() { return SETTINGS.map(d => d.code + (d.options ? tune[d.key] : (+tune[d.key]).toFixed(d.key === 'speed' || d.key === 'power' ? 1 : 2))).join(' '); }
