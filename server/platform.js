// İşletim sistemi farkları tek yerde: dosya/URL/uygulama açma, süreç ağacı sonlandırma, kabuk.
import { spawn } from 'node:child_process';

export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

/** URL, klasör ya da uygulamayı varsayılan programla açar (kabuk enjeksiyonu yok: argüman dizisi). */
export function openTarget(target) {
  const t = String(target);
  let child;
  if (IS_WIN) child = spawn('cmd', ['/c', 'start', '', t], { detached: true, stdio: 'ignore', windowsHide: true });
  else if (IS_MAC) child = spawn('open', [t], { detached: true, stdio: 'ignore' });
  else child = spawn('xdg-open', [t], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

/** Süreci ve alt süreçlerini sonlandırır. */
export function killTree(child) {
  if (!child?.pid) return;
  try {
    if (IS_WIN) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
    else {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  } catch {}
}

/** Patronun onayladığı PC komutu için kabuk: Windows'ta PowerShell, diğerlerinde sh. */
export function shellSpawn(command, opts = {}) {
  if (IS_WIN) return spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, ...opts });
  return spawn('/bin/sh', ['-c', command], { detached: true, ...opts });
}

export const SHELL_NAME = IS_WIN ? 'PowerShell' : 'sh';
