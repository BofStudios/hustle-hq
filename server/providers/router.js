// Motor yönlendirici: alias zinciri → somut (sağlayıcı, model) adayları, cooldown, kota sayacı, mock fallback.
import { env, num } from '../config.js';
import { load, save } from '../store.js';
import { emit, toast } from '../bus.js';
import { PROVIDERS, ALIASES } from './catalog.js';
import { mockChat } from './mock.js';

const cooldowns = new Map(); // key -> { until, fails }
const disabledModels = new Map(); // "prov:model" -> until
const status = {}; // provId -> { state: ok|cool|down|off, lastError, lastOk }
let ollamaModels = [];
let active = 0;
const waiters = [];

const usage = load('usage', { day: today(), byProvider: {} });

function today() {
  return new Date().toISOString().slice(0, 10);
}

function keyOf(p) {
  if (p.local) return ollamaModels.length ? 'local' : null;
  return env[p.keyEnv] || null;
}

export function isDemo() {
  if (env.FORCE_DEMO === '1') return true;
  return !PROVIDERS.some((p) => keyOf(p));
}

export async function probeOllama() {
  const base = env.OLLAMA_URL || 'http://localhost:11434/v1';
  try {
    const r = await fetch(base.replace(/\/v1\/?$/, '') + '/api/tags', { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    ollamaModels = (j.models || []).map((m) => m.name);
  } catch {
    ollamaModels = [];
  }
  const p = PROVIDERS.find((x) => x.id === 'ollama');
  p.baseUrl = base;
  const preferred = env.OLLAMA_MODEL && ollamaModels.includes(env.OLLAMA_MODEL) ? env.OLLAMA_MODEL : ollamaModels[0];
  p.models = preferred ? Object.fromEntries(Object.keys(ALIASES).map((a) => [a, [preferred]])) : {};
  refreshStatus();
  return ollamaModels;
}

/** Kullanıcı motor ezmeleri: { aliasOverrides: { "openrouter": { "deepseek": ["..."] } } } */
function overrides() {
  return load('engines', { aliasOverrides: {} });
}

function modelsFor(p, alias) {
  return overrides().aliasOverrides?.[p.id]?.[alias] || p.models[alias] || [];
}

/** Zincirdeki her öğe ya alias ("deepseek") ya da açık "sağlayıcı:model" olabilir. */
export function resolveChain(chain) {
  const out = [];
  for (const item of chain || []) {
    const idx = item.indexOf(':');
    const explicitProv = idx > 0 ? PROVIDERS.find((p) => p.id === item.slice(0, idx)) : null;
    if (explicitProv) {
      if (keyOf(explicitProv)) out.push({ p: explicitProv, model: item.slice(idx + 1) });
      continue;
    }
    // ücretsiz sağlayıcılar önce
    const provs = [...PROVIDERS].sort((a, b) => Number(b.free) - Number(a.free));
    for (const p of provs) {
      if (!keyOf(p)) continue;
      for (const m of modelsFor(p, item)) out.push({ p, model: m });
    }
  }
  // zincirde hiçbir şey kalmadıysa herhangi bir anahtarlı sağlayıcının ilk modeli
  if (!out.length) {
    for (const p of PROVIDERS) {
      if (!keyOf(p)) continue;
      const first = Object.values(p.models)[0]?.[0];
      if (first) out.push({ p, model: first });
    }
  }
  const seen = new Set();
  return out.filter((c) => {
    const k = c.p.id + ':' + c.model;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function available(c) {
  const k = c.p.id + ':' + c.model;
  const now = Date.now();
  if ((disabledModels.get(k) || 0) > now) return false;
  if ((cooldowns.get(c.p.id)?.until || 0) > now) return false;
  return true;
}

function setCooldown(provId, ms, reason) {
  const prev = cooldowns.get(provId) || { fails: 0 };
  const fails = prev.fails + 1;
  const wait = ms ?? Math.min(15000 * 2 ** (fails - 1), 30 * 60 * 1000);
  cooldowns.set(provId, { until: Date.now() + wait, fails });
  status[provId] = { ...(status[provId] || {}), state: 'cool', lastError: reason, until: Date.now() + wait };
  emitStatus();
}

function markOk(provId) {
  cooldowns.delete(provId);
  status[provId] = { ...(status[provId] || {}), state: 'ok', lastOk: Date.now(), lastError: null };
}

function countUsage(provId, tokens) {
  if (usage.day !== today()) {
    usage.day = today();
    usage.byProvider = {};
  }
  const u = (usage.byProvider[provId] ||= { calls: 0, tokens: 0 });
  u.calls++;
  u.tokens += tokens || 0;
  save('usage', usage);
}

async function acquire() {
  const max = num('MAX_CONCURRENT', 3);
  if (active < max) {
    active++;
    return;
  }
  await new Promise((r) => waiters.push(r));
  active++;
}
function release() {
  active--;
  const next = waiters.shift();
  if (next) next();
}

/**
 * @returns {Promise<{text:string, provider:string, model:string, tokens:number}>}
 * Hiçbir aday yoksa veya hepsi cooldown'daysa: demo modunda mock, değilse 'ALL_COOLING' hatası.
 */
export async function chat({ messages, chain, meta = {}, maxTokens = 1200, temperature = 0.7, json = true }) {
  if (isDemo()) {
    await acquire();
    try {
      return await mockChat({ messages, meta });
    } finally {
      release();
    }
  }
  const candidates = resolveChain(chain).filter(available);
  if (!candidates.length) {
    const err = new Error('ALL_COOLING');
    err.code = 'ALL_COOLING';
    throw err;
  }
  await acquire();
  try {
    let lastErr;
    for (const c of candidates.slice(0, 4)) {
      if (!available(c)) continue;
      try {
        const res = await callOpenAI(c, { messages, maxTokens, temperature, json });
        markOk(c.p.id);
        countUsage(c.p.id, res.tokens);
        return res;
      } catch (e) {
        lastErr = e;
        handleError(c, e);
      }
    }
    const err = new Error(lastErr?.message || 'ALL_COOLING');
    err.code = 'ALL_COOLING';
    throw err;
  } finally {
    release();
    emitStatus();
  }
}

async function callOpenAI(c, { messages, maxTokens, temperature, json }) {
  const key = keyOf(c.p);
  const body = { model: c.model, messages, max_tokens: maxTokens, temperature };
  // json_object modu bazı sağlayıcılarda yok; sadece bilinenlerde aç
  if (json && ['deepseek', 'gemini', 'groq', 'moonshot', 'dashscope'].includes(c.p.id)) body.response_format = { type: 'json_object' };
  const headers = { 'Content-Type': 'application/json', ...(c.p.headers || {}) };
  if (key && key !== 'local') headers.Authorization = `Bearer ${key}`;
  const r = await fetch(c.p.baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const text = await r.text();
  if (!r.ok) {
    const e = new Error(`${c.p.name} ${r.status}: ${text.slice(0, 200)}`);
    e.status = r.status;
    e.retryAfter = Number(r.headers.get('retry-after')) || null;
    // response_format desteklenmiyorsa bir kez onsuz dene
    if (r.status === 400 && body.response_format && /response_format|json/i.test(text)) {
      return callOpenAI(c, { messages, maxTokens, temperature, json: false });
    }
    throw e;
  }
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw Object.assign(new Error(`${c.p.name}: JSON olmayan yanıt`), { status: 502 });
  }
  const msg = j.choices?.[0]?.message;
  const out = (msg?.content || msg?.reasoning_content || '').toString();
  if (!out.trim()) throw Object.assign(new Error(`${c.p.name}: boş yanıt`), { status: 502 });
  return { text: out, provider: c.p.id, model: c.model, tokens: j.usage?.total_tokens || Math.round(out.length / 3) };
}

function handleError(c, e) {
  const s = e.status;
  const k = c.p.id + ':' + c.model;
  if (s === 401 || s === 403) {
    status[c.p.id] = { state: 'down', lastError: 'Anahtar geçersiz veya yetkisiz' };
    setCooldown(c.p.id, 60 * 60 * 1000, 'yetki hatası');
    toast(`${c.p.name}: API anahtarı reddedildi`, 'error');
  } else if (s === 404 || s === 400) {
    disabledModels.set(k, Date.now() + 6 * 60 * 60 * 1000); // model yok/eski
  } else if (s === 429 || s === 402) {
    setCooldown(c.p.id, e.retryAfter ? e.retryAfter * 1000 : null, s === 402 ? 'kredi bitti' : 'kota (429)');
  } else {
    setCooldown(c.p.id, 20000 + Math.random() * 20000, e.message.slice(0, 80));
  }
}

function refreshStatus() {
  for (const p of PROVIDERS) {
    if (!keyOf(p)) status[p.id] = { state: 'off' };
    else if (!status[p.id] || status[p.id].state === 'off') status[p.id] = { state: 'ok' };
  }
}

export function providerStatus() {
  refreshStatus();
  const now = Date.now();
  return PROVIDERS.map((p) => {
    const s = status[p.id] || { state: 'off' };
    const cool = cooldowns.get(p.id);
    const state = s.state === 'cool' && (!cool || cool.until < now) ? 'ok' : s.state;
    return {
      id: p.id,
      name: p.name,
      free: p.free,
      local: !!p.local,
      signup: p.signup,
      keyEnv: p.keyEnv,
      hasKey: !!keyOf(p),
      state,
      lastError: s.lastError || null,
      until: cool?.until || null,
      usage: usage.byProvider[p.id] || { calls: 0, tokens: 0 },
      models: p.local ? ollamaModels : Object.values(p.models).flat(),
    };
  });
}

let lastEmit = 0;
function emitStatus() {
  if (Date.now() - lastEmit < 1000) return;
  lastEmit = Date.now();
  emit('providers', { demo: isDemo(), list: providerStatus() });
}

/** Anahtar testi: tek kısa çağrı. */
export async function testProvider(id) {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error('bilinmeyen sağlayıcı');
  if (p.local) await probeOllama();
  if (!keyOf(p)) return { ok: false, error: 'Anahtar yok' };
  const errors = [];
  for (const model of [...new Set(Object.values(p.models).flat())].slice(0, 3)) {
    try {
      const r = await callOpenAI({ p, model }, { messages: [{ role: 'user', content: 'Reply with just: OK' }], maxTokens: 10, temperature: 0, json: false });
      markOk(p.id);
      emitStatus();
      return { ok: true, model, reply: r.text.slice(0, 40) };
    } catch (e) {
      errors.push(e.message);
      if (e.status === 401 || e.status === 403) break;
    }
  }
  return { ok: false, error: errors.join(' | ').slice(0, 300) };
}

export { ALIASES };
