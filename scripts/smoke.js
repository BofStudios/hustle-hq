// Uçtan uca test: sunucuyu geçici bir klasörde DEMO modunda başlatır ve tüm akışı gerçekten dener.
// Kullanıcının data/, workspace/ ve .env dosyalarına dokunmaz. Çalıştır: npm run smoke
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hustlehq-smoke-'));
const PORT = 3900 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;

let failed = 0;
let passed = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  cond ? passed++ : failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p) => fetch(BASE + p);
const getJ = async (p) => (await get(p)).json();
const post = (p, body, headers = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });
const postJ = async (p, body) => (await post(p, body)).json();
async function waitFor(fn, ms = 45000, step = 1000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(step);
  }
  return null;
}

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    HQ_DATA_DIR: path.join(TMP, 'data'),
    HQ_WORKSPACE_DIR: path.join(TMP, 'workspace'),
    HQ_ENV_FILE: path.join(TMP, '.env'),
    PORT: String(PORT),
    FORCE_DEMO: '1',
    LANG: 'en',
    TICK_SECONDS: '2',
    OLLAMA_URL: 'http://127.0.0.1:9/v1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

async function main() {
  const health = await waitFor(() => getJ('/api/health'), 20000, 300);
  ok('Sunucu açıldı (/api/health)', health?.ok === true);
  if (!health) throw new Error('sunucu açılmadı:\n' + serverLog);
  ok('Anahtar yokken DEMO modu', health.demo === true);

  let s = await getJ('/api/snapshot');
  ok('10 ajan işe alındı', s.agents.length === 10, `${s.agents.length}`);
  ok('İlk açılışta kurulum sihirbazı bekleniyor', !s.company.setupDone);
  await sleep(4000);
  s = await getJ('/api/snapshot');
  ok('Kurulum bitmeden ajanlar çalışmaz', s.tasks.length === 0, `${s.tasks.length} görev`);

  // --- kurulum
  const co = await postJ('/api/setup', { lang: 'en', name: 'Smoke Corp', currency: '$', bossName: 'Tester' });
  ok('Kurulum: şirket bilgileri kaydedildi', co.setupDone && co.name === 'Smoke Corp' && co.currency === '$' && co.boss.name === 'Tester');

  // --- hedef → plan → teslimler
  await postJ('/api/goal', { text: 'Ship a template we can sell this week' });
  const planned = await waitFor(async () => {
    const x = await getJ('/api/snapshot');
    return x.tasks.filter((t) => t.createdBy === 'Max').length >= 4 ? x : null;
  });
  ok('Max hedefi görevlere böldü', !!planned, planned ? `${planned.tasks.filter((t) => t.createdBy === 'Max').length} görev` : 'zaman aşımı');
  const delivered = await waitFor(async () => {
    const x = await getJ('/api/snapshot');
    return x.deliverables.length >= 3 ? x : null;
  }, 60000);
  ok('Ajanlar teslim üretti', !!delivered, delivered ? `${delivered.deliverables.length} teslim` : 'zaman aşımı');
  s = await getJ('/api/snapshot');
  ok('Demo içerik seçilen dilde (EN)', s.tasks.some((t) => /revenue ideas|sales page|Launch copy/i.test(t.title)));

  // --- kasa ve bütçe
  await postJ('/api/ledger/deposit', { amount: 1000, note: 'test' });
  s = await getJ('/api/snapshot');
  ok('Kasaya bütçe eklendi', s.ledger.balance === 1000, `${s.ledger.balance}`);
  const mkt = s.agents.find((a) => a.role === 'marketing');
  const b1 = await postJ(`/api/agents/${mkt.id}/budget`, { amount: 300 });
  ok('Ajana bütçe tahsis edildi', b1.budget === 300);
  const b2 = await post(`/api/agents/${mkt.id}/budget`, { amount: 5000 });
  ok('Kasadan fazla bütçe reddedildi', b2.status === 400);

  // --- cüzdan (v1.1): yükleme, dağıtım, kâr çekme, bütçe talebi — hepsi defter kaydı
  let w = await postJ('/api/wallet/topup', { amount: 500, method: 'atm', note: 'atm test' });
  ok('Cüzdan: ATM ile bakiye yüklendi', w.balance === 1500 && w.capital === 1500, `kasa ${w.balance}`);
  ok('Cüzdan: serbest bakiye = kasa − ajan bütçeleri', w.allocated === 300 && w.free === 1200, `serbest ${w.free}`);
  const dist = await postJ('/api/wallet/distribute', { amount: 700, mode: 'performance' });
  ok('Cüzdan: ekibe performansa göre dağıtıldı', dist.split?.length >= 7 && dist.wallet?.free === 500 && dist.wallet?.balance === 1500, `${dist.split?.length} ajan, serbest ${dist.wallet?.free}`);
  const tooMuch = await post('/api/wallet/withdraw', { amount: 600 });
  ok('Cüzdan: serbest bakiyeden fazla kâr çekilemez', tooMuch.status === 400);
  w = await postJ('/api/wallet/withdraw', { amount: 200, note: 'profit' });
  ok('Cüzdan: kâr çekildi, kasa azaldı', w.balance === 1300 && w.withdrawn === 200 && w.free === 300, `kasa ${w.balance}`);
  s = await getJ('/api/snapshot');
  const mktNow = s.agents.find((a) => a.id === mkt.id);
  const back = await postJ(`/api/agents/${mkt.id}/budget`, { amount: -mktNow.budget });
  ok('Cüzdan: ajandan bütçe geri alındı', back.budget === 0 && s.ledger.free === 300, `${mktNow.budget} → ${back.budget}`);
  await postJ('/api/tasks', { title: 'Ad campaign: smoke launch', detail: 'small test', assignee: mkt.id });
  const budgetReq = await waitFor(async () => {
    const x = await getJ('/api/snapshot');
    return x.approvals.find((a) => a.kind === 'budget' && a.status === 'pending') || null;
  }, 60000);
  ok('Bütçesiz ajan patrondan bütçe istedi', !!budgetReq, budgetReq?.title || 'zaman aşımı');
  if (budgetReq) {
    const d = await postJ(`/api/approvals/${budgetReq.id}`, { approve: true });
    s = await getJ('/api/snapshot');
    ok('Bütçe talebi onaylanınca ajana ayrıldı', d.status === 'approved' && s.agents.find((a) => a.id === mkt.id).budget === budgetReq.payload.amount, d.result || '');
  }
  const t1 = await postJ(`/api/agents/${mkt.id}/treat`, { kind: 'coffee' });
  const t2 = await postJ(`/api/agents/${mkt.id}/treat`, { kind: 'coffee' });
  ok('Patron kahve ısmarladı (bekleme süresi var)', t1.ok === true && t2.ok === false && t2.cooldown > 0);
  const pz = await postJ('/api/team/pizza');
  const pz2 = await postJ('/api/team/pizza');
  ok('Pizza partisi (günde bir)', pz.ok === true && pz.people >= 8 && pz2.ok === false);
  const world = await getJ('/api/world');
  // --- gerçek para güvenlik rayları
  await postJ('/api/tasks', { title: 'Ad campaign: second test', detail: 'within budget', assignee: mkt.id });
  const adApr = await waitFor(async () => {
    const x = await getJ('/api/snapshot');
    return x.approvals.find((a) => a.kind === 'ad' && a.status === 'pending') || null;
  }, 60000);
  ok('Bütçeli ajan reklam planını onaya gönderdi', !!adApr, adApr?.title || 'zaman aşımı');
  if (adApr) {
    await postJ('/api/company', { settings: { safety: { dailyCap: 10 } } });
    const capped = await post(`/api/approvals/${adApr.id}`, { approve: true });
    const capMsg = (await capped.json()).error || '';
    ok('Günlük harcama limiti aşan reklam onaylanmadı', capped.status === 400 && /DAILY CAP/.test(capMsg), capMsg.slice(0, 60));
    await postJ('/api/company', { settings: { safety: { dailyCap: 1000, bigSpendPct: 1 } } });
    const big = await post(`/api/approvals/${adApr.id}`, { approve: true });
    ok('Büyük harcamada tutar teyidi isteniyor', big.status === 400 && /^CONFIRM:/.test((await big.json()).error || ''));
    const okd = await postJ(`/api/approvals/${adApr.id}`, { approve: true, confirmAmount: adApr.payload.amount });
    ok('Tutar yazılınca onaylandı, defterden düştü', okd.status === 'approved');
    const sf = await getJ('/api/safety');
    ok('Güvenlik durumu bugünkü harcamayı gösteriyor', sf.today === adApr.payload.amount && sf.dailyCap === 1000);
  }
  const noAck = await post('/api/wallet/fund', { amount: 100, currency: 'USD', split: 0.5 });
  ok('Güvenlik kuralları onaylanmadan fonlama reddedildi', noAck.status === 400);
  await postJ('/api/safety/ack');
  const badCur = await post('/api/wallet/fund', { amount: 100, currency: 'GBP' });
  ok('Sadece TRY / USD / EUR ile aktarım', badCur.status === 400);
  const fx = await getJ('/api/fx?from=USD&to=$');
  ok('Kur: aynı para biriminde 1:1', fx.rate === 1 && fx.from === 'USD' && fx.to === 'USD');
  const fd = await postJ('/api/wallet/fund', { amount: 100, currency: 'USD', split: 0.5 });
  ok('Girişte fonlama: kasaya yazıldı, yarısı ekibe dağıtıldı, Max plan aldı', fd.converted === 100 && fd.split?.length >= 7 && /^PLAN: Put the new budget to work/.test(fd.task?.title || ''), `${fd.converted} · ${fd.split?.length} ajan`);
  const pfv = await getJ('/api/portfolio');
  ok('Sanal portföy şirket para biriminde (USD)', pfv.base === 'USD' && pfv.startCapital === 10000, `${pfv.base} ${pfv.startCapital}`);
  ok('Dünya: hava durumu (simülasyon)',['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'].includes(world.weather?.kind) && world.weather.source === 'sim', `${world.weather?.kind} ${world.weather?.temp}°`);

  // --- onay kuyruğu
  const pending = await waitFor(async () => {
    const x = await getJ('/api/snapshot');
    return x.approvals.find((a) => a.status === 'pending') || null;
  }, 40000);
  ok('Dışarı giden iş onaya düştü', !!pending, pending?.title || 'zaman aşımı');
  if (pending) {
    const d = await postJ(`/api/approvals/${pending.id}`, { approve: true, answer: 'ok' });
    ok('Onay çalışıyor', d.status === 'approved');
  }

  // --- puan, gelir, XP
  s = await getJ('/api/snapshot');
  const dlv = s.deliverables[0];
  const ownerBefore = s.agents.find((a) => a.id === dlv.agentId);
  await postJ(`/api/deliverables/${dlv.id}/rate`, { stars: 5 });
  await postJ('/api/ledger/revenue', { amount: 250, note: 'test sale', deliverableId: dlv.id });
  s = await getJ('/api/snapshot');
  const ownerAfter = s.agents.find((a) => a.id === dlv.agentId);
  ok('Gerçek gelir kaydedildi', s.ledger.revenue === 250);
  ok('Teslim sahibi ödül aldı (gelir + XP)', ownerAfter.stats.revenue === 250 && (ownerAfter.stats.xp || 0) > (ownerBefore.stats.xp || 0), `xp ${ownerBefore.stats.xp || 0}→${ownerAfter.stats.xp}`);

  // --- strateji motoru (v1.2): ajanlar para kazanma yolunu kendileri seçer
  const prof = await postJ('/api/strategy/profile', { skills: 'design, video editing, English', hours: 12, accounts: ['fiverr', 'youtube'], risk: 'low', special20b: true, ibanLabel: 'TR00 0000 0000 0000 0000 0000 00' });
  ok('Strateji: profil kaydedildi, tam IBAN saklanmadı', prof.profile?.accounts?.length === 2 && !/\d{8}/.test(prof.profile.ibanLabel) && /\*\*\*\*/.test(prof.profile.ibanLabel), prof.profile?.ibanLabel);
  const chosen = await waitFor(async () => {
    const x = await getJ('/api/strategy');
    return x.strategies.filter((st) => st.status !== 'dropped').length ? x : null;
  }, 70000);
  ok('Strateji: Max kendi başına para kazanma yolu seçti', !!chosen, chosen ? chosen.strategies.map((st) => st.name).join(', ') : 'zaman aşımı');
  if (chosen) {
    const st1 = chosen.strategies.find((st) => st.status !== 'dropped');
    ok('Strateji: patrona kimlik gerektiren yapılacaklar düştü', st1.todos.length >= 1 && st1.todos.every((t) => !t.done));
    s = await getJ('/api/snapshot');
    ok('Strateji: ekibe stratejiye özel görevler dağıtıldı', s.tasks.some((t) => t.title.startsWith(`${st1.name}:`)));
    const revBefore = s.ledger.revenue;
    const balBefore = s.ledger.balance;
    const inc = await postJ('/api/income', { amount: 50, currency: 'USD', source: 'Fiverr', strategyId: st1.id });
    ok('Strateji: gerçek gelir stratejiye yazıldı', inc.strategies.find((x) => x.id === st1.id)?.income === 50 && inc.earned === revBefore + 50);
    const po = await postJ('/api/payout', { amount: 40, currency: 'USD', platform: 'Fiverr' });
    s = await getJ('/api/snapshot');
    ok('IBAN ödemesi: platformda bekleyen azaldı, kasa değişmedi', po.paid === 40 && po.waiting === po.earned - 40 && s.ledger.balance === balBefore + 50, `bekleyen ${po.waiting}`);
    ok('20/B: tahmini %15 stopaj gösteriliyor', po.withholdingEstimate === 6);
    for (const st of chosen.strategies.filter((x) => x.status !== 'dropped')) await postJ(`/api/strategy/${st.id}/drop`, { reason: 'test pivot' });
    const pivot = await waitFor(async () => {
      const x = await getJ('/api/strategy');
      return x.strategies.some((st) => st.status !== 'dropped') ? x : null;
    }, 70000);
    ok('Pivot: tüm yollar bırakılınca Max yeni strateji seçti', !!pivot && pivot.strategies.filter((st) => st.status === 'dropped').length >= 1, pivot ? pivot.strategies.filter((st) => st.status !== 'dropped').map((st) => st.name).join(', ') : 'zaman aşımı');
  }

  // --- hedef kuyruğu ve rapor
  const q = await postJ('/api/goals/queue', { op: 'add', text: 'Second goal' });
  ok('Hedef kuyruğa eklendi', q.goalQueue?.length === 1);
  const rep = await postJ('/api/report/now');
  ok('Günlük rapor görevi oluştu', !!rep.task && rep.task.title.startsWith('Daily report'));

  // --- dosyalar ve güvenlik
  const files = await getJ('/api/files?path=');
  ok('Dosya gezgini workspace’i listeliyor', files.entries?.length > 0, `${files.entries?.length} öğe`);
  const withPath = s.deliverables.find((d) => d.path);
  if (withPath) {
    const r = await get(`/api/file?path=${encodeURIComponent(withPath.path)}`);
    ok('Ajan dosyası CSP sandbox ile sunuluyor', r.status === 200 && /sandbox/.test(r.headers.get('content-security-policy') || ''));
  }
  const trav = await get('/api/file?path=' + encodeURIComponent('../.env'));
  ok('Workspace dışına dosya okuma engelli', trav.status === 400);
  const trav2 = await get('/api/files?path=' + encodeURIComponent('../../'));
  ok('Workspace dışı klasör listeleme engelli', trav2.status === 400);
  const csrf = await post('/api/ledger/deposit', { amount: 1 }, { Origin: 'https://evil.example' });
  ok('Başka siteden gelen istek (CSRF) engelli', csrf.status === 403);
  const sbx = await post('/api/ledger/deposit', { amount: 1 }, { Origin: 'null' });
  ok('Sandbox içindeki ajan sayfası API’ye yazamaz', sbx.status === 403);
  const st = await get('/%2e%2e/server/index.js');
  ok('Statik dosyalarda dizin atlama engelli', st.status === 403 || st.status === 404);
  const idx = await get('/');
  ok('Oyun sayfası sunuluyor', idx.status === 200 && /<canvas id="game">/.test(await idx.text()));
  const prov = await getJ('/api/providers');
  ok('Sağlayıcı listesi anahtar sızdırmıyor', !JSON.stringify(prov).match(/sk-|AIza|gsk_/));

  // --- WebSocket
  const wsSnap = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const t = setTimeout(() => { ws.terminate(); resolve(null); }, 5000);
    ws.on('message', (m) => {
      const j = JSON.parse(m);
      if (j.type === 'snapshot') { clearTimeout(t); ws.close(); resolve(j.payload); }
    });
    ws.on('error', () => resolve(null));
  });
  ok('WebSocket canlı veri gönderiyor', wsSnap?.agents?.length === 10);

  // --- yedek ve sıfırlama
  const ex = await get('/api/export');
  const buf = Buffer.from(await ex.arrayBuffer());
  ok('Yedek zip iniyor', ex.status === 200 && buf.slice(0, 2).toString() === 'PK', `${Math.round(buf.length / 1024)} KB`);
  ok('Yedek API anahtarı/.env içermiyor', !buf.includes(Buffer.from('.env')) || !buf.includes(Buffer.from('OPENROUTER_API_KEY=')));
  const bad = await post('/api/reset', { confirm: 'nope' });
  ok('Onaysız sıfırlama reddedildi', bad.status === 400);
  const rs = await postJ('/api/reset', { confirm: 'RESET' });
  ok('Sıfırlama öncesi otomatik yedek alındı', /backups\/before-reset-.*\.zip/.test(rs.backup || ''));
  s = await getJ('/api/snapshot');
  ok('Sıfırlama sonrası temiz şirket', !s.company.setupDone && s.agents.length === 10 && s.ledger.balance === 0 && s.deliverables.length === 0);

  const crashed = /Error|TypeError|ReferenceError/.test(serverLog.replace(/\[promise\][^\n]*fetch failed[^\n]*/g, ''));
  ok('Sunucu günlüğünde hata yok', !crashed, crashed ? serverLog.split('\n').filter((l) => /Error/.test(l)).slice(0, 3).join(' | ') : '');
}

main()
  .catch((e) => { console.error('❌ Test çöktü:', e.message); failed++; })
  .finally(() => {
    try { server.kill(); } catch {}
    setTimeout(() => {
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
      console.log(`\n${passed} geçti, ${failed} başarısız`);
      process.exitCode = failed ? 1 : 0;
    }, 500);
  });
