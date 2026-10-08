// Sunucu bağlantısı: WebSocket (otomatik yeniden bağlanma) + REST yardımcıları + yerel durum.
export const S = {
  connected: false,
  company: null,
  agents: new Map(),
  tasks: new Map(),
  deliverables: [],
  approvals: new Map(),
  ledger: { entries: [], balance: 0, revenue: 0 },
  decisions: [],
  graveyard: [],
  providers: [],
  demo: true,
  claude: { running: false, usedToday: 0, limit: 10 },
  pending: 0,
  logs: new Map(), // agentId -> [entry]
  feed: [], // son olaylar
};

const handlers = new Map();
export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
}
function fire(type, payload) {
  for (const fn of handlers.get(type) || []) {
    try { fn(payload); } catch (e) { console.error(type, e); }
  }
}

export async function api(method, path, body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function pushLog(e) {
  if (!S.logs.has(e.agentId)) S.logs.set(e.agentId, []);
  const arr = S.logs.get(e.agentId);
  arr.push(e);
  if (arr.length > 300) arr.splice(0, arr.length - 300);
  if (['thought', 'done', 'task', 'say', 'reward', 'penalty', 'sleep', 'review', 'inbox'].includes(e.kind)) {
    S.feed.push(e);
    if (S.feed.length > 60) S.feed.shift();
  }
}

function apply(type, p) {
  switch (type) {
    case 'snapshot':
      S.company = p.company;
      S.agents = new Map(p.agents.map((a) => [a.id, a]));
      S.tasks = new Map(p.tasks.map((t) => [t.id, t]));
      S.deliverables = p.deliverables;
      S.approvals = new Map(p.approvals.map((a) => [a.id, a]));
      S.ledger = p.ledger;
      S.decisions = p.decisions;
      S.graveyard = p.graveyard;
      S.providers = p.providers;
      S.demo = p.demo;
      S.claude = p.claude;
      S.pending = p.pending;
      break;
    case 'agent:update': {
      const prev = S.agents.get(p.id);
      S.agents.set(p.id, { ...prev, ...p });
      break;
    }
    case 'agent:replace':
      S.agents.delete(p.oldId);
      S.agents.set(p.agent.id, p.agent);
      break;
    case 'agent:log':
      pushLog(p);
      break;
    case 'hp':
      for (const [id, hp, stress] of p) { const a = S.agents.get(id); if (a) { a.hp = hp; if (stress != null) a.stress = stress; } }
      break;
    case 'task:update':
      S.tasks.set(p.id, p);
      if (S.tasks.size > 400) S.tasks.delete(S.tasks.keys().next().value);
      break;
    case 'deliverable:new':
      S.deliverables.push(p);
      break;
    case 'deliverable:update': {
      const i = S.deliverables.findIndex((d) => d.id === p.id);
      if (i >= 0) S.deliverables[i] = p;
      break;
    }
    case 'approval:update':
      S.approvals.set(p.id, p);
      S.pending = [...S.approvals.values()].filter((a) => a.status === 'pending').length;
      break;
    case 'decision:new':
      S.decisions.push(p);
      break;
    case 'company':
      S.company = p;
      break;
    case 'providers':
      S.providers = p.list;
      S.demo = p.demo;
      break;
    case 'tick':
      S.pending = p.pending;
      S.claude = p.claude;
      break;
    case 'reload':
      setTimeout(() => location.reload(), 300);
      break;
    case 'ledger:changed':
      refreshLedger();
      break;
  }
}

export async function refreshLedger() {
  try {
    const snap = await api('GET', '/api/snapshot');
    S.ledger = snap.ledger;
    S.graveyard = snap.graveyard;
    fire('ledger', S.ledger);
  } catch {}
}

let ws;
export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { S.connected = true; fire('connection', true); };
  ws.onclose = () => {
    S.connected = false;
    fire('connection', false);
    setTimeout(connect, 2000);
  };
  ws.onmessage = (ev) => {
    const { type, payload } = JSON.parse(ev.data);
    apply(type, payload);
    fire(type, payload);
    fire('*', { type, payload });
  };
}
