// Ajan beyni: zamanlayıcı, görev döngüsü (JSON eylem protokolü), proaktif işler, denetim, sohbet.
import { chat, isDemo } from '../providers/router.js';
import { num, env } from '../config.js';

const L = (tr, en) => (env.LANG !== 'tr' ? en : tr);
import {
  agents, company, approvals, tasks, deliverables, openTasksFor, createTask, updateTask, updateAgent,
  agentLog, findAgent, logDecision, persist,
} from '../state.js';
import { ROLES } from './roster.js';
import { TOOLS } from './tools.js';
import { systemPrompt, taskPrompt, parseAction } from './prompts.js';
import { setShieldVerdict } from '../approvals.js';
import { hardBlockReason } from '../policy.js';
import { reward, economyTick, gainXp, bond } from '../economy.js';
import { writeFile } from './sandbox.js';
import { emit, toast } from '../bus.js';
import { uid } from '../store.js';

const MAX_STEPS = 8;
const busy = new Set();

const ACTIVITY_BY_TOOL = {
  web_search: 'research', read_url: 'research', write_file: null, read_file: 'reviewing', list_files: 'reviewing',
  run_command: 'coding', generate_image: 'design', send_message: 'talking', create_task: 'planning', decide: 'planning',
  escalate: 'talking', request_approval: 'talking', request_budget: 'talking', propose_spend: 'analyzing', market_quote: 'trading', paper_trade: 'trading',
  note: 'writing', finish: null,
};

export function startRuntime() {
  // yeniden başlatmada yarım kalan görevleri kuyruğa geri al
  for (const t of tasks) if (t.status === 'doing') updateTask(t, { status: 'todo' });
  for (const a of agents) {
    if (a.status !== 'dead' && a.role !== 'claude') updateAgent(a, { status: 'idle', bubble: null, currentTaskId: null });
    if (a.role === 'claude' && a.status !== 'dead') updateAgent(a, { status: 'oncall', bubble: null });
  }
  setInterval(loop, 1000);
  setInterval(economyTick, 60000);
  setInterval(dailyReportCheck, 60000);
}

function schedule(a, seconds) {
  a.nextRunAt = Date.now() + seconds * 1000;
}

function loop() {
  if (company.settings.paused || !company.setupDone) return; // kurulum sihirbazı bitene kadar ofis bekler
  const now = Date.now();
  for (const a of agents) {
    if (a.status === 'dead' || ROLES[a.role]?.manual || busy.has(a.id) || now < (a.nextRunAt || 0)) continue;
    busy.add(a.id);
    tick(a)
      .catch((e) => {
        agentLog(a, 'error', `Beklenmeyen hata: ${e.message}`);
        schedule(a, 60);
      })
      .finally(() => busy.delete(a.id));
  }
}

function setIdle(a) {
  if (a.status === 'dead') return;
  updateAgent(a, { status: 'idle', bubble: null, currentTaskId: null, activity: ROLES[a.role].activity });
}

async function tick(a) {
  const tickSec = num('TICK_SECONDS', 25);
  if (a.role === 'shield') {
    const pending = approvals.find((x) => x.status === 'pending' && x.shield?.state === 'pending');
    if (pending) {
      await shieldReview(a, pending);
      schedule(a, 4);
      return;
    }
  }
  let task = openTasksFor(a.id)[0] || proactiveTask(a);
  if (!task) {
    setIdle(a);
    schedule(a, tickSec * (0.6 + Math.random()));
    return;
  }
  await runTask(a, task);
  schedule(a, (isDemo() ? 4 : tickSec) * (0.5 + Math.random() * 0.5));
}

// ---------------- proaktif işler ----------------
function proactiveTask(a) {
  const baseMin = isDemo() ? 1.2 : company.settings.proactiveMinutes || 12;
  const goalActive = !!company.goal;
  // hedef varken üretim ekibi Max'in görevlerini bekler; Max, Nova ve Penny proaktif kalır
  if (goalActive && !['ceo', 'ideas', 'cfo'].includes(a.role)) return null;
  const mult = { ceo: 1, ideas: 1.5, research: 2, dev: 3, design: 2.5, marketing: 2.5, qa: 3, cfo: 2, shield: Infinity }[a.role] ?? 3;
  if (Date.now() - (a.lastProactiveAt || 0) < baseMin * mult * 60000 * (0.8 + Math.random() * 0.4)) return null;
  a.lastProactiveAt = Date.now();

  const lastIdea = [...deliverables].reverse().find((d) => d.kind === 'idea');
  const lastCode = [...deliverables].reverse().find((d) => d.kind === 'code');
  const lastAny = [...deliverables].reverse().find((d) => d.agentId !== a.id && (d.kind === 'idea' || d.kind === 'code'));
  let spec = null;
  switch (a.role) {
    case 'ceo': {
      const open = tasks.filter((t) => ['todo', 'doing'].includes(t.status) && t.assignee !== a.id);
      // hedef kuyruğu: aktif hedefin işleri bittiyse sıradaki hedefe geç
      if (goalActive && company.goalQueue?.length && open.length === 0) {
        const goalTasks = tasks.filter((t) => t.goalId === company.goal.id && t.assignee !== a.id);
        if (goalTasks.length >= 3 && goalTasks.every((t) => t.status === 'done' || t.status === 'failed')) {
          const next = company.goalQueue.shift();
          persist('company');
          logDecision(a.name, L(`Hedef tamamlandı, sıradakine geçildi: ${next}`, `Goal completed, moving to the next: ${next}`), company.goal.text);
          setGoal(next);
          return null;
        }
      }
      if (goalActive && open.length < 2) spec = { title: `PLAN: ${company.goal.text}`, detail: L('Önceki dalga bitti ya da tıkandı. Teslimleri değerlendir, sıradaki 3-5 görevi ata. Para getirmeyen işi kes.', "Previous wave finished or stalled. Review the deliverables, assign the next 3-5 tasks. Cut work that doesn't make money.") };
      else if (!goalActive && open.length < 3) spec = { title: L('STANDUP: takımı yönet', 'STANDUP: run the team'), detail: 'Patron hedef vermedi. Son fikirlerden en hızlı para getireceğini seç, ekibe 2-4 görev ata ve kararını decide ile kaydet.' };
      break;
    }
    case 'ideas':
      spec = { title: L('3 yeni hızlı para fikri', '3 new fast money ideas'), detail: 'Düşük maliyet, 7 gün içinde ilk satış. Her fikirde kitle, fiyat, kanal, ilk 7 gün planı, tahmini gelir. fikirler/ klasörüne yaz.' };
      break;
    case 'research':
      spec = lastIdea
        ? { title: `${L('Doğrula', 'Validate')}: ${lastIdea.title}`, detail: `${lastIdea.path || ''} dosyasındaki en iyi fikrin talebini, rakiplerini ve fiyatlarını web'de araştır.` }
        : { title: L('Türkiye’de yükselen dijital ürün trendleri', 'Rising digital product trends'), detail: L('Web’de ara, 5 somut fırsat çıkar.', 'Search the web and find 5 concrete opportunities.') };
      break;
    case 'dev':
      if (lastIdea) spec = { title: `MVP: ${lastIdea.title}`, detail: `${lastIdea.path} içindeki en iyi fikir için satılabilir en küçük ürünü yap.` };
      break;
    case 'design':
      if (lastAny) spec = { title: `${L('Görsel', 'Visual')}: ${lastAny.title}`, detail: 'Bu teslim için kapak veya sosyal medya görseli üret.' };
      break;
    case 'marketing':
      if (lastAny) spec = { title: `${L('Satış metni', 'Sales copy')}: ${lastAny.title}`, detail: 'Hook’lar, ürün açıklaması, 3 post. Yayın için onaya gönder.' };
      break;
    case 'qa':
      if (lastCode && !deliverables.some((d) => d.agentId === a.id && d.summary.includes(lastCode.path))) spec = { title: `QA: ${lastCode.path}`, detail: `${lastCode.path} dosyasını incele, hataları ve eksikleri listele.` };
      break;
    case 'cfo':
      spec = { title: L('Finans raporu + sanal portföy', 'Finance report + paper portfolio'), detail: 'Kasa, gelir ve runway durumu. Hangi işin para getirmesi en olası? Sanal portföyü (paper trading) gözden geçir.' };
      break;
  }
  if (!spec) return null;
  return createTask({ ...spec, assignee: a.id, createdBy: a.name, priority: 1, goalId: company.goal?.id || null });
}

// ---------------- görev çalıştırma ----------------
async function runTask(a, task) {
  updateTask(task, { status: 'doing', attempts: (task.attempts || 0) + 1 });
  if (a.role === 'ceo' && /^(PLAN|STANDUP)/i.test(task.title)) emit('meeting', { by: a.id, title: task.title.replace(/^(PLAN|STANDUP):\s*/i, '') });
  updateAgent(a, { status: 'working', currentTaskId: task.id, bubble: '⚙️', activity: ROLES[a.role].activity });
  agentLog(a, 'task', L(`▶ Görev: ${task.title}`, `▶ Task: ${task.title}`));

  const messages = [
    { role: 'system', content: systemPrompt(a) },
    { role: 'user', content: taskPrompt(a, task) },
  ];
  a.inbox = [];
  const ctx = { agent: a, task, files: new Set() };
  const allowed = new Set(ROLES[a.role].tools);
  let invalid = 0;

  const maxSteps = a.role === 'ceo' ? 12 : MAX_STEPS;
  const history = [];
  for (let step = 0; step < maxSteps; step++) {
    if (a.status === 'dead') return;
    updateAgent(a, { bubble: '💭', status: 'thinking' });
    let res;
    try {
      res = await chat({
        messages, chain: a.chain,
        meta: { agent: a, task, step, kind: /^PLAN/i.test(task.title) ? 'plan' : 'task', goal: company.goal?.text },
      });
    } catch (e) {
      if (e.code === 'ALL_COOLING') {
        agentLog(a, 'sleep', L('Tüm motorların kotası dolu, kanepede uyuyorum 💤', 'All my engines are out of quota, napping on the couch 💤'));
        updateTask(task, { status: 'todo' });
        updateAgent(a, { status: 'sleeping', bubble: '💤', currentTaskId: null });
        schedule(a, 120 + Math.random() * 120);
        return;
      }
      throw e;
    }
    a.stats.calls++;
    a.stats.tokens += res.tokens || 0;
    a.lastEngine = `${res.provider}/${res.model}`;
    a.hp = Math.max(0, a.hp - 0.15); // her çağrının sanal maliyeti

    const action = parseAction(res.text);
    if (!action) {
      invalid++;
      agentLog(a, 'warn', `Format dışı yanıt (${res.provider}): ${res.text.slice(0, 200)}`);
      if (invalid >= 2) {
        // zayıf model kurtarma: ham metni rapor olarak teslim et
        const rel = writeFile(`raporlar/${a.name.toLowerCase()}-${Date.now() % 100000}.md`, `# ${task.title}\n\n${res.text}`);
        ctx.files.add(rel);
        await finalize(a, task, ctx, await TOOLS.finish({ summary: res.text.slice(0, 600), deliverable: rel }, ctx));
        return;
      }
      messages.push({ role: 'assistant', content: res.text.slice(0, 2000) });
      messages.push({ role: 'user', content: 'HATA: Yanıtın geçerli JSON değil. SADECE {"thought":"...","action":"...","args":{...}} biçiminde tek nesne döndür.' });
      continue;
    }

    if (action.thought) agentLog(a, 'thought', action.thought, { engine: a.lastEngine });
    const tool = TOOLS[action.action];
    let resultText;
    let out = null;
    if (!tool || (!allowed.has(action.action) && action.action !== 'finish')) {
      resultText = `HATA: "${action.action}" aracın yok. Kullanabileceklerin: ${[...allowed].join(', ')}`;
    } else {
      const act = ACTIVITY_BY_TOOL[action.action] || ROLES[a.role].activity;
      updateAgent(a, {
        status: 'working', activity: act, bubble: bubbleFor(action.action),
        monitor: `${action.action} ${JSON.stringify(action.args).slice(0, 120)}`,
      });
      agentLog(a, 'tool', `${action.action} ${JSON.stringify(action.args).slice(0, 300)}`);
      try {
        out = await Promise.race([
          tool(action.args || {}, ctx),
          new Promise((_, rej) => setTimeout(() => rej(new Error('araç zaman aşımı')), 150000)),
        ]);
        resultText = typeof out === 'string' ? out : out?.result;
      } catch (e) {
        resultText = `HATA: ${e.message}`;
      }
      agentLog(a, 'result', String(resultText).slice(0, 1500));
      if (out?.done) {
        await finalize(a, task, ctx, out);
        return;
      }
    }
    history.push(`${step + 1}. ${action.action} ${JSON.stringify(action.args).slice(0, 90)} → ${String(resultText).slice(0, 60).replace(/\s+/g, ' ')}`);
    messages.push({ role: 'assistant', content: JSON.stringify(action).slice(0, 3000) });
    messages.push({ role: 'user', content: `SONUÇ (${action.action}):\n${String(resultText).slice(0, 3500)}\n\n${step >= maxSteps - 3 ? 'Adımların azalıyor: hemen finish ile teslim et.' : 'Sıradaki eylemin (JSON):'}` });
    // bağlamı kısa tut: sistem + görev + yapılanların özeti + son 8 mesaj
    if (messages.length > 14) {
      messages.splice(2, messages.length - 10, { role: 'user', content: `ŞU ANA KADAR YAPTIKLARIN (tekrarlama):\n${history.slice(0, -4).join('\n')}` });
    }
  }

  // adım bitti
  if (ctx.files.size) {
    await finalize(a, task, ctx, await TOOLS.finish({ summary: 'Adım sınırı doldu; üretilen dosyalar teslim edildi.' }, ctx));
  } else {
    a.stats.failed++;
    const retry = (task.attempts || 1) < 2;
    updateTask(task, { status: retry ? 'todo' : 'failed', result: L('Adım sınırında sonuç çıkmadı.', 'No result within the step limit.') });
    reward(a, -4, L(`görevi bitiremedi: ${task.title}`, `could not finish: ${task.title}`));
    setIdle(a);
  }
}

function bubbleFor(action) {
  return { web_search: '🔎', read_url: '📖', write_file: '📝', run_command: '⌨️', generate_image: '🎨', send_message: '💬', create_task: '📋', escalate: '❗', request_approval: '📨', propose_spend: '💸', market_quote: '📈', paper_trade: '📊', note: '🧠' }[action] || '⚙️';
}

async function finalize(a, task, ctx, out) {
  a.stats.done++;
  gainXp(a, 10, L('teslim', 'delivery'));
  updateTask(task, { status: 'done', result: out.summary?.slice(0, 2000) || '', deliverableIds: out.deliverableId ? [out.deliverableId] : [] });
  agentLog(a, 'done', `✅ ${task.title}: ${out.summary?.slice(0, 300) || ''}`);
  reward(a, 2, L('görev tamamlandı', 'task completed'));
  updateAgent(a, { bubble: '✅', status: 'idle', currentTaskId: null });
  // görevi veren ajana haber ver ve masasına yürü
  const creator = findAgent(task.createdBy);
  if (creator && creator.id !== a.id) {
    creator.inbox ||= [];
    creator.inbox.push({ from: a.name, t: Date.now(), text: `"${task.title}" bitti: ${(out.summary || '').slice(0, 400)}` });
    updateAgent(creator);
    emit('walk', { agentId: a.id, to: creator.id, reason: 'teslim', text: String(task.title || '').slice(0, 50) });
    bond(a, creator, 1.5);
  } else if (/^boss$/i.test(task.createdBy)) {
    emit('walk', { agentId: a.id, to: 'boss', reason: 'teslim' });
    toast(`✅ ${a.name}: ${task.title}`, 'done');
  }
  // CEO'nun ekibi bitirdiğinde küçük takım bonusu
  const ceo = agents.find((x) => x.role === 'ceo' && x.status !== 'dead');
  if (ceo && ceo.id !== a.id && task.createdBy === ceo.name) reward(ceo, 1, 'ekip teslim etti');
}

// ---------------- denetim (Shield) ----------------
async function shieldReview(a, apr) {
  updateAgent(a, { status: 'working', activity: 'reviewing', bubble: '🛡️', monitor: `${L('denetim', 'review')}: ${apr.title}` });
  const block = hardBlockReason(`${apr.title}\n${apr.detail}`);
  if (block) {
    setShieldVerdict(apr, 'block', block);
    return;
  }
  try {
    const res = await chat({
      chain: a.chain,
      meta: { agent: a, kind: 'shield' },
      maxTokens: 400,
      messages: [
        { role: 'system', content: `Sen ${a.name}, reklam ve içerik denetçisisin. İçeriği şu açılardan denetle: yanıltıcı/garanti kazanç iddiası, spam, telif/marka ihlali, platform reklam politikaları, kişisel veri, yasa dışılık, harcama mantıksızlığı. SADECE JSON döndür: {"verdict":"ok"|"risk"|"block","note":"kısa gerekçe + düzeltme önerisi"}` },
        { role: 'user', content: `Tür: ${apr.kind}\nBaşlık: ${apr.title}\nDetay:\n${apr.detail}\nBeklenen getiri: ${apr.expectedReturn || '-'}` },
      ],
    });
    let v = null;
    try {
      const m = res.text.match(/\{[\s\S]*\}/);
      v = m ? JSON.parse(m[0]) : null;
    } catch {}
    const verdict = ['ok', 'risk', 'block'].includes(v?.verdict) ? v.verdict : 'risk';
    setShieldVerdict(apr, verdict, v?.note || res.text.slice(0, 300));
    agentLog(a, 'review', `🛡️ ${apr.title} → ${verdict}: ${v?.note || ''}`);
    a.stats.calls++;
  } catch (e) {
    setShieldVerdict(apr, 'skip', e.code === 'ALL_COOLING' ? L('Denetçi motorları meşgul, patron dikkatli baksın.', 'Reviewer engines are busy; boss, check this carefully.') : `${L('Denetim hatası', 'Review error')}: ${e.message}`);
  }
  setIdle(a);
}

// ---------------- patron sohbeti ----------------
export async function chatWithAgent(a, text) {
  if (a.status === 'dead') return { reply: L('💀 (kovuldu)', '💀 (fired)') };
  agentLog(a, 'boss', `Boss: ${text}`);
  const res = await chat({
    chain: a.chain,
    meta: { agent: a, kind: 'chat' },
    maxTokens: 500,
    messages: [
      { role: 'system', content: `${systemPrompt(a).split('KESİN KURALLAR')[0]}\nPatron seninle konuşuyor. Kısa, samimi, karakterine uygun cevap ver. Patron bir iş istiyorsa onu görev olarak al. SADECE JSON: {"reply":"cevabın","task":null veya {"title":"...","detail":"..."}}` },
      { role: 'user', content: text },
    ],
  });
  let j = null;
  try {
    const m = res.text.match(/\{[\s\S]*\}/);
    j = m ? JSON.parse(m[0]) : null;
  } catch {}
  const reply = j?.reply || res.text.slice(0, 600);
  let task = null;
  if (j?.task?.title && !ROLES[a.role].manual) {
    task = createTask({ title: j.task.title, detail: j.task.detail || text, assignee: a.id, createdBy: 'Boss', priority: 3 });
    a.nextRunAt = Date.now() + 1500;
  }
  agentLog(a, 'say', reply);
  emit('say', { agentId: a.id, text: reply.slice(0, 160) });
  return { reply, task };
}

// ---------------- patron hedefi ----------------
// ---------------- günlük rapor ----------------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dailyReportCheck(force = false) {
  if (!company.setupDone || company.settings.paused) return null;
  const hour = new Date().getHours();
  const key = todayKey();
  if (!force && (hour < 18 || company.lastReportDay === key)) return null;
  const cfo = agents.find((x) => x.role === 'cfo' && x.status !== 'dead');
  if (!cfo) return null;
  company.lastReportDay = key;
  persist('company');
  const since = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const doneToday = tasks.filter((t) => t.status === 'done' && t.updatedAt >= since).length;
  const dlvToday = deliverables.filter((d) => d.createdAt >= since);
  const fired = agents.filter((x) => x.status === 'dead').map((x) => x.name);
  const facts = L(
    `Bugün: ${doneToday} görev bitti, ${dlvToday.length} teslim (${dlvToday.slice(-5).map((d) => d.title).join('; ')}). Kovulan: ${fired.join(', ') || 'yok'}.`,
    `Today: ${doneToday} tasks done, ${dlvToday.length} deliverables (${dlvToday.slice(-5).map((d) => d.title).join('; ')}). Fired: ${fired.join(', ') || 'none'}.`,
  );
  const t = createTask({
    title: L(`Günlük rapor ${key}`, `Daily report ${key}`),
    detail: L(
      `${facts}\nBugünün kısa özetini yaz: ne bitti, ne para getirebilir, kasa/runway durumu, en iyi ve en kötü performans, yarın için 3 net öneri. raporlar/gunluk-${key}.md dosyasına yaz, sonra finish.`,
      `${facts}\nWrite a short summary of today: what got done, what could make money, treasury/runway, best and worst performers, 3 concrete actions for tomorrow. Write it to reports/daily-${key}.md, then finish.`,
    ),
    assignee: cfo.id, createdBy: 'Boss', priority: 3,
  });
  cfo.nextRunAt = Date.now() + 1000;
  toast(L('📊 Penny günlük raporu hazırlıyor', '📊 Penny is preparing the daily report'), 'info');
  return t;
}

export function setGoal(text) {
  const clean = String(text || '').trim().slice(0, 600);
  if (!clean) {
    company.goal = null;
    persist('company');
    emit('company', company);
    return null;
  }
  company.goal = { id: uid('goal'), text: clean, setAt: Date.now() };
  persist('company');
  emit('company', company);
  const ceo = agents.find((x) => x.role === 'ceo' && x.status !== 'dead');
  if (ceo) {
    createTask({ title: `PLAN: ${clean}`, detail: 'Patronun yeni hedefi. Hedefi 4-7 net göreve böl, doğru ajanlara ata (create_task), önemli kararı decide ile kaydet, sonra finish.', assignee: ceo.id, createdBy: 'Boss', priority: 3, goalId: company.goal.id });
    ceo.nextRunAt = Date.now() + 500;
    emit('walk', { agentId: ceo.id, to: 'boss', reason: 'hedef' });
  }
  logDecision('Boss', `Yeni hedef: ${clean}`, '');
  toast(L(`🎯 Yeni hedef verildi: ${clean.slice(0, 60)}`, `🎯 New goal set: ${clean.slice(0, 60)}`), 'goal');
  return company.goal;
}

export function isBusy(id) {
  return busy.has(id);
}
