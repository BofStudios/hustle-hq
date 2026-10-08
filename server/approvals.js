// Onay kuyruğu: dışarı giden veya riskli her eylem Boss masasına kart olarak düşer.
import { approvals, agentById, agentLog, ledger, persist, logDecision, updateAgent } from './state.js';
import { uid } from './store.js';
import { emit, toast } from './bus.js';
import { hardBlockReason, urlAllowed, pcActionBlockReason } from './policy.js';
import { WORKSPACE_DIR } from './config.js';
import { runInWorkspace } from './agents/sandbox.js';
import { openTarget, shellSpawn, killTree } from './platform.js';

const NEEDS_SHIELD = new Set(['publish', 'spend', 'external', 'ad']);

export function createApproval({ agentId, kind, title, detail = '', payload = {}, expectedReturn = '' }) {
  const a = {
    id: uid('apr'),
    agentId,
    kind,
    title: String(title).slice(0, 160),
    detail: String(detail).slice(0, 6000),
    payload,
    expectedReturn: String(expectedReturn).slice(0, 300),
    shield: NEEDS_SHIELD.has(kind) ? { state: 'pending', note: '' } : { state: 'skip', note: '' },
    status: 'pending',
    createdAt: Date.now(),
    decidedAt: null,
    result: null,
  };
  const block = hardBlockReason(`${title}\n${detail}\n${JSON.stringify(payload)}`);
  if (block) {
    a.status = 'rejected';
    a.decidedAt = Date.now();
    a.result = `Otomatik red: ${block}`;
    a.shield = { state: 'blocked', note: block };
  }
  approvals.push(a);
  persist('approvals');
  emit('approval:update', a);
  if (a.status === 'pending') toast(`📥 Onay bekliyor: ${a.title}`, 'approval');
  else notifyAgent(a);
  return a;
}

export function setShieldVerdict(a, verdict, note) {
  a.shield = { state: verdict, note: String(note).slice(0, 1200) };
  persist('approvals');
  emit('approval:update', a);
}

function notifyAgent(a) {
  const ag = agentById(a.agentId);
  if (!ag) return;
  ag.inbox ||= [];
  ag.inbox.push({ from: 'Boss', t: Date.now(), text: `Onay "${a.title}" → ${a.status.toUpperCase()}. ${a.result || ''}`.slice(0, 1500) });
  updateAgent(ag);
  agentLog(ag, 'approval', `Onay sonucu: ${a.title} → ${a.status}${a.result ? ' | ' + a.result.slice(0, 300) : ''}`);
}

export async function decideApproval(id, approve, answer = '') {
  const a = approvals.find((x) => x.id === id);
  if (!a) throw new Error('onay bulunamadı');
  if (a.status !== 'pending') throw new Error('zaten karar verilmiş');
  a.status = approve ? 'approved' : 'rejected';
  a.decidedAt = Date.now();
  a.result = answer ? `Boss: ${answer}` : null;
  if (approve) {
    try {
      const r = await execute(a);
      if (r) a.result = [a.result, r].filter(Boolean).join('\n');
    } catch (e) {
      a.result = `Yürütme hatası: ${e.message}`;
    }
  }
  persist('approvals');
  emit('approval:update', a);
  notifyAgent(a);
  if (a.kind === 'spend' || a.kind === 'publish') logDecision('Boss', `${approve ? 'Onaylandı' : 'Reddedildi'}: ${a.title}`, a.result || '');
  return a;
}

async function execute(a) {
  switch (a.kind) {
    case 'command':
    case 'install': {
      const out = await runInWorkspace(a.payload.command, a.payload.cwd, 5 * 60 * 1000);
      return `Çıktı (exit ${out.code}):\n${out.output.slice(-2500)}`;
    }
    case 'open_url': {
      if (!urlAllowed(a.payload.url)) throw new Error('URL izinli değil');
      openTarget(a.payload.url);
      return 'Tarayıcıda açıldı.';
    }
    case 'pc': {
      const { action, target } = a.payload;
      const block = pcActionBlockReason(action, target);
      if (block) throw new Error(block);
      if (action === 'open_url' || action === 'open_app' || action === 'open_folder') {
        openTarget(target);
        return `Açıldı: ${target}`;
      }
      if (action === 'powershell') {
        const out = await new Promise((resolve) => {
          const ch = shellSpawn(target, { cwd: WORKSPACE_DIR });
          let buf = '';
          ch.stdout.on('data', (d) => (buf += d));
          ch.stderr.on('data', (d) => (buf += d));
          const timer = setTimeout(() => { killTree(ch); buf += '\n[zaman aşımı]'; }, 120000);
          ch.on('close', (code) => { clearTimeout(timer); resolve(`exit ${code}\n${buf.slice(-3000)}`); });
          ch.on('error', (e) => { clearTimeout(timer); resolve(e.message); });
        });
        return out;
      }
      return null;
    }
    case 'ad':
    case 'spend': {
      const amount = Math.abs(Number(a.payload.amount) || 0);
      const ag = agentById(a.agentId);
      if (ag) { ag.budget = Math.max(0, (ag.budget || 0) - amount); updateAgent(ag); }
      ledger.entries.push({ id: uid('led'), t: Date.now(), type: 'spend', amount, note: a.title, agentId: a.agentId, approvalId: a.id });
      persist('ledger');
      emit('ledger:changed', {});
      return `Kasadan ${amount} düşüldü. Ödemeyi patron kendisi yapar.`;
    }
    default:
      return null; // publish/external/question: Boss elle uygular
  }
}

export function pendingCount() {
  return approvals.filter((a) => a.status === 'pending').length;
}
