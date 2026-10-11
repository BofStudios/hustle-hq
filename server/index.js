// Hustle HQ sunucusu: statik dosyalar + REST API + WebSocket.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { env, num, setEnv, PUBLIC_DIR, WORKSPACE_DIR } from './config.js';
import { flush, readLogTail } from './store.js';
import { bus, emit } from './bus.js';
import {
  snapshot, agents, company, tasks, deliverables, persist, approvals, findAgent, agentById, createTask, updateTask, updateAgent, publicAgent,
} from './state.js';
import { ensureRoster, rateDeliverable, recordRevenue, fire, revive, replace, recordAdResult } from './economy.js';
import { topUp, withdraw, allocate, distribute, walletView, fund, safetyStatus, acceptSafety } from './wallet.js';
import { currentWeather, treatById, pizzaParty } from './life.js';
import { strategyView, setProfile, dropStrategy, setTodo, recordIncome, recordPayout } from './strategies.js';
import { startRuntime, chatWithAgent, setGoal, dailyReportCheck } from './agents/runtime.js';
import { decideApproval, pendingCount } from './approvals.js';
import { providerStatus, isDemo, probeOllama, testProvider, ALIASES } from './providers/router.js';
import { PROVIDERS } from './providers/catalog.js';
import { runClaude, claudeStatus, stopClaude } from './claude.js';
import { portfolioView, quote, resetPortfolio, paperTrade, fxRate } from './market.js';
import { safePath } from './agents/sandbox.js';
import { ROLES } from './agents/roster.js';
import { load, save } from './store.js';
import { exportZip, resetCompany } from './maintenance.js';
import { startLemonSqueezy, syncOrders, syncProducts, linkProduct, lsStatus } from './lemonsqueezy.js';

const PORT = num('PORT', 3777);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

ensureRoster();
await probeOllama();
startRuntime();
startLemonSqueezy();
setInterval(probeOllama, 5 * 60 * 1000).unref();

// ---------------- yardımcılar ----------------
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  let s = '';
  for await (const c of req) {
    s += c;
    if (s.length > 2e6) throw new Error('gövde çok büyük');
  }
  return s ? JSON.parse(s) : {};
}

// ---------------- REST ----------------
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });

route('GET', '/api/health', () => ({ ok: true, demo: isDemo(), agents: agents.length }));
route('GET', '/api/snapshot', () => ({ ...snapshot(), providers: providerStatus(), demo: isDemo(), claude: claudeStatus(), pending: pendingCount() }));
route('GET', '/api/meta', () => ({ roles: ROLES, aliases: ALIASES, providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, free: p.free, signup: p.signup, keyEnv: p.keyEnv, models: p.models })) }));

route('POST', '/api/goal', async (b) => ({ goal: setGoal(b.text) }));
route('POST', '/api/goals/queue', async (b) => {
  company.goalQueue ||= [];
  const op = b.op || 'add';
  if (op === 'add') {
    const text = String(b.text || '').trim().slice(0, 600);
    if (!text) throw new Error('goal is empty');
    if (!company.goal) setGoal(text); // aktif hedef yoksa direkt başlar
    else company.goalQueue.push(text);
  } else if (op === 'remove') company.goalQueue.splice(Number(b.index), 1);
  else if (op === 'move') {
    const i = Number(b.index), j = i + (b.dir === 'up' ? -1 : 1);
    if (j >= 0 && j < company.goalQueue.length) [company.goalQueue[i], company.goalQueue[j]] = [company.goalQueue[j], company.goalQueue[i]];
  }
  company.goalQueue = company.goalQueue.slice(0, 20);
  persist('company');
  emit('company', company);
  return company;
});
route('POST', '/api/report/now', async () => ({ task: dailyReportCheck(true) }));

route('POST', '/api/tasks', async (b) => {
  const a = findAgent(b.assignee);
  if (!a) throw new Error('agent not found');
  if (ROLES[a.role].manual) throw new Error('Claude için /api/claude kullan');
  const t = createTask({ title: b.title, detail: b.detail || '', assignee: a.id, createdBy: 'Boss', priority: 3 });
  a.nextRunAt = Date.now() + 1000;
  return t;
});
route('POST', '/api/tasks/:id/cancel', async (b, p) => {
  const t = tasks.find((x) => x.id === p.id);
  if (!t) throw new Error('görev yok');
  updateTask(t, { status: 'failed', result: 'Patron iptal etti' });
  return t;
});

route('GET', '/api/agents/:id/log', (b, p, q) => readLogTail(`agent-${p.id}`, Number(q.get('n')) || 150));
route('POST', '/api/agents/:id/chat', async (b, p) => {
  const a = agentById(p.id);
  if (!a) throw new Error('ajan yok');
  return chatWithAgent(a, String(b.text || '').slice(0, 2000));
});
route('POST', '/api/agents/:id/fire', async (b, p) => { fire(agentById(p.id)); return { ok: true }; });
route('POST', '/api/agents/:id/revive', async (b, p) => { revive(agentById(p.id)); return { ok: true }; });
route('POST', '/api/agents/:id/hire', async (b, p) => ({ agent: publicAgent(replace(agentById(p.id))) }));
route('POST', '/api/agents/:id/engine', async (b, p) => {
  const a = agentById(p.id);
  if (!a) throw new Error('ajan yok');
  const chain = (Array.isArray(b.chain) ? b.chain : []).map(String).filter(Boolean).slice(0, 8);
  updateAgent(a, { chain });
  return publicAgent(a);
});
route('POST', '/api/agents/:id/look', async (b, p) => {
  const a = agentById(p.id);
  if (!a) throw new Error('ajan yok');
  updateAgent(a, { look: { ...a.look, ...b.look }, name: b.name ? String(b.name).slice(0, 16) : a.name });
  return publicAgent(a);
});

route('POST', '/api/approvals/:id', async (b, p) => decideApproval(p.id, !!b.approve, String(b.answer || '').slice(0, 2000), { confirmAmount: b.confirmAmount }));
route('GET', '/api/safety', () => safetyStatus());
route('POST', '/api/safety/ack', async () => acceptSafety());
// masaüstü kısayolundan açılan sunucuyu arayüzden kapatmak için (sadece yerel, CSRF korumalı)
route('POST', '/api/shutdown', async () => { setTimeout(() => { flush(); process.exit(0); }, 300); return { ok: true }; });

route('POST', '/api/deliverables/:id/rate', async (b, p) => {
  const d = deliverables.find((x) => x.id === p.id);
  if (!d) throw new Error('teslim yok');
  rateDeliverable(d, Number(b.stars));
  return d;
});
route('GET', '/api/files', (b, p, q) => {
  const rel = (q.get('path') || '').replace(/^[/\\]+/, '');
  const abs = safePath(rel || '.');
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error('klasör yok');
  const entries = fs.readdirSync(abs, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
    .map((e) => {
      const st = fs.statSync(path.join(abs, e.name));
      return { name: e.name, dir: e.isDirectory(), size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, c) => Number(c.dir) - Number(a.dir) || c.mtime - a.mtime)
    .slice(0, 500);
  return { path: rel.replace(/\\/g, '/'), entries };
});
route('GET', '/api/file', (b, p, q) => {
  const abs = safePath(q.get('path') || '');
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) throw new Error('dosya yok');
  return { __file: abs };
});

route('POST', '/api/agents/:id/budget', async (b, p) => {
  const a = agentById(p.id);
  if (!a) throw new Error('ajan yok');
  return allocate(a, b.amount, { by: company.boss?.name || 'Boss', inPerson: !!b.inPerson });
});
route('POST', '/api/agents/:id/treat', async (b, p) => treatById(p.id, String(b.kind || '')));
route('POST', '/api/team/pizza', async () => pizzaParty());
route('GET', '/api/wallet', () => walletView());
route('POST', '/api/wallet/topup', async (b) => { topUp(b.amount, { method: b.method, note: b.note }); return walletView(); });
route('POST', '/api/wallet/withdraw', async (b) => { withdraw(b.amount, b.note); return walletView(); });
route('POST', '/api/wallet/distribute', async (b) => ({ split: distribute(b.amount, b.mode === 'performance' ? 'performance' : 'equal'), wallet: walletView() }));
route('GET', '/api/world', async () => ({ weather: await currentWeather(), t: Date.now() }));
route('GET', '/api/strategy', () => strategyView());
route('POST', '/api/strategy/profile', async (b) => { setProfile(b); return strategyView(); });
route('POST', '/api/strategy/:id/drop', async (b, p) => { dropStrategy(p.id, b.reason, company.boss?.name || 'Boss'); return strategyView(); });
route('POST', '/api/strategy/:id/todo', async (b, p) => { setTodo(p.id, Number(b.i), !!b.done); return strategyView(); });
route('POST', '/api/income', async (b) => recordIncome({ amount: b.amount, currency: b.currency, source: b.source, strategyId: b.strategyId || null, note: b.note }));
route('POST', '/api/payout', async (b) => recordPayout({ amount: b.amount, currency: b.currency, platform: b.platform, account: b.account }));
route('GET', '/api/fx', async (b, p, q) => fxRate(q.get('from') || 'USD', q.get('to') || company.currency));
route('POST', '/api/wallet/fund', async (b) => fund({ amount: b.amount, currency: b.currency, split: b.split, note: b.note }));
route('POST', '/api/ads/:id/result', async (b, p) => {
  const apr = approvals.find((x) => x.id === p.id);
  if (!apr) throw new Error('reklam bulunamadı');
  recordAdResult(apr, b);
  persist('approvals');
  emit('approval:update', apr);
  return apr;
});
route('GET', '/api/export', () => ({ __buffer: exportZip(), __name: `hustle-hq-backup-${new Date().toISOString().slice(0, 10)}.zip`, __type: 'application/zip' }));
route('POST', '/api/reset', async (b) => {
  if (b.confirm !== 'RESET') throw new Error('onay metni hatalı');
  return resetCompany();
});
route('GET', '/api/lemonsqueezy', () => lsStatus());
route('POST', '/api/lemonsqueezy/key', async (b) => { setEnv('LEMONSQUEEZY_API_KEY', b.key); await syncProducts(); return syncOrders(); });
route('POST', '/api/lemonsqueezy/sync', async () => { await syncProducts(); return syncOrders(); });
route('POST', '/api/lemonsqueezy/link', async (b) => linkProduct(b.productId, b.deliverableId));
route('POST', '/api/ledger/deposit', async (b) => { topUp(b.amount, { note: b.note, method: b.method }); return { ok: true }; });
route('POST', '/api/ledger/revenue', async (b) => { recordRevenue(b.amount, b.note, b.deliverableId); return { ok: true }; });

// İlk kurulum sihirbazı: alıcı kendi şirket bilgilerini girer. Anahtarlar ayrı uçtan (/api/providers/key) gelir.
route('POST', '/api/setup', async (b) => {
  const lang = b.lang === 'tr' ? 'tr' : 'en';
  setEnv('LANG', lang);
  if (b.name) company.name = String(b.name).trim().slice(0, 40) || company.name;
  if (b.currency) company.currency = String(b.currency).trim().slice(0, 4) || company.currency;
  if (b.bossName) company.boss = { ...company.boss, name: String(b.bossName).trim().slice(0, 20) || 'Boss' };
  company.setupDone = true;
  company.setupAt ||= Date.now();
  persist('company');
  emit('company', company);
  return company;
});
route('POST', '/api/company', async (b) => {
  if (b.name) company.name = String(b.name).slice(0, 40);
  if (b.currency) company.currency = String(b.currency).slice(0, 4);
  if (b.boss) company.boss = { ...company.boss, ...b.boss, look: { ...company.boss.look, ...(b.boss.look || {}) } };
  if (b.settings) {
    const s = b.settings;
    if (s.burnPerHour != null) company.settings.burnPerHour = Math.max(0, Math.min(50, Number(s.burnPerHour)));
    if (s.proactiveMinutes != null) company.settings.proactiveMinutes = Math.max(2, Math.min(240, Number(s.proactiveMinutes)));
    if (s.autoHire != null) company.settings.autoHire = !!s.autoHire;
    if (s.paused != null) company.settings.paused = !!s.paused;
    if (s.weather != null) company.settings.weather = ['auto', 'real', 'clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'].includes(s.weather) ? s.weather : 'auto';
    if (s.safety) {
      const cur = company.settings.safety || {};
      const num0 = (v, lo, hi) => (v === '' || v == null || !Number.isFinite(Number(v)) ? undefined : Math.max(lo, Math.min(hi, Number(v))));
      const next = { dailyCap: num0(s.safety.dailyCap, 0, 1e9), stopLossPct: num0(s.safety.stopLossPct, 0, 100), bigSpendPct: num0(s.safety.bigSpendPct, 0, 100) };
      company.settings.safety = { ...cur, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) };
    }
    if (s.city != null) company.settings.city = String(s.city).replace(/[^\p{L}\p{N} ,.'-]/gu, '').trim().slice(0, 60);
  }
  persist('company');
  emit('company', company);
  return company;
});

route('GET', '/api/providers', () => ({ demo: isDemo(), list: providerStatus() }));
route('POST', '/api/providers/key', async (b) => {
  const p = PROVIDERS.find((x) => x.id === b.id);
  if (!p?.keyEnv) throw new Error('bu sağlayıcı anahtar almaz');
  setEnv(p.keyEnv, b.key);
  emit('providers', { demo: isDemo(), list: providerStatus() });
  return { ok: true, demo: isDemo() };
});
route('POST', '/api/providers/:id/test', async (b, p) => testProvider(p.id));
route('POST', '/api/settings/env', async (b) => {
  const allowed = ['MAX_CONCURRENT', 'TICK_SECONDS', 'FORCE_DEMO', 'LANG', 'OLLAMA_MODEL', 'OLLAMA_URL', 'CLAUDE_DAILY_LIMIT'];
  for (const [k, v] of Object.entries(b)) if (allowed.includes(k)) setEnv(k, v);
  if ('OLLAMA_MODEL' in b || 'OLLAMA_URL' in b) await probeOllama();
  emit('providers', { demo: isDemo(), list: providerStatus() });
  return { ok: true };
});
route('GET', '/api/engines', () => load('engines', { aliasOverrides: {} }));
route('POST', '/api/engines', async (b) => {
  save('engines', { aliasOverrides: b.aliasOverrides || {} });
  return { ok: true };
});

route('GET', '/api/claude', () => claudeStatus());
route('POST', '/api/claude', async (b) => {
  runClaude({ prompt: b.prompt, project: b.project || 'claude' }).catch(() => {});
  return { ok: true };
});
route('POST', '/api/claude/stop', async () => { stopClaude(); return { ok: true }; });

route('GET', '/api/portfolio', () => portfolioView());
route('GET', '/api/quote/:sym', (b, p) => quote(p.sym));
route('POST', '/api/portfolio/reset', async (b) => { resetPortfolio(b.capital); return portfolioView(); });
route('POST', '/api/portfolio/trade', async (b) => paperTrade({ symbol: b.symbol, side: b.side, qty: b.qty, reason: 'Patron', by: company.boss.name || 'Boss' }));

// ---------------- HTTP ----------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // yalnızca yerel istemciler (ürün yerel çalışır)
  const ra = req.socket.remoteAddress || '';
  if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ra)) {
    res.writeHead(403);
    return res.end('local only');
  }
  if (url.pathname.startsWith('/api/')) {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) return send(res, 404, { error: 'yok' });
    // CSRF: tarayıcıdan gelen POST'lar sadece aynı origin'den
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return send(res, 403, { error: 'origin' });
    }
    try {
      const body = req.method === 'GET' ? {} : await readBody(req);
      const out = await r.fn(body, url.pathname.match(r.re).groups || {}, url.searchParams);
      if (out?.__buffer) {
        res.writeHead(200, { 'Content-Type': out.__type || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${out.__name || 'download.bin'}"`, 'Cache-Control': 'no-store' });
        return res.end(out.__buffer);
      }
      if (out?.__file) {
        // Ajanların yazdığı dosyalar güvenilmez: izole (opaque) kökende açılır, API'ye erişemez,
        // kendi onay kartını onaylayamaz. Origin "null" olduğu için POST'lar origin kontrolünde reddedilir.
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(out.__file).toLowerCase()] || 'application/octet-stream',
          'Content-Security-Policy': 'sandbox allow-scripts allow-popups; connect-src \'none\'',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        });
        return fs.createReadStream(out.__file).pipe(res);
      }
      return send(res, 200, out ?? { ok: true });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }
  // statik
  let p = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
  if (!p.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'yasak' });
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
});

// ---------------- WebSocket ----------------
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  ws.send(JSON.stringify({ type: 'snapshot', payload: { ...snapshot(), providers: providerStatus(), demo: isDemo(), claude: claudeStatus(), pending: pendingCount() } }));
});
bus.on('client', (msg) => {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
});
setInterval(() => emit('tick', { t: Date.now(), pending: pendingCount(), claude: claudeStatus() }), 5000).unref();

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`
  ⚠️  Port ${PORT} kullanımda. Hustle HQ zaten açık olabilir: http://localhost:${PORT}`);
    console.error(`  ⚠️  Port ${PORT} is busy. Hustle HQ may already be running. Change PORT in .env to run another copy.
`);
    process.exit(1);
  }
  console.error('[sunucu]', e);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  🏢 Hustle HQ is running → http://localhost:${PORT}`);
  console.log(`  Mode: ${isDemo() ? 'DEMO (no API key yet — add one in Admin > Engines)' : 'LIVE'}`);
  console.log(`  Workspace: ${WORKSPACE_DIR}\n`);
});

// 7/24 çalışma: tek bir beklenmeyen hata tüm ofisi düşürmesin
process.on('uncaughtException', (e) => console.error('[hata]', e?.stack || e));
process.on('unhandledRejection', (e) => console.error('[promise]', e?.stack || e));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
