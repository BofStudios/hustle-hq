// Cüzdan: patronun yüklediği sermaye, ajan bütçeleri, bütçe dağıtımı, kâr çekme ve yatırımcı raporu.
// HEPSİ DEFTER KAYDIDIR. Sistem hiçbir banka, kart veya kripto cüzdanına bağlanmaz, para göndermez/almaz.
// Gerçek para patronun kendi hesabında kalır; ajan harcamaları onaydan sonra patron tarafından elle ödenir.
import { agents, company, ledger, persist, updateAgent, agentLog, logDecision, balance, allocatedBudgets, publicAgent } from './state.js';

import { uid } from './store.js';
import { emit, toast } from './bus.js';
import { env } from './config.js';
import { fxRate, isoOf } from './market.js';
import { agentByRole, createTask } from './state.js';

const L = (tr, en) => (env.LANG !== 'tr' ? en : tr);
const cur = () => company.currency || '₺';
export const TOPUP_METHODS = ['bank', 'card', 'cash', 'atm', 'other'];
export const FUND_CURRENCIES = ['TRY', 'USD', 'EUR']; // şimdilik sadece bu üçü
export const SAFETY_VERSION = 1;
const MAX_AMOUNT = 1e9;

function amountOf(v) {
  const n = Math.round(Math.abs(Number(v) || 0) * 100) / 100;
  if (!n) throw new Error(L('tutar gerekli', 'amount required'));
  if (n > MAX_AMOUNT) throw new Error(L('tutar çok büyük', 'amount too large'));
  return n;
}

/** Ajanlara ayrılmış (henüz harcanmamış) bütçelerin toplamı. Kovulanların bütçesi kasaya döner. */
export const allocatedTotal = allocatedBudgets;
/** Serbest bakiye: kasada olup kimseye ayrılmamış kısım. Dağıtma ve kâr çekme bunu aşamaz. */
export function freeBalance() {
  return balance() - allocatedTotal();
}

const isRefund = (e) => e.refund || /^Reklam iadesi/.test(e.note || '');

/** Patron kasaya para yükler (kayıt). Yöntem sadece etikettir: banka havalesi, kart, nakit, ATM… */
export function topUp(amount, { method = 'bank', note = '' } = {}) {
  const n = amountOf(amount);
  const m = TOPUP_METHODS.includes(method) ? method : 'other';
  const e = { id: uid('led'), t: Date.now(), type: 'deposit', capital: true, method: m, amount: n, note: String(note || L('Patron bakiye yükledi', 'Boss topped up')).slice(0, 200) };
  ledger.entries.push(e);
  persist('ledger');
  emit('ledger:changed', {});
  emit('fx', { kind: 'deposit', amount: n, method: m });
  toast(L(`🏦 Kasaya ${n} ${cur()} yüklendi`, `🏦 ${n} ${cur()} added to the treasury`), 'money');
  return e;
}

/** Patron kârı çeker (kayıt): kendi hesabına aldığı parayı deftere işler. Serbest bakiyeyi aşamaz. */
export function withdraw(amount, note = '') {
  const n = amountOf(amount);
  const free = freeBalance();
  if (n > free + 1e-9) throw new Error(L(`Serbest bakiye yetersiz (${Math.floor(free)} ${cur()}). Önce ajan bütçelerini geri al.`, `Not enough free balance (${Math.floor(free)} ${cur()}). Take budgets back from agents first.`));
  const e = { id: uid('led'), t: Date.now(), type: 'withdraw', amount: n, note: String(note || L('Patron kâr çekti', 'Boss withdrew profit')).slice(0, 200) };
  ledger.entries.push(e);
  persist('ledger');
  emit('ledger:changed', {});
  emit('fx', { kind: 'withdraw', amount: n });
  logDecision(company.boss?.name || 'Boss', L(`Kasadan ${n} ${cur()} çekildi`, `Withdrew ${n} ${cur()}`), e.note);
  toast(L(`🏧 ${n} ${cur()} çekildi (deftere işlendi)`, `🏧 ${n} ${cur()} withdrawn (recorded)`), 'money');
  return e;
}

/**
 * Ajana bütçe ver (+) ya da geri al (−). Bütçe kasadan "ayrılır": bakiye değişmez, serbest bakiye azalır.
 * Ajan bu bütçe kadar harcama/reklam ÖNEREBİLİR; ödemeyi yine patron yapar.
 */
export function allocate(agent, amount, { by = 'Boss', note = '', inPerson = false } = {}) {
  if (!agent) throw new Error(L('ajan yok', 'agent not found'));
  if (agent.status === 'dead') throw new Error(L('kovulmuş ajana bütçe verilemez', 'cannot give budget to a fired agent'));
  if (agent.role === 'claude') throw new Error(L('Claude bütçe kullanmaz', 'Claude does not use a budget'));
  let n = Math.round((Number(amount) || 0) * 100) / 100;
  if (!n) throw new Error(L('tutar gerekli', 'amount required'));
  if (Math.abs(n) > MAX_AMOUNT) throw new Error(L('tutar çok büyük', 'amount too large'));
  const before = agent.budget || 0;
  if (n < 0) n = -Math.min(before, -n);
  if (!n) throw new Error(L('ajanın geri alınacak bütçesi yok', 'agent has no budget to take back'));
  const free = freeBalance();
  if (n > 0 && n > free + 1e-9) throw new Error(L(`Serbest bakiye yetersiz (kasa ${Math.floor(balance())}, serbest ${Math.floor(free)} ${cur()}). ATM'den yükle ya da başka ajandan geri al.`, `Not enough free balance (treasury ${Math.floor(balance())}, free ${Math.floor(free)} ${cur()}). Top up or take budget back from another agent.`));
  agent.budget = Math.round((before + n) * 100) / 100;
  agent.stats ||= {};
  if (n > 0) agent.stats.budgetGiven = (agent.stats.budgetGiven || 0) + n;
  ledger.entries.push({ id: uid('led'), t: Date.now(), type: 'alloc', amount: n, agentId: agent.id, note: String(note || (n > 0 ? L(`${agent.name}'e bütçe`, `Budget to ${agent.name}`) : L(`${agent.name}'den bütçe geri alındı`, `Budget taken back from ${agent.name}`))).slice(0, 200) });
  persist('ledger');
  agent.inbox ||= [];
  agent.inbox.push({ from: by, t: Date.now(), text: n > 0
    ? L(`Sana ${n} ${cur()} bütçe ayırdım. Toplam bütçen: ${agent.budget} ${cur()}. Akıllıca kullan: harcama/reklam önerisi yap, getirisini göster.`, `I allocated ${n} ${cur()} to you. Your budget: ${agent.budget} ${cur()}. Use it wisely: propose spends/ads and show the return.`)
    : L(`Bütçenden ${-n} ${cur()} geri aldım. Kalan: ${agent.budget} ${cur()}.`, `I took back ${-n} ${cur()} of your budget. Remaining: ${agent.budget} ${cur()}.`) });
  if (agent.inbox.length > 20) agent.inbox.shift();
  if (n > 0) {
    agent.calmUntil = Math.max(agent.calmUntil || 0, Date.now() + 15 * 60000);
    agent.bubble = '💼';
  }
  updateAgent(agent);
  agentLog(agent, n > 0 ? 'reward' : 'penalty', n > 0 ? L(`💼 ${by} ${n} ${cur()} bütçe verdi (toplam ${agent.budget})`, `💼 ${by} gave ${n} ${cur()} budget (total ${agent.budget})`) : L(`💼 ${by} ${-n} ${cur()} bütçe geri aldı`, `💼 ${by} took back ${-n} ${cur()} budget`));
  emit('ledger:changed', {});
  emit('fx', { kind: 'budget', agentId: agent.id, amount: n, inPerson: !!inPerson });
  return publicAgent(agent);
}

/** Toplu dağıtım: eşit ya da performansa göre (gelir + puan + seviye). Serbest bakiyeyi aşamaz. */
export function distribute(amount, mode = 'equal') {
  const total = amountOf(amount);
  const free = freeBalance();
  if (total > free + 1e-9) throw new Error(L(`Serbest bakiye yetersiz (${Math.floor(free)} ${cur()})`, `Not enough free balance (${Math.floor(free)} ${cur()})`));
  const team = agents.filter((a) => a.status !== 'dead' && a.role !== 'claude' && a.role !== 'shield');
  if (!team.length) throw new Error(L('dağıtılacak ajan yok', 'no agents to fund'));
  const weight = (a) => {
    if (mode !== 'performance') return 1;
    const st = a.stats || {};
    const avg = st.rated ? st.ratingSum / st.rated : 2.5;
    return 1 + (st.revenue || 0) / 100 + avg + (a.level || 1) + (st.done || 0) * 0.2;
  };
  const sum = team.reduce((s, a) => s + weight(a), 0);
  const out = [];
  let left = total;
  team.forEach((a, i) => {
    const share = i === team.length - 1 ? left : Math.floor((total * weight(a)) / sum);
    left -= share;
    if (share > 0) { allocate(a, share, { note: L(`Toplu dağıtım (${mode === 'performance' ? 'performans' : 'eşit'})`, `Bulk split (${mode})`) }); out.push({ id: a.id, name: a.name, amount: share }); }
  });
  logDecision(company.boss?.name || 'Boss', L(`${total} ${cur()} ekibe dağıtıldı (${mode === 'performance' ? 'performansa göre' : 'eşit'})`, `${total} ${cur()} split across the team (${mode})`), out.map((x) => `${x.name}: ${x.amount}`).join(', '));
  return out;
}

/**
 * Oyuna girişteki "şirketi fonla" akışı: tutar istenen para biriminde girilir (ör. TL), canlı kurla şirket
 * para birimine (ör. USD) çevrilip deftere yazılır; istenirse bir kısmı hemen performansa göre ekibe dağıtılır
 * ve Max'e "bütçeyi işe koş" planı verilir. Yine sadece kayıt: para patronun hesabında kalır.
 */
export async function fund({ amount, currency, split = 0, note = '' } = {}) {
  if (!((company.safetyAck?.v || 0) >= SAFETY_VERSION)) throw new Error(L('Önce güvenlik kurallarını oku ve onayla (Yönetim → Güvenlik).', 'Read and accept the safety rules first (Admin → Safety).'));
  const n = amountOf(amount);
  if (!FUND_CURRENCIES.includes(String(currency || '').toUpperCase())) throw new Error(L('Para birimi: TRY, USD veya EUR', 'Currency must be TRY, USD or EUR'));
  const to = isoOf(company.currency);
  const fx = await fxRate(currency || to, to);
  const converted = Math.round(n * fx.rate * 100) / 100;
  if (!(converted > 0)) throw new Error(L('çevrilen tutar sıfır', 'converted amount is zero'));
  const sym = (c) => ({ USD: '$', TRY: '₺', EUR: '€', GBP: '£' })[c] || c + ' ';
  const fxNote = fx.from === fx.to ? '' : ` (${sym(fx.from)}${n.toLocaleString('en-US')} @ 1 ${fx.to} = ${(1 / fx.rate).toFixed(fx.rate < 0.2 ? 2 : 4)} ${fx.from})`;
  const e = topUp(converted, { method: 'bank', note: `${note || L('Şirket fonlandı', 'Company funded')}${fxNote}` });
  e.original = { amount: n, currency: fx.from, rate: fx.rate, source: fx.source };
  persist('ledger');
  let splitOut = [];
  const share = Math.floor(converted * Math.max(0, Math.min(1, Number(split) || 0)));
  if (share > 0) splitOut = distribute(Math.min(share, Math.floor(freeBalance())), 'performance');
  let task = null;
  const ceo = agentByRole('ceo');
  if (share > 0 && ceo && ceo.status !== 'dead' && company.settings?.paused !== true) {
    task = createTask({
      title: L(`PLAN: Yeni bütçeyi işe koş (${cur()}${Math.round(converted)})`, `PLAN: Put the new budget to work (${cur()}${Math.round(converted)})`),
      detail: L(
        `Patron ${cur()}${converted} yükledi, ${cur()}${share} ekibe dağıtıldı (performansa göre). Wave planı: bütçesi olan pazarlama küçük bir test reklamı önersin (ad_campaign), gerekirse araç/abonelik yerine tek seferlik harcama (propose_spend). Her harcama patron onayına gider, ödemeyi patron yapar. Getirisi ölçülemeyen harcama yapma.`,
        `The boss funded ${cur()}${converted}; ${cur()}${share} was split across the team by performance. Wave plan: marketing proposes a small test ad within budget (ad_campaign); one-off spends only if they clearly pay back (propose_spend). Every spend goes to the boss for approval and the boss pays. No spend without a measurable return.`),
      assignee: ceo.id, createdBy: 'Boss', priority: 3,
    });
    ceo.nextRunAt = Date.now() + 1000;
  }
  return { converted, fx, split: splitOut, task: task ? { id: task.id, title: task.title } : null, wallet: walletView() };
}

// ---------------- gerçek para güvenlik rayları ----------------
// Onaylanan her harcama/reklam patronun GERÇEK parasıdır (kendisi öder). Bu yüzden:
//  1) günlük harcama limiti, 2) zarar durdurma (gelir yokken çok harcama → dondur),
//  3) büyük harcamada tutarı yazarak teyit. Ayarlar Yönetim → Güvenlik'te.
export function safetySettings() {
  const s = company.settings?.safety || {};
  const tl = isoOf(company.currency) === 'TRY';
  return {
    dailyCap: Number.isFinite(s.dailyCap) ? s.dailyCap : tl ? 2000 : 50,
    stopLossPct: Number.isFinite(s.stopLossPct) ? s.stopLossPct : 50,
    bigSpendPct: Number.isFinite(s.bigSpendPct) ? s.bigSpendPct : 25,
  };
}
export function spendToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return ledger.entries.filter((e) => e.type === 'spend' && e.t >= d.getTime()).reduce((s, e) => s + e.amount, 0);
}
export function safetyStatus() {
  const cfg = safetySettings();
  const since = Date.now() - 14 * 864e5;
  let spend14 = 0, rev14 = 0, refund14 = 0;
  for (const e of ledger.entries) {
    if (e.t < since) continue;
    if (e.type === 'spend') spend14 += e.amount;
    if (e.type === 'revenue') rev14 += e.amount;
    if (e.type === 'deposit' && isRefund(e)) refund14 += e.amount;
  }
  const { capital } = ledgerTotals();
  const net = spend14 - refund14;
  const limit = (capital * cfg.stopLossPct) / 100;
  const frozen = cfg.stopLossPct > 0 && capital > 0 && rev14 <= 0 && net >= limit;
  return { ...cfg, today: Math.round(spendToday() * 100) / 100, spend14: Math.round(net * 100) / 100, revenue14: rev14, stopLossAt: Math.round(limit * 100) / 100, frozen, ack: company.safetyAck || null, version: SAFETY_VERSION };
}
/** Harcama/reklam onayından önce çağrılır. Engel varsa hata fırlatır (kart beklemede kalır). */
export function guardSpend(amount, confirmAmount) {
  const n = Math.abs(Number(amount) || 0);
  const st = safetyStatus();
  const c = cur();
  if (st.frozen) throw new Error(L(`ZARAR DURDURMA: son 14 günde ${st.spend14} ${c} harcandı ve hiç gelir yok. Harcamalar donduruldu. Yönetim → Güvenlik'ten gözden geçir.`, `STOP-LOSS: ${c}${st.spend14} spent in the last 14 days with zero revenue. Spending is frozen. Review it in Admin → Safety.`));
  if (st.dailyCap >= 0 && st.today + n > st.dailyCap) throw new Error(L(`GÜNLÜK LİMİT: bugün ${st.today} ${c} harcandı, limit ${st.dailyCap} ${c}. Gerçekten istiyorsan Yönetim → Güvenlik'ten limiti artır.`, `DAILY CAP: ${c}${st.today} spent today, cap is ${c}${st.dailyCap}. Raise it in Admin → Safety only if you really mean it.`));
  const free = Math.max(0, balance());
  if (st.bigSpendPct > 0 && n > (free * st.bigSpendPct) / 100 && Number(confirmAmount) !== n) {
    const e = new Error(L(`CONFIRM: Bu büyük bir harcama (${n} ${c}, kasanın %${Math.round((n / Math.max(1, free)) * 100)}'i). Onaylamak için tutarı yaz.`, `CONFIRM: This is a large spend (${c}${n}, ${Math.round((n / Math.max(1, free)) * 100)}% of the treasury). Type the amount to confirm.`));
    e.code = 'CONFIRM_AMOUNT';
    throw e;
  }
}
export function acceptSafety() {
  company.safetyAck = { v: SAFETY_VERSION, t: Date.now() };
  persist('company');
  emit('company', company);
  return safetyStatus();
}

/** Kovulan ajanın bütçesi kasaya (serbest bakiyeye) döner. */
export function releaseBudget(agent, reason = '') {
  const b = agent.budget || 0;
  if (b <= 0) return;
  agent.budget = 0;
  ledger.entries.push({ id: uid('led'), t: Date.now(), type: 'alloc', amount: -b, agentId: agent.id, note: L(`${agent.name} ayrıldı, bütçesi kasaya döndü${reason ? ` (${reason})` : ''}`, `${agent.name} left, budget returned${reason ? ` (${reason})` : ''}`).slice(0, 200) });
  persist('ledger');
  emit('ledger:changed', {});
}

export function ledgerTotals() {
  let capital = 0, revenue = 0, spend = 0, withdrawn = 0, refunds = 0;
  for (const e of ledger.entries) {
    if (e.type === 'deposit') { if (isRefund(e)) refunds += e.amount; else capital += e.amount; }
    else if (e.type === 'revenue') revenue += e.amount;
    else if (e.type === 'spend') spend += e.amount;
    else if (e.type === 'withdraw') withdrawn += e.amount;
  }
  const bal = balance();
  const allocated = allocatedTotal();
  const c = (x) => Math.round(x * 100) / 100;
  return { balance: c(bal), allocated: c(allocated), free: c(bal - allocated), capital: c(capital), revenue: c(revenue), spend: c(spend), withdrawn: c(withdrawn), refunds: c(refunds), profit: c(revenue - spend + refunds) };
}

/** Yatırımcı raporu: sermaye ne oldu, kim ne kadar bütçe aldı, ne getirdi. */
export function walletView() {
  const t = ledgerTotals();
  const spendBy = new Map();
  for (const e of ledger.entries) if (e.type === 'spend' && e.agentId) spendBy.set(e.agentId, (spendBy.get(e.agentId) || 0) + e.amount);
  const team = agents.filter((a) => a.role !== 'claude').map((a) => {
    const spent = spendBy.get(a.id) || 0;
    const rev = a.stats?.revenue || 0;
    return { id: a.id, name: a.name, role: a.role, title: a.title, status: a.status, level: a.level || 1, budget: a.budget || 0, given: a.stats?.budgetGiven || 0, spent, revenue: rev, roi: spent ? Math.round(((rev - spent) / spent) * 100) : null };
  });
  // son 30 günün gün sonu bakiyesi (grafik için)
  const DAY = 864e5;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const from = start.getTime() - 29 * DAY;
  const sorted = [...ledger.entries].sort((a, b) => a.t - b.t);
  const delta = (e) => (e.type === 'spend' || e.type === 'withdraw' ? -e.amount : e.type === 'alloc' || e.type === 'payout' ? 0 : e.amount);
  let run = sorted.filter((e) => e.t < from).reduce((s, e) => s + delta(e), 0);
  const series = [];
  let i = sorted.findIndex((e) => e.t >= from);
  if (i < 0) i = sorted.length;
  for (let d = 0; d < 30; d++) {
    const end = from + (d + 1) * DAY;
    let rev = 0;
    while (i < sorted.length && sorted[i].t < end) { run += delta(sorted[i]); if (sorted[i].type === 'revenue') rev += sorted[i].amount; i++; }
    series.push({ day: from + d * DAY, balance: Math.round(run), revenue: Math.round(rev) });
  }
  return {
    ...t,
    currency: cur(),
    payback: t.capital ? Math.round(((t.revenue + t.refunds) / t.capital) * 100) : null,
    roi: t.capital ? Math.round((t.profit / t.capital) * 100) : null,
    team,
    series,
    methods: TOPUP_METHODS,
    recent: ledger.entries.slice(-40).reverse(),
  };
}
