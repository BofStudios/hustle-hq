// Arayüz: HUD, sağ çekmece panelleri, toast, onboarding. Olay delegasyonu: data-action.
import { S, on, api, refreshLedger } from './net.js';
import { portrait, character, PAL } from './sprites.js';
import { focusAgent, followAgent, toggleScanlines, getScanlines, getReduceFx, setReduceFx } from './world.js';
import { sfx, toggleSound, soundEnabled } from './sound.js';
import { getLang, setLang } from './i18n.js';

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
const cur = () => S.company?.currency || '₺';

let current = null; // { view, arg }
const tabs = {};
let meta = { roles: {}, aliases: {}, providers: [] };

const STATUS_TR = { idle: 'Boşta', thinking: 'Düşünüyor', working: 'Çalışıyor', sleeping: 'Uyuyor (kota)', dead: 'KOVULDU', oncall: 'Çağrıda bekliyor', walking: 'Yürüyor' };
const KIND_TR = { idea: '💡 Fikir', report: '📄 Rapor', code: '💻 Kod', image: '🎨 Görsel', product: '📦 Satılık ürün' };
const APR_TR = { command: '⌨️ Komut', install: '📦 Kurulum', publish: '📣 Yayın', spend: '💸 Harcama', external: '🌐 Dış işlem', open_url: '🔗 URL aç', question: '❓ Soru', pc: '🖥️ PC kontrolü', ad: '📢 Reklam kampanyası' };

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
  on('ledger', () => scheduleRerender());
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
  $('#hud-cash').textContent = `${fmt(S.ledger.balance)} ${cur()}`;
  $('#hud-rev').textContent = `${fmt(S.ledger.revenue)} ${cur()}`;
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
  $('#clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  people: '👥 Kişiler', files: '🗂️ Dosyalar (workspace)', decisions: '📜 Kararlar', deliverables: '📦 Teslimler', cash: '🏦 Kasa', market: '📈 Borsa Masası (Sanal)', claude: '⚡ Claude Masası', settings: '🛠️ Yönetim',
};
const ALIAS_VIEW = { servers: 'engines', whiteboard: 'tasks', archive: 'deliverables' };

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
    <div style="margin-top:8px"><button class="btn ghost small" data-action="report-now">📊 Penny'den şimdi günlük rapor iste</button></div>
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
    ${a.kind === 'ad' && pending ? '<div class="warnbox" style="margin-top:6px">📢 Onay = kampanyayı reklam panelinde <b>sen kurup ödersin</b>. Tutar ajanın bütçesinden ve kasadan düşer.</div>' : ''}
    ${a.kind === 'spend' && pending ? '<div class="warnbox" style="margin-top:6px">Onaylarsan tutar kasadan (defterden) düşer. <b>Ödemeyi sen kendin yaparsın</b>, sistem para göndermez.</div>' : ''}
    ${a.kind === 'publish' && pending ? '<div class="muted" style="margin-top:6px">Onay = içeriği kendin yayınlayacağın anlamına gelir. Ajan otomatik paylaşım yapmaz.</div>' : ''}
    ${a.result ? `<pre>${esc(a.result)}</pre>` : ''}
    ${pending ? `<div class="row" style="margin-top:6px"><input id="ans-${a.id}" placeholder="${a.kind === 'question' ? 'Cevabın (zorunlu değil)' : 'Not (opsiyonel)'}" data-enter="approve" data-id="${a.id}" /><button class="btn green shrink" data-action="approve" data-id="${a.id}">✔ Onayla</button><button class="btn red shrink" data-action="reject" data-id="${a.id}">✕ Reddet</button></div>` : ''}
  </div>`;
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

async function decide(id, approve) {
  const answer = document.getElementById(`ans-${id}`)?.value || '';
  try {
    await api('POST', `/api/approvals/${id}`, { approve, answer });
    toast(approve ? '✔ Onaylandı' : '✕ Reddedildi', approve ? 'done' : 'info');
  } catch (e) { toast(e.message, 'error'); }
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
      ${a.role !== 'claude' ? `<div class="row" style="margin:6px 0"><span class="muted shrink">💼 Bütçe: <b style="color:var(--yellow)">${fmt(a.budget)} ${cur()}</b></span><input id="bud-amt" type="number" placeholder="Tutar (− geri al)" /><button class="btn small shrink" data-action="agent-budget" data-id="${id}">Bütçe ver</button></div>` : ''}
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
      <h3>KASAYA BÜTÇE EKLE</h3>
      <div class="row"><input id="dep-amount" type="number" min="1" placeholder="Tutar" /><input id="dep-note" placeholder="Not (ör. reklam bütçesi)" /><button class="btn shrink" data-action="deposit">Ekle</button></div>
      <h3>GERÇEK GELİR KAYDET</h3>
      <div class="stack"><div class="row"><input id="rev-amount" type="number" min="1" placeholder="Tutar" /><input id="rev-note" placeholder="Nereden? (ör. Shopier satışı)" /></div>
      <select id="rev-dlv"><option value="">— Hangi teslimden geldi? (ajan ödül alır) —</option>${dlv.map((d) => `<option value="${d.id}">${esc(d.agentName)}: ${esc(d.title.slice(0, 70))}</option>`).join('')}</select>
      <div><button class="btn green" data-action="revenue">💰 Gelir kaydet</button></div></div>
      <h3>DEFTER</h3>
      <table><tr><th>Ne zaman</th><th>Tür</th><th>Not</th><th class="num">Tutar</th></tr>
      ${e.slice(0, 60).map((x) => `<tr><td class="muted">${ago(x.t)}</td><td>${{ deposit: '🏦 Bütçe', spend: '💸 Harcama', revenue: '💰 Gelir' }[x.type]}</td><td>${esc(x.note)}</td><td class="num ${x.type === 'spend' ? 'neg' : 'pos'}">${x.type === 'spend' ? '−' : '+'}${fmt(x.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Boş</td></tr>'}</table>`,
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
        <div class="stat"><span class="k">DEĞER ₺</span><span class="v">${fmt(p.value)}</span></div>
        <div class="stat"><span class="k">NAKİT</span><span class="v">${fmt(p.cash)}</span></div>
        <div class="stat"><span class="k">K/Z</span><span class="v ${p.pnl >= 0 ? 'green' : ''}" style="${p.pnl < 0 ? 'color:var(--red)' : ''}">${p.pnl >= 0 ? '+' : ''}${fmt(p.pnl)}</span></div>
        <div class="stat"><span class="k">BAŞLANGIÇ</span><span class="v">${fmt(p.startCapital)}</span></div></div>
      <h3>POZİSYONLAR</h3>
      <table><tr><th>Sembol</th><th class="num">Adet</th><th class="num">Ort. ₺</th><th class="num">Fiyat</th><th class="num">K/Z ₺</th></tr>${p.positions.map((x) => `<tr><td>${esc(x.sym)} ${x.source === 'sim' ? '<span class="chip">sim</span>' : ''}</td><td class="num">${x.qty}</td><td class="num">${x.avg.toFixed(2)}</td><td class="num">${x.price} ${esc(x.currency || '')}</td><td class="num ${x.pnl >= 0 ? 'pos' : 'neg'}">${x.pnl.toFixed(2)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Pozisyon yok</td></tr>'}</table>
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
      <h3>VERİ</h3>
      <div class="row"><a class="btn ghost small shrink" href="/api/export" download>💾 Yedeği indir (zip)</a><button class="btn red small shrink" data-action="reset-company">🧨 Şirketi sıfırla</button></div>
      <div class="muted" style="margin-top:4px">Yedek; şirket verisini ve workspace dosyalarını içerir, API anahtarlarını içermez. Sıfırlamadan önce otomatik yedek alınır (data/backups).</div>
      <h3>HAKKINDA</h3>
      <div class="muted">Hustle HQ v1.0 · Veriler <code>data/</code>, ajan çıktıları <code>workspace/</code> klasöründe. Kurallar kodda sabittir: gerçek para transferi, gerçek borsa işlemi, hesap açma ve şifre girişi yoktur.</div>
      <div style="margin-top:8px"><button class="btn ghost small" data-action="onboarding">Tanıtımı tekrar göster</button></div>`,
  };
};

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
      case 'onboarding': return showOnboarding();
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
          <label class="muted shrink" style="width:120px">Para birimi<select id="su-cur">${['₺', '$', '€', '£'].map((c) => `<option ${c === st.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
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

// ======================= ONBOARDING =======================
export function showOnboarding() {
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
