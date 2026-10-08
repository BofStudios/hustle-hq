// workspace/ hapsi: yol çözümleme ve komut çalıştırma.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { zipDirectory } from '../zip.js';
import { killTree, IS_WIN } from '../platform.js';
import { WORKSPACE_DIR } from '../config.js';

export function safePath(rel = '.') {
  const clean = String(rel).replace(/^[/\\]+/, '').replace(/^workspace[/\\]/i, '');
  const abs = path.resolve(WORKSPACE_DIR, clean);
  if (abs !== WORKSPACE_DIR && !abs.startsWith(WORKSPACE_DIR + path.sep)) throw new Error('workspace dışına erişim yasak');
  return abs;
}

export function relPath(abs) {
  return path.relative(WORKSPACE_DIR, abs).replace(/\\/g, '/');
}

export function writeFile(rel, content) {
  const abs = safePath(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return relPath(abs);
}

export function readFile(rel, max = 8000) {
  const abs = safePath(rel);
  if (!fs.existsSync(abs)) throw new Error('dosya yok: ' + rel);
  const st = fs.statSync(abs);
  if (st.isDirectory()) throw new Error('bu bir klasör');
  const txt = fs.readFileSync(abs, 'utf8');
  return txt.length > max ? txt.slice(0, max) + `\n…[${txt.length - max} karakter kesildi]` : txt;
}

export function listFiles(rel = '.', depth = 2) {
  const root = safePath(rel);
  if (!fs.existsSync(root)) return [];
  const out = [];
  const walk = (dir, d) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
      const p = path.join(dir, e.name);
      out.push(relPath(p) + (e.isDirectory() ? '/' : ''));
      if (e.isDirectory() && d > 1 && out.length < 300) walk(p, d - 1);
    }
  };
  walk(root, depth);
  return out.slice(0, 300);
}

/** Klasörü zip'ler (saf Node.js, Windows/macOS/Linux; harici araç gerekmez). */
export async function zipDir(relDir, relZip) {
  const src = safePath(relDir);
  const dst = safePath(relZip);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, zipDirectory(src));
  return relPath(dst);
}

export function copyInto(relFile, relDir) {
  const src = safePath(relFile);
  if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) throw new Error('dosya yok: ' + relFile);
  const dst = safePath(path.join(relDir, path.basename(src)));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return relPath(dst);
}

export function runInWorkspace(command, cwdRel = '.', timeoutMs = 60000) {
  return new Promise((resolve) => {
    let cwd;
    try {
      cwd = safePath(cwdRel || '.');
      fs.mkdirSync(cwd, { recursive: true });
    } catch (e) {
      return resolve({ code: -1, output: e.message });
    }
    const child = spawn(command, { cwd, shell: true, windowsHide: true, detached: !IS_WIN, env: { ...process.env, CI: '1' } });
    let output = '';
    const add = (b) => {
      output += b.toString();
      if (output.length > 20000) output = output.slice(-20000);
    };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    const timer = setTimeout(() => {
      output += '\n[zaman aşımı, süreç sonlandırıldı]';
      killTree(child);
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, output: e.message });
    });
  });
}
