// Para kazan ya da öl: can, yakım, ödül, kovulma, evrimsel işe alım.
import { agents, company, graveyard, persist, updateAgent, agentLog, logDecision, deliverables, ledger, agentById, publicAgent, tasks } from './state.js';
import { ROLES, ROLE_ORDER, randomLook } from './agents/roster.js';
import { uid } from './store.js';
import { emit, toast } from './bus.js';

export function newAgent(role, slot, generation = 1, predecessor = null) {
  const def = ROLES[role];
  const used = new Set([...agents.map((a) => a.name), ...graveyard.map((g) => g.name)]);
  const name = def.names.find((n) => !used.has(n)) || `${def.names[0]}-${generation}`;
  const chain = [...def.chain];
  // evrim: halef farklı motor sırası dener
  if (predecessor && chain.length > 1) chain.push(chain.shift());
  return {
    id: uid('ag'),
    slot,
    role,
    name,
    title: def.title,
    chain,
    look: generation === 1 ? { ...def.look } : { ...randomLook(), suit: def.look.suit },
    hp: role === 'claude' ? 100 : 80,
    status: def.manual ? 'oncall' : 'idle',
    activity: def.activity,
    bubble: null,
    currentTaskId: null,
    generation,
    hiredAt: Date.now(),
    nextRunAt: Date.now() + 3000 + slot * 1500,
    lastProactiveAt: 0,
    stats: { done: 0, failed: 0, rated: 0, ratingSum: 0, revenue: 0, calls: 0, tokens: 0 },
    memory: predecessor
      ? `Öncülün ${predecessor.name} kovuldu. Sebep: ${predecessor.deathReason || 'para getirmedi'}.\n${predecessor.memory || ''}\nDers: daha hızlı, daha somut, satılabilir teslim çıkar.`.slice(-2000)
      : '',
    inbox: [],
    monitor: '',
  };
}

export function ensureRoster() {
  if (agents.length) return;
  ROLE_ORDER.forEach((role, slot) => agents.push(newAgent(role, slot)));
  persist('agents');
  logDecision('Sistem', 'Hustle HQ kuruldu', '10 kişilik ekip işe alındı. Kural: para kazan ya da kovul.');
}

/** Seviye = floor(sqrt(xp/50)) + 1  →  50 XP = Lv2, 200 = Lv3, 450 = Lv4, 800 = Lv5 … */
export function levelOf(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}

export function gainXp(agent, n, reason = '') {
  if (!agent || agent.status === 'dead' || !(n > 0)) return;
  agent.stats.xp = (agent.stats.xp || 0) + Math.round(n);
  const before = agent.level || 1;
  const now = levelOf(agent.stats.xp);
  agent.level = now;
  if (now > before) {
    agentLog(agent, 'reward', `⭐ LEVEL UP! Seviye ${now} (${reason})`);
    emit('fx', { agentId: agent.id, kind: 'levelup', level: now });
    toast(`⭐ ${agent.name} seviye ${now} oldu!`, 'hire');
  }
  updateAgent(agent);
}

export function reward(agent, amount, reason) {
  if (!agent || agent.status === 'dead') return;
  agent.hp = Math.max(0, Math.min(100, agent.hp + amount));
  if (amount > 0) agent.calmUntil = Date.now() + Math.min(60, amount * 2) * 60000;
  agent.stress = computeStress(agent);
  updateAgent(agent);
  if (Math.abs(amount) >= 5) {
    agentLog(agent, amount > 0 ? 'reward' : 'penalty', `${amount > 0 ? '+' : ''}${amount.toFixed(0)} can: ${reason}`);
    emit('fx', { agentId: agent.id, kind: amount > 0 ? 'heal' : 'hurt', amount: Math.round(amount) });
  }
  if (agent.hp <= 0) kill(agent, reason);
}

export function kill(agent, reason = 'para getirmedi') {
  if (agent.status === 'dead' || agent.role === 'claude') return;
  agent.status = 'dead';
  agent.hp = 0;
  agent.deathReason = reason;
  agent.diedAt = Date.now();
  agent.bubble = '💀';
  updateAgent(agent);
  graveyard.push({ ...publicAgent(agent), memory: agent.memory });
  persist('graveyard');
  logDecision('Penny & Max', `${agent.name} (${agent.title}) KOVULDU`, `Sebep: ${reason}. Teslim: ${agent.stats.done}, ort. puan: ${agent.stats.rated ? (agent.stats.ratingSum / agent.stats.rated).toFixed(1) : '-'}`);
  toast(`💀 ${agent.name} kovuldu: ${reason}`, 'death');
  emit('fx', { agentId: agent.id, kind: 'death' });
  if (company.settings.autoHire) setTimeout(() => replace(agent), 45000);
}

export function replace(dead) {
  if (dead.status !== 'dead') return null;
  const idx = agents.indexOf(dead);
  if (idx < 0) return null;
  const fresh = newAgent(dead.role, dead.slot, (dead.generation || 1) + 1, dead);
  agents.splice(idx, 1, fresh);
  persist('agents');
  emit('agent:replace', { oldId: dead.id, agent: publicAgent(fresh) });
  logDecision('Max', `${fresh.name} işe alındı (${fresh.title})`, `${dead.name}'in yerine, ${fresh.generation}. kuşak. Öncülün dersleri hafızasında.`);
  toast(`🆕 ${fresh.name} işe başladı (${fresh.title})`, 'hire');
  return fresh;
}

export function revive(agent) {
  if (agent.status !== 'dead') return;
  graveyard.splice(graveyard.findIndex((g) => g.id === agent.id), 1);
  Object.assign(agent, { status: 'idle', hp: 50, bubble: '😇', deathReason: null, nextRunAt: Date.now() + 2000 });
  persist('graveyard');
  updateAgent(agent);
  logDecision('Boss', `${agent.name} diriltildi`, 'Patron ikinci şans verdi.');
}

export function fire(agent) {
  kill(agent, 'patron tarafından kovuldu');
}

/** Teslim puanı (1-5) → can. */
export function rateDeliverable(d, stars) {
  const s = Math.max(1, Math.min(5, Math.round(stars)));
  const prev = d.rating;
  d.rating = s;
  persist('deliverables');
  emit('deliverable:update', d);
  const ag = agentById(d.agentId);
  if (!ag) return;
  if (prev == null) {
    ag.stats.rated++;
    ag.stats.ratingSum += s;
  } else ag.stats.ratingSum += s - prev;
  const delta = { 1: -10, 2: -3, 3: 5, 4: 12, 5: 25 }[s] - (prev ? { 1: -10, 2: -3, 3: 5, 4: 12, 5: 25 }[prev] : 0);
  const xpGain = (s - (prev || 0)) * 5;
  if (xpGain > 0) gainXp(ag, xpGain, `${s}★`);
  reward(ag, delta, `teslim puanı ${s}★: ${d.title}`);
}

/** Gerçek gelir kaydı. Teslime bağlanırsa ilgili ajan büyük ödül alır, takım da pay alır. */
export function recordRevenue(amount, note, deliverableId, agentId = null) {
  const n = Math.abs(Number(amount) || 0);
  if (!n) throw new Error('tutar gerekli');
  const d = deliverableId ? deliverables.find((x) => x.id === deliverableId) : null;
  ledger.entries.push({ id: uid('led'), t: Date.now(), type: 'revenue', amount: n, note: String(note || 'Gelir').slice(0, 200), deliverableId: d?.id || null, agentId: d?.agentId || agentId || null });
  if (!d && agentId) {
    const ag = agentById(agentId);
    if (ag) {
      ag.stats.revenue += n;
      reward(ag, 40, `GERÇEK GELİR: ${n} ${company.currency}`);
      gainXp(ag, Math.min(300, n), 'gelir');
      ag.bubble = '💰';
      updateAgent(ag);
    }
  }
  persist('ledger');
  if (d) {
    d.revenue = (d.revenue || 0) + n;
    persist('deliverables');
    emit('deliverable:update', d);
    const ag = agentById(d.agentId);
    if (ag) {
      ag.stats.revenue += n;
      reward(ag, 40, `GERÇEK GELİR: ${n} ${company.currency}`);
      gainXp(ag, Math.min(300, n), 'gelir');
      ag.bubble = '💰';
      updateAgent(ag);
    }
  }
  for (const a of agents) if (a.status !== 'dead' && a.id !== (d?.agentId || agentId)) reward(a, 8, 'şirket para kazandı');
  emit('fx', { kind: 'money', amount: n });
  emit('ledger:changed', {});
  toast(`💰 +${n} ${company.currency} gelir!`, 'money');
  logDecision('Penny', `Gelir: +${n} ${company.currency}`, note || '');
}

/** Reklam kampanyası gerçek sonucu: harcama farkı kasaya iade edilir, satış gelir olur, ROI ajana yazılır. */
export function recordAdResult(apr, { spent, clicks, revenue }) {
  if (apr.kind !== 'ad' || apr.status !== 'approved') throw new Error('sadece onaylanmış reklam');
  if (apr.adResult) throw new Error('sonuç zaten girildi');
  const planned = Math.abs(Number(apr.payload?.amount) || 0);
  const s = Math.max(0, Number(spent ?? planned) || 0);
  const rev = Math.max(0, Number(revenue) || 0);
  if (s < planned) {
    ledger.entries.push({ id: uid('led'), t: Date.now(), type: 'deposit', amount: planned - s, note: `Reklam iadesi (harcanmayan): ${apr.title}` });
  } else if (s > planned) {
    ledger.entries.push({ id: uid('led'), t: Date.now(), type: 'spend', amount: s - planned, note: `Reklam fazla harcama: ${apr.title}` });
  }
  persist('ledger');
  apr.adResult = { spent: s, clicks: Math.max(0, Number(clicks) || 0), revenue: rev, t: Date.now() };
  const ag = agentById(apr.agentId);
  if (ag) {
    ag.stats.adSpend = (ag.stats.adSpend || 0) + s;
    ag.stats.adRevenue = (ag.stats.adRevenue || 0) + rev;
    updateAgent(ag);
    if (!rev && s > 0) reward(ag, -8, `reklam satış getirmedi (${s} ${company.currency} yandı)`);
  }
  if (rev) recordRevenue(rev, `Reklam satışı: ${apr.title}`, null, apr.agentId);
  else emit('ledger:changed', {});
  logDecision('Penny', `Reklam sonucu: ${apr.title}`, `Harcanan ${s}, tıklama ${apr.adResult.clicks}, satış ${rev} → ROI ${s ? ((rev / s) * 100).toFixed(0) + '%' : '-'}`);
  return apr;
}

export function deposit(amount, note) {
  const n = Math.abs(Number(amount) || 0);
  if (!n) throw new Error('tutar gerekli');
  ledger.entries.push({ id: uid('led'), t: Date.now(), type: 'deposit', amount: n, note: String(note || 'Patron sermaye ekledi').slice(0, 200) });
  persist('ledger');
  emit('ledger:changed', {});
  toast(`🏦 Kasaya ${n} ${company.currency} eklendi`, 'money');
}

let lastTick = Date.now();
/** Stres 0-100: düşük can, biriken iş, son başarısızlıklar ve azalan kasa. Prompt'a da girer. */
export function computeStress(a) {
  const queue = tasks.filter((t) => t.assignee === a.id && (t.status === 'todo' || t.status === 'doing')).length;
  const recentFail = tasks.filter((t) => t.assignee === a.id && t.status === 'failed' && Date.now() - t.updatedAt < 6 * 3.6e6).length;
  const noRevenue = ledger.entries.some((e) => e.type === 'revenue') ? 0 : 10;
  const s = (100 - a.hp) * 0.75 + queue * 7 + recentFail * 12 + noRevenue - (a.calmUntil > Date.now() ? 25 : 0);
  return Math.max(0, Math.min(100, s));
}

/** Dakikalık yakım. */
export function economyTick() {
  const now = Date.now();
  const hours = (now - lastTick) / 3.6e6;
  lastTick = now;
  if (company.settings.paused || !company.setupDone) return; // kurulum sihirbazı bitene kadar ofis bekler
  const burn = (company.settings.burnPerHour || 2) * hours;
  for (const a of agents) {
    if (a.status === 'dead' || a.role === 'claude') continue;
    a.hp = Math.max(0, a.hp - burn);
    a.stress = computeStress(a);
    if (a.hp <= 0) kill(a, 'canı tükendi: zamanında para getiremedi');
  }
  persist('agents');
  emit('hp', agents.map((a) => [a.id, Math.round(a.hp * 10) / 10, Math.round(a.stress || 0)]));
}
