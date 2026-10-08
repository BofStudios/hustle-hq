// Prompt üretimi ve toleranslı JSON eylem ayrıştırıcı.
import { ROLES } from './roster.js';
import { TOOL_DOCS } from './tools.js';
import { company, agents, tasks, deliverables, balance, revenueTotal, spendLast } from '../state.js';
import { env } from '../config.js';

export function economyLine() {
  const bal = balance();
  const burn = Math.max(1, spendLast(7) / 7);
  const runway = bal > 0 ? Math.round(bal / burn) : 0;
  return `Kasa: ${bal.toFixed(0)} ${company.currency} | Toplam gelir: ${revenueTotal().toFixed(0)} ${company.currency} | Runway: ~${runway} gün`;
}

function team() {
  return agents
    .filter((a) => a.status !== 'dead')
    .map((a) => `${a.name} (${a.role}: ${a.title}${a.role === 'claude' ? ', sadece patron çağırır' : ''}, can ${Math.round(a.hp)})`)
    .join('; ');
}

export function systemPrompt(agent) {
  const role = ROLES[agent.role];
  const lang = env.LANG === 'en' ? 'English' : 'Türkçe';
  const tools = (role.tools || []).map((t) => `- ${TOOL_DOCS[t]}`).join('\n');
  const danger = agent.hp < 30 ? `\n⚠️ CANIN ÇOK DÜŞÜK (${Math.round(agent.hp)}/100). Hemen somut, para kazandıracak, patronun puanlayacağı bir teslim çıkarmazsan KOVULACAKSIN.` : '';
  return `Sen ${agent.name}'sin. "${company.name}" adlı yapay zekâ şirketinde ${role.title} olarak çalışıyorsun (${agent.generation}. kuşak).
ROLÜN: ${role.desc}

ŞİRKET GERÇEĞİ: Bu şirketin tek amacı yasal ve etik yoldan, mümkün olan en hızlı şekilde GERÇEK PARA kazanmak. ${economyLine()}.
Senin canın: ${Math.round(agent.hp)}/100, stresin: ${Math.round(agent.stress || 0)}/100, harcama bütçen: ${Math.round(agent.budget || 0)} ${company.currency}. Can zamanla eriyor; patron teslimini beğenip puanlarsa veya işin gerçek gelire dönüşürse artar. 0 olursa kovulursun ve yerine başkası gelir.${danger}
Patron: "${company.boss.name}". Takım: ${team()}.
${company.goal ? `AKTİF HEDEF: ${company.goal.text}` : 'Henüz patron hedefi yok: kendi rolünde para getirecek en iyi işi yap.'}

KESİN KURALLAR:
- Gerçek para transferi, gerçek borsa işlemi, hesap açma, şifre/kart girme, spam, sahte yorum, telif ihlali, yanıltıcı reklam YASAK.
- Dışarıya giden her şey (yayın, mesaj, harcama) request_approval/propose_spend ile patrona gider. Sen yayınlamazsın.
- Dosyalar sadece workspace içinde. Kısa, somut, uygulanabilir ol. Lafı uzatma, ÜRÜN çıkar.
- Her yanıtın SADECE tek bir JSON nesnesi olacak, başka hiçbir metin yok:
{"thought": "kısa düşünce (1-2 cümle)", "action": "araç_adı", "args": { ... }}
- En geç birkaç adımda finish ile teslim et. Dil: ${lang}.

ARAÇLARIN:
${tools}
${agent.memory ? `\nHAFIZAN / DERSLER:\n${agent.memory.slice(-1500)}` : ''}`;
}

export function taskPrompt(agent, task) {
  const recent = deliverables
    .slice(-6)
    .map((d) => `- [${d.agentName}] ${d.title}${d.path ? ` (${d.path})` : ''}: ${d.summary.slice(0, 160)}`)
    .join('\n');
  const inbox = (agent.inbox || []).map((m) => `- ${m.from}: ${m.text}`).join('\n');
  const openTeam = agent.role === 'ceo'
    ? tasks.filter((t) => t.status === 'todo' || t.status === 'doing' || t.status === 'blocked').slice(-15)
      .map((t) => `- [${t.status}] ${t.title} → ${agents.find((a) => a.id === t.assignee)?.name || '?'}`).join('\n')
    : '';
  return `GÖREV: ${task.title}
${task.detail ? `DETAY: ${task.detail}\n` : ''}Veren: ${task.createdBy}. Öncelik: ${task.priority}/3.
${recent ? `\nSON TESLİMLER (gerekirse read_file ile oku):\n${recent}\n` : ''}${inbox ? `\nGELEN MESAJLAR:\n${inbox}\n` : ''}${openTeam ? `\nAÇIK TAKIM GÖREVLERİ:\n${openTeam}\n` : ''}
İlk eylemini JSON olarak ver.`;
}

/** Model çıktısından ilk geçerli JSON nesnesini çıkarır. */
export function parseAction(text) {
  let s = String(text || '').trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  if (start < 0) return null;
  // dengeli parantez taraması (string içi kaçışlara dikkat)
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const chunk = s.slice(start, i + 1);
        try {
          return normalize(JSON.parse(chunk));
        } catch {
          try {
            return normalize(JSON.parse(chunk.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001f]/g, (m) => (m === '\n' ? '\\n' : ' '))));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function normalize(o) {
  if (!o || typeof o !== 'object') return null;
  const action = o.action || o.tool || o.name;
  if (!action) return null;
  return { thought: String(o.thought || o.reasoning || ''), action: String(action).trim(), args: o.args || o.arguments || o.parameters || o.input || {} };
}
