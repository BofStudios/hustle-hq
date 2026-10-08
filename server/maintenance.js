// Veri dışa aktarma (yedek zip) ve şirketi sıfırlama. Sıfırlamadan önce her zaman otomatik yedek alınır.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, WORKSPACE_DIR } from './config.js';
import { zipBuffers } from './zip.js';
import { flush } from './store.js';
import { company, agents, tasks, deliverables, approvals, ledger, decisions, graveyard, persist } from './state.js';
import { portfolio, resetPortfolio } from './market.js';
import { ensureRoster } from './economy.js';
import { emit } from './bus.js';

function collect(dir, prefix, skip) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (skip.includes(e.name)) continue;
      const a = path.join(abs, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(a, r);
      else if (e.isFile() && !e.name.endsWith('.tmp')) out.push({ name: `${prefix}/${r}`, data: fs.readFileSync(a), mtime: fs.statSync(a).mtime });
    }
  };
  walk(dir, '');
  return out;
}

/** Şirket verisi + workspace → tek zip (API anahtarları/.env asla dahil değil). */
export function exportZip() {
  flush();
  const entries = [
    ...collect(DATA_DIR, 'data', ['backups']),
    ...collect(WORKSPACE_DIR, 'workspace', ['node_modules', '.git']),
  ];
  entries.push({ name: 'README.txt', data: Buffer.from(`Hustle HQ backup ${new Date().toISOString()}\nRestore: stop the app, copy data/ and workspace/ into the Hustle HQ folder, start again.\nAPI keys (.env) are intentionally NOT included.\n`) });
  return zipBuffers(entries);
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Şirketi sıfırlar: önce data/backups/ altına otomatik yedek, sonra temiz kurulum. Workspace dosyaları korunur. */
export function resetCompany() {
  const backupDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `before-reset-${stamp()}.zip`);
  fs.writeFileSync(file, exportZip());

  for (const arr of [agents, tasks, deliverables, approvals, decisions, graveyard]) arr.splice(0, arr.length);
  ledger.entries.splice(0, ledger.entries.length);
  const keepLang = company.settings?.lang;
  Object.assign(company, {
    name: 'Hustle HQ', createdAt: Date.now(), goal: null, goalQueue: [], lastReportDay: null,
    settings: { burnPerHour: 2, autoHire: true, proactiveMinutes: 12, paused: false, lang: keepLang },
    setupDone: false,
  });
  resetPortfolio(portfolio.startCapital || 100000);
  ensureRoster();
  persist('company', 'agents', 'tasks', 'deliverables', 'approvals', 'ledger', 'decisions', 'graveyard');
  flush();
  emit('reload', { reason: 'reset' });
  return { backup: path.relative(DATA_DIR, file).replace(/\\/g, '/') };
}
