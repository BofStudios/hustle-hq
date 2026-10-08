// Atomik JSON koleksiyonları + JSONL loglar. Küçük ölçek için dosya tabanlı ve yeterli.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const cache = new Map();
const dirty = new Set();

function file(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

export function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let val = fallback;
  try {
    if (fs.existsSync(file(name))) val = JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch (e) {
    console.error(`[store] ${name}.json bozuk, yedeklenip sıfırlanıyor:`, e.message);
    try { fs.renameSync(file(name), file(name) + `.broken-${Date.now()}`); } catch {}
  }
  cache.set(name, val);
  return val;
}

/** Değişikliği işaretle; diske toplu ve atomik yazılır. */
export function save(name, val) {
  if (val !== undefined) cache.set(name, val);
  dirty.add(name);
}

export function flush() {
  if (dirty.size) fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
  for (const name of dirty) {
    const tmp = file(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache.get(name), null, 1));
    fs.renameSync(tmp, file(name));
  }
  dirty.clear();
}

setInterval(() => {
  try { flush(); } catch (e) { console.error('[store] yazma hatası:', e.message); }
}, 1500).unref();
process.on('exit', flush);

export function appendLog(name, obj) {
  const line = JSON.stringify({ t: Date.now(), ...obj }) + '\n';
  fs.appendFile(path.join(DATA_DIR, 'logs', `${name}.jsonl`), line, () => {});
}

export function readLogTail(name, n = 100) {
  const p = path.join(DATA_DIR, 'logs', `${name}.jsonl`);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  return lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

let seq = Date.now() % 100000;
export function uid(prefix = 'id') {
  return `${prefix}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
