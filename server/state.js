// Merkezi oyun durumu: koleksiyonlar + değişiklik yayını.
import { load, save, uid, appendLog } from './store.js';
import { emit } from './bus.js';

export const company = load('company', {
  name: 'Hustle HQ',
  createdAt: Date.now(),
  currency: '₺',
  goal: null,
  settings: { burnPerHour: 2, autoHire: true, proactiveMinutes: 12, paused: false },
  boss: { name: 'Boss', look: { skin: 1, hair: 3, hairStyle: 0, shirt: 7, pants: 0, tie: 2 } },
  floor: 1,
});

export const agents = load('agents', []);
export const tasks = load('tasks', []);
export const deliverables = load('deliverables', []);
export const approvals = load('approvals', []);
export const ledger = load('ledger', { entries: [] });
export const decisions = load('decisions', []);
export const graveyard = load('graveyard', []);

export function persist(...names) {
  for (const n of names) save(n);
}

// ---------- ajanlar ----------
export function agentById(id) {
  return agents.find((a) => a.id === id);
}
export function agentByRole(role) {
  return agents.find((a) => a.role === role && a.status !== 'dead') || agents.find((a) => a.role === role);
}
/** "Byte", "developer", "dev", ajan id → ajan */
export function findAgent(ref) {
  if (!ref) return null;
  const r = String(ref).toLowerCase().trim();
  return (
    agents.find((a) => a.id === ref) ||
    agents.find((a) => a.name.toLowerCase() === r && a.status !== 'dead') ||
    agents.find((a) => a.role === r && a.status !== 'dead') ||
    agents.find((a) => a.title.toLowerCase().includes(r) && a.status !== 'dead') ||
    null
  );
}

export function publicAgent(a) {
  const { memory, ...rest } = a;
  return { ...rest, memoryChars: memory?.length || 0 };
}

// Aynı ajanın art arda güncellemeleri 250 ms içinde tek mesajda birleşir (WS trafiğini azaltır).
const pendingAgentEmit = new Map();
export function updateAgent(a, patch = {}) {
  Object.assign(a, patch);
  save('agents');
  if (pendingAgentEmit.has(a.id)) return;
  pendingAgentEmit.set(a.id, setTimeout(() => {
    pendingAgentEmit.delete(a.id);
    emit('agent:update', publicAgent(a));
  }, 250));
}

export function agentLog(a, kind, text, extra = {}) {
  const entry = { t: Date.now(), agentId: a.id, kind, text: String(text).slice(0, 4000), ...extra };
  appendLog(`agent-${a.id}`, entry);
  emit('agent:log', entry);
  return entry;
}

// ---------- görevler ----------
export function createTask({ title, detail = '', assignee, createdBy = 'boss', priority = 2, goalId = null, parent = null }) {
  const t = {
    id: uid('task'),
    title: String(title).slice(0, 140),
    detail: String(detail).slice(0, 3000),
    assignee,
    createdBy,
    status: 'todo',
    priority,
    goalId,
    parent,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    result: null,
    deliverableIds: [],
    attempts: 0,
  };
  tasks.push(t);
  save('tasks');
  emit('task:update', t);
  return t;
}

export function updateTask(t, patch) {
  Object.assign(t, patch, { updatedAt: Date.now() });
  save('tasks');
  emit('task:update', t);
}

export function openTasksFor(agentId) {
  return tasks
    .filter((t) => t.assignee === agentId && (t.status === 'todo' || t.status === 'doing'))
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
}

// ---------- teslimler ----------
export function addDeliverable(d) {
  const item = { id: uid('dlv'), createdAt: Date.now(), rating: null, revenue: 0, ...d };
  deliverables.push(item);
  save('deliverables');
  emit('deliverable:new', item);
  return item;
}

// ---------- kararlar ----------
export function logDecision(by, title, why = '') {
  const d = { id: uid('dec'), t: Date.now(), by, title: String(title).slice(0, 200), why: String(why).slice(0, 1000) };
  decisions.push(d);
  if (decisions.length > 500) decisions.splice(0, decisions.length - 500);
  save('decisions');
  emit('decision:new', d);
  return d;
}

// ---------- kasa ----------
export function balance() {
  return ledger.entries.reduce((s, e) => s + (e.type === 'spend' ? -e.amount : e.amount), 0);
}
export function revenueTotal() {
  return ledger.entries.filter((e) => e.type === 'revenue').reduce((s, e) => s + e.amount, 0);
}
export function spendLast(days = 7) {
  const since = Date.now() - days * 864e5;
  return ledger.entries.filter((e) => e.type === 'spend' && e.t >= since).reduce((s, e) => s + e.amount, 0);
}

export function snapshot() {
  return {
    company,
    agents: agents.map(publicAgent),
    tasks: tasks.slice(-300),
    deliverables: deliverables.slice(-200),
    approvals: approvals.filter((a) => a.status === 'pending' || Date.now() - a.createdAt < 3 * 864e5).slice(-100),
    ledger: { entries: ledger.entries.slice(-200), balance: balance(), revenue: revenueTotal() },
    decisions: decisions.slice(-100),
    graveyard: graveyard.slice(-50),
  };
}
