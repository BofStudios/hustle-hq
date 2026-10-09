// Yaşayan dünya (sunucu tarafı): hava durumu, patronun ikramları (kahve, övgü), pizza partisi.
// İkramlar sadece moral/stres içindir; can (HP) vermez, böylece "para kazan ya da kovul" kuralı delinmez.
import { agents, company, persist, updateAgent, agentById, agentLog, logDecision } from './state.js';
import { computeStress, gainXp, reward } from './economy.js';
import { emit, toast } from './bus.js';
import { env } from './config.js';

const L = (tr, en) => (env.LANG !== 'tr' ? en : tr);
const MIN = 60000;

// ---------------- hava durumu ----------------
// Varsayılan: tarihe göre tohumlanmış simülasyon (her sekmede aynı hava). İstenirse şehir girilir ve
// Open-Meteo'dan (ücretsiz, anahtarsız) gerçek hava çekilir. Sadece şehir adı gönderilir.
const KINDS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];
let cache = { key: '', at: 0, data: null };

function seeded(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function simulatedWeather(date = new Date()) {
  const m = date.getMonth();
  const winter = m === 11 || m <= 1;
  const summer = m >= 5 && m <= 7;
  // hava 3 saatlik bloklarda değişir
  const block = Math.floor(date.getTime() / (3 * 3600e3));
  const r = seeded(block);
  let kind;
  if (summer) kind = r < 0.72 ? 'clear' : r < 0.88 ? 'cloudy' : r < 0.96 ? 'rain' : 'storm';
  else if (winter) kind = r < 0.3 ? 'clear' : r < 0.55 ? 'cloudy' : r < 0.72 ? 'rain' : r < 0.92 ? 'snow' : 'fog';
  else kind = r < 0.45 ? 'clear' : r < 0.68 ? 'cloudy' : r < 0.86 ? 'rain' : r < 0.94 ? 'storm' : 'fog';
  const base = [6, 8, 12, 16, 21, 26, 30, 30, 25, 19, 13, 8][m];
  const h = date.getHours();
  const daily = Math.sin(((h - 9) / 24) * Math.PI * 2) * 4;
  const temp = Math.round(base + daily + (seeded(block + 7) - 0.5) * 4 - (kind === 'rain' || kind === 'storm' ? 3 : 0) - (kind === 'snow' ? 6 : 0));
  return { kind, temp: kind === 'snow' ? Math.min(temp, 1) : temp, source: 'sim' };
}

function wmo(code) {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if (code >= 51) return 'rain';
  return 'cloudy';
}

async function realWeather(city) {
  const ac = AbortSignal.timeout(6000);
  const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(city)}`, { signal: ac })).json();
  const p = g?.results?.[0];
  if (!p) throw new Error(L('şehir bulunamadı', 'city not found'));
  const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code,is_day`, { signal: AbortSignal.timeout(6000) })).json();
  const c = w?.current;
  if (!c) throw new Error('weather unavailable');
  return { kind: wmo(Number(c.weather_code)), temp: Math.round(c.temperature_2m), source: 'real', city: `${p.name}${p.country_code ? ', ' + p.country_code : ''}` };
}

/** Şu anki hava. Ayar: company.settings.weather = 'auto' | 'real' | clear|cloudy|rain|storm|snow|fog */
export async function currentWeather() {
  const mode = company.settings?.weather || 'auto';
  if (KINDS.includes(mode)) return { ...simulatedWeather(), kind: mode, source: 'manual' };
  const city = String(company.settings?.city || '').trim();
  if (mode === 'real' && city) {
    const key = `${city}`;
    if (cache.key === key && Date.now() - cache.at < 20 * MIN && cache.data) return cache.data;
    try {
      const data = await realWeather(city);
      cache = { key, at: Date.now(), data };
      return data;
    } catch (e) {
      const fb = { ...simulatedWeather(), error: e.message };
      cache = { key, at: Date.now() - 15 * MIN, data: fb }; // 5 dk sonra yeniden dene
      return fb;
    }
  }
  return simulatedWeather();
}

// ---------------- patron ikramları ----------------
const COOLDOWN = { coffee: 20 * MIN, praise: 60 * MIN };

/** Patron yürüyüp ajana kahve verir ya da över: stres düşer (sakinlik), övgü biraz XP verir. HP vermez. */
export function treat(agent, kind) {
  if (!agent) throw new Error(L('ajan yok', 'agent not found'));
  if (!COOLDOWN[kind]) throw new Error('kind: coffee | praise');
  if (agent.status === 'dead') throw new Error(L('kovulmuş ajana ikram olmaz', 'agent was fired'));
  agent.treats ||= {};
  const last = agent.treats[kind] || 0;
  const wait = last + COOLDOWN[kind] - Date.now();
  if (wait > 0) {
    const m = Math.ceil(wait / MIN);
    return { ok: false, cooldown: m, text: kind === 'coffee' ? L(`${agent.name} hâlâ kahvesini içiyor (${m} dk)`, `${agent.name} is still drinking the last one (${m} min)`) : L(`${agent.name} az önce övüldü, şımarmasın (${m} dk)`, `${agent.name} was just praised (${m} min)`) };
  }
  agent.treats[kind] = Date.now();
  const calm = kind === 'coffee' ? 20 : 30;
  agent.calmUntil = Math.max(agent.calmUntil || 0, Date.now()) + calm * MIN;
  agent.bossBond = Math.min(100, (agent.bossBond || 0) + (kind === 'praise' ? 3 : 2));
  agent.stress = computeStress(agent);
  agent.bubble = kind === 'coffee' ? '☕' : '😊';
  updateAgent(agent);
  if (kind === 'praise') gainXp(agent, 5, L('patron övdü', 'boss praise'));
  agentLog(agent, 'reward', kind === 'coffee' ? L('☕ Patron kahve ısmarladı. Stres azaldı.', '☕ The boss brought coffee. Stress down.') : L('😊 Patron övdü: "İyi iş çıkarıyorsun!" Motivasyon arttı.', '😊 The boss said "Great work!" Motivation up.'));
  emit('fx', { kind: 'treat', agentId: agent.id, treat: kind });
  emit('hp', [[agent.id, Math.round(agent.hp * 10) / 10, Math.round(agent.stress || 0)]]);
  return { ok: true, stress: Math.round(agent.stress || 0) };
}

/** Pizza partisi: tüm ekip sakinleşir, +3 can (günde en fazla bir kez). Oyun içi ikramdır, kasadan para düşmez. */
export function pizzaParty() {
  const last = company.lastPizzaAt || 0;
  const wait = last + 6 * 60 * MIN - Date.now();
  if (wait > 0) return { ok: false, cooldown: Math.ceil(wait / MIN), text: L(`Ekip hâlâ tok. ${Math.ceil(wait / 60 / MIN)} saat sonra tekrar.`, `The team is still full. Try again in ${Math.ceil(wait / 60 / MIN)} h.`) };
  company.lastPizzaAt = Date.now();
  persist('company');
  let n = 0;
  for (const a of agents) {
    if (a.status === 'dead' || a.role === 'claude') continue;
    reward(a, 3, L('pizza partisi', 'pizza party'));
    a.calmUntil = Math.max(a.calmUntil || 0, Date.now()) + 45 * MIN;
    a.bossBond = Math.min(100, (a.bossBond || 0) + 1);
    a.stress = computeStress(a);
    updateAgent(a);
    n++;
  }
  logDecision(company.boss?.name || 'Boss', L('🍕 Pizza partisi', '🍕 Pizza party'), L(`${n} kişilik ekip mutfakta toplandı.`, `${n} people gathered in the kitchen.`));
  emit('party', { kind: 'pizza', at: Date.now() });
  emit('hp', agents.map((a) => [a.id, Math.round(a.hp * 10) / 10, Math.round(a.stress || 0)]));
  toast(L('🍕 Pizzalar geliyor! Ekip mutfağa koşuyor.', '🍕 Pizza is on the way! The team is heading to the kitchen.'), 'hire');
  return { ok: true, people: n };
}

export function treatById(id, kind) {
  return treat(agentById(id), kind);
}
