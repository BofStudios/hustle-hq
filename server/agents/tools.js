// Ajan araçları. Her araç (args, ctx) → string sonuç ya da { result, done, pending }.
import { writeFile, readFile, listFiles, runInWorkspace, safePath, relPath, zipDir, copyInto } from './sandbox.js';
import { commandNeedsApproval, urlAllowed, hardBlockReason, sandboxCommand, pcActionBlockReason } from '../policy.js';
import { WORKSPACE_DIR } from '../config.js';
import { createApproval } from '../approvals.js';
import { createTask, findAgent, agentLog, updateAgent, logDecision, addDeliverable, company } from '../state.js';
import { quote, paperTrade } from '../market.js';
import { emit } from '../bus.js';
import fs from 'node:fs';
import path from 'node:path';

export const TOOL_DOCS = {
  web_search: 'web_search {"query": "..."} → web sonuçları (başlık, url, özet)',
  read_url: 'read_url {"url": "https://..."} → sayfanın düz metni',
  write_file: 'write_file {"path": "proje/dosya.md", "content": "..."} → workspace içine dosya yazar',
  read_file: 'read_file {"path": "..."} → dosya içeriği',
  list_files: 'list_files {"path": "."} → klasör ağacı',
  run_command: 'run_command {"command": "node app.js", "cwd": "proje"} → izinli komutlar hemen çalışır, diğerleri patron onayına gider',
  generate_image: 'generate_image {"prompt": "english description", "path": "proje/gorsel.png", "width": 1024, "height": 1024}',
  send_message: 'send_message {"to": "ajan adı veya rol", "text": "..."} → iş arkadaşına mesaj',
  create_task: 'create_task {"title": "...", "detail": "net beklenti + teslim formatı", "assignee": "ideas|research|dev|design|marketing|shield|qa|cfo veya isim", "priority": 1-3}',
  decide: 'decide {"title": "karar", "why": "gerekçe"} → kararlar defterine yazar',
  escalate: 'escalate {"question": "patrona soru veya engel", "options": ["A","B"]} → patronun onay masasına düşer',
  request_approval: 'request_approval {"kind": "publish|external|open_url", "title": "...", "detail": "yayınlanacak tam içerik ve nerede", "url": "(open_url için)", "expected_return": "..."}',
  propose_spend: 'propose_spend {"amount": 100, "item": "ne alınacak", "why": "neden", "expected_return": "beklenen getiri"} → patron onaylarsa kendisi öder',
  package_product: 'package_product {"name": "ürün adı", "files": ["proje/dosya.pdf", "..."], "price": 149, "description": "kime, ne işe yarar, içinde ne var"} → satılabilir zip paketi + README + satış metni üretir, patrona "yükle" onayı gider',
  ad_campaign: 'ad_campaign {"platform": "instagram|tiktok|google|meta", "audience": "hedef kitle", "daily_budget": 50, "days": 5, "headline": "...", "text": "reklam metni", "cta": "Satın al", "landing_url": "https://...", "expected_return": "..."} → gerçek reklam planı; denetçi + patron onayı, patron kendisi yayınlar ve öder',
  pc_action: 'pc_action {"action": "open_url|open_app|open_folder|powershell", "target": "url / uygulama / komut", "why": "neden"} → bilgisayarda işlem; HER SEFERİNDE patron onayı gerekir',
  market_quote: 'market_quote {"symbol": "AAPL"} → güncel fiyat (paper trading için)',
  paper_trade: 'paper_trade {"symbol": "AAPL", "side": "buy|sell", "qty": 10, "reason": "..."} → SANAL portföyde işlem',
  note: 'note {"text": "kalıcı ders/not"} → hafızana yazar (kovulsan bile halefine kalır)',
  finish: 'finish {"summary": "ne yaptın, sonuç", "deliverable": "ana dosya yolu (opsiyonel)", "title": "teslim başlığı"} → görevi bitirir',
};

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';

async function webSearch(query) {
  const r = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({ q: query }),
    signal: AbortSignal.timeout(15000),
  });
  const html = await r.text();
  const results = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && results.length < 8) {
    let url = m[1];
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    results.push(`- ${strip(m[2])}\n  ${url}\n  ${strip(m[3]).slice(0, 220)}`);
  }
  return results.length ? results.join('\n') : 'Sonuç yok (arama motoru engellemiş olabilir; farklı kelimeler dene).';
}

export const TOOLS = {
  async web_search({ query }) {
    if (!query) return 'HATA: query gerekli';
    return webSearch(String(query).slice(0, 200));
  },

  async read_url({ url }) {
    if (!urlAllowed(url)) return 'HATA: URL izinli değil (sadece genel http/https)';
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    const ct = r.headers.get('content-type') || '';
    if (!/text|json|xml/.test(ct)) return `İçerik türü okunamaz: ${ct}`;
    const txt = strip(await r.text());
    return txt.slice(0, 7000) + (txt.length > 7000 ? '…' : '');
  },

  async write_file({ path: p, content }, ctx) {
    if (!p) return 'HATA: path gerekli';
    const block = hardBlockReason(content);
    if (block && /password|şifre|iban|kart/i.test(block)) return `HATA: ${block}`;
    const rel = writeFile(p, String(content ?? ''));
    ctx.files.add(rel);
    emit('fs:changed', { path: rel, agentId: ctx.agent.id });
    return `Yazıldı: ${rel} (${String(content ?? '').length} karakter)`;
  },

  async read_file({ path: p }) {
    return readFile(p);
  },

  async list_files({ path: p = '.' }) {
    const l = listFiles(p);
    return l.length ? l.join('\n') : '(boş)';
  },

  async run_command({ command, cwd = '.' }, ctx) {
    const why = commandNeedsApproval(command);
    if (why) {
      const isInstall = /\b(npm|pnpm|yarn)\s+(i|install|add)\b|\bpip\s+install\b/i.test(command);
      const a = createApproval({
        agentId: ctx.agent.id,
        kind: isInstall ? 'install' : 'command',
        title: `Komut: ${String(command).slice(0, 80)}`,
        detail: `Klasör: workspace/${cwd}\nKomut: ${command}\nNeden onay: ${why}\nGörev: ${ctx.task?.title || '-'}`,
        payload: { command, cwd },
      });
      return { result: `Onaya gönderildi (${a.id}, ${why}). Sonuç gelene kadar başka işle devam et ya da finish ile durumu raporla.`, pending: a.id };
    }
    const out = await runInWorkspace(sandboxCommand(command, WORKSPACE_DIR), cwd, 90000);
    return `exit ${out.code}\n${out.output.slice(-3500)}`;
  },

  async generate_image({ prompt, path: p, width = 1024, height = 1024 }, ctx) {
    if (!prompt) return 'HATA: prompt gerekli';
    const w = Math.min(1536, Math.max(256, Number(width) || 1024));
    const h = Math.min(1536, Math.max(256, Number(height) || 1024));
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt).slice(0, 600))}?width=${w}&height=${h}&nologo=true&seed=${Math.floor(Math.random() * 1e6)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!r.ok) return `HATA: görsel servisi ${r.status}`;
    const buf = Buffer.from(await r.arrayBuffer());
    const rel = String(p || `gorseller/${Date.now()}.png`).replace(/\.(jpe?g|webp)$/i, '.png');
    const abs = safePath(rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buf);
    ctx.files.add(relPath(abs));
    emit('fs:changed', { path: relPath(abs), agentId: ctx.agent.id });
    return `Görsel kaydedildi: ${relPath(abs)} (${Math.round(buf.length / 1024)} KB)`;
  },

  async send_message({ to, text }, ctx) {
    const target = findAgent(to);
    if (!target) return `HATA: "${to}" bulunamadı`;
    if (target.id === ctx.agent.id) return 'HATA: kendine mesaj atamazsın';
    target.inbox ||= [];
    target.inbox.push({ from: ctx.agent.name, t: Date.now(), text: String(text).slice(0, 1500) });
    if (target.inbox.length > 20) target.inbox.shift();
    updateAgent(target);
    agentLog(target, 'inbox', `${ctx.agent.name}: ${String(text).slice(0, 300)}`);
    emit('walk', { agentId: ctx.agent.id, to: target.id, reason: 'mesaj', text: String(text).slice(0, 60) });
    return `Mesaj ${target.name}'e iletildi.`;
  },

  async create_task({ title, detail = '', assignee, priority = 2 }, ctx) {
    const target = findAgent(assignee);
    if (!target) return `HATA: "${assignee}" yok. Roller: ideas, research, dev, design, marketing, shield, qa, cfo`;
    if (target.role === 'claude') return 'HATA: Claude otonom görev almaz, sadece patron çağırır. Developer’a ver ya da escalate et.';
    if (target.status === 'dead') return `HATA: ${target.name} kovuldu, yerine gelen bekleniyor.`;
    const t = createTask({
      title, detail, assignee: target.id, createdBy: ctx.agent.name,
      priority: Math.min(3, Math.max(1, Number(priority) || 2)),
      goalId: ctx.task?.goalId || company.goal?.id || null,
      parent: ctx.task?.id || null,
    });
    emit('walk', { agentId: 'router', to: target.id, from: ctx.agent.id, reason: 'görev' });
    return `Görev oluşturuldu: ${t.id} → ${target.name}`;
  },

  async decide({ title, why }, ctx) {
    logDecision(ctx.agent.name, title, why);
    return 'Karar kaydedildi.';
  },

  async escalate({ question, options = [] }, ctx) {
    const a = createApproval({
      agentId: ctx.agent.id,
      kind: 'question',
      title: `Soru: ${String(question).slice(0, 120)}`,
      detail: `${question}\n\nSeçenekler: ${(options || []).join(' / ') || '-'}`,
      payload: { options },
    });
    emit('walk', { agentId: ctx.agent.id, to: 'boss', reason: 'eskalasyon' });
    return { result: `Patrona soruldu (${a.id}). Cevap gelince inbox'una düşer.`, pending: a.id };
  },

  async request_approval({ kind = 'publish', title, detail = '', url, expected_return = '' }, ctx) {
    const k = ['publish', 'external', 'open_url'].includes(kind) ? kind : 'external';
    if (k === 'open_url' && !urlAllowed(url)) return 'HATA: geçersiz URL';
    const a = createApproval({ agentId: ctx.agent.id, kind: k, title: title || 'Onay', detail, payload: { url }, expectedReturn: expected_return });
    if (a.status === 'rejected') return `REDDEDİLDİ: ${a.result}`;
    return { result: `Onaya gönderildi (${a.id}). Önce denetçi, sonra patron bakacak.`, pending: a.id };
  },

  async propose_spend({ amount, item, why = '', expected_return = '' }, ctx) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 'HATA: amount pozitif sayı olmalı';
    if (n > (ctx.agent.budget || 0)) return `HATA: bütçen yetersiz (${ctx.agent.budget || 0} ${company.currency}). escalate/send_message ile Max'ten ya da patrondan bütçe iste.`;
    const a = createApproval({
      agentId: ctx.agent.id, kind: 'spend',
      title: `Harcama: ${item} (${n} ${company.currency})`,
      detail: `Ne: ${item}\nTutar: ${n} ${company.currency}\nNeden: ${why}\nBeklenen getiri: ${expected_return}`,
      payload: { amount: n, item }, expectedReturn: expected_return,
    });
    if (a.status === 'rejected') return `REDDEDİLDİ: ${a.result}`;
    return { result: `Harcama önerisi onaya gitti (${a.id}).`, pending: a.id };
  },

  async package_product({ name, files = [], price = 0, description = '' }, ctx) {
    if (!name) return 'HATA: name gerekli';
    const list = (Array.isArray(files) ? files : [files]).map(String).filter(Boolean).slice(0, 40);
    if (!list.length) return 'HATA: en az bir dosya gerekli (önce write_file ile ürünü üret)';
    const slug = String(name).toLowerCase().replace(/[^a-z0-9ğüşıöç]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'urun';
    const dir = `urunler/${slug}`;
    const copied = [];
    for (const f of list) {
      try { copied.push(copyInto(f, `${dir}/icerik`)); } catch (e) { return `HATA: ${e.message}`; }
    }
    writeFile(`${dir}/README.md`, `# ${name}\n\n${description}\n\n## İçerik\n${copied.map((c) => `- ${c.split('/').pop()}`).join('\n')}\n\nFiyat: ${price} ${company.currency}\n`);
    writeFile(`${dir}/SATIS-METNI.md`, `# ${name}\n\n${description}\n\n**Fiyat:** ${price} ${company.currency}\n\n## Ne alırsın?\n${copied.map((c) => `- ${c.split('/').pop()}`).join('\n')}\n\n> Bu metni Lemon Squeezy ürün açıklamasına yapıştır.\n`);
    let zip;
    try { zip = await zipDir(dir, `urunler/${slug}.zip`); } catch (e) { return `HATA: zip oluşturulamadı: ${e.message}`; }
    ctx.files.add(zip);
    ctx.files.add(`${dir}/SATIS-METNI.md`);
    emit('fs:changed', { path: zip, agentId: ctx.agent.id });
    const a = createApproval({
      agentId: ctx.agent.id, kind: 'publish',
      title: `Ürünü yayınla: ${name} (${price} ${company.currency})`,
      detail: `Paket: workspace/${zip}\nSatış metni: workspace/${dir}/SATIS-METNI.md\n\nAdımlar:\n1. app.lemonsqueezy.com → Products → New product\n2. Ad: ${name}, fiyat: ${price}\n3. Açıklamaya SATIS-METNI.md içeriğini yapıştır\n4. Dosya olarak zip'i yükle, yayınla\n5. Hustle HQ → Kasa → Lemon Squeezy bölümünde ürünü bu teslime bağla\n\n${description}`,
      payload: { zip, name, price }, expectedReturn: `${price} ${company.currency} / satış`,
    });
    return { result: `Paket hazır: ${zip}. Yayın onayı patrona gitti (${a.id}). Şimdi finish ile teslim et (deliverable: ${zip}).`, pending: a.id };
  },

  async ad_campaign(args, ctx) {
    const days = Math.max(1, Math.min(60, Number(args.days) || 3));
    const daily = Math.max(1, Number(args.daily_budget) || 0);
    const total = daily * days;
    if (total > (ctx.agent.budget || 0)) return `HATA: kampanya ${total} ${company.currency}, bütçen ${ctx.agent.budget || 0}. Önce bütçe iste.`;
    const plan = `# Reklam Kampanyası: ${args.headline || ''}\n\n- Platform: ${args.platform}\n- Hedef kitle: ${args.audience}\n- Günlük bütçe: ${daily} ${company.currency} × ${days} gün = ${total} ${company.currency}\n- Başlık: ${args.headline}\n- Metin: ${args.text}\n- CTA: ${args.cta}\n- Hedef URL: ${args.landing_url}\n- Beklenen getiri: ${args.expected_return || '-'}\n\n## Patron için kurulum\n1. ${args.platform} reklam yöneticisini aç\n2. Hedef kitleyi gir, bütçeyi ${daily}/gün ayarla\n3. Metni ve görseli yapıştır, yayınla\n`;
    const rel = writeFile(`reklam/${Date.now() % 1e6}-${String(args.platform || 'kampanya').replace(/[^a-z0-9]/gi, '')}.md`, plan);
    ctx.files.add(rel);
    const a = createApproval({
      agentId: ctx.agent.id, kind: 'ad',
      title: `Reklam: ${args.platform} · ${total} ${company.currency}`,
      detail: plan, payload: { amount: total, platform: args.platform, url: args.landing_url, file: rel }, expectedReturn: args.expected_return || '',
    });
    if (a.status === 'rejected') return `REDDEDİLDİ: ${a.result}`;
    return { result: `Kampanya planı ${rel} dosyasına yazıldı, onaya gitti (${a.id}).`, pending: a.id };
  },

  async pc_action({ action, target, why = '' }, ctx) {
    const block = pcActionBlockReason(action, target);
    if (block) return `REDDEDİLDİ: ${block}`;
    const a = createApproval({
      agentId: ctx.agent.id, kind: 'pc',
      title: `PC: ${action} ${String(target).slice(0, 70)}`,
      detail: `Eylem: ${action}\nHedef: ${target}\nNeden: ${why}\nGörev: ${ctx.task?.title || '-'}`,
      payload: { action, target },
    });
    if (a.status === 'rejected') return `REDDEDİLDİ: ${a.result}`;
    return { result: `PC işlemi patron onayına gitti (${a.id}).`, pending: a.id };
  },

  async market_quote({ symbol }) {
    const q = await quote(symbol);
    return `${q.sym}: ${q.price} (kaynak: ${q.source === 'sim' ? 'simülasyon' : q.source + ', gecikmeli'})`;
  },

  async paper_trade(args, ctx) {
    const tr = await paperTrade({ ...args, by: ctx.agent.name });
    return `SANAL işlem: ${tr.side} ${tr.qty} ${tr.sym} @ ${tr.price}`;
  },

  async note({ text }, ctx) {
    const line = `- ${new Date().toISOString().slice(0, 10)}: ${String(text).slice(0, 400)}`;
    ctx.agent.memory = ((ctx.agent.memory || '') + '\n' + line).split('\n').slice(-40).join('\n').trim();
    updateAgent(ctx.agent);
    return 'Hafızaya yazıldı.';
  },

  async finish({ summary = '', deliverable, title }, ctx) {
    const files = [...ctx.files];
    const main = deliverable && files.includes(String(deliverable).replace(/^workspace[/\\]/, '')) ? String(deliverable).replace(/^workspace[/\\]/, '') : files[0] || null;
    let d = null;
    if (main || summary.length > 40) {
      d = addDeliverable({
        taskId: ctx.task?.id || null,
        agentId: ctx.agent.id,
        agentName: ctx.agent.name,
        title: String(title || ctx.task?.title || 'Teslim').slice(0, 140),
        kind: kindOf(main, ctx.agent.role),
        path: main,
        files,
        summary: String(summary).slice(0, 2000),
      });
    }
    return { result: 'Görev bitti.', done: true, summary: String(summary), deliverableId: d?.id || null };
  },
};

function kindOf(p, role) {
  if (!p) return role === 'ideas' ? 'idea' : 'report';
  if (/\.zip$/i.test(p)) return 'product';
  if (/\.(png|jpe?g|svg|webp)$/i.test(p)) return 'image';
  if (/\.(js|ts|py|html|css|json)$/i.test(p)) return 'code';
  if (role === 'ideas') return 'idea';
  return 'report';
}
