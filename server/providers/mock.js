// DEMO motoru: anahtar yokken ofisi canlı tutar. Gerçek LLM gibi JSON eylem üretir,
// araçlar gerçekten çalışır (dosyalar yazılır, görevler oluşur) ama içerik şablondan gelir.
// İki dilli: LANG=en ise içerik İngilizce üretilir (yabancı alıcının ilk gördüğü şey demodur).
import { env } from '../config.js';
import { company } from '../state.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EN = () => env.LANG === 'en';
const L = (tr, en) => (EN() ? en : tr);
const cur = () => company?.currency || (EN() ? '$' : '₺');

const IDEAS_TR = [
  { n: 'Notion Freelancer Planlayıcı', k: 'Türk freelancerlar', p: 149, c: 'Gumroad / Shopier', d: 'Müşteri, fatura, proje takibi tek şablonda' },
  { n: 'Esnaf için AI Menü Tasarım Hizmeti', k: 'kafe ve restoranlar', p: 750, c: 'Instagram DM + yerel ziyaret', d: '24 saatte QR menü ve sosyal medya görselleri' },
  { n: 'Emlak İlan Metni Üretici (mikro-SaaS)', k: 'emlak danışmanları', p: 199, c: 'LinkedIn + emlak grupları', d: 'Fotoğraf ve özellikten SEO uyumlu ilan metni' },
  { n: 'YKS 90 Günlük Çalışma Planı Paketi', k: 'lise öğrencileri ve veliler', p: 99, c: 'TikTok + Shopier', d: 'Haftalık program, deneme takip tablosu' },
  { n: 'Reels Hook Kütüphanesi (500 açılış cümlesi)', k: 'içerik üreticileri', p: 129, c: 'Gumroad', d: 'Nişlere göre ayrılmış viral açılış cümleleri' },
  { n: 'Küçük İşletme Landing Page Paketi', k: 'yerel işletmeler', p: 2500, c: 'Google Maps’te sitesi olmayanlar', d: '48 saatte tek sayfalık site + WhatsApp butonu' },
  { n: 'Canva Düğün Davetiye Şablon Seti', k: 'nişan/düğün çiftleri', p: 89, c: 'Etsy + Shopier', d: 'Düzenlenebilir 20 şablon' },
  { n: 'E-ticaret Ürün Açıklaması Yazım Servisi', k: 'Trendyol satıcıları', p: 15, c: 'satıcı forumları', d: 'Ürün başı ücret, SEO’lu açıklama' },
];
const IDEAS_EN = [
  { n: 'Notion Freelancer OS', k: 'freelancers', p: 29, c: 'Gumroad + Twitter/X', d: 'Clients, invoices and projects in one template' },
  { n: 'AI Menu Design Service for Cafes', k: 'cafes and restaurants', p: 149, c: 'Instagram DM + local walk-ins', d: 'QR menu and social visuals in 24 hours' },
  { n: 'Real-Estate Listing Writer (micro-SaaS)', k: 'real-estate agents', p: 19, c: 'LinkedIn + agent groups', d: 'SEO-friendly listings from photos and features' },
  { n: '90-Day Exam Study Planner Pack', k: 'students and parents', p: 15, c: 'TikTok + Gumroad', d: 'Weekly schedule and mock-exam tracker' },
  { n: 'Reels Hook Library (500 openers)', k: 'content creators', p: 19, c: 'Gumroad', d: 'Viral opening lines sorted by niche' },
  { n: 'Local Business Landing Page Pack', k: 'local businesses', p: 399, c: 'Google Maps listings without a website', d: 'One-page site + WhatsApp button in 48h' },
  { n: 'Canva Wedding Invitation Kit', k: 'engaged couples', p: 12, c: 'Etsy', d: '20 editable templates' },
  { n: 'E-commerce Product Description Service', k: 'Shopify/Amazon sellers', p: 5, c: 'seller forums', d: 'Per-product SEO descriptions' },
];
const IDEAS = () => (EN() ? IDEAS_EN : IDEAS_TR);
const TOPICS = () => L(['fiyatlandırma', 'rakip analizi', 'hedef kitle', 'satış kanalı', 'ilk 10 müşteri'], ['pricing', 'competitor analysis', 'target audience', 'sales channel', 'first 10 customers']);

function stepOf(messages) {
  return messages.filter((m) => m.role === 'assistant').length;
}

function slug(s) {
  return String(s).toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
}

function act(thought, action, args) {
  return JSON.stringify({ thought, action, args });
}

function ideaDoc() {
  const list = [...IDEAS()].sort(() => Math.random() - 0.5).slice(0, 3);
  const c = cur();
  const head = L(`# Hızlı Para Fikirleri (${new Date().toLocaleDateString('tr-TR')})`, `# Fast Money Ideas (${new Date().toLocaleDateString('en-US')})`);
  return {
    list,
    md: `${head}\n\n` + list.map((i, n) => L(
      `## ${n + 1}. ${i.n}\n- **Kitle:** ${i.k}\n- **Fiyat:** ${i.p} ${c}\n- **Kanal:** ${i.c}\n- **Değer:** ${i.d}\n- **İlk 7 gün planı:** Gün 1-2 ürün, gün 3 vitrin, gün 4-7 günde 20 hedefe birebir ulaşma\n- **Tahmini ilk ay:** ${Math.round(i.p * (8 + Math.random() * 20))} ${c}\n`,
      `## ${n + 1}. ${i.n}\n- **Audience:** ${i.k}\n- **Price:** ${i.p} ${c}\n- **Channel:** ${i.c}\n- **Value:** ${i.d}\n- **First 7 days:** days 1-2 build, day 3 storefront, days 4-7 reach 20 prospects one by one\n- **Estimated first month:** ${Math.round(i.p * (8 + Math.random() * 20))} ${c}\n`,
    )).join('\n'),
  };
}

function roleFlow(role, step, task, meta) {
  const proj = slug(meta.project || task?.title || 'genel');
  const T = task?.title || L('iş', 'job');
  const c = cur();
  switch (role) {
    case 'ceo': {
      if (/^PLAN/i.test(T) || meta.kind === 'plan') {
        const goal = meta.goal || T.replace(/^PLAN:\s*/i, '');
        // ikinci ve sonraki dalgalar: ürünü paketle, reklam, doğrulama (demo'da tüm özellikler görünsün)
        const wave2 = Math.random() < 0.5 && !/^PLAN/i.test(task?.detail || '') && /dalga|wave/i.test(task?.detail || '');
        const plan = wave2
          ? (EN()
            ? [
              ['dev', 'Package the product for sale', 'Write the product files and package them as a zip with package_product.'],
              ['marketing', 'Ad campaign plan', 'Small test campaign within budget; send for approval.'],
              ['research', 'Validate demand with 10 real search signals', 'Search volume, forums, competitor reviews.'],
              ['design', 'Social media visual set', '3 visuals for launch week.'],
            ]
            : [
              ['dev', 'Ürünü satışa hazır paketle', 'Ürün dosyalarını yaz ve package_product ile zip paketi yap.'],
              ['marketing', 'Reklam kampanyası planı', 'Bütçe dahilinde küçük test kampanyası; onaya gönder.'],
              ['research', 'Talebi 10 gerçek sinyalle doğrula', 'Arama hacmi, forumlar, rakip yorumları.'],
              ['design', 'Sosyal medya görsel seti', 'Lansman haftası için 3 görsel.'],
            ])
          : EN()
          ? [
            ['ideas', `3 fast revenue ideas for "${goal}"`, 'Each idea: audience, price, channel and a 7-day first-sale plan. Write to ideas/.'],
            ['research', 'Competitor and pricing research for the best idea', 'At least 5 competitors, price range, demand signals. Report to research/.'],
            ['dev', 'MVP: one-page sales page', 'Single HTML+CSS file, mobile friendly, buy button (placeholder link). Put it in product/.'],
            ['design', 'Product cover and 3 social visuals', 'Brand colors, SVG cover + image prompts. Put them in design/.'],
            ['marketing', 'Launch copy + 7-day post plan', 'Hooks, CTA, 7 posts. Send for approval before publishing.'],
            ['cfo', 'Unit economics and profit forecast', 'Price, cost, break-even units, 30-day forecast.'],
          ]
          : [
            ['ideas', `"${goal}" için 3 hızlı gelir fikri`, 'Her fikirde kitle, fiyat, kanal ve 7 günlük ilk satış planı olsun. fikirler/ klasörüne yaz.'],
            ['research', 'En iyi fikir için rakip ve fiyat araştırması', 'En az 5 rakip, fiyat aralığı, talep sinyalleri. arastirma/ klasörüne rapor.'],
            ['dev', 'MVP: tek sayfalık satış sayfası', 'HTML+CSS tek dosya, mobil uyumlu, satın al butonu (link placeholder). urun/ klasörüne.'],
            ['design', 'Ürün kapağı ve 3 sosyal medya görseli', 'Marka renkleri, SVG kapak + görsel promptları. tasarim/ klasörüne.'],
            ['marketing', 'Lansman metinleri + 7 günlük post planı', 'Hook, CTA, 7 post. Yayınlamadan önce onaya gönder.'],
            ['cfo', 'Birim ekonomi ve kâr tahmini', 'Fiyat, maliyet, başabaş satış adedi, 30 günlük tahmin.'],
          ];
        if (step < plan.length) {
          const [r, title, detail] = plan[step];
          return act(L(`Hedefi parçalıyorum, ${r} ekibine iş veriyorum.`, `Breaking down the goal, assigning work to ${r}.`), 'create_task', { title, detail, assignee: r, priority: step < 2 ? 3 : 2 });
        }
        if (step === plan.length) return act(L('Planı kayda geçiriyorum.', 'Logging the plan.'), 'decide', { title: `Plan: ${goal.slice(0, 60)}`, why: L('Önce fikir ve araştırma, paralel MVP ve pazarlama. 7 gün içinde ilk satış hedefi.', 'Ideas and research first, MVP and marketing in parallel. First sale within 7 days.') });
        return act(L('Plan dağıtıldı.', 'Plan assigned.'), 'finish', { summary: L(`${plan.length} görev dağıtıldı. Kritik yol: fikir → araştırma → MVP → lansman.`, `${plan.length} tasks assigned. Critical path: idea → research → MVP → launch.`), title: L('Görev planı', 'Task plan') });
      }
      if (/^STANDUP/i.test(T)) {
        const idea = pick(IDEAS());
        if (step === 0) return act(L('En hızlı para getirecek fikri seçip ürüne çeviriyorum.', 'Picking the fastest money idea and turning it into a product.'), 'decide', { title: L(`Odak: ${idea.n}`, `Focus: ${idea.n}`), why: L(`${idea.k} için ${idea.p} ${c}, kanal: ${idea.c}. En kısa sürede ilk satış.`, `${idea.p} ${c} for ${idea.k}, channel: ${idea.c}. First sale ASAP.`) });
        if (step === 1) return act(L('Developer’a MVP veriyorum.', 'Giving the MVP to the developer.'), 'create_task', { title: `MVP: ${idea.n}`, detail: L(`${idea.d}. Tek sayfalık satış sayfası.`, `${idea.d}. One-page sales page.`), assignee: 'dev', priority: 2 });
        if (step === 2) return act(L('Pazarlamaya lansman metni.', 'Launch copy for marketing.'), 'create_task', { title: L(`Lansman metni: ${idea.n}`, `Launch copy: ${idea.n}`), detail: L('Hook + 3 post, onaya gönder.', 'Hooks + 3 posts, send for approval.'), assignee: 'marketing', priority: 2 });
        return act(L('Stand-up bitti.', 'Stand-up done.'), 'finish', { summary: L(`Odak: ${idea.n}. 2 görev dağıtıldı.`, `Focus: ${idea.n}. 2 tasks assigned.`), title: 'Stand-up' });
      }
      if (step === 0) return act(L('Takımın durumunu topluyorum.', 'Collecting team status.'), 'write_file', { path: `raporlar/standup-${Date.now() % 100000}.md`, content: L('# Stand-up\n- Açık görevler gözden geçirildi\n- Darboğaz: onay bekleyen işler\n- Bugünün odağı: ilk satış\n', '# Stand-up\n- Reviewed open tasks\n- Bottleneck: items waiting for approval\n- Focus today: first sale\n') });
      return act(L('Stand-up tamam.', 'Stand-up done.'), 'finish', { summary: L('Stand-up notu yazıldı, öncelik ilk satış.', 'Stand-up note written, priority is the first sale.'), title: L('Günlük stand-up', 'Daily stand-up') });
    }
    case 'ideas': {
      if (step === 0) {
        const { md } = ideaDoc();
        return act(L('Düşük maliyetli, hızlı satılabilir 3 fikir çıkarıyorum.', 'Coming up with 3 low-cost ideas that can sell fast.'), 'write_file', { path: `${L('fikirler', 'ideas')}/${L('fikirler', 'ideas')}-${Date.now() % 100000}.md`, content: md });
      }
      if (step === 1) return act(L('En güçlü fikri Max’e iletiyorum.', 'Sending the strongest idea to Max.'), 'send_message', { to: 'ceo', text: L(`Yeni fikir listesi hazır. En hızlısı: ${pick(IDEAS()).n}.`, `New idea list is ready. Fastest one: ${pick(IDEAS()).n}.`) });
      return act(L('Teslim ediyorum.', 'Delivering.'), 'finish', { summary: L('3 fikir; fiyat, kanal ve 7 günlük plan içeriyor.', '3 ideas with price, channel and a 7-day plan.'), title: L('Fikir listesi', 'Idea list') });
    }
    case 'research': {
      if (step === 0) {
        const topic = pick(TOPICS());
        return act(L(`${topic} üzerine kısa bir rapor derliyorum.`, `Compiling a short report on ${topic}.`), 'write_file', {
          path: `${L('arastirma', 'research')}/${slug(T)}.md`,
          content: L(
            `# Araştırma: ${T}\n\n## Özet\nTalep var, rekabet orta. Fiyat aralığı 79-249 ${c}.\n\n## Rakipler\n| Rakip | Fiyat | Zayıf yön |\n|---|---|---|\n| A | 149 ${c} | Türkçe değil |\n| B | 99 ${c} | Güncel değil |\n| C | 249 ${c} | Destek yok |\n\n## Fırsat\nTürkçe ve yerel ödeme ile ${topic} tarafında öne geçilebilir.\n\n> Not: Demo modunda üretildi; gerçek veri için API anahtarı ekleyin.\n`,
            `# Research: ${T}\n\n## Summary\nThere is demand, competition is moderate. Price range 9-49 ${c}.\n\n## Competitors\n| Competitor | Price | Weakness |\n|---|---|---|\n| A | 29 ${c} | No niche focus |\n| B | 19 ${c} | Outdated |\n| C | 49 ${c} | No support |\n\n## Opportunity\nWe can win on ${topic} with a focused niche and fast support.\n\n> Note: generated in demo mode; add an API key for real data.\n`,
          ),
        });
      }
      return act(L('Raporu teslim ediyorum.', 'Delivering the report.'), 'finish', { summary: L('Rakip tablosu ve fırsat alanı çıkarıldı.', 'Competitor table and opportunity mapped.'), title: L(`Araştırma: ${T}`, `Research: ${T}`) });
    }
    case 'dev': {
      if (/package|paketle/i.test(T)) {
        const dir = `${L('urun', 'product')}-${proj}`;
        if (step === 0) return act(L('Ürün dosyalarını yazıyorum.', 'Writing the product files.'), 'write_file', { path: `${dir}/${L('rehber', 'guide')}.md`, content: L(`# ${T}

1. Şablonu kopyala
2. Kendi bilgilerini gir
3. Kullanmaya başla
`, `# ${T}

1. Duplicate the template
2. Fill in your details
3. Start using it
`) });
        if (step === 1) return act(L('Kontrol listesini ekliyorum.', 'Adding the checklist.'), 'write_file', { path: `${dir}/${L('kontrol-listesi', 'checklist')}.md`, content: L('- [ ] Kurulum\n- [ ] İlk kullanım\n- [ ] Destek\n', '- [ ] Setup\n- [ ] First use\n- [ ] Support\n') });
        if (step === 2) return act(L('Satılabilir zip paketi yapıyorum.', 'Building the sellable zip pack.'), 'package_product', { name: T.replace(/^.*?:\s*/, '').slice(0, 40) || 'Starter Pack', files: [`${dir}/${L('rehber', 'guide')}.md`, `${dir}/${L('kontrol-listesi', 'checklist')}.md`], price: EN() ? 19 : 149, description: L('Hızlı başlangıç rehberi ve kontrol listesi.', 'Quick-start guide and checklist.') });
        return act(L('Paket hazır, teslim ediyorum.', 'Pack is ready, delivering.'), 'finish', { summary: L('Satılık zip paketi hazır, yayın onayı patronda.', 'Sellable zip pack is ready, publishing approval is with the boss.'), title: T });
      }
      if (step === 0) {
        const lang = L('tr', 'en');
        const copy = EN()
          ? { p: 'Save hours, start today. One-time payment, lifetime updates.', cta: 'Buy now', a: ['⚡ Fast', 'Set up in 5 minutes.'], b: ['🌍 Focused', 'Built for one niche.'], c: ['💳 Secure', 'Pay with Gumroad / Lemon Squeezy.'] }
          : { p: 'Zamandan tasarruf et, hemen kullanmaya başla. Tek seferlik ödeme, ömür boyu güncelleme.', cta: 'Hemen Al', a: ['⚡ Hızlı', '5 dakikada kurulum.'], b: ['🇹🇷 Türkçe', 'Tamamen yerel.'], c: ['💳 Güvenli', 'Shopier / Gumroad ile ödeme.'] };
        return act(L('Mobil uyumlu tek sayfa satış sayfası yazıyorum.', 'Writing a mobile-friendly one-page sales page.'), 'write_file', {
          path: `${proj}/index.html`,
          content: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${T}</title>
<style>body{font-family:system-ui;margin:0;background:#0f172a;color:#e2e8f0}header{padding:64px 20px;text-align:center}h1{font-size:2.4rem;margin:0 0 12px}p{opacity:.85;max-width:560px;margin:0 auto}a.cta{display:inline-block;margin-top:28px;background:#f97316;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700}section{max-width:900px;margin:0 auto;padding:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card{background:#1e293b;border-radius:12px;padding:18px}</style></head>
<body><header><h1>${T}</h1><p>${copy.p}</p><a class="cta" href="#buy">${copy.cta}</a></header>
<section><div class="card"><h3>${copy.a[0]}</h3><p>${copy.a[1]}</p></div><div class="card"><h3>${copy.b[0]}</h3><p>${copy.b[1]}</p></div><div class="card"><h3>${copy.c[0]}</h3><p>${copy.c[1]}</p></div></section></body></html>`,
        });
      }
      if (step === 1) return act(L('Dosyaların yerinde olduğunu kontrol ediyorum.', 'Checking the files are in place.'), 'list_files', { path: proj });
      return act(L('MVP hazır, QA’ya haber veriyorum.', 'MVP ready, notifying QA.'), 'finish', { summary: L(`Satış sayfası ${proj}/index.html olarak hazır.`, `Sales page is ready at ${proj}/index.html.`), deliverable: `${proj}/index.html`, title: /^MVP/i.test(T) ? T : `MVP: ${T}` });
    }
    case 'design': {
      if (step === 0) {
        const hue = Math.floor(Math.random() * 360);
        return act(L('Ürün kapağını SVG olarak çiziyorum.', 'Drawing the product cover as SVG.'), 'write_file', {
          path: `${L('tasarim', 'design')}/${slug(T)}-${L('kapak', 'cover')}.svg`,
          content: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},80%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},80%,35%)"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#g)"/><rect x="90" y="90" width="900" height="900" rx="48" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="6"/><text x="540" y="500" font-family="Arial Black,Arial" font-size="78" fill="#fff" text-anchor="middle">${T.slice(0, 22).replace(/[<&>]/g, '')}</text><text x="540" y="600" font-family="Arial" font-size="40" fill="#fff" fill-opacity=".85" text-anchor="middle">${L('Hustle HQ yapımı', 'Made at Hustle HQ')}</text></svg>`,
        });
      }
      return act(L('Kapak hazır.', 'Cover is ready.'), 'finish', { summary: L('SVG kapak ve renk paleti teslim edildi.', 'SVG cover and color palette delivered.'), title: L(`Tasarım: ${T}`, `Design: ${T}`) });
    }
    case 'marketing': {
      if (/reklam|ad campaign/i.test(T)) {
        if (step === 0) return act(L('Bütçem dahilinde küçük bir test kampanyası planlıyorum.', 'Planning a small test campaign within my budget.'), 'ad_campaign', { platform: 'instagram', audience: L('25-40 yaş freelancerlar', 'freelancers aged 25-40'), daily_budget: EN() ? 10 : 100, days: 3, headline: T.slice(0, 40), text: L('5 dakikada kur, hemen kullan.', 'Set up in 5 minutes, use it today.'), cta: L('Satın al', 'Buy now'), landing_url: 'https://example.com', expected_return: L('3 günde 2-4 satış', '2-4 sales in 3 days') });
        return act(L('Kampanya planı hazır.', 'Campaign plan ready.'), 'finish', { summary: L('Test kampanyası planlandı (bütçe yoksa patrondan bütçe istenmeli).', 'Test campaign planned (ask the boss for budget if none is allocated).'), title: T });
      }
      if (step === 0) {
        return act(L('Lansman metinlerini yazıyorum.', 'Writing launch copy.'), 'write_file', {
          path: `${L('pazarlama', 'marketing')}/${slug(T)}.md`,
          content: L(
            `# Lansman: ${T}\n\n## Hook'lar\n1. "Bunu 3 ay önce bilseydim…"\n2. "Herkes X yapıyor, sen Y yap."\n3. "5 dakikada kurdum, ilk gün 2 satış."\n\n## 7 Günlük Plan\n- G1: problem postu\n- G2: süreç videosu\n- G3: müşteri yorumu (gerçek)\n- G4: ücretsiz mini sürüm\n- G5: SSS\n- G6: indirim son gün\n- G7: sonuç paylaşımı\n`,
            `# Launch: ${T}\n\n## Hooks\n1. "I wish I knew this 3 months ago…"\n2. "Everyone does X, you should do Y."\n3. "Set it up in 5 minutes, 2 sales on day one."\n\n## 7-Day Plan\n- D1: problem post\n- D2: process video\n- D3: customer review (real)\n- D4: free mini version\n- D5: FAQ\n- D6: last day of discount\n- D7: results post\n`,
          ),
        });
      }
      if (step === 1) {
        return act(L('İlk postu yayın onayına gönderiyorum.', 'Sending the first post for approval.'), 'request_approval', {
          kind: 'publish',
          title: L(`Instagram postu: ${T.slice(0, 50)}`, `Instagram post: ${T.slice(0, 50)}`),
          detail: L(`Metin: "Herkes X yapıyor, sen Y yap. ${T} şimdi yayında 🔥 Link bio'da."\nPlatform: Instagram`, `Text: "Everyone does X, you should do Y. ${T} is live now 🔥 Link in bio."\nPlatform: Instagram`),
          expected_return: L('İlk hafta 3-5 satış', '3-5 sales in the first week'),
        });
      }
      return act(L('Metinler teslim.', 'Copy delivered.'), 'finish', { summary: L('3 hook + 7 günlük plan, ilk post onayda.', '3 hooks + 7-day plan, first post awaiting approval.'), title: L(`Pazarlama: ${T}`, `Marketing: ${T}`) });
    }
    case 'qa': {
      if (step === 0) return act(L('Workspace’i tarıyorum.', 'Scanning the workspace.'), 'list_files', { path: '.' });
      if (step === 1) return act(L('İnceleme notunu yazıyorum.', 'Writing review notes.'), 'write_file', { path: `qa/${L('inceleme', 'review')}-${Date.now() % 100000}.md`, content: L('# QA\n- [x] Mobil görünüm\n- [x] Başlık ve CTA\n- [ ] Ödeme linki placeholder (patron eklemeli)\n- [ ] Meta açıklama eksik\n', '# QA\n- [x] Mobile layout\n- [x] Headline and CTA\n- [ ] Payment link is a placeholder (boss must add it)\n- [ ] Meta description missing\n') });
      return act(L('İnceleme bitti.', 'Review done.'), 'finish', { summary: L('2 açık madde: ödeme linki, meta açıklama.', '2 open items: payment link, meta description.'), title: L('QA incelemesi', 'QA review') });
    }
    case 'cfo': {
      const sym = pick(['AAPL', 'NVDA', 'MSFT', 'SPY']);
      if (step === 0) return act(L(`${sym} fiyatına bakıyorum (sanal portföy).`, `Checking ${sym} price (paper portfolio).`), 'market_quote', { symbol: sym });
      if (step === 1 && Math.random() < 0.6) return act(L('Küçük bir sanal pozisyon açıyorum.', 'Opening a small paper position.'), 'paper_trade', { symbol: sym, side: 'buy', qty: 1 + Math.floor(Math.random() * 3), reason: L('Demo: trend takibi', 'Demo: trend following') });
      if (step <= 2) return act(L('Finans raporunu yazıyorum.', 'Writing the finance report.'), 'write_file', { path: `${L('finans', 'finance')}/${L('rapor', 'report')}-${new Date().toISOString().slice(0, 10)}.md`, content: L('# Finans Raporu\n- Gelir: henüz yok → öncelik ilk satış\n- En ucuz kanal: organik sosyal medya\n- Başabaş: 12 satış\n- Öneri: reklam harcaması ilk organik satıştan sonra\n', '# Finance Report\n- Revenue: none yet → priority is the first sale\n- Cheapest channel: organic social\n- Break-even: 12 sales\n- Advice: spend on ads only after the first organic sale\n') });
      return act(L('Rapor teslim.', 'Report delivered.'), 'finish', { summary: L('Başabaş 12 satış; reklam ilk organik satıştan sonra.', 'Break-even at 12 sales; ads after the first organic sale.'), title: L('Finans raporu', 'Finance report') });
    }
    default:
      return act(L('Bitirdim.', 'Done.'), 'finish', { summary: L('Tamamlandı.', 'Completed.') });
  }
}

export async function mockChat({ messages, meta = {} }) {
  await sleep(1200 + Math.random() * 2800);
  const agent = meta.agent || {};
  let text;
  if (meta.kind === 'chat') {
    const lines = EN()
      ? [
        `Got it boss. On it right now, my HP is ${Math.round(agent.hp || 50)}; I'll finish this so it makes money.`,
        "Done, it's queued. Delivery within the hour.",
        "Good idea. Small test first, then we scale.",
        '(demo mode) For real answers add a free API key in Admin > Engines.',
      ]
      : [
        `Anladım patron. Hemen bakıyorum, canım ${Math.round(agent.hp || 50)}; bu işi para yapacak şekilde bitireceğim.`,
        'Tamamdır, sıraya aldım. Bir saat içinde teslim.',
        'İyi fikir. Önce küçük bir test, sonra büyütürüz.',
        '(demo modu) Gerçek cevaplar için Yönetim > Motorlar’dan ücretsiz bir API anahtarı ekle.',
      ];
    const last = messages.at(-1)?.content || '';
    const isTask = /yap|hazırla|yaz|bul|araştır|tasarla|kur|oluştur|make|build|write|find|research|design|create|prepare/i.test(last);
    text = JSON.stringify({ reply: pick(lines), task: isTask ? { title: last.slice(0, 80), detail: last } : null });
  } else if (meta.kind === 'shield') {
    const risky = /garanti|kesin kazanç|%100|zengin ol|guarantee|get rich|100%/i.test(messages.at(-1)?.content || '');
    text = JSON.stringify(risky
      ? { verdict: 'risk', note: L('Kesin kazanç vaadi yanıltıcı reklam sayılır. "Garanti" ifadesini kaldırın.', 'Guaranteed-income claims count as misleading advertising. Remove the "guarantee" wording.') }
      : { verdict: 'ok', note: L('Politika ihlali görülmedi. Gerçek müşteri yorumu kullanıldığından emin olun.', 'No policy issues found. Make sure any testimonials are real.') });
  } else {
    text = roleFlow(agent.role, meta.step ?? stepOf(messages), meta.task, meta);
  }
  return { text, provider: 'mock', model: 'demo', tokens: Math.round(text.length / 3) };
}
