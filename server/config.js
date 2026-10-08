// .env yükleme ve yazma. Bağımlılık yok: basit KEY=VALUE ayrıştırıcı.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Testler ve çoklu kurulum için yollar ortam değişkeniyle değiştirilebilir (kullanıcı verisine dokunmadan).
export const DATA_DIR = path.resolve(process.env.HQ_DATA_DIR || path.join(ROOT, 'data'));
export const WORKSPACE_DIR = path.resolve(process.env.HQ_WORKSPACE_DIR || path.join(ROOT, 'workspace'));
export const PUBLIC_DIR = path.join(ROOT, 'public');
const ENV_PATH = path.resolve(process.env.HQ_ENV_FILE || path.join(ROOT, '.env'));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[line.slice(0, eq).trim()] = val;
  }
  return out;
}

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    const example = path.join(ROOT, '.env.example');
    if (fs.existsSync(example)) fs.copyFileSync(example, ENV_PATH);
  }
  const fileVars = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, 'utf8')) : {};
  // process.env öncelikli
  return { ...fileVars, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k in fileVars)) };
}

export const env = loadEnv();

export function num(key, def) {
  const n = Number(env[key]);
  return Number.isFinite(n) && env[key] !== '' && env[key] != null ? n : def;
}

/** Tek bir anahtarı .env dosyasında günceller (yorumları korur). */
export function setEnv(key, value) {
  if (!/^[A-Z0-9_]+$/.test(key)) throw new Error('geçersiz anahtar adı');
  const clean = String(value ?? '').replace(/[\r\n]/g, '').trim();
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${key}=${clean}`) : `${text.replace(/\s*$/, '')}\n${key}=${clean}\n`;
  fs.writeFileSync(ENV_PATH, text);
  env[key] = clean;
}
