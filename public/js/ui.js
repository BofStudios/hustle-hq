// Arayüz: HUD, sağ çekmece panelleri, toast, onboarding. Olay delegasyonu: data-action.
import { S, on, api, refreshLedger } from './net.js';
import { portrait, character, PAL } from './sprites.js';
import { focusAgent, followAgent, toggleScanlines, getScanlines, getReduceFx, setReduceFx } from './world.js';
import { sfx, toggleSound, soundEnabled } from './sound.js';
import { getLang, setLang } from './i18n.js';
import { weather, weatherIcon, weatherName, refreshWeather } from './life.js';

const LL = (tr0, en) => (getLang() === 'en' ? en : tr0);

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString(getLang() === 'en' ? 'en-US' : 'tr-TR');
const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  const en = getLang() === 'en';
  if (s < 60) return `${Math.floor(s)} ${en ? 's' : 'sn'}`;
  if (s < 3600) return `${Math.floor(s / 60)} ${en ? 'min' : 'dk'}`;
  if (s < 86400) return `${Math.floor(s / 3600)} ${en ? 'h' : 'sa'}`;
  return `${Math.floor(s / 86400)} ${en ? 'd' : 'g'}`;
};
const cur = () => S.company?.currency || '$';
// İngilizcede $1,250; Türkçede 1.250 ₺
const money = (n) => (getLang() === 'en' && cur().length <= 2 ? `${cur()}${fmt(n)}` : `${fmt(n)} ${cur()}`);

let current = null; // { view, arg }
const tabs = {};
let meta = { roles: {}, aliases: {}, providers: [] };

const STATUS_TR = { idle: 'Boşta', thinking: 'Düşünüyor', working: 'Çalışıyor', sleeping: 'Uyuyor (kota)', dead: 'KOVULDU', oncall: 'Çağrıda bekliyor', walking: 'Yürüyor' };
const KIND_TR = { idea: '💡 Fikir', report: '📄 Rapor', code: '💻 Kod', image: '🎨 Görsel', product: '📦 Satılık ürün' };
const APR_TR = { command: '⌨️ Komut', install: '📦 Kurulum', publish: '📣 Yayın', spend: '💸 Harcama', external: '🌐 Dış işlem', open_url: '🔗 URL aç', question: '❓ Soru', pc: '🖥️ PC kontrolü', ad: '📢 Reklam kampanyası', budget: '💼 Bütçe talebi' };
const LEDGER_TR = { deposit: '🏦 Yükleme', spend: '💸 Harcama', revenue: '💰 Gelir', withdraw: '🏧 Kâr çekme', alloc: '💼 Bütçe ayırma', payout: '🏦 IBAN ödemesi' };

// ======================= BAŞLAT =======================
export async function initUI() {
  try { meta = await api('GET', '/api/meta'); } catch {}
  document.querySelectorAll('#menu button').forEach((b) => { if (!b.title) b.title = b.querySelector('span')?.textContent || ''; else b.title = `${b.querySelector('span')?.textContent} (${b.title})`; });
  document.getElementById('menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) open(b.dataset.open);
  });
  document.addEventListener('click', onAction);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('[data-enter]')) {
      e.preventDefault();
      runAction(e.target.dataset.enter, e.target);
    }
    if (!isTyping() && current?.view === 'approvals') {
      const first = [...S.approvals.values()].find((a) => a.status === 'pending');
      if (first && (e.key === 'y' || e.key === 'Y')) decide(first.id, true);
      if (first && (e.key === 'n' || e.key === 'N')) decide(first.id, false);
    }
  });

  on('toast', (p) => toast(p.text, p.kind));
  const sb = $('#sound-btn');
  sb.textContent = soundEnabled() ? '🔊' : '🔇';
  sb.addEventListener('click', () => { sb.textContent = toggleSound() ? '🔊' : '🔇'; sb.blur(); });
  on('connection', (ok) => { $('#offline').hidden = ok; });
  let feedQueued = false;
  on('agent:log', (e) => {
    if (!feedQueued) { feedQueued = true; requestAnimationFrame(() => { feedQueued = false; renderFeed(); }); }
    if (current?.view === 'agent' && current.arg === e.agentId) appendTerm(e);
  });
  on('*', ({ type }) => {
    if (type === 'agent:log' || type === 'tick' || type === 'hp') return;
    scheduleRerender();
  });
  on('ledger', () => { walletStale = true; stratStale = true; scheduleRerender(); });
  on('strategy', () => { stratStale = true; scheduleRerender(); });
  setInterval(updateHud, 1000);
  updateHud();
}

export function isTyping() {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

export function toast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'death' || kind === 'money' ? 7000 : 4500);
  ({ money: sfx.money, death: sfx.death, hire: sfx.hire, approval: sfx.approval, done: sfx.ding, goal: sfx.ding, error: sfx.error })[kind]?.();
  while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
}

// ======================= HUD =======================
function updateHud() {
  if (!S.company) return;
  $('#company-name').textContent = S.company.name.toUpperCase();
  $('#hud-cash').textContent = money(S.ledger.balance);
  if (S.ledger.free != null) $('#hud-cash').parentElement.title = LL(`Kasa ${fmt(S.ledger.balance)} · serbest ${fmt(S.ledger.free)} · ajanlarda ${fmt(S.ledger.allocated)} ${cur()} (kayıt defteri)`, `Treasury ${fmt(S.ledger.balance)} · free ${fmt(S.ledger.free)} · with agents ${fmt(S.ledger.allocated)} ${cur()} (ledger)`);
  $('#hud-rev').textContent = money(S.ledger.revenue);
  const ag = [...S.agents.values()];
  const working = ag.filter((a) => a.status === 'working' || a.status === 'thinking').length;
  const sleeping = ag.filter((a) => a.status === 'sleeping').length;
  const dead = ag.filter((a) => a.status === 'dead').length;
  $('#hud-team').innerHTML = `<span style="color:#2ecc71">${working}⚙</span> <span style="color:#46a6ff">${sleeping}💤</span> <span style="color:#e74c3c">${dead}💀</span>`;
  const badge = $('#badge-approvals');
  badge.hidden = !S.pending;
  badge.textContent = S.pending;
  const mb = $('#mode-badge');
  mb.textContent = S.demo ? 'DEMO' : 'CANLI';
  mb.className = `mode ${S.demo ? 'demo' : 'live'}`;
  mb.title = S.demo ? 'API anahtarı yok: ajanlar şablonla çalışıyor. Motorlar menüsünden ücretsiz anahtar ekle.' : 'Gerçek modellerle çalışıyor';
  $('#prov-lights').innerHTML = S.providers.filter((p) => p.hasKey).map((p) => `<span class="${p.state}" title="${esc(p.name)}: ${p.state}"></span>`).join('') || '<span title="Motor yok"></span>';
  const d = new Date();
  const day = (getLang() === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'])[d.getDay()];
  const night = d.getHours() >= 20 || d.getHours() < 6;
  $('#clock').textContent = `${weatherIcon(night)} ${weather.temp}° · ${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  $('#clock').title = `${weatherName()}${weather.city ? ' · ' + weather.city : ''}${weather.source === 'real' ? '' : LL(' (simülasyon)', ' (simulated)')}`;
  const gb = $('#goal-bar');
  gb.hidden = !S.company.goal;
  if (S.company.goal) $('#goal-text').textContent = S.company.goal.text;
}

function renderFeed() {
  const items = S.feed.slice(-6);
  $('#feed').innerHTML = items.map((e) => {
    const a = S.agents.get(e.agentId);
    return `<div class="item ${e.kind}"><b>${esc(a?.name || '?')}</b>${esc(String(e.text).slice(0, 110))}</div>`;
  }).join('');
}

// ======================= ÇEKMECE =======================
const TITLES = {
  boss: '🎯 Boss Masası', approvals: '📥 Onay Kuyruğu', tasks: '📋 Görev Panosu', engines: '⚙️ Motorlar & Sağlayıcılar', character: '🧍 Karakterim',
  people: '👥 Kişiler', files: '🗂️ Dosyalar (workspace)', decisions: '📜 Kararlar', deliverables: '📦 Teslimler', cash: '🏦 Kasa', wallet: '💳 Cüzdan & Yatırım', strategy: '🧭 Strateji', market: '📈 Borsa Masası (Sanal)', claude: '⚡ Claude Masası', settings: '🛠️ Yönetim',
};
const ALIAS_VIEW = { servers: 'engines', whiteboard: 'tasks', archive: 'deliverables', atm: 'wallet' };

export function open(view, arg) {
  view = ALIAS_VIEW[view] || view;
  current = { view, arg };
  $('#drawer').hidden = false;
  render(true);
}
export function openAgent(id, tab) {
  if (tab) tabs[id] = tab;
  open('agent', id);
}
export function closeAll() {
  current = null;
  $('#drawer').hidden = true;
  $('#modal').hidden = true;
  document.activeElement?.blur?.();
}

let rerenderTimer = null;
function scheduleRerender() {
  if (!current || rerenderTimer) return;
  rerenderTimer = setTimeout(() => {
    rerenderTimer = null;
    render(false);
  }, 700);
}

function render(force) {
  if (!current) return;
  const body = $('#drawer-body');
  // yazı yazılırken ezme
  if (!force && body.contains(document.activeElement) && isTyping()) return;
  const keep = {};
  body.querySelectorAll('input[id], textarea[id], select[id]').forEach((el) => { if (el.type !== 'password') keep[el.id] = el.value; });
  const scroll = body.scrollTop;
  const termScroll = $('#term')?.scrollTop;
  const fn = VIEWS[current.view];
  if (!fn) return;
  const { title, html, after } = fn(current.arg);
  $('#drawer-title').textContent = title || TITLES[current.view] || '';
  body.innerHTML = html;
  if (!force) {
    for (const [id, v] of Object.entries(keep)) { const el = document.getElementById(id); if (el && v) el.value = v; }
    body.scrollTop = scroll;
  }
  after?.();
  if (!force && termScroll != null && $('#term')) $('#term').scrollTop = termScroll;
}

// ======================= GÖRÜNÜMLER =======================
const VIEWS = {};

// ---------- Boss ----------
VIEWS.boss = () => {
  const g = S.company?.goal;
  const pending = [...S.approvals.values()].filter((a) => a.status === 'pending');
  const presets = [
    '7 gün içinde ilk 1.000 ₺ gelirini getir',
    'Satılabilir bir dijital ürün (şablon/e-kitap) çıkar ve satış sayfasını hazırla',
    'Küçük işletmelere satılacak bir hizmet paketi kur ve ilk 10 müşteri listesini çıkar',
    'Bir mikro-SaaS fikri seç, MVP yap ve lansman planı hazırla',
    'Instagram/TikTok için 30 günlük içerik makinesi kur',
  ];
  return {
    html: `
    <div class="infobox">Patron sensin. Hedefi <b>Max</b>'e verirsin, Max görevlere böler ve ekibe dağıtır. Dışarı giden her şey senin onayına düşer.</div>
    <h3>AKTİF HEDEF</h3>
    ${g ? `<div class="card"><div class="title">🎯 ${esc(g.text)}</div><div class="muted">${ago(g.setAt)} önce verildi</div><div style="margin-top:8px"><button class="btn small ghost" data-action="goal-clear">Hedefi kaldır</button></div></div>` : '<div class="muted">Hedef yok. Ekip kendi kendine fikir üretiyor.</div>'}
    <h3>YENİ HEDEF VER</h3>
    <textarea id="goal-input" rows="3" placeholder="Örn: 7 gün içinde Shopier'de satılacak bir Notion şablonu çıkar"></textarea>
    <div class="presets">${presets.map((p) => `<button data-action="goal-preset" data-text="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    <div class="row"><button class="btn" data-action="goal-set">🎯 Hedefi Max'e ver</button><button class="btn ghost shrink" data-action="goal-queue">➕ Sıraya ekle</button></div>
    ${(S.company?.goalQueue || []).length ? `<h3>SIRADAKİ HEDEFLER (${S.company.goalQueue.length})</h3><div class="muted" style="margin-bottom:6px">Aktif hedefin tüm işleri bitince sıradaki otomatik başlar.</div>${S.company.goalQueue.map((q, i) => `<div class="card"><div class="row"><span>${i + 1}. ${esc(q)}</span><button class="btn ghost small shrink" data-action="gq-move" data-i="${i}" data-dir="up">↑</button><button class="btn ghost small shrink" data-action="gq-move" data-i="${i}" data-dir="down">↓</button><button class="btn red small shrink" data-action="gq-del" data-i="${i}">✕</button></div></div>`).join('')}` : ''}
    <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn ghost small shrink" data-action="report-now">📊 Penny'den şimdi günlük rapor iste</button><button class="btn ghost small shrink" data-action="pizza">🍕 ${LL('Ekibe pizza ısmarla', 'Order pizza for the team')}</button><button class="btn ghost small shrink" data-action="open" data-view="wallet">💳 ${LL('Cüzdan', 'Wallet')}</button></div>
    <div class="muted" style="margin-top:4px">${LL('Pizza oyun içi bir ikramdır (kasadan para düşmez): ekip sakinleşir, +3 can, günde bir kez.', 'Pizza is an in-game treat (no money leaves the treasury): the team calms down, +3 HP, once a day.')}</div>
    <h3>ONAY BEKLEYENLER (${pending.length})</h3>
    ${pending.length ? pending.slice(0, 3).map(approvalCard).join('') + (pending.length > 3 ? `<button class="btn ghost small" data-action="open" data-view="approvals">Tümünü gör →</button>` : '') : '<div class="muted">Bekleyen onay yok.</div>'}
    <h3>KASA</h3>
    <div class="grid4">
      <div class="stat"><span class="k">KASA</span><span class="v">${fmt(S.ledger.balance)}</span></div>
      <div class="stat"><span class="k">GELİR</span><span class="v green">${fmt(S.ledger.revenue)}</span></div>
      <div class="stat"><span class="k">TESLİM</span><span class="v">${S.deliverables.length}</span></div>
      <div class="stat"><span class="k">ONAY</span><span class="v">${S.pending}</span></div>
    </div>`,
  };
};

// ---------- Onaylar ----------
function approvalCard(a) {
  const ag = S.agents.get(a.agentId);
  const sh = a.shield || {};
  const shieldChip = sh.state === 'pending' ? '<span class="chip info">🛡️ denetleniyor…</span>' : sh.state === 'ok' ? '<span class="chip ok">🛡️ temiz</span>' : sh.state === 'risk' ? '<span class="chip risk">🛡️ riskli</span>' : sh.state === 'block' || sh.state === 'blocked' ? '<span class="chip block">🛡️ engellendi</span>' : '';
  const pending = a.status === 'pending';
  return `<div class="card ${pending ? 'pending' : ''}">
    <div class="row"><div class="title">${APR_TR[a.kind] || a.kind} · ${esc(a.title)}</div></div>
    <div><span class="chip">${esc(ag?.name || '?')}</span>${shieldChip}<span class="chip">${ago(a.createdAt)}</span>${!pending ? `<span class="chip ${a.status === 'approved' ? 'ok' : 'bad'}">${a.status === 'approved' ? 'onaylandı' : 'reddedildi'}</span>` : ''}</div>
    <pre>${esc(a.detail)}</pre>
    ${a.expectedReturn ? `<div class="muted">Beklenen getiri: ${esc(a.expectedReturn)}</div>` : ''}
    ${sh.note ? `<div class="muted">🛡️ ${esc(sh.note)}</div>` : ''}
    ${a.kind === 'pc' && pending ? '<div class="warnbox" style="margin-top:6px">🖥️ Onaylarsan bu işlem <b>senin bilgisayarında</b> çalışır. Komutu okumadan onaylama. Yıkıcı komutlar kodda zaten engelli.</div>' : ''}
    ${(a.kind === 'ad' || a.kind === 'spend') && pending ? realMoneyBox(a) : ''}
    ${a.kind === 'ad' && pending ? '<div class="warnbox" style="margin-top:6px">📢 Onay = kampanyayı reklam panelinde <b>sen kurup ödersin</b>. Tutar ajanın bütçesinden ve kasadan düşer.</div>' : ''}
    ${a.kind === 'budget' && pending ? `<div class="infobox" style="margin-top:6px">${LL(`💼 Onay = kasadaki <b>serbest bakiyeden</b> (${fmt(S.ledger.free)} ${cur()}) ajana bütçe ayrılır. Para hareketi yok. Ajan bu bütçeyle harcama/reklam önerebilir, ödemeyi yine sen yaparsın.`, `💼 Approve = budget is set aside from the <b>free balance</b> (${fmt(S.ledger.free)} ${cur()}). No money moves. The agent can then propose spends/ads; you still pay.`)}</div>` : ''}
    ${a.kind === 'spend' && pending ? '<div class="warnbox" style="margin-top:6px">Onaylarsan tutar kasadan (defterden) düşer. <b>Ödemeyi sen kendin yaparsın</b>, sistem para göndermez.</div>' : ''}
    ${a.kind === 'publish' && pending ? '<div class="muted" style="margin-top:6px">Onay = içeriği kendin yayınlayacağın anlamına gelir. Ajan otomatik paylaşım yapmaz.</div>' : ''}
    ${a.result ? `<pre>${esc(a.result)}</pre>` : ''}
    ${pending ? `<div class="row" style="margin-top:6px"><input id="ans-${a.id}" placeholder="${a.kind === 'question' ? 'Cevabın (zorunlu değil)' : 'Not (opsiyonel)'}" data-enter="approve" data-id="${a.id}" /><button class="btn green shrink" data-action="approve" data-id="${a.id}">✔ Onayla</button><button class="btn red shrink" data-action="reject" data-id="${a.id}">✕ Reddet</button></div>` : ''}
  </div>`;
}

function realMoneyBox(a) {
  if (!safety) loadSafety();
  const st = safety;
  const amt = Math.abs(Number(a.payload?.amount) || 0);
  const over = st && st.today + amt > st.dailyCap;
  return `<div class="dangerbox">💳 <b>${LL('GERÇEK PARA', 'REAL MONEY')}:</b> ${LL(`Onaylarsan ${money(amt)} tutarını reklam platformunda / mağazada <b>sen kendin ödersin</b>. Getiri garantisi yok.`, `If you approve, <b>you pay ${money(amt)} yourself</b> on the ad platform / store. No guaranteed return.`)}
    ${st ? `<div style="margin-top:4px">${LL('Bugün', 'Today')}: ${money(st.today)} / ${money(st.dailyCap)} ${LL('günlük limit', 'daily cap')}${over ? ` · <b>${LL('limit aşılıyor', 'over the cap')}</b>` : ''}${st.frozen ? ` · <b>${LL('ZARAR DURDURMA: harcama donduruldu', 'STOP-LOSS: spending frozen')}</b>` : ''}</div>` : ''}</div>`;
}

VIEWS.approvals = () => {
  const all = [...S.approvals.values()].sort((a, b) => b.createdAt - a.createdAt);
  const pending = all.filter((a) => a.status === 'pending');
  const done = all.filter((a) => a.status !== 'pending').slice(0, 25);
  return {
    html: `<div class="infobox">Ajanlar dışarıya hiçbir şey göndermez. Komut, yayın, harcama ve dış işlemler buraya düşer. <span class="kbd">Y</span> ilk kartı onaylar, <span class="kbd">N</span> reddeder.</div>
      <h3>BEKLEYEN (${pending.length})</h3>${pending.map(approvalCard).join('') || '<div class="muted">Temiz. ☕</div>'}
      <h3>GEÇMİŞ</h3>${done.map(approvalCard).join('') || '<div class="muted">-</div>'}`,
  };
};

async function decide(id, approve, confirmAmount) {
  const answer = document.getElementById(`ans-${id}`)?.value || '';
  try {
    await api('POST', `/api/approvals/${id}`, { approve, answer, confirmAmount });
    toast(approve ? '✔ Onaylandı' : '✕ Reddedildi', approve ? 'done' : 'info');
    safety = null;
  } catch (e) {
    if (/^CONFIRM:/.test(e.message)) {
      const a = S.approvals.get(id);
      const typed = prompt(e.message.replace(/^CONFIRM:\s*/, ''));
      if (typed == null) return;
      if (Number(typed) !== Math.abs(Number(a?.payload?.amount))) return toast(LL('Tutar eşleşmedi, onaylanmadı.', 'Amount did not match; not approved.'), 'error');
      return decide(id, approve, Number(typed));
    }
    toast(e.message, 'error');
  }
}

// ---------- gerçek para güvenliği ----------
let safety = null;
let safetyLoading = false;
function loadSafety() {
  if (safetyLoading) return;
  safetyLoading = true;
  api('GET', '/api/safety').then((r) => { safety = r; render(true); }).catch(() => {}).finally(() => { safetyLoading = false; });
}
const SAFETY_RULES = () => [
  [LL('Para senin hesabında kalır', 'Your money stays in your account'), LL('Hustle HQ bankana, kartına ya da cüzdanına bağlanmaz, para çekmez, göndermez. Yüklediğin tutar bir kayıttır; her ödemeyi sen kendin yaparsın.', 'Hustle HQ never connects to your bank, card or wallet and never moves money. A top-up is a record; you make every payment yourself.')],
  [LL('Kaybetmeyi göze alabileceğin parayı kullan', 'Only use money you can afford to lose'), LL('Yapay zekâ yanılabilir. Kazanç garantisi yoktur. Kira, fatura ya da borç parasını asla koyma.', 'AI can be wrong. No earnings are guaranteed. Never use rent, bill or borrowed money.')],
  [LL('Her harcama senin onayınla', 'Every spend needs your approval'), LL('Ajanlar sadece önerir. Günlük limit, zarar durdurma ve büyük harcamada tutar teyidi seni korur.', 'Agents only propose. A daily cap, a stop-loss and typed confirmation for large spends protect you.')],
  [LL('Kart, şifre, 2FA kodu asla', 'Never share cards, passwords or 2FA codes'), LL('Hiçbir ajan bunları istemez. Bir metin isterse yanlıştır: paylaşma.', 'No agent ever needs them. If any text asks for them, it is wrong: do not share.')],
  [LL('Yayınlamadan önce oku', 'Read before you publish'), LL('Reklam ve gönderilerin sorumluluğu sende: platform kuralları, tüketici ve reklam mevzuatı.', 'You are responsible for every ad and post: platform rules, consumer and advertising law.')],
  [LL('Sonucu ölç', 'Measure real results'), LL('Gerçek harcamayı ve satışı kaydet. Getirisi olmayan harcamayı kes, para getirmeyen ajanı kov.', 'Record real spend and sales. Cut spending that does not pay back; fire agents who do not earn.')],
  [LL('Dolandırıcılığa dikkat', 'Watch out for scams'), LL('"Garantili getiri", forex/kripto sinyalleri, para katlama vaatleri dolandırıcılıktır. Borsa masası sadece sanaldır.', '"Guaranteed returns", forex/crypto signals and money-doubling promises are scams. The trading desk is paper only.')],
  [LL('Vergi ve kayıt', 'Taxes and records'), LL('Gelir vergiye tabi olabilir. Yönetim → Yedek ile kayıtlarını sakla.', 'Income may be taxable. Keep your records with Admin → Backup.')],
];
function rulesHtml() {
  return `<ol class="rules">${SAFETY_RULES().map(([t, d]) => `<li><b>${esc(t)}.</b> ${esc(d)}</li>`).join('')}</ol>`;
}

// ---------- Görevler ----------
VIEWS.tasks = () => {
  const all = [...S.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const col = (st, label) => {
    const list = all.filter((t) => (Array.isArray(st) ? st.includes(t.status) : t.status === st)).slice(0, 25);
    return `<div class="col"><h4>${label} (${list.length})</h4>${list.map((t) => {
      const a = S.agents.get(t.assignee);
      return `<div class="t">${t.status === 'failed' ? '❌ ' : ''}${esc(t.title)}<small>${esc(a?.name || '?')} · ${esc(t.createdBy)} · ${ago(t.updatedAt)}${t.status === 'todo' ? ` · <a href="#" data-action="task-cancel" data-id="${t.id}">iptal</a>` : ''}</small></div>`;
    }).join('')}</div>`;
  };
  const agents = [...S.agents.values()].filter((a) => a.status !== 'dead' && a.role !== 'claude');
  return {
    html: `<h3>YENİ GÖREV (doğrudan ajana)</h3>
      <div class="stack">
        <div class="row"><input id="nt-title" placeholder="Görev başlığı" /><select id="nt-assignee" class="shrink" style="width:170px">${agents.map((a) => `<option value="${a.id}">${esc(a.name)} · ${esc(a.title)}</option>`).join('')}</select></div>
        <textarea id="nt-detail" rows="2" placeholder="Detay: ne bekliyorsun, teslim formatı"></textarea>
        <div><button class="btn" data-action="task-new">📋 Görevi ver</button></div>
      </div>
      <h3>PANO</h3>
      <div class="kanban">${col('todo', 'SIRADA')}${col('doing', 'YAPILIYOR')}${col(['done', 'failed'], 'BİTTİ')}</div>`,
  };
};

// ---------- Ajan ----------
VIEWS.agent = (id) => {
  const a = S.agents.get(id);
  if (!a) return { title: 'Ajan', html: '<div class="muted">Bu ajan artık yok (kovulmuş ve yerine biri gelmiş olabilir).</div>' };
  const tab = tabs[id] || (a.role === 'claude' ? 'claude' : 'log');
  const task = a.currentTaskId ? S.tasks.get(a.currentTaskId) : null;
  const avg = a.stats?.rated ? (a.stats.ratingSum / a.stats.rated).toFixed(1) : '-';
  const hpCol = a.hp > 60 ? 'var(--green)' : a.hp > 30 ? 'var(--yellow)' : 'var(--red)';
  const tabBtn = (k, l) => `<button class="${tab === k ? 'on' : ''}" data-action="tab" data-id="${id}" data-tab="${k}">${l}</button>`;
  const role = meta.roles?.[a.role];
  let body = '';
  if (tab === 'log') body = `<div class="term" id="term"></div>`;
  else if (tab === 'chat') {
    const logs = (S.logs.get(id) || []).filter((e) => e.kind === 'boss' || e.kind === 'say').slice(-30);
    body = `<div class="term" id="chatlog" style="height:260px">${logs.map((e) => `<div class="${e.kind}">${e.kind === 'boss' ? '' : `<b>${esc(a.name)}:</b> `}${esc(e.text)}</div>`).join('') || '<div class="result">Bir şey yaz, konuşalım.</div>'}</div>
      <div class="row" style="margin-top:8px"><input id="chat-input" placeholder="${esc(a.name)}'e yaz… (iş istersen görev olarak alır)" data-enter="agent-chat" data-id="${id}" /><button class="btn shrink" data-action="agent-chat" data-id="${id}">Gönder</button></div>`;
  } else if (tab === 'task') {
    body = `<div class="stack"><input id="at-title" placeholder="Ne yapsın?" /><textarea id="at-detail" rows="3" placeholder="Detay / teslim formatı"></textarea><div><button class="btn" data-action="agent-task" data-id="${id}">📋 ${esc(a.name)}'e ver (öncelik: yüksek)</button></div></div>
      <h3>AÇIK GÖREVLERİ</h3>${[...S.tasks.values()].filter((t) => t.assignee === id && (t.status === 'todo' || t.status === 'doing')).map((t) => `<div class="card"><div class="title">${t.status === 'doing' ? '⚙️' : '⏳'} ${esc(t.title)}</div><div class="muted">${esc(t.createdBy)} · ${ago(t.createdAt)}</div></div>`).join('') || '<div class="muted">Yok.</div>'}`;
  } else if (tab === 'engine') {
    body = `<div class="muted">Motor zinciri: soldan sağa denenir. Bir sağlayıcının kotası dolunca sıradakine geçilir. Alias (ör. <code>deepseek</code>) ya da <code>sağlayıcı:model</code> yazabilirsin.</div>
      <input id="engine-chain" style="margin:8px 0" value="${esc((a.chain || []).join(', '))}" />
      <div class="presets">${Object.entries(meta.aliases || {}).map(([k, v]) => `<button data-action="chain-add" data-alias="${k}" title="${esc(v)}">+ ${k}</button>`).join('')}</div>
      <button class="btn" data-action="agent-engine" data-id="${id}">Kaydet</button>
      <div class="muted" style="margin-top:8px">Son kullanılan: <code>${esc(a.lastEngine || '-')}</code></div>`;
  } else if (tab === 'work') {
    const ds = S.deliverables.filter((d) => d.agentId === id).slice(-15).reverse();
    body = ds.map(deliverableCard).join('') || '<div class="muted">Henüz teslim yok.</div>';
  } else if (tab === 'look') {
    body = `<div class="row"><input id="ag-name" value="${esc(a.name)}" maxlength="16" /><button class="btn small shrink" data-action="agent-rename" data-id="${id}">Adı kaydet</button></div>${lookControls(a.look || {}, id)}`;
  } else if (tab === 'claude') body = claudeBody();
  return {
    title: `${a.name}`,
    html: `<div class="agent-head"><canvas id="pf" width="64" height="64"></canvas><div class="meta">
        <div class="name">${esc(a.name)} <span class="chip" style="background:#ffd23f22;color:#ffd23f">Lv${a.level || 1}</span> ${a.generation > 1 ? `<span class="chip">${a.generation}. kuşak</span>` : ''}</div>
        <div class="hp" style="margin-top:4px;height:5px" title="XP ${a.stats?.xp || 0}"><i style="width:${xpPct(a)}%;background:#ffd23f"></i></div>
        <div class="muted">${esc(a.title)}</div>
        <div style="margin-top:4px"><span class="chip ${a.status === 'dead' ? 'bad' : a.status === 'working' ? 'ok' : 'info'}">${STATUS_TR[a.status] || a.status}</span>${a.bubble ? `<span class="chip">${a.bubble}</span>` : ''}</div>
        ${a.role !== 'claude' ? `<div class="hp" style="margin-top:6px" title="Can ${Math.round(a.hp)}/100"><i style="width:${Math.max(0, a.hp)}%;background:${hpCol}"></i></div><div class="muted">Can ${Math.round(a.hp)}/100 · saatlik yakım ${S.company?.settings?.burnPerHour ?? 2}</div>` : ''}
      </div></div>
      ${role ? `<div class="muted" style="margin-top:8px">${esc(role.desc)}</div>` : ''}
      <div class="grid4">
        <div class="stat"><span class="k">TESLİM</span><span class="v">${a.stats?.done || 0}</span></div>
        <div class="stat"><span class="k">PUAN</span><span class="v">${avg}</span></div>
        <div class="stat"><span class="k">GELİR</span><span class="v green">${fmt(a.stats?.revenue)}</span></div>
        <div class="stat"><span class="k">ÇAĞRI</span><span class="v">${a.stats?.calls || 0}</span></div>
      </div>
      ${a.role !== 'claude' ? `<div class="row" style="margin:6px 0"><span class="muted shrink">💼 Bütçe: <b style="color:var(--yellow)">${fmt(a.budget)} ${cur()}</b></span><input id="bud-amt" type="number" placeholder="${LL('Tutar (− geri al)', 'Amount (− to take back)')}" /><button class="btn small shrink" data-action="agent-budget" data-id="${id}">Bütçe ver</button></div>` : ''}
      ${a.role !== 'claude' && a.status !== 'dead' ? `<div class="row" style="margin:6px 0;flex-wrap:wrap"><button class="btn ghost small shrink" data-action="agent-praise" data-id="${id}">😊 ${LL('Öv', 'Praise')}</button><span class="muted">${LL('Kahve için mutfaktaki makineden al, ona götür (E).', 'For coffee: grab one from the kitchen machine and bring it over (E).')}</span></div>` : ''}
      ${bondsLine(a)}
      ${task ? `<div class="card"><div class="muted">ŞU AN</div><div class="title">${esc(task.title)}</div></div>` : ''}
      ${a.status === 'dead' ? `<div class="warnbox">💀 ${esc(a.deathReason || 'Kovuldu')}. ${S.company?.settings?.autoHire ? 'Yerine yenisi birazdan işe alınacak.' : ''}</div>` : ''}
      <div class="tabs">${a.role === 'claude' ? tabBtn('claude', '⚡ İş ver') : ''}${tabBtn('log', 'Canlı log')}${a.role !== 'claude' ? tabBtn('chat', 'Sohbet') + tabBtn('task', 'Görev ver') + tabBtn('engine', 'Motor') : ''}${tabBtn('work', 'Teslimler')}${tabBtn('look', 'Görünüm')}</div>
      ${body}
      <div class="row" style="margin-top:14px;flex-wrap:wrap">
        <button class="btn ghost small shrink" data-action="agent-goto" data-id="${id}">📍 Masasına git</button>
        <button class="btn ghost small shrink" data-action="agent-follow" data-id="${id}">🎥 Takip et</button>
        ${a.role !== 'claude' ? (a.status === 'dead'
          ? `<button class="btn green small shrink" data-action="agent-revive" data-id="${id}">😇 Dirilt</button><button class="btn small shrink" data-action="agent-hire" data-id="${id}">🆕 Yenisini işe al</button>`
          : `<button class="btn red small shrink" data-action="agent-fire" data-id="${id}">🔥 Kov</button>`) : ''}
      </div>`,
    after: async () => {
      const pf = $('#pf');
      if (pf) {
        const g = pf.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(portrait(a.look, 64), 0, 0);
      }
      if (tab === 'log' || tab === 'claude') {
        if (!S.logs.get(id)?.length) {
          try {
            const logs = await api('GET', `/api/agents/${id}/log?n=150`);
            S.logs.set(id, logs);
          } catch {}
        }
        const term = $('#term');
        if (term) {
          term.innerHTML = '';
          (S.logs.get(id) || []).slice(-150).forEach((e) => appendTerm(e, false));
          term.scrollTop = term.scrollHeight;
        }
      }
      const cl = $('#chatlog');
      if (cl) cl.scrollTop = cl.scrollHeight;
    },
  };
};

function bondsLine(a) {
  const b = Object.entries(a.bonds || {}).map(([id, n]) => [S.agents.get(id), n]).filter(([x, n]) => x && x.status !== 'dead' && n > 0).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const boss = a.bossBond ? ` · ${LL('patronla', 'with boss')} ${'♥'.repeat(Math.min(5, Math.ceil(a.bossBond / 10)))}` : '';
  if (!b.length && !boss) return '';
  return `<div class="muted" style="margin:4px 0">🤝 ${LL('Yakın arkadaşları', 'Closest friends')}: ${b.map(([x, n]) => `<a href="#" data-action="open-agent" data-id="${x.id}">${esc(x.name)}</a> (${Math.round(n)})`).join(', ') || '-'}${boss}</div>`;
}

function appendTerm(e, scroll = true) {
  const term = $('#term');
  if (!term) return;
  const d = document.createElement('div');
  d.className = e.kind;
  const t = new Date(e.t);
  const icon = { thought: '💭', tool: '›', result: '  ', done: '✅', task: '▶', error: '✖', warn: '!', sleep: '💤', reward: '❤', penalty: '♡', boss: '★', say: '💬', inbox: '✉', review: '🛡', approval: '📥' }[e.kind] || '·';
  d.innerHTML = `<span class="t">${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}</span>${icon} ${esc(e.text)}${e.engine ? ` <span class="t">[${esc(e.engine)}]</span>` : ''}`;
  const atBottom = term.scrollHeight - term.scrollTop - term.clientHeight < 40;
  term.appendChild(d);
  while (term.children.length > 300) term.firstChild.remove();
  if (scroll && atBottom) term.scrollTop = term.scrollHeight;
}

// ---------- Teslimler ----------
function deliverableCard(d) {
  const stars = [1, 2, 3, 4, 5].map((s) => `<button class="${d.rating >= s ? 'on' : ''}" data-action="rate" data-id="${d.id}" data-stars="${s}" title="${s} yıldız">★</button>`).join('');
  const files = (d.files || []).slice(0, 6);
  return `<div class="card">
    <div class="title">${KIND_TR[d.kind] || '📄'} ${esc(d.title)}</div>
    <div><span class="chip">${esc(d.agentName || '?')}</span><span class="chip">${ago(d.createdAt)}</span>${d.revenue ? `<span class="chip ok">💰 ${fmt(d.revenue)} ${cur()}</span>` : ''}</div>
    ${d.summary ? `<div class="muted" style="margin-top:6px">${esc(d.summary.slice(0, 400))}</div>` : ''}
    ${files.length ? `<div style="margin-top:6px">${files.map((f) => `<a href="/api/file?path=${encodeURIComponent(f)}" target="_blank" class="chip info">📎 ${esc(f)}</a>`).join(' ')}</div>` : ''}
    <div class="row" style="margin-top:6px"><div class="stars shrink">${stars}</div><div class="muted">Puanla → ajanın canı artar/azalır</div><button class="btn small green shrink" data-action="revenue-link" data-id="${d.id}">💰 Gelir bağla</button></div>
  </div>`;
}

VIEWS.deliverables = () => {
  const list = [...S.deliverables].reverse().slice(0, 60);
  return {
    html: `<div class="infobox">Ajanların ürettiği her şey. <b>Puanlaman</b> ajanın canını belirler: 1★ = −10, 5★ = +25. Bir teslim gerçek satış getirdiyse <b>Gelir bağla</b>: ajan +40 can alır, tüm takım +8.</div>${list.map(deliverableCard).join('') || '<div class="muted">Henüz teslim yok.</div>'}`,
  };
};

// ---------- Dosya gezgini ----------
let fsState = { path: '', data: null, preview: null };
const TEXT_EXT = /\.(md|txt|json|csv|html?|css|js|ts|py|svg|xml|yml|yaml)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
function loadDir(p) {
  fsState = { path: p, data: null, preview: null };
  api('GET', `/api/files?path=${encodeURIComponent(p)}`).then((d) => { fsState.data = d; render(true); }).catch((e) => { fsState.data = { error: e.message, entries: [] }; render(true); });
}
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
VIEWS.files = () => {
  if (!fsState.data) { loadDir(fsState.path); return { html: '<div class="muted">Yükleniyor…</div>' }; }
  const parts = fsState.path ? fsState.path.split('/').filter(Boolean) : [];
  const crumbs = [`<a href="#" data-action="fs-go" data-path="">workspace</a>`].concat(parts.map((x, i) => `<a href="#" data-action="fs-go" data-path="${esc(parts.slice(0, i + 1).join('/'))}">${esc(x)}</a>`)).join(' / ');
  const rows = (fsState.data.entries || []).map((e) => {
    const full = (fsState.path ? fsState.path + '/' : '') + e.name;
    if (e.dir) return `<tr><td>📁 <a href="#" data-action="fs-go" data-path="${esc(full)}">${esc(e.name)}</a></td><td class="muted num">${ago(e.mtime)}</td><td></td></tr>`;
    const canPrev = TEXT_EXT.test(e.name) || IMG_EXT.test(e.name);
    return `<tr><td>${IMG_EXT.test(e.name) ? '🖼️' : /\.zip$/i.test(e.name) ? '📦' : '📄'} ${canPrev ? `<a href="#" data-action="fs-prev" data-path="${esc(full)}">${esc(e.name)}</a>` : esc(e.name)}</td><td class="muted num">${kb(e.size)} · ${ago(e.mtime)}</td><td class="shrink"><a class="chip info" href="/api/file?path=${encodeURIComponent(full)}" target="_blank">aç ↗</a></td></tr>`;
  }).join('');
  let prev = '';
  if (fsState.preview) {
    const pv = fsState.preview;
    prev = `<h3>ÖNİZLEME · ${esc(pv.path.split('/').pop())}</h3>${pv.img ? `<img src="/api/file?path=${encodeURIComponent(pv.path)}" style="max-width:100%;border:2px solid #000;border-radius:6px;background:#fff" />` : `<pre class="card" style="white-space:pre-wrap;max-height:420px;overflow:auto">${esc(pv.text)}</pre>`}`;
  }
  return {
    html: `<div class="infobox">Ajanların ürettiği her şey burada: fikirler, raporlar, kod, tasarımlar, ürün paketleri. Sadece okunur.</div>
      <div style="margin-bottom:8px">${crumbs} <button class="btn ghost small" data-action="fs-go" data-path="${esc(fsState.path)}">↻</button></div>
      ${fsState.data.error ? `<div class="warnbox">${esc(fsState.data.error)}</div>` : ''}
      <table>${rows || '<tr><td class="muted">Boş klasör</td></tr>'}</table>${prev}`,
  };
};

// ---------- Kararlar ----------
VIEWS.decisions = () => ({
  html: [...S.decisions].reverse().slice(0, 80).map((d) => `<div class="card"><div class="title">${esc(d.title)}</div><div><span class="chip">${esc(d.by)}</span><span class="chip">${ago(d.t)} önce</span></div>${d.why ? `<div class="muted" style="margin-top:4px">${esc(d.why)}</div>` : ''}</div>`).join('') || '<div class="muted">Henüz karar yok.</div>',
});

// ---------- Kişiler ----------
VIEWS.people = () => {
  const ag = [...S.agents.values()].sort((a, b) => a.slot - b.slot);
  const top = employeeOfMonth();
  const ranked = ag.filter((a) => a.role !== 'claude' && a.status !== 'dead').sort((x, y) => score(y) - score(x));
  return {
    html: `${top ? `<div class="card" style="border-color:#d1a54a"><div class="title">🏆 AYIN ÇALIŞANI: ${esc(top.name)}</div><div class="muted">${esc(top.title)} · gelir ${fmt(top.stats?.revenue)} ${cur()} · ort. puan ${top.stats?.rated ? (top.stats.ratingSum / top.stats.rated).toFixed(1) : '-'} · ${top.stats?.done || 0} teslim. Masasında altın kupa var.</div></div>` : ''}
      <h3>LİDERLİK TABLOSU</h3>
      <table><tr><th>#</th><th>Ad</th><th class="num">Lv</th><th class="num">Gelir</th><th class="num">Puan</th><th class="num">Teslim</th><th class="num">Reklam ROI</th><th class="num">Skor</th></tr>
      ${ranked.map((a, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(a.name)}</td><td class="num" style="color:#ffd23f">${a.level || 1}</td><td class="num">${fmt(a.stats?.revenue)}</td><td class="num">${a.stats?.rated ? (a.stats.ratingSum / a.stats.rated).toFixed(1) : '-'}</td><td class="num">${a.stats?.done || 0}</td><td class="num">${a.stats?.adSpend ? Math.round(((a.stats.adRevenue || 0) / a.stats.adSpend) * 100) + '%' : '-'}</td><td class="num">${Math.round(score(a))}</td></tr>`).join('')}
      </table>
      <h3>KADRO</h3>
      <table><tr><th></th><th>Ad</th><th>Rol</th><th class="num">Can</th><th class="num">Teslim</th><th class="num">Puan</th><th>Durum</th></tr>
      ${ag.map((a) => `<tr><td>${a.slot === 9 ? 0 : a.slot + 1}</td><td><a href="#" data-action="open-agent" data-id="${a.id}">${esc(a.name)}</a>${a.generation > 1 ? ` <span class="muted">g${a.generation}</span>` : ''}</td><td class="muted">${esc(a.title)}</td><td class="num" style="color:${a.hp > 60 ? 'var(--green)' : a.hp > 30 ? 'var(--yellow)' : 'var(--red)'}">${a.role === 'claude' ? '∞' : Math.round(a.hp)}</td><td class="num">${a.stats?.done || 0}</td><td class="num">${a.stats?.rated ? (a.stats.ratingSum / a.stats.rated).toFixed(1) : '-'}</td><td>${STATUS_TR[a.status] || a.status}</td></tr>`).join('')}
      </table>
      <h3>ANMA DUVARI · KOVULANLAR (${S.graveyard.length})</h3>
      ${[...S.graveyard].reverse().map((g) => `<div class="card"><div class="title">† ${esc(g.name)} <span class="muted">${esc(g.title)} · ${g.generation}. kuşak</span></div><div class="muted">${esc(g.deathReason || '')} · ${g.diedAt ? ago(g.diedAt) + ' önce' : ''} · teslim ${g.stats?.done || 0}</div></div>`).join('') || '<div class="muted">Henüz kimse kovulmadı. Şimdilik.</div>'}`,
  };
};

/** Skor: gelir baskın, sonra puan ortalaması ve teslim sayısı. */
function score(a) {
  const s = a.stats || {};
  const avg = s.rated ? s.ratingSum / s.rated : 0;
  return (s.revenue || 0) * 10 + avg * 20 * Math.min(1, (s.rated || 0) / 3) + (s.done || 0) * 2;
}
export function employeeOfMonth() {
  const list = [...S.agents.values()].filter((a) => a.role !== 'claude' && a.status !== 'dead' && ((a.stats?.revenue || 0) > 0 || (a.stats?.rated || 0) > 0));
  if (!list.length) return null;
  return list.sort((x, y) => score(y) - score(x))[0];
}

function xpPct(a) {
  const xp = a.stats?.xp || 0;
  const lv = a.level || 1;
  const lo = 50 * (lv - 1) ** 2, hi = 50 * lv ** 2;
  return Math.max(0, Math.min(100, ((xp - lo) / (hi - lo)) * 100));
}

// ---------- Motorlar ----------
VIEWS.engines = () => {
  const list = S.providers;
  const ag = [...S.agents.values()].filter((a) => a.role !== 'claude').sort((a, b) => a.slot - b.slot);
  return {
    html: `${S.demo ? '<div class="warnbox"><b>DEMO MODU:</b> Hiç API anahtarı yok, ajanlar şablonla çalışıyor. Aşağıdan <b>ücretsiz</b> bir anahtar ekle (en kolayı OpenRouter, Gemini ve Groq). Anahtar sadece bu bilgisayardaki <code>.env</code> dosyasına yazılır.</div>' : '<div class="infobox">Canlı mod. Kotası dolan motor otomatik soğumaya alınır, ajan zincirdeki sıradaki motora geçer.</div>'}
      <h3>SAĞLAYICILAR</h3>
      ${list.map((p) => `<div class="card">
        <div class="prov"><span class="dot ${p.state}"></span><div><b>${esc(p.name)}</b> ${p.free ? '<span class="chip ok">ücretsiz</span>' : '<span class="chip">ucuz / hediye kredi</span>'}${p.local ? '<span class="chip info">lokal</span>' : ''}
          <div class="muted">${p.hasKey ? `Bugün ${p.usage.calls} çağrı · ${fmt(p.usage.tokens)} token` : 'Anahtar yok'}${p.lastError ? ` · <span style="color:#ff9b9b">${esc(p.lastError)}</span>` : ''}${p.until && p.until > Date.now() ? ` · soğuma ${Math.ceil((p.until - Date.now()) / 1000)} sn` : ''}</div></div>
          <a href="${esc(p.signup)}" target="_blank" class="btn ghost small">${p.local ? 'İndir' : 'Anahtar al'} ↗</a></div>
        ${p.keyEnv ? `<div class="row" style="margin-top:8px"><input type="password" id="key-${p.id}" placeholder="${p.hasKey ? '•••••••• (kayıtlı, değiştirmek için yaz)' : p.keyEnv}" autocomplete="off" /><button class="btn small shrink" data-action="prov-save" data-id="${p.id}">Kaydet</button><button class="btn ghost small shrink" data-action="prov-test" data-id="${p.id}">Test</button></div>` : `<div class="muted" style="margin-top:6px">${p.hasKey ? `Algılanan modeller: ${esc(p.models.join(', '))}` : 'Ollama çalışmıyor. Kurup <code>ollama pull qwen2.5:7b</code> çalıştır, 5 dakika içinde otomatik algılanır.'}</div><div class="row" style="margin-top:6px"><button class="btn ghost small shrink" data-action="prov-test" data-id="${p.id}">Yeniden algıla</button></div>`}
      </div>`).join('')}
      <h3>AJAN MOTOR ZİNCİRLERİ</h3>
      <div class="muted" style="margin-bottom:6px">Alias'lar: ${Object.entries(meta.aliases || {}).map(([k, v]) => `<code title="${esc(v)}">${k}</code>`).join(' ')}</div>
      <table>${ag.map((a) => `<tr><td style="width:90px"><b>${esc(a.name)}</b></td><td><input id="ch-${a.id}" value="${esc((a.chain || []).join(', '))}" /></td><td class="shrink"><button class="btn small" data-action="chain-save" data-id="${a.id}">✔</button></td></tr>`).join('')}</table>
      <h3>PERFORMANS</h3>
      <div class="row"><label class="muted">Eşzamanlı LLM çağrısı<input id="env-MAX_CONCURRENT" placeholder="3" /></label><label class="muted">Tick (sn)<input id="env-TICK_SECONDS" placeholder="25" /></label><label class="muted">Ollama modeli<input id="env-OLLAMA_MODEL" placeholder="qwen2.5:7b" /></label></div>
      <div style="margin-top:8px"><button class="btn small" data-action="env-save">Kaydet</button> <span class="muted">Not: tick ve eşzamanlılık değişikliği sunucu yeniden başlatılınca tam uygulanır.</span></div>`,
  };
};

// ---------- Karakterim ----------
/** Görünüm düzenleyici (patron ya da ajan için ortak). target: 'boss' | ajan id */
function lookControls(L, target) {
  const sw = (k, colors) => `<div class="swatches">${colors.map((c, i) => `<button style="background:${c}" class="${L[k] === i ? 'on' : ''}" data-action="look" data-target="${target}" data-k="${k}" data-v="${i}"></button>`).join('')}</div>`;
  const opts = (k, labels) => `<div class="swatches">${labels.map((l, i) => `<button style="width:auto;padding:0 6px;background:#f3ead6;color:#2a1d12;font-size:11px" class="${(L[k] ?? -1) === i ? 'on' : ''}" data-action="look" data-target="${target}" data-k="${k}" data-v="${i}">${l}</button>`).join('')}</div>`;
  const tog = (k, l) => `<button class="btn small ${L[k] ? '' : 'ghost'}" data-action="look" data-target="${target}" data-k="${k}" data-v="${L[k] ? 0 : 1}" data-bool="1">${l}</button>`;
  return `<div class="look-grid" style="margin-top:14px">
        <span class="muted">Ten</span>${sw('skin', PAL.skin)}
        <span class="muted">Saç rengi</span>${sw('hair', PAL.hair)}
        <span class="muted">Saç modeli</span>${opts('hairStyle', ['Kısa', 'Yan', 'Diken', 'Uzun', 'Topuz', 'Kıvırcık'])}
        <span class="muted">Üst</span>${sw('shirt', PAL.shirt)}
        <span class="muted">Pantolon</span>${sw('pants', PAL.pants)}
        <span class="muted">Kravat</span>${opts('tie', ['Kırmızı', 'Mavi', 'Turuncu', 'Siyah'])}
        <span class="muted">Ekstra</span><div class="row" style="flex-wrap:wrap">${tog('suit', 'Takım elbise')}${tog('glasses', 'Gözlük')}${tog('headphones', 'Kulaklık')}${tog('hoodie', 'Kapşon')}</div>
      </div>`;
}

VIEWS.character = () => {
  const L = S.company?.boss?.look || {};
  return {
    html: `<div class="row" style="align-items:flex-start"><canvas id="boss-prev" class="preview-big shrink" width="16" height="26"></canvas>
      <div class="stack"><label class="muted">Patron adı<input id="boss-name" value="${esc(S.company?.boss?.name || 'Boss')}" /></label><button class="btn small" data-action="boss-name">Adı kaydet</button>
      <div class="muted">Karakterin ofiste WASD ile yürüyen patrondur.</div></div></div>
      ${lookControls(L, 'boss')}`,
    after: () => {
      const c = $('#boss-prev');
      if (!c) return;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, 16, 26);
      g.drawImage(character(L, 0, 0, 'stand', false, 'happy'), 0, 0);
    },
  };
};

// ---------- Reklam sonuçları ----------
function adsHtml() {
  const ads = [...S.approvals.values()].filter((a) => a.kind === 'ad' && a.status === 'approved').sort((x, y) => y.createdAt - x.createdAt).slice(0, 15);
  if (!ads.length) return '';
  return `<h3>📢 REKLAM KAMPANYALARI</h3>
    <div class="muted" style="margin-bottom:6px">Kampanyayı yayınlayıp bitirdiysen gerçek sonucu gir. Harcanmayan bütçe kasaya iade olur, satış gelir olur, ajanın ROI'si hesaplanır.</div>
    ${ads.map((a) => {
      const ag = S.agents.get(a.agentId);
      const r = a.adResult;
      return `<div class="card"><div class="title">${esc(a.title)}</div><div><span class="chip">${esc(ag?.name || '?')}</span><span class="chip">${ago(a.createdAt)}</span>${r ? `<span class="chip ${r.revenue > r.spent ? 'ok' : 'bad'}">ROI ${r.spent ? Math.round((r.revenue / r.spent) * 100) : 0}%</span>` : ''}</div>
        ${r ? `<div class="muted" style="margin-top:4px">Harcanan ${fmt(r.spent)} · tıklama ${r.clicks} · satış ${fmt(r.revenue)} ${cur()}</div>`
          : `<div class="row" style="margin-top:6px"><input id="ads-${a.id}" type="number" placeholder="Harcanan (${fmt(a.payload?.amount)})" /><input id="adc-${a.id}" type="number" placeholder="Tıklama" /><input id="adr-${a.id}" type="number" placeholder="Satış ₺" /><button class="btn small shrink" data-action="ad-result" data-id="${a.id}">Kaydet</button></div>`}
      </div>`;
    }).join('')}`;
}

// ---------- Kasa ----------
function ledgerCls(x) {
  return x.type === 'spend' || x.type === 'withdraw' ? 'neg' : x.type === 'alloc' || x.type === 'payout' ? 'muted' : 'pos';
}
function ledgerAmt(x) {
  if (x.type === 'alloc' || x.type === 'payout') return `${x.amount < 0 ? '↩ ' : '→ '}${fmt(Math.abs(x.amount))}`;
  return `${x.type === 'spend' || x.type === 'withdraw' ? '−' : '+'}${fmt(x.amount)}`;
}
let ls = null;
VIEWS.cash = () => {
  if (!ls) api('GET', '/api/lemonsqueezy').then((r) => { ls = r; render(true); }).catch(() => {});
  const alloc = [...S.agents.values()].filter((a) => (a.budget || 0) > 0);
  const allocSum = alloc.reduce((s, a) => s + a.budget, 0);
  const dlvOpts = [...S.deliverables].reverse().slice(0, 60);
  const lsHtml = !ls ? '<div class="muted">Yükleniyor…</div>' : `
      <div class="infobox">Lemon Squeezy'deki <b>gerçek satışlar</b> 5 dakikada bir okunur ve otomatik gelir olarak kaydedilir. Sadece okuma yapılır. Ürünü bir teslime bağlarsan satış gelince o ajan +40 can alır. İlk bağlantıda geçmiş siparişler sayılmaz.</div>
      <div class="row"><input type="password" id="ls-key" placeholder="${ls.connected ? '•••••• (bağlı, değiştirmek için yaz)' : 'Lemon Squeezy API anahtarı'}" /><button class="btn small shrink" data-action="ls-key">Bağla</button>${ls.connected ? '<button class="btn ghost small shrink" data-action="ls-sync">↻ Senkron</button>' : ''}</div>
      <div class="muted" style="margin-top:4px">${ls.connected ? `✅ Bağlı · son senkron ${ls.lastSync ? ago(ls.lastSync) + ' önce' : '-'} · ${ls.ordersSeen} sipariş görüldü` : 'Bağlı değil. Anahtar: app.lemonsqueezy.com → Settings → API'}${ls.lastError ? ` · <span style="color:#ff9b9b">${esc(ls.lastError)}</span>` : ''}</div>
      ${(ls.products || []).map((p) => `<div class="row" style="margin-top:6px"><span class="shrink" style="min-width:160px">🛍️ <b>${esc(p.name)}</b> <span class="muted">${esc(p.price || '')}</span></span><select id="lsl-${p.id}"><option value="">— teslime bağla —</option>${dlvOpts.map((d) => `<option value="${d.id}" ${ls.productLinks?.[p.id] === d.id ? 'selected' : ''}>${esc(d.agentName)}: ${esc(d.title.slice(0, 50))}</option>`).join('')}</select><button class="btn small shrink" data-action="ls-link" data-id="${p.id}">✔</button></div>`).join('')}`;
  const e = [...(S.ledger.entries || [])].reverse();
  const spend = e.filter((x) => x.type === 'spend').reduce((s, x) => s + x.amount, 0);
  const dlv = [...S.deliverables].reverse().slice(0, 40);
  return {
    html: `<div class="warnbox">Kasa bir <b>kayıt defteridir</b>. Sistem hiçbir banka, kart veya cüzdana bağlanmaz, para göndermez. Ajanlar harcama önerir, onaylarsan ödemeyi sen yaparsın.</div>
      <div class="grid4">
        <div class="stat"><span class="k">BAKİYE</span><span class="v">${fmt(S.ledger.balance)}</span></div>
        <div class="stat"><span class="k">GELİR</span><span class="v green">${fmt(S.ledger.revenue)}</span></div>
        <div class="stat"><span class="k">HARCAMA</span><span class="v" style="color:var(--red)">${fmt(spend)}</span></div>
        <div class="stat"><span class="k">ROI</span><span class="v">${spend ? ((S.ledger.revenue / spend) * 100).toFixed(0) + '%' : '-'}</span></div>
      </div>
      <h3>🍋 GERÇEK SATIŞLAR (LEMON SQUEEZY)</h3>${lsHtml}
      ${adsHtml()}
      <h3>AJAN BÜTÇELERİ (${fmt(allocSum)} ${cur()} tahsisli)</h3>
      <div class="muted" style="margin-bottom:6px">Ajan panelinden "Bütçe ver" ile kasadan pay ayır. Ajanlar sadece kendi bütçeleri kadar harcama ya da reklam önerebilir. Ödemeyi yine sen yaparsın.</div>
      ${alloc.length ? `<table>${alloc.map((a) => `<tr><td><a href="#" data-action="open-agent" data-id="${a.id}">${esc(a.name)}</a></td><td class="muted">${esc(a.title)}</td><td class="num">${fmt(a.budget)} ${cur()}</td></tr>`).join('')}</table>` : '<div class="muted">Henüz kimseye bütçe verilmedi.</div>'}
      <div class="infobox">${LL('Bakiye yükleme, ekibe dağıtım, bütçe talepleri ve kâr çekme için', 'For top-ups, team budgets, budget requests and withdrawals open')} <a href="#" data-action="open" data-view="wallet">💳 ${LL('Cüzdan', 'Wallet')}</a>.</div>
      <h3>KASAYA BÜTÇE EKLE</h3>
      <div class="row"><input id="dep-amount" type="number" min="1" placeholder="Tutar" /><input id="dep-note" placeholder="Not (ör. reklam bütçesi)" /><button class="btn shrink" data-action="deposit">Ekle</button></div>
      <h3>GERÇEK GELİR KAYDET</h3>
      <div class="stack"><div class="row"><input id="rev-amount" type="number" min="1" placeholder="Tutar" /><input id="rev-note" placeholder="Nereden? (ör. Shopier satışı)" /></div>
      <select id="rev-dlv"><option value="">— Hangi teslimden geldi? (ajan ödül alır) —</option>${dlv.map((d) => `<option value="${d.id}">${esc(d.agentName)}: ${esc(d.title.slice(0, 70))}</option>`).join('')}</select>
      <div><button class="btn green" data-action="revenue">💰 Gelir kaydet</button></div></div>
      <h3>DEFTER</h3>
      <table><tr><th>Ne zaman</th><th>Tür</th><th>Not</th><th class="num">Tutar</th></tr>
      ${e.slice(0, 60).map((x) => `<tr><td class="muted">${ago(x.t)}</td><td>${LEDGER_TR[x.type] || x.type}</td><td>${esc(x.note)}</td><td class="num ${ledgerCls(x)}">${ledgerAmt(x)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Boş</td></tr>'}</table>`,
  };
};

// ---------- Cüzdan (v1.1): yükle, dağıt, talepler, kâr çek ----------
let wallet = null;
let walletStale = true;
let walletLoading = false;
function loadWallet() {
  if (walletLoading) return;
  walletLoading = true;
  api('GET', '/api/wallet').then((w) => { wallet = w; walletStale = false; render(true); }).catch(() => {}).finally(() => { walletLoading = false; });
}
function walletPresets() {
  return /^(₺|TL|TRY)$/i.test(cur()) ? [500, 1000, 2500, 5000, 10000] : [50, 100, 250, 500, 1000];
}
VIEWS.wallet = () => {
  if (!wallet || walletStale) loadWallet();
  const w = wallet;
  if (!w) return { html: '<div class="muted">Yükleniyor…</div>' };
  const c = cur();
  const reqs = [...S.approvals.values()].filter((a) => a.kind === 'budget' && a.status === 'pending');
  const pb = Math.max(0, Math.min(100, w.payback || 0));
  const team = w.team.filter((t) => t.status !== 'dead' && t.role !== 'shield');
  const step = walletPresets()[0];
  return {
    html: `<div class="warnbox">${LL(
      '<b>Cüzdan bir kayıt defteridir.</b> Hiçbir banka, kart ya da kripto cüzdanına bağlanmaz; para çekmez, göndermez. Parayı kendi hesabında bu işe ayırır, buraya kaydedersin. Ajanlar bu bütçeyle harcama ve reklam <b>önerir</b>, onaylarsan <b>ödemeyi sen yaparsın</b>. Kazanç garantisi yoktur.',
      '<b>The wallet is a ledger.</b> It never connects to a bank, card or crypto wallet and never moves money. You set money aside in your own account and record it here. Agents <b>propose</b> spends and ads with their budget; if you approve, <b>you pay</b>. No earnings are guaranteed.')}</div>
      <div class="grid4">
        <div class="stat"><span class="k">${LL('KASA', 'TREASURY')}</span><span class="v">${fmt(w.balance)}</span></div>
        <div class="stat"><span class="k">${LL('SERBEST', 'FREE')}</span><span class="v green">${fmt(w.free)}</span></div>
        <div class="stat"><span class="k">${LL('AJANLARDA', 'WITH AGENTS')}</span><span class="v">${fmt(w.allocated)}</span></div>
        <div class="stat"><span class="k">${LL('YATIRILAN', 'INVESTED')}</span><span class="v">${fmt(w.capital)}</span></div>
        <div class="stat"><span class="k">${LL('GELİR', 'REVENUE')}</span><span class="v green">${fmt(w.revenue)}</span></div>
        <div class="stat"><span class="k">${LL('HARCAMA', 'SPENT')}</span><span class="v" style="color:var(--red)">${fmt(w.spend - w.refunds)}</span></div>
        <div class="stat"><span class="k">${LL('NET KÂR', 'NET PROFIT')}</span><span class="v ${w.profit >= 0 ? 'green' : ''}" style="${w.profit < 0 ? 'color:var(--red)' : ''}">${w.profit >= 0 ? '+' : ''}${fmt(w.profit)}</span></div>
        <div class="stat"><span class="k">${LL('ÇEKİLEN', 'WITHDRAWN')}</span><span class="v">${fmt(w.withdrawn)}</span></div>
      </div>
      ${w.capital ? `<div class="muted">${LL(`Yatırdığının <b>%${pb}</b>'i gelir olarak geri döndü · sermaye getirisi ${w.roi >= 0 ? '+' : ''}${w.roi}%`, `<b>${pb}%</b> of what you invested came back as revenue · return on capital ${w.roi >= 0 ? '+' : ''}${w.roi}%`)}</div>
      <div class="hp" style="height:10px;margin:6px 0 4px"><i style="width:${pb}%;background:linear-gradient(90deg,var(--accent),var(--green))"></i></div>` : ''}
      <canvas id="wallet-chart" width="560" height="110" style="width:100%;height:110px;margin-top:6px;background:#120f18;border:1px solid var(--line);border-radius:8px"></canvas>
      <div class="muted" style="font-size:11px">${LL('Son 30 gün: çizgi = kasa, çubuk = günlük gelir', 'Last 30 days: line = treasury, bars = daily revenue')}</div>

      <h3>🏦 ${LL('BAKİYE YÜKLE', 'TOP UP')}</h3>
      <div style="margin-bottom:8px"><button class="btn green small" data-action="fund-open">💸 ${LL('TL / döviz ile fonla (otomatik çeviri)', 'Fund in TRY / any currency (auto-convert)')}</button></div>
      <div class="presets">${walletPresets().map((n) => `<button data-action="wallet-preset" data-amt="${n}">+${fmt(n)} ${esc(c)}</button>`).join('')}</div>
      <div class="row"><input id="wl-amt" type="number" min="1" placeholder="${LL('Tutar', 'Amount')}" /><select id="wl-method" class="shrink" style="width:150px">${[['bank', LL('Banka havalesi', 'Bank transfer')], ['card', LL('Kart', 'Card')], ['cash', LL('Nakit', 'Cash')], ['other', LL('Diğer', 'Other')]].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="row" style="margin-top:6px"><input id="wl-note" placeholder="${LL('Not (ör. ekim ayı reklam sermayesi)', 'Note (e.g. October ad capital)')}" /><button class="btn shrink" data-action="wallet-topup">🏦 ${LL('Yükle (kaydet)', 'Top up (record)')}</button></div>
      <div class="muted" style="margin-top:4px">${LL('İpucu: lobideki ATM’den de yükleyebilirsin. Zırhlı araç parayı kasaya taşır.', 'Tip: you can also top up at the lobby ATM. An armored van carries it to the safe.')}</div>

      <h3>💼 ${LL('EKİBE DAĞIT', 'FUND THE TEAM')}</h3>
      <div class="row"><input id="ws-amt" type="number" min="1" placeholder="${LL(`Tutar (serbest: ${fmt(w.free)})`, `Amount (free: ${fmt(w.free)})`)}" /><select id="ws-mode" class="shrink" style="width:170px"><option value="performance">${LL('Performansa göre', 'By performance')}</option><option value="equal">${LL('Eşit', 'Equal')}</option></select><button class="btn shrink" data-action="wallet-split">${LL('Dağıt', 'Split')}</button></div>
      <div class="muted" style="margin-top:4px">${LL('Performans: gelir, puan, seviye ve teslim sayısı yüksek olana daha çok. Denetçi (Shield) bütçe kullanmaz.', 'Performance: more for higher revenue, rating, level and deliveries. Shield (compliance) does not use a budget.')}</div>

      <h3>📨 ${LL('BÜTÇE TALEPLERİ', 'BUDGET REQUESTS')} (${reqs.length})</h3>
      ${reqs.map(approvalCard).join('') || `<div class="muted">${LL('Bekleyen talep yok. Bütçesi biten ajanlar buraya talep düşer ve masana yürür.', 'No pending requests. Agents who run out of budget file a request here and walk to your desk.')}</div>`}

      <h3>👥 ${LL('AJAN BÜTÇELERİ & GETİRİ', 'AGENT BUDGETS & RETURNS')}</h3>
      <table><tr><th>${LL('Ajan', 'Agent')}</th><th class="num">${LL('Bütçe', 'Budget')}</th><th class="num">${LL('Verilen', 'Given')}</th><th class="num">${LL('Harcanan', 'Spent')}</th><th class="num">${LL('Getirdi', 'Earned')}</th><th class="num">ROI</th><th></th></tr>
      ${team.map((t) => `<tr><td><a href="#" data-action="open-agent" data-id="${t.id}">${esc(t.name)}</a> <span class="muted">Lv${t.level}</span></td><td class="num" style="color:var(--yellow)">${fmt(t.budget)}</td><td class="num">${fmt(t.given)}</td><td class="num">${fmt(t.spent)}</td><td class="num pos">${fmt(t.revenue)}</td><td class="num ${t.roi == null ? '' : t.roi >= 0 ? 'pos' : 'neg'}">${t.roi == null ? '-' : t.roi + '%'}</td><td style="white-space:nowrap"><button class="btn ghost small" data-action="wallet-give" data-id="${t.id}" data-amt="${step}">+${fmt(step)}</button>${t.budget > 0 ? ` <button class="btn ghost small" data-action="wallet-give" data-id="${t.id}" data-amt="${-t.budget}" title="${LL('Hepsini geri al', 'Take it all back')}">↩</button>` : ''}</td></tr>`).join('')}</table>

      <h3>🏧 ${LL('KÂR ÇEK', 'WITHDRAW PROFIT')}</h3>
      <div class="row"><input id="ww-amt" type="number" min="1" placeholder="${LL(`Tutar (en fazla ${fmt(w.free)})`, `Amount (max ${fmt(w.free)})`)}" /><input id="ww-note" placeholder="${LL('Not', 'Note')}" /><button class="btn shrink" data-action="wallet-withdraw">🏧 ${LL('Çek (kaydet)', 'Withdraw (record)')}</button></div>
      <div class="muted" style="margin-top:4px">${LL('Kendi hesabına aldığın kârı deftere işler. Ajanlara ayrılmış bütçe çekilemez; önce geri al.', 'Records profit you took into your own account. Budget allocated to agents cannot be withdrawn; take it back first.')}</div>

      <h3>📒 ${LL('SON HAREKETLER', 'RECENT ACTIVITY')}</h3>
      <table>${w.recent.slice(0, 25).map((x) => `<tr><td class="muted">${ago(x.t)}</td><td>${LEDGER_TR[x.type] || x.type}</td><td>${esc(x.note)}</td><td class="num ${ledgerCls(x)}">${ledgerAmt(x)}</td></tr>`).join('') || `<tr><td class="muted">${LL('Henüz hareket yok', 'No activity yet')}</td></tr>`}</table>`,
    after: () => drawWalletChart(w),
  };
};

function drawWalletChart(w) {
  const c = document.getElementById('wallet-chart');
  if (!c || !w?.series?.length) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W2 = c.clientWidth * dpr, H2 = c.clientHeight * dpr;
  c.width = W2; c.height = H2;
  const g = c.getContext('2d');
  const pad = 10 * dpr;
  const xs = (i) => pad + (i / (w.series.length - 1)) * (W2 - pad * 2);
  const maxB = Math.max(1, ...w.series.map((d) => Math.abs(d.balance)));
  const maxR = Math.max(1, ...w.series.map((d) => d.revenue));
  g.fillStyle = '#2ecc7155';
  const bw = Math.max(2, (W2 - pad * 2) / w.series.length - 2 * dpr);
  w.series.forEach((d, i) => { if (d.revenue) { const h = (d.revenue / maxR) * (H2 * 0.45); g.fillRect(xs(i) - bw / 2, H2 - pad - h, bw, h); } });
  g.strokeStyle = '#ff8a50';
  g.lineWidth = 2 * dpr;
  g.beginPath();
  w.series.forEach((d, i) => { const y = H2 - pad - ((d.balance + maxB) / (2 * maxB)) * (H2 - pad * 2); i ? g.lineTo(xs(i), y) : g.moveTo(xs(i), y); });
  g.stroke();
  g.strokeStyle = '#ffffff22';
  g.lineWidth = 1;
  const zero = H2 - pad - 0.5 * (H2 - pad * 2);
  g.beginPath(); g.moveTo(pad, zero); g.lineTo(W2 - pad, zero); g.stroke();
  g.fillStyle = '#9a93ad';
  g.font = `${10 * dpr}px Inter, sans-serif`;
  g.fillText(`${fmt(w.series.at(-1).balance)} ${cur()}`, W2 - pad - 80 * dpr, pad + 10 * dpr);
}

// ---------- Strateji (v1.2): ajanlar nasıl para kazanılacağına karar verir ----------
let strat = null;
let stratStale = true;
let stratLoading = false;
function loadStrat() {
  if (stratLoading) return;
  stratLoading = true;
  api('GET', '/api/strategy').then((r) => { strat = r; stratStale = false; render(true); }).catch(() => {}).finally(() => { stratLoading = false; });
}
const ACC_LABEL = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', upwork: 'Upwork', fiverr: 'Fiverr', bionluk: 'Bionluk', etsy: 'Etsy', gumroad: 'Gumroad', shopier: 'Shopier', medium: 'Medium', github: 'GitHub', appstore: 'App Store', googleplay: 'Google Play' };
function curSelect(id) {
  return `<select id="${id}" class="shrink" style="width:96px">${['TRY', 'USD', 'EUR'].map((c) => `<option value="${c}" ${c === (localStorage.getItem('hq_fund_cur') || 'TRY') ? 'selected' : ''}>${SYM[c]} ${c}</option>`).join('')}</select>`;
}
VIEWS.strategy = () => {
  if (!strat || stratStale) loadStrat();
  const v = strat;
  if (!v) return { html: '<div class="muted">Yükleniyor…</div>' };
  const p = v.profile;
  const live = v.strategies.filter((s) => s.status !== 'dropped');
  const dropped = v.strategies.filter((s) => s.status === 'dropped');
  const empty = !p.skills && !p.accounts.length;
  const card = (s) => {
    const lead = [...S.agents.values()].find((a) => a.role === s.lead && a.status !== 'dead');
    const done = s.todos.filter((t) => t.done).length;
    const left = s.minutesLeft < 24 * 60 ? `${s.minutesLeft} ${LL('dk', 'min')}` : `${Math.ceil(s.minutesLeft / 1440)} ${LL('gün', 'days')}`;
    return `<div class="card ${s.status === 'scaling' ? 'pending' : ''}">
      <div class="row"><div class="title">${s.status === 'scaling' ? '📈' : '🧭'} ${esc(s.name)}</div><span class="chip ${s.income > 0 ? 'ok' : 'info'} shrink">${money(s.income)}</span></div>
      <div class="muted">${LL('Lider', 'Lead')}: ${esc(lead?.name || s.lead)} · ${LL('seçen', 'chosen by')} ${esc(s.by || 'Max')} ${ago(s.startedAt)} ${LL('önce', 'ago')} · ${LL('değerlendirme', 'review in')} ${left}</div>
      <div style="margin-top:6px">${esc(s.why)}</div>
      ${s.plan ? `<pre>${esc(s.plan)}</pre>` : ''}
      <div class="muted">KPI: ${esc(s.kpi)}</div>
      <h4 style="margin:8px 0 4px">✅ ${LL('Senin yapacakların', 'Your to-dos')} (${done}/${s.todos.length})</h4>
      ${s.todos.map((t, i) => `<label class="muted" style="display:block;margin:3px 0"><input type="checkbox" style="width:auto" data-action="strat-todo" data-id="${s.id}" data-i="${i}" ${t.done ? 'checked' : ''}/> ${t.done ? `<s>${esc(t.text)}</s>` : esc(t.text)}</label>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn ghost small shrink" data-action="strat-drop" data-id="${s.id}">🔁 ${LL('Bırak (pivot)', 'Drop (pivot)')}</button></div>
    </div>`;
  };
  return {
    html: `<div class="infobox">${LL(
      '<b>Para kazanma yolunu ajanlar seçer.</b> Profiline bakıp 1-3 strateji seçerler, işleri dağıtırlar ve süresi dolduğunda para getirmeyeni bırakıp yenisine geçerler. Her şirkette sonuç farklıdır. Kimlik gerektiren adımlar (hesap açmak, ödeme bilgisi, yayınlamak) sana yapılacak olarak düşer. Kazanç garantisi yoktur.',
      '<b>The agents choose how to make money.</b> They read your profile, pick 1-3 strategies, split the work, and drop what does not earn when its review window ends. Every company ends up different. Steps that need your identity (opening accounts, payout details, publishing) become your to-dos. No earnings are guaranteed.')}</div>
      ${empty ? `<div class="warnbox">👤 ${LL('Ajanlara kendinden bahset: profilin boşken genel bir yol seçerler.', 'Tell the agents about yourself: with an empty profile they choose a generic path.')}</div>` : ''}
      <div class="grid4">
        <div class="stat"><span class="k">${LL('KAZANILAN', 'EARNED')}</span><span class="v green">${money(v.earned)}</span></div>
        <div class="stat"><span class="k">${LL('IBANA GEÇEN', 'PAID TO IBAN')}</span><span class="v">${money(v.paid)}</span></div>
        <div class="stat"><span class="k">${LL('PLATFORMDA', 'ON PLATFORMS')}</span><span class="v">${money(v.waiting)}</span></div>
        <div class="stat"><span class="k">${LL('AKTİF YOL', 'ACTIVE PATHS')}</span><span class="v">${live.length}</span></div>
      </div>
      <h3>🧭 ${LL('AKTİF STRATEJİLER', 'ACTIVE STRATEGIES')}</h3>
      ${live.map(card).join('') || `<div class="muted">${LL('Max şu an stratejiyi düşünüyor… (toplantı odasına bak)', 'Max is working out the strategy right now… (check the meeting room)')}</div>`}
      <details ${empty ? 'open' : ''} style="margin-top:10px"><summary><b>👤 ${LL('PROFİLİN (ajanlar buna göre seçer)', 'YOUR PROFILE (agents choose from this)')}</b></summary>
        <div class="stack" style="margin-top:8px">
          <label class="muted">${LL('Becerilerin', 'Your skills')}<input id="pf-skills" value="${esc(p.skills)}" placeholder="${LL('ör. tasarım, video montaj, İngilizce, Excel', 'e.g. design, video editing, English, Excel')}" /></label>
          <div class="row"><label class="muted">${LL('Diller', 'Languages')}<input id="pf-lang" value="${esc(p.languages)}" /></label><label class="muted shrink" style="width:130px">${LL('Saat / hafta', 'Hours / week')}<input id="pf-hours" type="number" min="1" max="80" value="${p.hours}" /></label><label class="muted shrink" style="width:150px">${LL('Risk', 'Risk')}<select id="pf-risk">${[['low', LL('Düşük (bedava yollar)', 'Low (free paths)')], ['medium', LL('Orta', 'Medium')], ['high', LL('Yüksek', 'High')]].map(([k, l]) => `<option value="${k}" ${p.risk === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <div class="muted">${LL('Açık hesapların', 'Accounts you already have')}</div>
          <div class="presets">${v.accounts.map((a) => `<label style="display:inline-flex;gap:4px;align-items:center;margin:2px 8px 2px 0"><input type="checkbox" class="pf-acc" value="${a}" style="width:auto" ${p.accounts.includes(a) ? 'checked' : ''}/> ${ACC_LABEL[a] || a}</label>`).join('')}</div>
          <div class="row"><label class="muted"><input type="checkbox" id="pf-20b" style="width:auto" ${p.special20b ? 'checked' : ''}/> ${LL('20/B istisna belgem ve özel banka hesabım var', 'I have a 20/B exemption certificate and a dedicated bank account (Turkey)')}</label><label class="muted">${LL('Hesap etiketi (tam IBAN yazma)', 'Account label (not the full IBAN)')}<input id="pf-iban" value="${esc(p.ibanLabel)}" placeholder="Bank ****1234" /></label></div>
          <div><button class="btn small" data-action="strat-profile">${LL('Profili kaydet', 'Save profile')}</button></div>
          <div class="muted">${LL('Profile en uygun yollar şu an', 'Best fits for this profile right now')}: ${v.ranking.map((r) => esc(v.catalog.find((c) => c.id === r.id)?.name || r.id)).join(' · ')}</div>
        </div>
      </details>
      <h3>💰 ${LL('GERÇEK GELİR KAYDET', 'RECORD REAL INCOME')}</h3>
      <div class="row"><input id="in-amt" type="number" min="1" placeholder="${LL('Tutar', 'Amount')}" />${curSelect('in-cur')}<input id="in-src" placeholder="${LL('Nereden? (ör. Fiverr, AdSense)', 'From where? (e.g. Fiverr, AdSense)')}" /></div>
      <div class="row" style="margin-top:6px"><select id="in-str"><option value="">— ${LL('Hangi stratejiden?', 'Which strategy?')} —</option>${v.strategies.map((s) => `<option value="${s.id}">${esc(s.name)}${s.status === 'dropped' ? ` (${LL('bırakıldı', 'dropped')})` : ''}</option>`).join('')}</select><button class="btn green shrink" data-action="income-add">💰 ${LL('Kaydet', 'Record')}</button></div>
      <div class="muted" style="margin-top:4px">${LL('Gelir stratejiye yazılır, lider ajan ödül alır. Pivot kararı buna göre verilir.', 'Income is credited to the strategy and its lead agent is rewarded. Pivot decisions use it.')}</div>
      <h3>🏦 ${LL('PLATFORMDAN IBAN’A ÖDEME', 'PAYOUT FROM PLATFORM TO IBAN')}</h3>
      <div class="row"><input id="po-amt" type="number" min="1" placeholder="${LL('Tutar', 'Amount')}" />${curSelect('po-cur')}<input id="po-plat" placeholder="${LL('Platform (ör. Fiverr)', 'Platform (e.g. Fiverr)')}" /><button class="btn shrink" data-action="payout-add">🏦 ${LL('Kaydet', 'Record')}</button></div>
      ${p.special20b ? `<div class="warnbox" style="margin-top:6px">${LL(`20/B: tüm hasılatın özel hesaba gelmesi gerekir; banka yatan tutardan nihai vergi olarak ~%15 keser. Tahmini kesinti: <b>${money(v.withholdingEstimate)}</b>. Kapsam ve yıllık sınır için mali müşavirine danış.`, `20/B (Turkey): all income must arrive in the dedicated account; the bank withholds ~15% as final tax. Estimated withholding: <b>${money(v.withholdingEstimate)}</b>. Confirm scope and the yearly limit with your accountant.`)}</div>` : ''}
      <table style="margin-top:6px">${v.payouts.slice(0, 12).map((x) => `<tr><td class="muted">${ago(x.t)}</td><td>${esc(x.note)}</td><td class="num">${money(x.amount)}</td></tr>`).join('') || `<tr><td class="muted">${LL('Henüz ödeme yok', 'No payouts yet')}</td></tr>`}</table>
      ${dropped.length ? `<h3>🔁 ${LL('PİVOT GEÇMİŞİ', 'PIVOT HISTORY')}</h3>${dropped.map((s) => `<div class="card"><div class="title">✕ ${esc(s.name)}</div><div class="muted">${esc(s.dropReason || '')} · ${ago(s.droppedAt)} ${LL('önce', 'ago')} · ${money(s.income)}</div></div>`).join('')}` : ''}`,
  };
};

// ---------- Borsa ----------
let pf = null;
VIEWS.market = () => {
  if (!pf) api('GET', '/api/portfolio').then((p) => { pf = p; render(true); }).catch(() => {});
  const p = pf;
  return {
    html: `<div class="warnbox"><b>Simülasyon.</b> Gerçek para yok, hiçbir aracı kuruma bağlanmaz. Penny (CFO) stratejilerini burada sanal sermayeyle dener. <b>Yatırım tavsiyesi değildir.</b> Fiyatlar Yahoo Finance'ten gecikmeli gelir (BIST için .IS: THYAO.IS); erişilemezse simüle edilir.</div>
      ${p ? `<div class="grid4">
        <div class="stat"><span class="k">${LL('DEĞER', 'VALUE')} ${esc(p.baseSymbol || '₺')}</span><span class="v">${fmt(p.value)}</span></div>
        <div class="stat"><span class="k">NAKİT</span><span class="v">${fmt(p.cash)}</span></div>
        <div class="stat"><span class="k">K/Z</span><span class="v ${p.pnl >= 0 ? 'green' : ''}" style="${p.pnl < 0 ? 'color:var(--red)' : ''}">${p.pnl >= 0 ? '+' : ''}${fmt(p.pnl)}</span></div>
        <div class="stat"><span class="k">BAŞLANGIÇ</span><span class="v">${fmt(p.startCapital)}</span></div></div>
      <h3>POZİSYONLAR</h3>
      <table><tr><th>Sembol</th><th class="num">Adet</th><th class="num">${LL('Ort.', 'Avg')} ${esc(p.baseSymbol || '₺')}</th><th class="num">Fiyat</th><th class="num">${LL('K/Z', 'P/L')} ${esc(p.baseSymbol || '₺')}</th></tr>${p.positions.map((x) => `<tr><td>${esc(x.sym)} ${x.source === 'sim' ? '<span class="chip">sim</span>' : ''}</td><td class="num">${x.qty}</td><td class="num">${x.avg.toFixed(2)}</td><td class="num">${x.price} ${esc(x.currency || '')}</td><td class="num ${x.pnl >= 0 ? 'pos' : 'neg'}">${x.pnl.toFixed(2)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Pozisyon yok</td></tr>'}</table>
      <h3>SANAL İŞLEM (patron)</h3>
      <div class="row"><input id="mt-sym" placeholder="AAPL" /><select id="mt-side" class="shrink" style="width:90px"><option value="buy">AL</option><option value="sell">SAT</option></select><input id="mt-qty" type="number" min="1" placeholder="Adet" /><button class="btn shrink" data-action="market-trade">İşlem</button></div>
      <h3>SON İŞLEMLER</h3>
      <table><tr><th>Zaman</th><th>Kim</th><th>İşlem</th><th>Gerekçe</th></tr>${[...p.trades].reverse().slice(0, 25).map((t) => `<tr><td class="muted">${ago(t.t)}</td><td>${esc(t.by)}</td><td class="${t.side === 'buy' ? 'pos' : 'neg'}">${t.side === 'buy' ? 'AL' : 'SAT'} ${t.qty} ${esc(t.sym)} @${t.price}</td><td class="muted">${esc(t.reason)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">-</td></tr>'}</table>
      <h3>SANAL SERMAYEYİ SIFIRLA</h3>
      <div class="row"><input id="mr-cap" type="number" placeholder="100000" /><button class="btn ghost shrink" data-action="market-reset">Sıfırla</button><button class="btn ghost shrink" data-action="market-refresh">↻ Yenile</button></div>` : '<div class="muted">Yükleniyor…</div>'}`,
  };
};

// ---------- Claude ----------
function claudeBody() {
  const c = S.claude || {};
  return `<div class="infobox">Claude <b>otonom çalışmaz</b>. Burada iş verdiğinde bilgisayarındaki Claude Code (<code>claude -p</code>) workspace içindeki proje klasöründe gerçek geliştirme yapar ve senin Claude kullanım limitinden harcar. Bugün: <b>${c.usedToday || 0}/${c.limit || 10}</b></div>
    <div class="stack">
      <label class="muted">Proje klasörü (workspace/…)<input id="cl-project" placeholder="ornek-urun" /></label>
      <textarea id="cl-prompt" rows="5" placeholder="Örn: urun/index.html satış sayfasını profesyonelleştir, Shopier butonu ekle, mobil uyumu düzelt."></textarea>
      <div class="row"><button class="btn" data-action="claude-run" ${c.running ? 'disabled' : ''}>⚡ Claude'u çalıştır</button>${c.running ? '<button class="btn red shrink" data-action="claude-stop">■ Durdur</button>' : ''}</div>
    </div>
    <h3>CANLI ÇIKTI</h3><div class="term" id="term"></div>`;
}
VIEWS.claude = () => {
  const a = [...S.agents.values()].find((x) => x.role === 'claude');
  if (a) tabs[a.id] = 'claude';
  return a ? VIEWS.agent(a.id) : { html: 'Claude masası yok.' };
};

// ---------- Yönetim ----------
VIEWS.settings = () => {
  const s = S.company?.settings || {};
  return {
    html: `<h3>DİL / LANGUAGE</h3>
      <div class="row"><button class="btn small ${getLang() === 'tr' ? '' : 'ghost'}" data-action="set-lang" data-lang="tr">🇹🇷 Türkçe</button><button class="btn small ${getLang() === 'en' ? '' : 'ghost'}" data-action="set-lang" data-lang="en">🇬🇧 English</button></div>
      <div class="muted" style="margin-top:4px">Arayüz ve ajanların yazdığı içerik bu dile geçer. / Interface and agent output switch to this language.</div>
      <h3>ŞİRKET</h3>
      <div class="row"><label class="muted">Şirket adı<input id="set-name" value="${esc(S.company?.name)}" /></label><label class="muted shrink" style="width:90px">Para birimi<input id="set-cur" value="${esc(cur())}" /></label></div>
      <h3>HAYATTA KALMA EKONOMİSİ</h3>
      <div class="row"><label class="muted">Saatlik can yakımı<input id="set-burn" type="number" step="0.5" value="${s.burnPerHour ?? 2}" /></label><label class="muted">Proaktif iş aralığı (dk)<input id="set-pro" type="number" value="${s.proactiveMinutes ?? 12}" /></label></div>
      <div class="row" style="margin-top:8px"><label class="muted"><input type="checkbox" id="set-autohire" style="width:auto" ${s.autoHire ? 'checked' : ''}/> Kovulanın yerine otomatik işe al</label></div>
      <div style="margin-top:10px"><button class="btn" data-action="settings-save">Kaydet</button></div>
      <h3>OFİS</h3>
      <button class="btn ${s.paused ? 'green' : 'red'}" data-action="pause">${s.paused ? '▶ Ofisi çalıştır' : '⏸ Ofisi duraklat'}</button>
      <div class="muted" style="margin-top:6px">Duraklatınca ajanlar yeni LLM çağrısı yapmaz ve canları erimez.</div>
      <h3>GÖRSEL EFEKTLER</h3>
      <div class="row"><button class="btn small ${getScanlines() ? '' : 'ghost'}" data-action="fx-scan">📺 CRT tarama çizgileri: ${getScanlines() ? 'AÇIK' : 'KAPALI'}</button><button class="btn small ${getReduceFx() ? '' : 'ghost'}" data-action="fx-reduce">🌙 Efektleri azalt: ${getReduceFx() ? 'AÇIK' : 'KAPALI'}</button></div>
      <div class="muted" style="margin-top:4px">"Efektleri azalt" vinyeti ve sinematik şeritleri kapatır; zayıf bilgisayarlar ve uzun oturumlar için.</div>
      <h3>🛡️ ${LL('GERÇEK PARA GÜVENLİĞİ', 'REAL-MONEY SAFETY')}</h3>
      ${safetyAdmin()}
      <h3>${LL('DÜNYA & HAVA DURUMU', 'WORLD & WEATHER')}</h3>
      <div class="row"><label class="muted">${LL('Hava', 'Weather')}<select id="set-wx">${[['auto', LL('Otomatik (mevsime göre simülasyon)', 'Automatic (seasonal simulation)')], ['real', LL('Gerçek hava (şehir)', 'Real weather (city)')], ['clear', '☀️'], ['cloudy', '☁️'], ['rain', '🌧️'], ['storm', '⛈️'], ['snow', '❄️'], ['fog', '🌫️']].map(([k, l]) => `<option value="${k}" ${(s.weather || 'auto') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="muted">${LL('Şehir', 'City')}<input id="set-city" value="${esc(s.city || '')}" placeholder="Istanbul" /></label><button class="btn small shrink" data-action="weather-save" style="align-self:flex-end">${LL('Kaydet', 'Save')}</button></div>
      <div class="muted" style="margin-top:4px">${LL('Gerçek hava Open-Meteo’dan (ücretsiz, anahtarsız) gelir; sadece şehir adı gönderilir. Şu an', 'Real weather comes from Open-Meteo (free, no key); only the city name is sent. Now')}: ${weatherIcon()} ${esc(weatherName())} ${weather.temp}°${weather.city ? ' · ' + esc(weather.city) : ''}${weather.error ? ` · <span style="color:#ff9b9b">${esc(weather.error)}</span>` : ''}</div>
      <h3>VERİ</h3>
      <div class="row"><a class="btn ghost small shrink" href="/api/export" download>💾 Yedeği indir (zip)</a><button class="btn red small shrink" data-action="reset-company">🧨 Şirketi sıfırla</button></div>
      <div class="muted" style="margin-top:4px">Yedek; şirket verisini ve workspace dosyalarını içerir, API anahtarlarını içermez. Sıfırlamadan önce otomatik yedek alınır (data/backups).</div>
      <h3>HAKKINDA</h3>
      <div class="muted">Hustle HQ v1.2 · ${LL('Veriler <code>data/</code>, ajan çıktıları <code>workspace/</code> klasöründe. Kurallar kodda sabittir: gerçek para transferi, gerçek borsa işlemi, hesap açma ve şifre girişi yoktur.', 'Data lives in <code>data/</code>, agent output in <code>workspace/</code>. Rules are hard-coded: no real money transfers, no real trading, no account creation and no password entry.')}</div>
      <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn ghost small shrink" data-action="onboarding">📖 ${LL('Tutorial ve güvenlik kuralları', 'Tutorial & safety rules')}</button><button class="btn red small shrink" data-action="shutdown">⏻ ${LL('Sunucuyu kapat', 'Shut down server')}</button></div>
      <div class="muted" style="margin-top:4px">${LL('Masaüstü kısayolu sunucuyu arka planda açar; ajanlar pencere kapalıyken de çalışır. Tamamen durdurmak için bu düğmeyi kullan.', 'The desktop shortcut runs the server in the background; agents keep working when the window is closed. Use this button to stop it completely.')}</div>`,
  };
};

function safetyAdmin() {
  if (!safety) loadSafety();
  const st = safety;
  if (!st) return '<div class="muted">Yükleniyor…</div>';
  return `<div class="dangerbox">${LL('Onaylanan her harcama ve reklam <b>senin gerçek paran</b>. Bu raylar seni hatalı ya da aşırı harcamadan korur.', 'Every approved spend and ad is <b>your real money</b>. These rails protect you from mistakes and overspending.')}</div>
    <div class="grid4">
      <div class="stat"><span class="k">${LL('BUGÜN', 'TODAY')}</span><span class="v">${money(st.today)}</span></div>
      <div class="stat"><span class="k">${LL('GÜNLÜK LİMİT', 'DAILY CAP')}</span><span class="v">${money(st.dailyCap)}</span></div>
      <div class="stat"><span class="k">${LL('14 GÜN HARCAMA', '14-DAY SPEND')}</span><span class="v">${money(st.spend14)}</span></div>
      <div class="stat"><span class="k">${LL('ZARAR DURDURMA', 'STOP-LOSS')}</span><span class="v" style="color:${st.frozen ? 'var(--red)' : 'var(--green)'}">${st.frozen ? LL('DONDU', 'FROZEN') : st.stopLossPct ? `${st.stopLossPct}%` : LL('KAPALI', 'OFF')}</span></div>
    </div>
    <div class="row"><label class="muted">${LL('Günlük harcama limiti', 'Daily spend cap')} (${esc(cur())})<input id="sf-cap" type="number" min="0" value="${st.dailyCap}" /></label><label class="muted">${LL('Zarar durdurma (% sermaye, 0 = kapalı)', 'Stop-loss (% of capital, 0 = off)')}<input id="sf-stop" type="number" min="0" max="100" value="${st.stopLossPct}" /></label><label class="muted">${LL('Tutar teyidi eşiği (% kasa)', 'Typed-confirm threshold (% treasury)')}<input id="sf-big" type="number" min="0" max="100" value="${st.bigSpendPct}" /></label></div>
    <div style="margin-top:8px"><button class="btn small" data-action="safety-save">${LL('Kaydet', 'Save')}</button></div>
    <div class="muted" style="margin-top:6px">${LL('Zarar durdurma: son 14 günde hiç gelir yokken sermayenin bu yüzdesi kadar harcanırsa yeni harcama onayları kilitlenir.', 'Stop-loss: if this % of your capital is spent in 14 days with zero revenue, new spend approvals are locked.')} ${st.ack ? `· ✅ ${LL('Kurallar onaylandı', 'Rules accepted')} ${ago(st.ack.t)} ${LL('önce', 'ago')}` : ''}</div>
    <details style="margin-top:8px"><summary>${LL('Güvenlik kuralları', 'Safety rules')}</summary>${rulesHtml()}</details>`;
}

// ======================= AKSİYONLAR =======================
function onAction(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  runAction(el.dataset.action, el);
}

async function runAction(action, el) {
  const id = el.dataset.id;
  const val = (sel) => document.getElementById(sel)?.value?.trim() || '';
  try {
    switch (action) {
      case 'close': return closeAll();
      case 'open': return open(el.dataset.view);
      case 'open-agent': return openAgent(id);
      case 'tab': tabs[id] = el.dataset.tab; return render(true);
      case 'goal-preset': $('#goal-input').value = el.dataset.text; return;
      case 'goal-set': {
        const text = val('goal-input');
        if (!text) return toast('Hedef yaz', 'error');
        await api('POST', '/api/goal', { text });
        $('#goal-input').value = '';
        return render(true);
      }
      case 'goal-queue': {
        const text = val('goal-input');
        if (!text) return toast('Hedef yaz', 'error');
        await api('POST', '/api/goals/queue', { op: 'add', text });
        $('#goal-input').value = '';
        toast('➕ Hedef sıraya eklendi', 'done');
        return render(true);
      }
      case 'gq-move': await api('POST', '/api/goals/queue', { op: 'move', index: Number(el.dataset.i), dir: el.dataset.dir }); return render(true);
      case 'gq-del': await api('POST', '/api/goals/queue', { op: 'remove', index: Number(el.dataset.i) }); return render(true);
      case 'report-now': {
        const r = await api('POST', '/api/report/now');
        toast(r.task ? '📊 Rapor görevi Penny’ye verildi' : 'Rapor şu an verilemedi (Penny yok ya da ofis duraklatılmış)', r.task ? 'done' : 'error');
        return;
      }
      case 'fx-scan': toggleScanlines(); return render(true);
      case 'fx-reduce': setReduceFx(!getReduceFx()); return render(true);
      case 'goal-clear': await api('POST', '/api/goal', { text: '' }); return render(true);
      case 'approve': return decide(id, true);
      case 'reject': return decide(id, false);
      case 'task-new': {
        const title = val('nt-title');
        if (!title) return toast('Başlık yaz', 'error');
        await api('POST', '/api/tasks', { title, detail: val('nt-detail'), assignee: val('nt-assignee') });
        toast('📋 Görev verildi', 'done');
        $('#nt-title').value = '';
        $('#nt-detail').value = '';
        return;
      }
      case 'task-cancel': await api('POST', `/api/tasks/${id}/cancel`); return;
      case 'agent-chat': {
        const input = $('#chat-input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.disabled = true;
        const log = $('#chatlog');
        log?.insertAdjacentHTML('beforeend', `<div class="boss">★ ${esc(text)}</div><div class="result" id="typing">yazıyor…</div>`);
        if (log) log.scrollTop = log.scrollHeight;
        try {
          const r = await api('POST', `/api/agents/${id}/chat`, { text });
          if (r.task) toast(`📋 ${S.agents.get(id)?.name} görevi aldı: ${r.task.title}`, 'done');
        } finally {
          input.disabled = false;
          $('#typing')?.remove();
          render(true);
          setTimeout(() => $('#chat-input')?.focus(), 50);
        }
        return;
      }
      case 'agent-task': {
        const title = val('at-title');
        if (!title) return toast('Başlık yaz', 'error');
        await api('POST', '/api/tasks', { title, detail: val('at-detail'), assignee: id });
        toast('📋 Görev verildi', 'done');
        return render(true);
      }
      case 'chain-add': {
        const inp = $('#engine-chain');
        inp.value = [...inp.value.split(',').map((s) => s.trim()).filter(Boolean), el.dataset.alias].join(', ');
        return;
      }
      case 'agent-engine':
        await api('POST', `/api/agents/${id}/engine`, { chain: val('engine-chain').split(',').map((s) => s.trim()).filter(Boolean) });
        return toast('Motor zinciri kaydedildi', 'done');
      case 'chain-save':
        await api('POST', `/api/agents/${id}/engine`, { chain: val(`ch-${id}`).split(',').map((s) => s.trim()).filter(Boolean) });
        return toast('Kaydedildi', 'done');
      case 'agent-fire':
        if (!confirm(`${S.agents.get(id)?.name} kovulsun mu?`)) return;
        await api('POST', `/api/agents/${id}/fire`);
        return;
      case 'agent-revive': await api('POST', `/api/agents/${id}/revive`); return;
      case 'agent-hire': {
        const r = await api('POST', `/api/agents/${id}/hire`);
        if (r.agent) openAgent(r.agent.id);
        return;
      }
      case 'agent-goto': focusAgent(id); return closeAll();
      case 'agent-follow': followAgent(id); return closeAll();
      case 'prov-save': {
        const key = val(`key-${id}`);
        if (!key) return toast('Anahtarı yapıştır', 'error');
        const r = await api('POST', '/api/providers/key', { id, key });
        toast(r.demo ? 'Kaydedildi' : '✅ Kaydedildi. Ofis CANLI moda geçti!', 'done');
        const t = await api('POST', `/api/providers/${id}/test`);
        toast(t.ok ? `✅ ${id} çalışıyor (${t.model})` : `⚠️ ${id}: ${t.error}`, t.ok ? 'done' : 'error');
        return render(true);
      }
      case 'prov-test': {
        toast('Test ediliyor…');
        const t = await api('POST', `/api/providers/${id}/test`);
        toast(t.ok ? `✅ Çalışıyor: ${t.model}` : `⚠️ ${t.error}`, t.ok ? 'done' : 'error');
        return render(true);
      }
      case 'env-save': {
        const b = {};
        for (const k of ['MAX_CONCURRENT', 'TICK_SECONDS', 'OLLAMA_MODEL']) { const v = val(`env-${k}`); if (v) b[k] = v; }
        await api('POST', '/api/settings/env', b);
        return toast('Kaydedildi', 'done');
      }
      case 'look': {
        const k = el.dataset.k;
        const v = el.dataset.bool ? !!Number(el.dataset.v) : Number(el.dataset.v);
        const target = el.dataset.target || 'boss';
        if (target === 'boss') await api('POST', '/api/company', { boss: { look: { [k]: v } } });
        else await api('POST', `/api/agents/${target}/look`, { look: { [k]: v } });
        return;
      }
      case 'ad-result': {
        await api('POST', `/api/ads/${id}/result`, { spent: val(`ads-${id}`) === '' ? undefined : Number(val(`ads-${id}`)), clicks: Number(val(`adc-${id}`)) || 0, revenue: Number(val(`adr-${id}`)) || 0 });
        await refreshLedger();
        toast('📢 Reklam sonucu kaydedildi', 'done');
        return render(true);
      }
      case 'fs-go': return loadDir(el.dataset.path || '');
      case 'fs-prev': {
        const p = el.dataset.path;
        if (IMG_EXT.test(p) && !/\.svg$/i.test(p)) { fsState.preview = { path: p, img: true }; return render(true); }
        const r = await fetch(`/api/file?path=${encodeURIComponent(p)}`);
        const t = await r.text();
        fsState.preview = { path: p, text: t.length > 20000 ? t.slice(0, 20000) + '\n…[kesildi]' : t };
        return render(true);
      }
      case 'wallet-preset': $('#wl-amt').value = el.dataset.amt; return;
      case 'wallet-topup': {
        const amount = Number(val('wl-amt'));
        if (!amount) return toast(LL('Tutar yaz', 'Enter an amount'), 'error');
        if (!confirm(LL(`${fmt(amount)} ${cur()} yükleme deftere kaydedilsin mi? (Sistem para çekmez; bu parayı kendi hesabında ayırdığını kaydedersin.)`, `Record a ${fmt(amount)} ${cur()} top-up? (The system never takes money; you are recording money you set aside yourself.)`))) return;
        wallet = await api('POST', '/api/wallet/topup', { amount, method: val('wl-method'), note: val('wl-note') });
        await refreshLedger();
        return render(true);
      }
      case 'wallet-split': {
        const amount = Number(val('ws-amt'));
        if (!amount) return toast(LL('Tutar yaz', 'Enter an amount'), 'error');
        const r = await api('POST', '/api/wallet/distribute', { amount, mode: val('ws-mode') });
        wallet = r.wallet;
        toast(`💼 ${r.split.map((x) => `${x.name} +${fmt(x.amount)}`).join(' · ')}`, 'money');
        await refreshLedger();
        return render(true);
      }
      case 'wallet-withdraw': {
        const amount = Number(val('ww-amt'));
        if (!amount) return toast(LL('Tutar yaz', 'Enter an amount'), 'error');
        if (!confirm(LL(`${fmt(amount)} ${cur()} kâr çekimi deftere kaydedilsin mi?`, `Record a ${fmt(amount)} ${cur()} withdrawal?`))) return;
        wallet = await api('POST', '/api/wallet/withdraw', { amount, note: val('ww-note') });
        await refreshLedger();
        return render(true);
      }
      case 'wallet-give': {
        await api('POST', `/api/agents/${id}/budget`, { amount: Number(el.dataset.amt) });
        walletStale = true;
        await refreshLedger();
        return render(true);
      }
      case 'agent-praise': {
        const r = await api('POST', `/api/agents/${id}/treat`, { kind: 'praise' });
        toast(r.ok ? LL(`😊 ${S.agents.get(id)?.name} övüldü (+XP, stres ↓)`, `😊 ${S.agents.get(id)?.name} praised (+XP, stress ↓)`) : r.text, r.ok ? 'done' : 'info');
        return;
      }
      case 'fund-go': return fundGo(() => { $('#modal').hidden = true; $('#modal').onclick = null; });
      case 'fund-open': return showFundModal();
      case 'strat-profile': {
        strat = await api('POST', '/api/strategy/profile', {
          skills: val('pf-skills'), languages: val('pf-lang'), hours: Number(val('pf-hours')), risk: val('pf-risk'),
          accounts: [...document.querySelectorAll('.pf-acc:checked')].map((x) => x.value), special20b: $('#pf-20b').checked, ibanLabel: val('pf-iban'),
        });
        toast(LL('👤 Profil kaydedildi. Ajanlar sıradaki stratejide bunu kullanır.', '👤 Profile saved. The agents use it for the next strategy.'), 'done');
        return render(true);
      }
      case 'strat-todo': strat = await api('POST', `/api/strategy/${id}/todo`, { i: Number(el.dataset.i), done: el.checked }); return render(true);
      case 'strat-drop': {
        if (!confirm(LL('Bu strateji bırakılsın mı? Max yerine yenisini seçer.', 'Drop this strategy? Max will choose a new one.'))) return;
        strat = await api('POST', `/api/strategy/${id}/drop`, { reason: LL('patron bıraktı', 'dropped by the boss') });
        return render(true);
      }
      case 'income-add': {
        const amount = Number(val('in-amt'));
        if (!amount) return toast(LL('Tutar yaz', 'Enter an amount'), 'error');
        strat = await api('POST', '/api/income', { amount, currency: val('in-cur'), source: val('in-src'), strategyId: val('in-str') || null });
        await refreshLedger();
        return render(true);
      }
      case 'payout-add': {
        const amount = Number(val('po-amt'));
        if (!amount) return toast(LL('Tutar yaz', 'Enter an amount'), 'error');
        strat = await api('POST', '/api/payout', { amount, currency: val('po-cur'), platform: val('po-plat') });
        await refreshLedger();
        return render(true);
      }
      case 'safety-save': {
        safety = await api('POST', '/api/company', { settings: { safety: { dailyCap: val('sf-cap'), stopLossPct: val('sf-stop'), bigSpendPct: val('sf-big') } } }).then(() => api('GET', '/api/safety'));
        toast(LL('🛡️ Güvenlik ayarları kaydedildi', '🛡️ Safety settings saved'), 'done');
        return render(true);
      }
      case 'shutdown': {
        if (!confirm(LL('Sunucu kapatılsın mı? Ajanlar durur. Masaüstü kısayolu ile tekrar açabilirsin.', 'Shut down the server? Agents stop. Reopen it with the desktop shortcut.'))) return;
        await api('POST', '/api/shutdown');
        document.body.innerHTML = `<div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:var(--pixel);color:#ff8a50;font-size:20px;text-align:center">HUSTLE HQ<br>${LL('kapatıldı. Bu pencereyi kapatabilirsin.', 'is shut down. You can close this window.')}</div>`;
        return;
      }
      case 'pizza': {
        const r = await api('POST', '/api/team/pizza');
        if (!r.ok) toast(`🍕 ${r.text}`, 'info');
        return;
      }
      case 'weather-save': {
        await api('POST', '/api/company', { settings: { weather: val('set-wx'), city: val('set-city') } });
        await refreshWeather();
        toast(`${weatherIcon()} ${weatherName()} ${weather.temp}°${weather.error ? ' · ' + weather.error : ''}`, weather.error ? 'error' : 'done');
        return render(true);
      }
      case 'agent-budget': {
        const amount = Number(val('bud-amt'));
        if (!amount) return toast('Tutar yaz', 'error');
        await api('POST', `/api/agents/${id}/budget`, { amount });
        return render(true);
      }
      case 'ls-key': {
        const key = val('ls-key');
        if (!key) return toast('Anahtarı yapıştır', 'error');
        const r = await api('POST', '/api/lemonsqueezy/key', { key });
        toast(r.error ? `⚠️ ${r.error}` : '🍋 Lemon Squeezy bağlandı', r.error ? 'error' : 'done');
        ls = await api('GET', '/api/lemonsqueezy');
        return render(true);
      }
      case 'ls-sync': {
        const r = await api('POST', '/api/lemonsqueezy/sync');
        toast(r.error ? `⚠️ ${r.error}` : `🍋 Senkron: ${r.added || 0} yeni satış`, r.error ? 'error' : 'done');
        ls = await api('GET', '/api/lemonsqueezy');
        return render(true);
      }
      case 'ls-link': {
        ls = await api('POST', '/api/lemonsqueezy/link', { productId: id, deliverableId: document.getElementById(`lsl-${id}`)?.value || null });
        toast('Ürün bağlandı', 'done');
        return render(true);
      }
      case 'agent-rename': {
        const name = val('ag-name');
        if (name) await api('POST', `/api/agents/${id}/look`, { look: {}, name });
        return toast('Kaydedildi', 'done');
      }
      case 'boss-name': await api('POST', '/api/company', { boss: { name: val('boss-name') || 'Boss' } }); return toast('Kaydedildi', 'done');
      case 'rate': await api('POST', `/api/deliverables/${id}/rate`, { stars: Number(el.dataset.stars) }); return;
      case 'revenue-link': {
        const amt = prompt('Bu teslimden gelen gerçek gelir tutarı?');
        if (!amt) return;
        await api('POST', '/api/ledger/revenue', { amount: Number(amt), note: 'Teslimden gelir', deliverableId: id });
        await refreshLedger();
        return;
      }
      case 'deposit':
        await api('POST', '/api/ledger/deposit', { amount: Number(val('dep-amount')), note: val('dep-note') });
        await refreshLedger();
        return render(true);
      case 'revenue':
        await api('POST', '/api/ledger/revenue', { amount: Number(val('rev-amount')), note: val('rev-note'), deliverableId: val('rev-dlv') || null });
        await refreshLedger();
        return render(true);
      case 'market-trade':
        await api('POST', '/api/portfolio/trade', { symbol: val('mt-sym'), side: val('mt-side'), qty: Number(val('mt-qty')) });
        pf = await api('GET', '/api/portfolio');
        return render(true);
      case 'market-reset':
        if (!confirm('Sanal portföy sıfırlansın mı?')) return;
        pf = await api('POST', '/api/portfolio/reset', { capital: Number(val('mr-cap')) || 100000 });
        return render(true);
      case 'market-refresh': pf = await api('GET', '/api/portfolio'); return render(true);
      case 'claude-run': {
        const prompt = val('cl-prompt');
        if (!prompt) return toast('Claude için görev yaz', 'error');
        await api('POST', '/api/claude', { prompt, project: val('cl-project') || 'claude' });
        toast('⚡ Claude çalışıyor…', 'done');
        $('#cl-prompt').value = '';
        return;
      }
      case 'claude-stop': await api('POST', '/api/claude/stop'); return;
      case 'settings-save':
        await api('POST', '/api/company', {
          name: val('set-name'), currency: val('set-cur'),
          settings: { burnPerHour: Number(val('set-burn')), proactiveMinutes: Number(val('set-pro')), autoHire: $('#set-autohire').checked },
        });
        return toast('Kaydedildi', 'done');
      case 'pause': await api('POST', '/api/company', { settings: { paused: !S.company.settings.paused } }); return;
      case 'onboarding': return showTutorial();
      case 'reset-company': {
        const word = getLang() === 'en' ? 'RESET' : 'SIFIRLA';
        const typed = prompt(`${getLang() === 'en' ? 'This starts a fresh company (an automatic backup is saved first). Type' : 'Şirket sıfırdan başlar (önce otomatik yedek alınır). Onay için yaz:'} ${word}`);
        if ((typed || '').trim().toUpperCase() !== word) return toast(getLang() === 'en' ? 'Cancelled' : 'İptal edildi');
        const r = await api('POST', '/api/reset', { confirm: 'RESET' });
        toast(`💾 ${r.backup}`, 'done');
        return;
      }
      case 'set-lang': {
        const l = el.dataset.lang;
        setLang(l);
        await api('POST', '/api/settings/env', { LANG: l });
        location.reload();
        return;
      }
      case 'onboard-done':
        localStorage.setItem('hq_onboarded', '1');
        $('#modal').hidden = true;
        if (el.dataset.next) open(el.dataset.next);
        return;
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ======================= EVE GİT =======================
export function goHome() {
  const left = Date.now();
  try { localStorage.setItem('hq_last_seen', String(left)); } catch {}
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="modal-box" style="text-align:center">
    <h1>🚌 EVE <span>GİTTİN</span></h1>
    <p class="muted">Ofis seni beklemiyor: ajanlar çalışmaya devam ediyor. Döndüğünde neler olduğunu göreceksin.</p>
    <div class="muted" id="away-clock" style="font-family:var(--pixel);font-size:20px;margin:16px 0">00:00</div>
    <button class="btn" id="come-back">🏢 Ofise dön</button>
  </div>`;
  const iv = setInterval(() => {
    const s = Math.floor((Date.now() - left) / 1000);
    const el = $('#away-clock');
    if (el) el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
  $('#come-back').onclick = () => {
    clearInterval(iv);
    m.hidden = true;
    if (Date.now() - left > 60000) showAwayReport(left);
  };
}

// ======================= SEN YOKKEN =======================
export function showAwayReport(since) {
  const dl = S.deliverables.filter((d) => d.createdAt > since);
  const done = [...S.tasks.values()].filter((t) => t.status === 'done' && t.updatedAt > since).length;
  const dec = S.decisions.filter((d) => d.t > since);
  const fired = dec.filter((d) => /KOVULDU/.test(d.title));
  const rev = (S.ledger.entries || []).filter((e) => e.type === 'revenue' && e.t > since).reduce((s, e) => s + e.amount, 0);
  const hrs = ((Date.now() - since) / 3.6e6).toFixed(1);
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="modal-box">
    <h1>SEN YOKKEN <span>${hrs} SAAT</span></h1>
    <p class="muted">Ofis çalışmaya devam etti. İşte özet:</p>
    <div class="grid4">
      <div class="stat"><span class="k">GÖREV</span><span class="v">${done}</span></div>
      <div class="stat"><span class="k">TESLİM</span><span class="v">${dl.length}</span></div>
      <div class="stat"><span class="k">GELİR</span><span class="v green">${fmt(rev)}</span></div>
      <div class="stat"><span class="k">ONAY</span><span class="v">${S.pending}</span></div>
    </div>
    ${fired.length ? `<div class="warnbox">💀 ${fired.map((d) => esc(d.title)).join('<br>')}</div>` : ''}
    <h3 style="font-family:var(--pixel);font-size:12px;color:var(--accent-2)">ÖNE ÇIKAN TESLİMLER</h3>
    ${dl.slice(-5).reverse().map((d) => `<div class="card"><b>${KIND_TR[d.kind] || '📄'} ${esc(d.title)}</b> <span class="chip">${esc(d.agentName)}</span><div class="muted">${esc((d.summary || '').slice(0, 140))}</div></div>`).join('') || '<div class="muted">Yeni teslim yok.</div>'}
    <div class="row" style="margin-top:12px">${S.pending ? '<button class="btn" data-action="onboard-done" data-next="approvals">📥 Onaylara bak</button>' : ''}<button class="btn ghost" data-action="onboard-done" data-next="deliverables">📦 Teslimleri puanla</button><button class="btn ghost" data-action="onboard-done">Ofise gir →</button></div>
  </div>`;
}

// ======================= İLK KURULUM SİHİRBAZI =======================
const SETUP_PROVIDERS = [
  ['openrouter', 'OpenRouter', 'https://openrouter.ai/keys', 'DeepSeek, Kimi, Qwen, GLM, Llama (free)'],
  ['gemini', 'Google Gemini', 'https://aistudio.google.com/apikey', 'Gemini Flash (free tier)'],
  ['groq', 'Groq', 'https://console.groq.com/keys', 'Llama, Qwen, Kimi (fast, free tier)'],
  ['zai', 'Z.ai GLM', 'https://z.ai/manage-apikey/apikey-list', 'GLM Flash (free)'],
];
export function showSetup() {
  const st = { step: 0, lang: getLang(), name: S.company?.name || 'Hustle HQ', currency: getLang() === 'en' ? '$' : '₺', boss: S.company?.boss?.name || 'Boss', keys: 0 };
  const m = $('#modal');
  m.hidden = false;
  const dots = () => `<div style="display:flex;gap:6px;margin-bottom:14px">${[0, 1, 2, 3].map((i) => `<span style="flex:1;height:5px;border-radius:3px;background:${i <= st.step ? 'var(--accent)' : '#3a3450'}"></span>`).join('')}</div>`;
  const draw = () => {
    let body = '';
    if (st.step === 0) {
      body = `<h1>HUSTLE <span>HQ</span></h1>
        <p class="muted">Choose your language · Dilini seç</p>
        <div class="row" style="margin:18px 0"><button class="btn ${st.lang === 'en' ? '' : 'ghost'}" data-s="lang" data-v="en">🇬🇧 English</button><button class="btn ${st.lang === 'tr' ? '' : 'ghost'}" data-s="lang" data-v="tr">🇹🇷 Türkçe</button></div>
        <div class="row"><button class="btn" data-s="next">Devam →</button></div>`;
    } else if (st.step === 1) {
      body = `<h1>ŞİRKETİN</h1><p class="muted">Bu bilgiler sadece bu bilgisayarda saklanır.</p>
        <div class="stack" style="margin:14px 0">
          <label class="muted">Şirket adı<input id="su-name" value="${esc(st.name)}" maxlength="40" /></label>
          <div class="row"><label class="muted">Patron adı<input id="su-boss" value="${esc(st.boss)}" maxlength="20" /></label>
          <label class="muted shrink" style="width:120px">Para birimi<select id="su-cur">${['$', '₺', '€'].map((c) => `<option ${c === st.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
        </div>
        <div class="row"><button class="btn ghost" data-s="back">← Geri</button><button class="btn" data-s="next">Devam →</button></div>`;
    } else if (st.step === 2) {
      body = `<h1>MOTORLAR</h1>
        <p class="muted">Ajanların beyni. En az bir <b>ücretsiz</b> anahtar ekle; istersen sonra ⚙️ Motorlar menüsünden de ekleyebilirsin. Anahtar olmadan ofis DEMO modunda çalışır.</p>
        ${SETUP_PROVIDERS.map(([id, name, url, note]) => `<div class="card"><div class="row"><b class="shrink" style="min-width:120px">${name}</b><span class="muted">${note}</span><a class="btn ghost small shrink" href="${url}" target="_blank">Anahtar al ↗</a></div>
          <div class="row" style="margin-top:6px"><input type="password" id="su-key-${id}" placeholder="API key" autocomplete="off" /><button class="btn small shrink" data-s="key" data-v="${id}">Kaydet</button></div><div class="muted" id="su-res-${id}"></div></div>`).join('')}
        <div class="row" style="margin-top:10px"><button class="btn ghost" data-s="back">← Geri</button><button class="btn" data-s="next">${st.keys ? 'Devam →' : 'Şimdilik atla →'}</button></div>`;
    } else {
      body = `<h1>HAZIRSIN</h1>
        <ol style="line-height:1.7">
          <li><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> ile yürü, ajanlara <span class="kbd">E</span> ile konuş.</li>
          <li><b>Boss masanda</b> <span class="kbd">B</span> ile Max'e hedef ver. Max işi ekibe dağıtır.</li>
          <li>Dışarı giden her şey <b>📥 Onaylar</b>'a düşer. Teslimleri puanla: puan ajanın canıdır.</li>
          <li>Para getirmeyen ajan kovulur, yerine yenisi gelir.</li>
        </ol>
        <div class="warnbox">Güvenlik: Ajanlar gerçek para göndermez, gerçek borsada işlem yapmaz, hesap açmaz ve şifre girmez. Borsa masası sadece sanal portföydür.</div>
        <label class="muted">İlk hedef (opsiyonel)<textarea id="su-goal" rows="2" placeholder="Örn: 7 gün içinde Shopier'de satılacak bir Notion şablonu çıkar"></textarea></label>
        <div class="row" style="margin-top:10px"><button class="btn ghost" data-s="back">← Geri</button><button class="btn" data-s="finish">🏢 Ofise gir</button></div>`;
    }
    m.innerHTML = `<div class="modal-box">${dots()}${body}</div>`;
  };
  m.onclick = async (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const s = b.dataset.s;
    try {
      if (s === 'lang') {
        st.lang = b.dataset.v;
        setLang(st.lang);
        st.currency = st.lang === 'en' ? '$' : '₺';
        // DOM çevirisi dil değişince yeniden yüklemede devreye girer; kurulum durumu yerelde saklanır
        try { sessionStorage.setItem('hq_setup_resume', '1'); } catch {}
        return location.reload();
      }
      if (s === 'back') { st.step = Math.max(0, st.step - 1); return draw(); }
      if (s === 'next') {
        if (st.step === 1) {
          st.name = $('#su-name').value.trim() || st.name;
          st.boss = $('#su-boss').value.trim() || st.boss;
          st.currency = $('#su-cur').value;
        }
        st.step++;
        return draw();
      }
      if (s === 'key') {
        const id = b.dataset.v;
        const key = $(`#su-key-${id}`).value.trim();
        if (!key) return;
        const res = $(`#su-res-${id}`);
        res.textContent = '…';
        await api('POST', '/api/providers/key', { id, key });
        const t = await api('POST', `/api/providers/${id}/test`);
        res.innerHTML = t.ok ? `<span style="color:var(--green)">✅ OK (${esc(t.model)})</span>` : `<span style="color:#ff9b9b">⚠️ ${esc(t.error || '')}</span>`;
        if (t.ok) { st.keys++; $(`#su-key-${id}`).value = ''; }
        return;
      }
      if (s === 'finish') {
        const goal = $('#su-goal').value.trim();
        await api('POST', '/api/setup', { lang: st.lang, name: st.name, currency: st.currency, bossName: st.boss });
        if (goal) await api('POST', '/api/goal', { text: goal });
        try { localStorage.setItem('hq_onboarded', '1'); sessionStorage.removeItem('hq_setup_resume'); } catch {}
        m.hidden = true;
        m.onclick = null;
        setTimeout(() => showFundModal({ first: true }), 400);
        toast(st.keys ? '✅ Ofis CANLI. İyi kazançlar patron!' : '🟠 DEMO modunda başladın. ⚙️ Motorlar menüsünden anahtar ekleyince ofis canlanır.', 'done');
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  let resume = false;
  try { resume = sessionStorage.getItem('hq_setup_resume') === '1'; } catch {}
  if (resume) st.step = 1;
  draw();
}

// ======================= ŞİRKETİ FONLA (oyuna girişte) =======================
// TL (ya da başka para birimi) girilir, canlı kurla şirket para birimine (ör. USD) çevrilip deftere yazılır.
// İstenirse bir kısmı hemen performansa göre ajanlara bütçe olarak dağıtılır ve Max bütçeyi işe koşan planı yapar.
const ISO = { '$': 'USD', 'US$': 'USD', '₺': 'TRY', 'TL': 'TRY', '€': 'EUR', '£': 'GBP' };
const SYM = { USD: '$', TRY: '₺', EUR: '€', GBP: '£' };
const isoOf = (c) => ISO[String(c || '').trim()] || (/^[A-Za-z]{3}$/.test(c || '') ? String(c).toUpperCase() : 'USD');
export function showFundModal({ first = false } = {}) {
  if (!S.company?.setupDone) return;
  const m = $('#modal');
  if (!m.hidden) { // başka bir pencere açıksa kapanınca göster
    let tries = 0;
    const iv = setInterval(() => { if (m.hidden || ++tries > 120) { clearInterval(iv); if (m.hidden) showFundModal({ first }); } }, 1000);
    return;
  }
  if (!(S.company.safetyAck?.v >= 1)) return showTutorial({ thenFund: true }); // önce güvenlik kuralları
  const target = isoOf(cur());
  let from = 'TRY';
  try { from = localStorage.getItem('hq_fund_cur') || 'TRY'; } catch {}
  if (!['TRY', 'USD', 'EUR'].includes(from)) from = 'TRY';
  const presets = { TRY: [1000, 5000, 10000, 25000], USD: [50, 100, 250, 500], EUR: [50, 100, 250, 500] };
  const label = { TRY: LL('TL aktar', 'Transfer TRY'), USD: LL('Dolar aktar', 'Transfer USD'), EUR: LL('Euro aktar', 'Transfer EUR') };
  const free = S.ledger.free ?? S.ledger.balance;
  m.hidden = false;
  m.innerHTML = `<div class="modal-box">
    <h1>${LL('ŞİRKETİ', 'FUND THE')} <span>${LL('FONLA', 'COMPANY')}</span></h1>
    <p class="muted">${first ? LL('Ekip hazır. Çalışmaları için bir bütçe koy.', 'Your team is ready. Give them a budget to work with.') : LL(`Hoş geldin patron. Kasada ${fmt(S.ledger.balance)} ${cur()} var, ${fmt(free)} ${cur()} serbest.`, `Welcome back, boss. Treasury: ${money(S.ledger.balance)}, ${money(free)} free.`)} ${LL('Bugün ne kadar koyuyorsun?', 'How much are you putting in today?')}</p>
    <div class="curtabs" id="fd-tabs">${['TRY', 'USD', 'EUR'].map((c) => `<button data-f="cur" data-v="${c}" class="${c === from ? 'on' : ''}"><b>${SYM[c]}</b>${label[c]}</button>`).join('')}</div>
    <input type="hidden" id="fd-cur" value="${from}" />
    <div class="row" style="margin-top:10px"><input id="fd-amt" type="number" min="1" placeholder="${LL('Tutar', 'Amount')}" data-enter="fund-go" style="font-size:18px" /></div>
    <div class="presets" id="fd-presets"></div>
    <div class="infobox" id="fd-conv" style="margin-top:8px">${LL('Tutar gir, canlı kurla', 'Enter an amount; it is converted to')} ${target} ${LL('cinsine çevrilir.', 'at the live rate.')}</div>
    <div class="row" style="flex-wrap:wrap;gap:8px"><label class="muted shrink"><input type="checkbox" id="fd-split" checked style="width:auto" /> ${LL('Hemen işe koş: ajanlara bütçe dağıt (performansa göre)', 'Put it to work now: give agents budgets (by performance)')}</label>
      <select id="fd-pct" class="shrink" style="width:110px">${[100, 75, 50, 25].map((p) => `<option value="${p}" ${p === 75 ? 'selected' : ''}>${p}%</option>`).join('')}</select></div>
    <div class="dangerbox" style="margin-top:10px">💳 <b>${LL('GERÇEK PARA', 'REAL MONEY')}.</b> ${LL(
      'Hustle HQ bankana, kartına ya da cüzdanına <b>bağlanmaz ve para çekmez</b>. Bu, kendi hesabında bu işe ayırdığın parayı kaydeder. Ajanlar bütçeleriyle reklam/harcama <b>önerir</b>; onaylarsan ödemeyi sen yaparsın. Kazanç garantisi yoktur.',
      'Hustle HQ <b>never connects to your bank, card or wallet and never takes money</b>. This records money you set aside in your own account. Agents <b>propose</b> ads and spends from their budget; if you approve, you pay. No earnings are guaranteed.')}</div>
    <label class="muted"><input type="checkbox" id="fd-ask" ${localStorage.getItem('hq_fund_ask') === '0' ? '' : 'checked'} style="width:auto" /> ${LL('Oyunu her açtığımda sor', 'Ask me every time I open Hustle HQ')}</label>
    <div class="row" style="margin-top:12px"><button class="btn ghost" data-f="skip">${LL('Şimdi değil', 'Not now')}</button><button class="btn green" data-f="go">💸 ${LL('Fonla ve başlat', 'Fund & start')}</button></div>
  </div>`;
  let rate = null;
  let timer = null;
  const drawPresets = () => {
    const c = $('#fd-cur').value;
    $('#fd-presets').innerHTML = presets[c].map((n) => `<button data-f="preset" data-v="${n}">${SYM[c]}${fmt(n)}</button>`).join('');
  };
  const update = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const c = $('#fd-cur')?.value;
      const amt = Number($('#fd-amt')?.value) || 0;
      const box = $('#fd-conv');
      if (!box || !c) return;
      try {
        rate = await api('GET', `/api/fx?from=${c}&to=${target}`);
        const conv = amt * rate.rate;
        const human = rate.from === rate.to ? '' : ` · 1 ${rate.to} = ${(1 / rate.rate).toFixed(rate.rate < 0.2 ? 2 : 4)} ${rate.from} (${LL('canlı', 'live')}, ${rate.source})`;
        box.innerHTML = amt ? `<b style="font-size:16px">≈ ${SYM[target] || ''}${conv.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${target}</b>${human}` : `${LL('Kur', 'Rate')}${human || ': 1:1'}`;
      } catch (e) { box.innerHTML = `<span style="color:#ff9b9b">⚠️ ${esc(e.message)}</span>`; rate = null; }
    }, 250);
  };
  drawPresets();
  update();
  const close = () => {
    try { localStorage.setItem('hq_fund_ask', $('#fd-ask')?.checked ? '1' : '0'); } catch {}
    m.hidden = true;
    m.onclick = null;
    m.oninput = null;
  };
  m.oninput = (e) => { if (e.target.id === 'fd-amt') update(); };
  m.onclick = async (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    const f = b.dataset.f;
    if (f === 'preset') { $('#fd-amt').value = b.dataset.v; return update(); }
    if (f === 'cur') {
      $('#fd-cur').value = b.dataset.v;
      document.querySelectorAll('#fd-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      drawPresets();
      return update();
    }
    if (f === 'skip') return close();
    if (f === 'go') return fundGo(close);
  };
  setTimeout(() => $('#fd-amt')?.focus(), 50);
}
async function fundGo(close) {
  const amount = Number($('#fd-amt')?.value);
  if (!amount) return toast(LL('Tutar yaz', 'Enter an amount'), 'error');
  const currency = $('#fd-cur').value;
  const split = $('#fd-split').checked ? Number($('#fd-pct').value) / 100 : 0;
  try {
    const btn = document.querySelector('[data-f="go"]');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    const r = await api('POST', '/api/wallet/fund', { amount, currency, split });
    try { localStorage.setItem('hq_fund_cur', currency); } catch {}
    close();
    const orig = r.fx.from === r.fx.to ? '' : ` (${SYM[r.fx.from] || ''}${fmt(amount)})`;
    toast(LL(`💸 Kasaya ${fmt(r.converted)} ${cur()} eklendi${orig}`, `💸 ${cur()}${r.converted.toLocaleString('en-US', { maximumFractionDigits: 2 })} added to the treasury${orig}`), 'money');
    if (r.split?.length) setTimeout(() => toast(`💼 ${r.split.map((x) => `${x.name} +${fmt(x.amount)}`).join(' · ')}`, 'money'), 900);
    if (r.task) setTimeout(() => toast(LL('🎯 Max bütçeyi işe koşan planı hazırlıyor', '🎯 Max is planning how to put the budget to work'), 'goal'), 1800);
    walletStale = true;
    await refreshLedger();
  } catch (e) {
    toast(e.message, 'error');
    const btn = document.querySelector('[data-f="go"]');
    if (btn) { btn.disabled = false; btn.textContent = `💸 ${LL('Fonla ve başlat', 'Fund & start')}`; }
  }
}

// ======================= TUTORIAL (kısa) + GÜVENLİK ONAYI =======================
export function showTutorial({ thenFund = false } = {}) {
  const m = $('#modal');
  m.hidden = false;
  const steps = [
    ['👋', LL('Hoş geldin patron', 'Welcome, boss'), LL('10 yapay zekâ çalışanın 7/24 para kazanmak için çalışır. <span class="kbd">WASD</span> ile ofiste yürü, bir ajana yaklaşıp <span class="kbd">E</span> ile konuş.', 'You have 10 AI employees working 24/7 to make money. Walk with <span class="kbd">WASD</span>; walk up to an agent and press <span class="kbd">E</span> to talk.')],
    ['💸', LL('Fonla ve bütçe dağıt', 'Fund and hand out budgets'), LL('TL, dolar ya da euro yükle; canlı kurla dolara çevrilir. İstersen hemen ajanlara dağıtılır, ya da ajana gidip <b>E → Bütçe</b> ile elden verirsin.', 'Put in TRY, USD or EUR; it is converted to dollars at the live rate. Split it across the team right away, or walk up to an agent and use <b>E → Budget</b>.')],
    ['🧭', LL('Yolu ajanlar seçer', 'The agents choose the path'), LL('<b>🧭 Strategy</b> panelinde kendinden bahset (beceri, saat, açık hesaplar). Max buna göre para kazanma stratejisi seçer, ekip çalışır, para getirmeyen yol bırakılır. Hesap açma gibi kimlik isteyen adımlar sana yapılacak olarak düşer.', 'Tell the agents about yourself in <b>🧭 Strategy</b> (skills, hours, accounts). Max picks money-making strategies from it, the team works, and paths that do not earn get dropped. Steps that need your identity, like opening accounts, become your to-dos.')],
    ['🎯', LL('Hedef ver', 'Give a goal'), LL('Masanda <span class="kbd">B</span>: Max hedefi görevlere böler, ekip ürün, satış sayfası, reklam planı çıkarır. Teslimleri puanla: puan ajanın canıdır.', 'At your desk press <span class="kbd">B</span>: Max splits the goal and the team builds products, sales pages and ad plans. Rate deliverables: rating is their HP.')],
    ['✅', LL('Onayla, sen öde, gerçek satışı kaydet', 'Approve, pay yourself, record real sales'), LL('Reklam, harcama ve paylaşımlar <span class="kbd">Q</span> Onaylar\'a düşer. Onaylarsan <b>sen</b> yayınlar ve ödersin. Satışlar Lemon Squeezy\'den otomatik ya da Kasa\'dan elle girilir; para getirmeyen ajan kovulur.', 'Ads, spends and posts land in <span class="kbd">Q</span> Approvals. If you approve, <b>you</b> publish and pay. Sales come in from Lemon Squeezy automatically or are entered in Treasury; agents that do not earn get fired.')],
  ];
  let i = 0;
  const draw = () => {
    if (i < steps.length) {
      const [ic, t, d] = steps[i];
      m.innerHTML = `<div class="modal-box">
        <div style="display:flex;gap:6px;margin-bottom:14px">${[...steps, 0].map((_, k) => `<span style="flex:1;height:5px;border-radius:3px;background:${k <= i ? 'var(--accent)' : '#3a3450'}"></span>`).join('')}</div>
        <div style="font-size:42px">${ic}</div><h1>${esc(t)}</h1><p style="line-height:1.6">${d}</p>
        <div class="row" style="margin-top:14px"><button class="btn ghost" data-t="skip">${LL('Geç', 'Skip')}</button><button class="btn" data-t="next">${LL('İleri →', 'Next →')}</button></div></div>`;
      return;
    }
    const acked = S.company?.safetyAck?.v >= 1;
    m.innerHTML = `<div class="modal-box">
      <div style="display:flex;gap:6px;margin-bottom:14px">${[...steps, 0].map(() => '<span style="flex:1;height:5px;border-radius:3px;background:var(--accent)"></span>').join('')}</div>
      <h1>🛡️ ${LL('GERÇEK PARA', 'REAL MONEY')} <span>${LL('GÜVENLİK KURALLARI', 'SAFETY RULES')}</span></h1>
      ${rulesHtml()}
      <div class="stack" style="margin-top:8px">
        <label class="muted"><input type="checkbox" class="sf-ok" style="width:auto" ${acked ? 'checked' : ''} /> ${LL('Sadece kaybetmeyi göze alabileceğim parayı kullanacağım.', 'I will only use money I can afford to lose.')}</label>
        <label class="muted"><input type="checkbox" class="sf-ok" style="width:auto" ${acked ? 'checked' : ''} /> ${LL('Kazanç garantisi olmadığını ve Hustle HQ\'nun para göndermediğini, ödemeleri benim yaptığımı anlıyorum.', 'I understand earnings are not guaranteed, Hustle HQ never moves money, and I make every payment.')}</label>
        <label class="muted"><input type="checkbox" class="sf-ok" style="width:auto" ${acked ? 'checked' : ''} /> ${LL('Kart bilgisi, şifre ya da 2FA kodunu hiçbir ajana/metne vermeyeceğim.', 'I will never give card details, passwords or 2FA codes to any agent or text.')}</label>
      </div>
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-t="back">← ${LL('Geri', 'Back')}</button><button class="btn green" data-t="accept" ${acked ? '' : 'disabled'}>${LL('Kabul ediyorum', 'I accept')}${thenFund ? ` → ${LL('Fonla', 'Fund')}` : ''}</button></div></div>`;
  };
  m.onchange = (e) => {
    if (!e.target.classList.contains('sf-ok')) return;
    const all = [...m.querySelectorAll('.sf-ok')].every((x) => x.checked);
    const b = m.querySelector('[data-t="accept"]');
    if (b) b.disabled = !all;
  };
  m.onclick = async (e) => {
    const b = e.target.closest('[data-t]');
    if (!b || b.disabled) return;
    const t = b.dataset.t;
    if (t === 'next') { i++; return draw(); }
    if (t === 'back') { i = Math.max(0, i - 1); return draw(); }
    if (t === 'skip') { i = steps.length; return draw(); } // kurallar atlanamaz
    if (t === 'accept') {
      try {
        await api('POST', '/api/safety/ack');
        if (S.company) S.company.safetyAck = { v: 1, t: Date.now() };
        safety = null;
        try { localStorage.setItem('hq_onboarded', '1'); } catch {}
        m.hidden = true;
        m.onclick = m.onchange = null;
        if (thenFund) setTimeout(() => showFundModal(), 250);
      } catch (err) { toast(err.message, 'error'); }
    }
  };
  draw();
}

// ======================= ONBOARDING (eski) =======================
export function showOnboarding() {
  return showTutorial();
}
function showOnboardingLegacy() {
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="modal-box">
    <h1>HUSTLE <span>HQ</span></h1>
    <p class="muted">7/24 çalışan 10 yapay zekâ çalışanın var. Tek kural: <b>para kazan ya da kovul.</b></p>
    <ol>
      <li><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> ya da oklarla ofiste yürü, <span class="kbd">Shift</span> ile koş. Bir ajana yaklaşıp <span class="kbd">E</span>'ye bas ya da üstüne tıkla.</li>
      <li><b>Motor odasına</b> (sol üst, server rafları) git ya da <b>⚙️ Motorlar</b> menüsünü aç, <b>ücretsiz</b> bir API anahtarı ekle (OpenRouter, Gemini veya Groq). O zamana kadar ofis <b>DEMO</b> modunda çalışır.</li>
      <li><b>Boss masanda</b> (sağ alt) <span class="kbd">B</span> ile Max'e hedef ver. Max işi ekibe dağıtır, küçük robot görevleri masalara taşır.</li>
      <li>Dışarı giden her şey <b>📥 Onaylar</b>'a düşer. Teslimleri <b>puanla</b>: puan ajanın canıdır. Gerçek satış olunca <b>gelir bağla</b>.</li>
      <li>Canı biten ajan kovulur, yerine öncülünün derslerini taşıyan yeni biri gelir. 💀 → 🆕</li>
    </ol>
    <div class="warnbox">Güvenlik: Ajanlar gerçek para göndermez, gerçek borsada işlem yapmaz, hesap açmaz ve şifre girmez. Borsa masası sadece sanal portföydür.</div>
    <div class="row"><button class="btn" data-action="onboard-done" data-next="engines">⚙️ Motor ekle</button><button class="btn ghost" data-action="onboard-done">Ofise gir →</button></div>
  </div>`;
}
