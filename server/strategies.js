// Strateji motoru: şirketin NASIL para kazanacağına ajanlar karar verir.
// Patronun profiline (beceri, dil, saat, açık hesaplar, risk) göre 1-3 strateji seçilir; her şirkette farklı çıkar.
// Para getirmeyen strateji süresi dolunca bırakılır, yerine yenisi seçilir (pivot).
// Ajanlar hesap açamaz, para harcayamaz, dışarı yayın yapamaz: bu adımlar patronun yapılacaklar listesine düşer.
import { company, persist, agents, createTask, logDecision, agentByRole, ledger, tasks } from './state.js';
import { emit, toast } from './bus.js';
import { env } from './config.js';
import { uid } from './store.js';
import { hardBlockReason } from './policy.js';
import { isDemo } from './providers/router.js';
import { recordRevenue } from './economy.js';
import { fxRate, isoOf } from './market.js';

const L = (tr, en) => (env.LANG !== 'tr' ? en : tr);
const T = (pair) => (Array.isArray(pair) ? L(pair[0], pair[1]) : pair);
const MAX_ACTIVE = 3;

export const ACCOUNTS = ['youtube', 'tiktok', 'instagram', 'x', 'linkedin', 'upwork', 'fiverr', 'bionluk', 'etsy', 'gumroad', 'shopier', 'medium', 'github', 'appstore', 'googleplay'];

// Yasal, gerçek para getirebilen yollar. Gerçek borsa/kripto işlemi, kumar, saadet zinciri, spam, sahte yorum yok.
export const CATALOG = [
  {
    id: 'freelance', lead: 'marketing', cost: 0, hours: 8, days: '7-21', needs: ['upwork', 'fiverr', 'bionluk', 'linkedin'],
    skills: ['design', 'tasarım', 'code', 'kod', 'yazılım', 'writing', 'yazı', 'translat', 'çeviri', 'video', 'excel', 'data', 'veri', 'marketing', 'seo'],
    name: ['Freelance hizmet', 'Freelance services'],
    pitch: ['Patronun becerisini paket hizmet olarak sat; ajanlar ilan, teklif ve portfolyo hazırlar.', "Sell the boss's skills as packaged services; agents write gigs, proposals and portfolio pieces."],
    tasks: {
      research: ['Patronun becerilerine uyan, talebi yüksek 3 freelance niş bul (fiyat, rekabet)', "Find 3 in-demand freelance niches that fit the boss's skills (price, competition)"],
      marketing: ['3 hizmet ilanı + teklif şablonu + profil biyografisi yaz', 'Write 3 gig listings, a proposal template and a profile bio'],
      design: ['Hizmet ilanları için kapak görselleri', 'Cover images for the gig listings'],
      ideas: ['Portfolyoya konacak 2 örnek iş fikri ve içeriği', 'Two portfolio sample pieces with content'],
    },
    todos: [['Bir freelance platformunda (Upwork, Fiverr, Bionluk) profil aç, kimliğini doğrula', 'Open a profile on a freelance platform (Upwork, Fiverr, Bionluk) and verify your identity'], ['Ödeme yöntemi olarak IBAN’ını ekle', 'Add your IBAN as the payout method'], ['Ajanların yazdığı ilanı yayınla, ilk teklifleri gönder', "Publish the agents' gig and send the first proposals"]],
    kpi: ['gönderilen teklif, dönüş, ilk sipariş', 'proposals sent, replies, first order'],
  },
  {
    id: 'content', lead: 'marketing', cost: 0, hours: 6, days: '30-90', needs: ['youtube', 'tiktok', 'instagram'],
    skills: ['video', 'edit', 'montaj', 'konuş', 'talk', 'game', 'oyun', 'music', 'müzik', 'vlog'],
    name: ['Video kanalı (YouTube / TikTok)', 'Video channel (YouTube / TikTok)'],
    pitch: ['Bir niş seçilir; ajanlar fikir, senaryo, başlık ve kapak üretir; sen çeker, yüklersin. Gelir: reklam, sponsorluk.', 'Pick a niche; agents produce ideas, scripts, titles and thumbnails; you record and upload. Income: ads, sponsorships.'],
    tasks: {
      research: ['Kanal için büyüyen 3 niş ve trend konular', '3 growing niches and trending topics for the channel'],
      ideas: ['Güçlü açılış cümleli 10 video fikri', '10 video ideas with strong hooks'],
      marketing: ['İlk 3 videonun tam senaryosu + başlık + açıklama', 'Full scripts, titles and descriptions for the first 3 videos'],
      design: ['İlk 3 video için kapak (thumbnail) tasarımı', 'Thumbnails for the first 3 videos'],
    },
    todos: [['Kanalı aç ya da mevcut kanalını seç', 'Create the channel or pick your existing one'], ['İlk 3 videoyu çek ve yükle', 'Record and upload the first 3 videos'], ['Şartlar oluşunca para kazanma programına başvur', 'Apply for monetization once eligible']],
    kpi: ['izlenme, abone, ilk sponsor teklifi', 'views, subscribers, first sponsor offer'],
  },
  {
    id: 'affiliate', lead: 'marketing', cost: 0, hours: 5, days: '30-60', needs: ['medium', 'x', 'instagram', 'youtube'],
    skills: ['writing', 'yazı', 'review', 'inceleme', 'tech', 'teknoloji', 'seo', 'blog'],
    name: ['Satış ortaklığı (affiliate) içerik', 'Affiliate content'],
    pitch: ['Bir nişte karşılaştırma ve inceleme içerikleri; satış olunca komisyon gelir.', 'Comparison and review content in one niche; you earn a commission per sale.'],
    tasks: {
      research: ['Nişte komisyonu iyi 3 satış ortaklığı programı ve şartları', '3 affiliate programs with good commissions in the niche, with terms'],
      marketing: ['3 karşılaştırma/inceleme yazısı (dürüst, açıklamalı)', '3 honest comparison/review articles with disclosure'],
      dev: ['İçeriklerin duracağı tek sayfalık site', 'A one-page site to host the content'],
    },
    todos: [['Seçilen satış ortaklığı programlarına başvur', 'Apply to the chosen affiliate programs'], ['Yazıları kendi bağlantılarınla yayınla', 'Publish the articles with your own links']],
    kpi: ['tıklama, dönüşüm, komisyon', 'clicks, conversions, commission'],
  },
  {
    id: 'digital', lead: 'dev', cost: 0, hours: 5, days: '7-30', needs: ['gumroad', 'etsy', 'shopier'],
    skills: ['design', 'tasarım', 'notion', 'excel', 'canva', 'writing', 'yazı', 'template', 'şablon'],
    name: ['Dijital ürün (şablon, rehber)', 'Digital products (templates, guides)'],
    pitch: ['Şablon, rehber, planlayıcı gibi bir kez yapılıp çok satılan ürünler.', 'Make-once, sell-many products like templates, guides and planners.'],
    tasks: {
      ideas: ['Talebi kanıtlanmış 3 dijital ürün fikri', '3 digital product ideas with proven demand'],
      dev: ['Ürünü satışa hazır paketle', 'Package the product for sale'],
      design: ['Ürün kapağı ve mağaza görselleri', 'Product cover and store images'],
      marketing: ['Mağaza açıklaması ve anahtar kelimeler', 'Store description and keywords'],
    },
    todos: [['Bir mağaza aç (Gumroad, Etsy, Shopier, Lemon Squeezy)', 'Open a store (Gumroad, Etsy, Shopier, Lemon Squeezy)'], ['Ürünü yükle, ödemeyi IBAN’ına bağla', 'Upload the product and connect payouts to your IBAN']],
    kpi: ['ziyaret, satış, iade oranı', 'visits, sales, refund rate'],
  },
  {
    id: 'local', lead: 'marketing', cost: 0, hours: 10, days: '7-30', needs: [],
    skills: ['web', 'site', 'design', 'tasarım', 'sales', 'satış', 'social', 'sosyal'],
    name: ['Yerel işletmelere hizmet', 'Services for local businesses'],
    pitch: ['Sitesi ya da düzgün menüsü olmayan işletmelere hazır paket; ajanlar demo ve teklif hazırlar, sen iletişime geçersin.', 'Ready-made packages for businesses without a website or menu; agents build the demo and offer, you make contact.'],
    tasks: {
      research: ['Herkese açık bilgilerle sitesi olmayan 20 yerel işletme listesi', 'A list of 20 local businesses without a website (public info only)'],
      dev: ['Gösterilebilir bir demo site şablonu', 'A demo website template to show'],
      marketing: ['Kibar, kişiselleştirilmiş tanıtım mesajı taslakları (spam değil)', 'Polite, personalized intro message drafts (no spam)'],
    },
    todos: [['Listeden işletmelerle bizzat iletişime geç', 'Contact the businesses on the list yourself'], ['İlk müşteri için fatura/sözleşme düzenini kur', 'Set up invoicing for the first client']],
    kpi: ['görüşme, teklif, kapanan iş', 'calls, offers, closed deals'],
  },
  {
    id: 'saas', lead: 'dev', cost: 1, hours: 12, days: '30-90', needs: ['github'],
    skills: ['code', 'kod', 'yazılım', 'developer', 'javascript', 'python', 'web'],
    name: ['Mikro-SaaS / araç', 'Micro-SaaS / tool'],
    pitch: ['Küçük ama acil bir sorunu çözen web aracı; abonelik ya da tek seferlik ücret.', 'A small web tool that solves an urgent problem; subscription or one-time fee.'],
    tasks: {
      research: ['Forumlarda sık şikâyet edilen 5 sorun ve rakipler', '5 frequently complained-about problems in forums, with competitors'],
      dev: ['En küçük çalışan sürüm (MVP)', 'The smallest working version (MVP)'],
      marketing: ['Lansman metni ve fiyat sayfası', 'Launch copy and pricing page'],
    },
    todos: [['Ücretsiz bir barındırma hizmetinde yayına al', 'Deploy it on a free hosting tier'], ['Ödeme platformu hesabını kur', 'Set up a payment platform account']],
    kpi: ['kayıt, aktif kullanıcı, ödeyen kullanıcı', 'sign-ups, active users, paying users'],
  },
  {
    id: 'apps', lead: 'dev', cost: 1, hours: 12, days: '30-90', needs: ['appstore', 'googleplay'],
    skills: ['code', 'kod', 'mobile', 'mobil', 'app', 'uygulama', 'flutter', 'react'],
    name: ['Mobil / web mini uygulama', 'Mobile / web mini app'],
    pitch: ['Basit, faydalı bir uygulama; reklam ya da uygulama içi satın alma.', 'A simple useful app; ads or in-app purchases.'],
    tasks: {
      ideas: ['Mağazada az rakibi olan 3 uygulama fikri', '3 app ideas with few competitors in the stores'],
      dev: ['Uygulamanın tıklanabilir prototipi', 'A clickable prototype of the app'],
      design: ['Mağaza ekran görüntüleri ve ikon', 'Store screenshots and icon'],
    },
    todos: [['Geliştirici hesabı aç (Google Play / App Store)', 'Open a developer account (Google Play / App Store)'], ['Uygulamayı yayınla', 'Publish the app']],
    kpi: ['indirme, günlük aktif kullanıcı, gelir', 'downloads, daily active users, revenue'],
  },
  {
    id: 'pod', lead: 'design', cost: 0, hours: 5, days: '14-60', needs: ['etsy'],
    skills: ['design', 'tasarım', 'çizim', 'illustration', 'art', 'sanat'],
    name: ['Baskılı ürün tasarımları (print-on-demand)', 'Print-on-demand designs'],
    pitch: ['Tişört, poster, kupa tasarımları; üretim ve kargo platformda, sen sadece tasarım koyarsın.', 'T-shirt, poster and mug designs; the platform prints and ships, you upload designs.'],
    tasks: {
      research: ['Satan 5 tasarım teması ve anahtar kelimeleri', '5 best-selling design themes and keywords'],
      design: ['10 özgün tasarım seti (telif yok)', '10 original designs (no copyrighted material)'],
      marketing: ['Ürün başlıkları ve etiketler', 'Product titles and tags'],
    },
    todos: [['Bir baskı-üretim platformu ile mağaza aç', 'Open a store with a print-on-demand platform'], ['Tasarımları yükle', 'Upload the designs']],
    kpi: ['görüntülenme, favori, satış', 'views, favorites, sales'],
  },
  {
    id: 'newsletter', lead: 'marketing', cost: 0, hours: 4, days: '60-120', needs: ['medium', 'x', 'linkedin'],
    skills: ['writing', 'yazı', 'news', 'finance', 'finans', 'tech', 'teknoloji'],
    name: ['Bülten + sponsorluk', 'Newsletter + sponsorships'],
    pitch: ['Bir nişte haftalık bülten; okur büyüyünce sponsorluk ve ücretli abonelik.', 'A weekly niche newsletter; sponsorships and paid tiers as it grows.'],
    tasks: {
      research: ['Bülten nişi ve rakip bültenler', 'Newsletter niche and competing newsletters'],
      marketing: ['İlk 4 sayının taslağı', 'Drafts of the first 4 issues'],
      design: ['Bülten logosu ve başlık görseli', 'Newsletter logo and header'],
    },
    todos: [['Bülten hesabını aç', 'Create the newsletter account'], ['Her hafta bir sayı yayınla', 'Publish one issue every week']],
    kpi: ['abone, açılma oranı, sponsor', 'subscribers, open rate, sponsors'],
  },
  {
    id: 'microtasks', lead: 'research', cost: 0, hours: 6, days: '7-21', needs: [],
    skills: ['english', 'ingilizce', 'translat', 'çeviri', 'language', 'dil', 'transcri', 'deşifre', 'data', 'veri'],
    name: ['Çeviri / deşifre / veri etiketleme işleri', 'Translation / transcription / data labeling'],
    pitch: ['Dil ve dikkat isteyen uzaktan işler; ajanlar güvenilir platformları ayıklar, başvuru metni ve örnek hazırlar.', 'Remote work that needs language skills and attention; agents vet legit platforms and prepare applications and samples.'],
    tasks: {
      research: ['Güvenilir 5 platform (dolandırıcılık kontrolüyle) ve şartları', '5 legitimate platforms (with a scam check) and their terms'],
      marketing: ['Başvuru metni ve özgeçmiş özeti', 'Application text and CV summary'],
      ideas: ['Başvuruya eklenecek 2 örnek çalışma', 'Two sample pieces to attach to applications'],
    },
    todos: [['Seçilen platformlara başvur ve testleri çöz', 'Apply to the chosen platforms and pass their tests']],
    kpi: ['başvuru, kabul, tamamlanan iş', 'applications, acceptances, completed jobs'],
  },
  {
    id: 'tutoring', lead: 'ideas', cost: 0, hours: 6, days: '7-30', needs: [],
    skills: ['teach', 'öğret', 'math', 'matematik', 'music', 'müzik', 'language', 'dil', 'english', 'ingilizce', 'coach', 'koç'],
    name: ['Online ders / kurs', 'Online tutoring / course'],
    pitch: ['Patronun bildiği konuda birebir ders ya da kısa kurs; ajanlar müfredat ve materyal hazırlar.', "One-on-one lessons or a short course in the boss's subject; agents build the curriculum and materials."],
    tasks: {
      ideas: ['Ders konusu, hedef öğrenci ve fiyat', 'Subject, target students and pricing'],
      marketing: ['Ders ilanı ve tanıtım metni', 'Lesson listing and promo text'],
      dev: ['Ders materyalleri ve alıştırmalar', 'Lesson materials and exercises'],
    },
    todos: [['Bir ders platformunda profil aç ya da çevrene duyur', 'Create a tutoring profile or announce it to your network']],
    kpi: ['deneme dersi, düzenli öğrenci', 'trial lessons, regular students'],
  },
  {
    id: 'ugc', lead: 'marketing', cost: 0, hours: 8, days: '14-45', needs: ['instagram', 'tiktok'],
    skills: ['social', 'sosyal', 'video', 'marketing', 'pazarlama', 'content', 'içerik'],
    name: ['Markalar için sosyal medya / UGC', 'Social media / UGC for brands'],
    pitch: ['Küçük markalara içerik ve hesap yönetimi; ajanlar örnek kampanya ve teklif dosyası hazırlar.', 'Content and account management for small brands; agents prepare sample campaigns and a pitch deck.'],
    tasks: {
      ideas: ['3 örnek kampanya fikri (portfolyo için)', '3 sample campaign concepts for the portfolio'],
      marketing: ['Teklif dosyası ve markalara tanıtım mesajı taslakları', 'Pitch deck and intro message drafts to brands'],
      design: ['Örnek gönderi görselleri', 'Sample post visuals'],
    },
    todos: [['Teklifleri markalara kendin gönder', 'Send the pitches to brands yourself']],
    kpi: ['gönderilen teklif, görüşme, aylık müşteri', 'pitches sent, calls, monthly clients'],
  },
];

export const DEFAULT_PROFILE = { skills: '', languages: 'English', hours: 10, accounts: [], risk: 'low', special20b: false, ibanLabel: '' };
export function profile() {
  return { ...DEFAULT_PROFILE, ...(company.profile || {}) };
}
export function setProfile(p = {}) {
  const cur = profile();
  const next = {
    skills: p.skills != null ? String(p.skills).slice(0, 300) : cur.skills,
    languages: p.languages != null ? String(p.languages).slice(0, 120) : cur.languages,
    hours: p.hours != null ? Math.max(1, Math.min(80, Number(p.hours) || 10)) : cur.hours,
    accounts: Array.isArray(p.accounts) ? p.accounts.filter((a) => ACCOUNTS.includes(a)) : cur.accounts,
    risk: ['low', 'medium', 'high'].includes(p.risk) ? p.risk : cur.risk,
    special20b: p.special20b != null ? !!p.special20b : cur.special20b,
    // tam IBAN saklanmaz; sadece banka adı + son 4 hane gibi bir etiket
    ibanLabel: p.ibanLabel != null ? String(p.ibanLabel).replace(/TR\d{2}[\d ]{10,}/gi, (m) => `****${m.replace(/\D/g, '').slice(-4)}`).slice(0, 40) : cur.ibanLabel,
  };
  company.profile = next;
  persist('company');
  emit('company', company);
  return next;
}

function seeded(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
/** Profile göre sıralama. Her şirketin kendi tohumu var: aynı profil bile farklı şirkette farklı sonuç verir. */
export function rankStrategies(exclude = []) {
  const p = profile();
  const acc = new Set(p.accounts);
  const sk = (p.skills + ' ' + p.languages).toLowerCase();
  const riskMax = { low: 0, medium: 1, high: 2 }[p.risk] ?? 0;
  return CATALOG.filter((s) => !exclude.includes(s.id)).map((s) => {
    let score = 1;
    if (s.needs.length && s.needs.some((n) => acc.has(n))) score += 2;
    if (!s.needs.length) score += 0.6;
    score += s.skills.filter((k) => sk.includes(k)).length * 1.2;
    if (p.hours < s.hours) score -= 1;
    if (s.cost > riskMax) score -= 1.5;
    score += seeded(`${company.createdAt}|${s.id}`) * 1.4;
    return { id: s.id, score: Math.round(score * 100) / 100 };
  }).sort((a, b) => b.score - a.score);
}

export function strategies() {
  company.strategies ||= [];
  return company.strategies;
}
const active = () => strategies().filter((s) => s.status !== 'dropped');

function reviewMs() {
  const days = Number(company.settings?.strategyReviewDays) || 14;
  return isDemo() ? 20 * 60000 : days * 864e5; // DEMO'da döngü dakikalar içinde görülsün
}

function incomeOf(id) {
  return ledger.entries.filter((e) => e.type === 'revenue' && e.strategyId === id).reduce((s, e) => s + e.amount, 0);
}

/** Max (CEO) bir strateji seçer. Kataloğun dışında özel strateji de önerebilir (yasal olmak şartıyla). */
export function chooseStrategy({ strategy, name, why = '', plan = '', kpi = '', lead } = {}, by = 'Max') {
  const key = String(strategy || '').toLowerCase().trim();
  const cat = CATALOG.find((c) => c.id === key);
  if (!cat && key !== 'custom') return `HATA: strategy şunlardan biri olmalı: ${CATALOG.map((c) => c.id).join(', ')}, custom`;
  if (active().length >= MAX_ACTIVE) return `HATA: zaten ${MAX_ACTIVE} aktif strateji var. Önce birini bırak ya da finish ile bitir.`;
  if (cat && active().some((s) => s.key === cat.id)) return `HATA: ${T(cat.name)} zaten aktif.`;
  const title = cat ? T(cat.name) : String(name || '').slice(0, 80);
  if (!title) return 'HATA: custom strateji için name gerekli';
  const block = hardBlockReason(`${title}\n${why}\n${plan}`) || (/(borsa|forex|kripto|crypto|trading|bahis|bet|kumar|gambl|saadet|mlm|pyramid|ponzi)/i.test(`${title} ${plan}`) && !cat ? 'gerçek parayla işlem/kumar/saadet zinciri stratejisi yasak' : null);
  if (block) return `REDDEDİLDİ: ${block}`;
  const roleLead = cat?.lead || (['research', 'ideas', 'dev', 'design', 'marketing', 'cfo'].includes(lead) ? lead : 'marketing');
  const s = {
    id: uid('str'), key: cat?.id || 'custom', name: title, why: String(why).slice(0, 600) || T(cat?.pitch || ''), plan: String(plan).slice(0, 1500),
    kpi: String(kpi).slice(0, 200) || T(cat?.kpi || ''), lead: roleLead, status: 'active', startedAt: Date.now(), reviewAt: Date.now() + reviewMs(),
    todos: (cat?.todos || [[`${title} için gereken hesabı/kanalı kendin aç`, `Open the account/channel ${title} needs yourself`]]).map((t) => ({ text: T(t), done: false })),
    by,
  };
  strategies().push(s);
  persist('company');
  // ekibe işler
  const ceo = agentByRole('ceo');
  const tpl = cat?.tasks || { research: [`${title}: pazar ve talep araştırması`, `${title}: market and demand research`], marketing: [`${title}: ilk müşteriye ulaşma planı ve metinleri`, `${title}: plan and copy to reach the first customer`] };
  for (const [role, t] of Object.entries(tpl)) {
    const ag = agentByRole(role);
    if (!ag || ag.status === 'dead') continue;
    createTask({
      title: `${title}: ${T(t)}`.slice(0, 140),
      detail: L(`Strateji: ${title}. Neden: ${s.why}\nPlan: ${s.plan || '-'}\nBaşarı ölçüsü: ${s.kpi}\nHesap açma, para harcama ve yayın patronun işidir; sen hazırla, gerekirse onaya gönder.`, `Strategy: ${title}. Why: ${s.why}\nPlan: ${s.plan || '-'}\nKPI: ${s.kpi}\nAccounts, spending and publishing are the boss's job; you prepare it and send it for approval when needed.`),
      assignee: ag.id, createdBy: ceo?.name || 'Max', priority: 2,
    });
  }
  logDecision(by, L(`Strateji seçildi: ${title}`, `Strategy chosen: ${title}`), `${s.why}${s.plan ? `\n${s.plan}` : ''}`);
  toast(L(`🧭 Yeni strateji: ${title}`, `🧭 New strategy: ${title}`), 'goal');
  emit('strategy', { kind: 'new', name: title, id: s.id });
  if (ceo) emit('meeting', { by: ceo.id, title });
  return { result: L(`"${title}" stratejisi başladı. ${Object.keys(tpl).length} görev dağıtıldı, patrona ${s.todos.length} yapılacak düştü.`, `Strategy "${title}" started. ${Object.keys(tpl).length} tasks assigned, ${s.todos.length} to-dos for the boss.`) };
}

export function dropStrategy(id, reason = '', by = 'Boss') {
  const s = strategies().find((x) => x.id === id);
  if (!s) throw new Error(L('strateji yok', 'strategy not found'));
  if (s.status === 'dropped') return s;
  Object.assign(s, { status: 'dropped', droppedAt: Date.now(), dropReason: String(reason || L('patron bıraktı', 'dropped by the boss')).slice(0, 300) });
  persist('company');
  logDecision(by, L(`🔁 PİVOT: ${s.name} bırakıldı`, `🔁 PIVOT: ${s.name} dropped`), s.dropReason);
  toast(L(`🔁 Pivot: ${s.name} bırakıldı, ekip yeni yol arıyor`, `🔁 Pivot: ${s.name} dropped, the team is looking for a new path`), 'info');
  emit('strategy', { kind: 'pivot', name: s.name, id: s.id });
  return s;
}

export function setTodo(id, i, done) {
  const s = strategies().find((x) => x.id === id);
  if (!s?.todos?.[i]) throw new Error(L('madde yok', 'item not found'));
  s.todos[i].done = !!done;
  persist('company');
  emit('company', company);
  return s;
}

/** Süresi dolan stratejiyi değerlendir: gelir varsa büyüt, yoksa bırak (pivot). Gerekirse yeni strateji görevi aç. */
export function strategyTick() {
  if (!company.setupDone || company.settings?.paused) return;
  const now = Date.now();
  for (const s of active()) {
    if (now < s.reviewAt) continue;
    const inc = incomeOf(s.id);
    if (inc > 0) {
      s.status = 'scaling';
      s.reviewAt = now + reviewMs();
      persist('company');
      logDecision('Penny', L(`📈 ${s.name} para getiriyor, devam`, `📈 ${s.name} is earning, keep going`), `${inc} ${company.currency}`);
      emit('strategy', { kind: 'scale', name: s.name, id: s.id });
    } else dropStrategy(s.id, L('süre doldu, gelir yok', 'review window ended with no income'), 'Penny');
  }
  // aktif strateji yoksa Max yeni bir yol seçsin
  const ceo = agentByRole('ceo');
  if (!ceo || ceo.status === 'dead' || active().length) return;
  // ilk stratejiden önce patrona profilini doldurması için birkaç dakika tanı
  const pr = profile();
  if (!pr.skills && !pr.accounts.length && company.setupAt && Date.now() - company.setupAt < (isDemo() ? 90e3 : 5 * 60e3) && !strategies().length) return;
  const open = tasks.some((t) => t.assignee === ceo.id && /^STRATEGY/i.test(t.title) && (t.status === 'todo' || t.status === 'doing'));
  if (open) return;
  const p = profile();
  const dropped = strategies().filter((s) => s.status === 'dropped').map((s) => s.key);
  const ranked = rankStrategies(dropped).slice(0, 6);
  createTask({
    title: L('STRATEGY: Şirket nasıl para kazanacak?', 'STRATEGY: How will this company make money?'),
    detail: L(
      `Patron profili: beceriler "${p.skills || '-'}", diller ${p.languages}, haftada ${p.hours} saat, açık hesaplar: ${p.accounts.join(', ') || 'yok'}, risk: ${p.risk}.\nBu patron için en kısa sürede GERÇEK para getirme ihtimali en yüksek 1-2 stratejiyi seç ve her biri için choose_strategy çağır (strategy, why, plan, kpi). Katalogdakiler (profile uygunluk sırasıyla): ${ranked.map((r) => `${r.id} (${T(CATALOG.find((c) => c.id === r.id).name)})`).join(', ')}. Daha iyisi varsa "custom" öner. Daha önce bırakılanlar: ${dropped.join(', ') || '-'}.\nYASAK: gerçek parayla borsa/kripto işlemi, kumar, saadet zinciri, spam, sahte yorum. Ajanlar hesap açamaz; hesap adımları patrona yapılacak olarak düşer.`,
      `Boss profile: skills "${p.skills || '-'}", languages ${p.languages}, ${p.hours} h/week, accounts: ${p.accounts.join(', ') || 'none'}, risk: ${p.risk}.\nPick the 1-2 strategies most likely to make REAL money soon for THIS boss and call choose_strategy for each (strategy, why, plan, kpi). Catalog, best fit first: ${ranked.map((r) => `${r.id} (${T(CATALOG.find((c) => c.id === r.id).name)})`).join(', ')}. Propose "custom" if you see something better. Previously dropped: ${dropped.join(', ') || '-'}.\nFORBIDDEN: real-money trading or crypto, gambling, MLM, spam, fake reviews. Agents cannot open accounts; account steps become boss to-dos.`),
    assignee: ceo.id, createdBy: 'Boss', priority: 3,
  });
  ceo.nextRunAt = Date.now() + 1500;
}

const SYM = { USD: '$', TRY: '₺', EUR: '€' };
async function convert(amount, currency) {
  const n = Math.round(Math.abs(Number(amount) || 0) * 100) / 100;
  if (!n) throw new Error(L('tutar gerekli', 'amount required'));
  const from = String(currency || isoOf(company.currency)).toUpperCase();
  if (!['TRY', 'USD', 'EUR'].includes(from)) throw new Error(L('Para birimi: TRY, USD veya EUR', 'Currency must be TRY, USD or EUR'));
  const fx = await fxRate(from, company.currency);
  return { n, from, fx, value: Math.round(n * fx.rate * 100) / 100, label: fx.from === fx.to ? '' : ` (${SYM[from]}${n.toLocaleString('en-US')} @ ${(1 / fx.rate).toFixed(fx.rate < 0.2 ? 2 : 4)})` };
}

/** Gerçek gelir: hangi stratejiden, hangi platformdan geldi. TL/USD/EUR girilir, şirket para birimine çevrilir. */
export async function recordIncome({ amount, currency, source = '', strategyId = null, note = '' } = {}) {
  const c = await convert(amount, currency);
  const s = strategyId ? strategies().find((x) => x.id === strategyId) : null;
  const lead = s ? agentByRole(s.lead) : null;
  const text = `${note || L('Gelir', 'Income')}${source ? ` · ${String(source).slice(0, 40)}` : ''}${s ? ` · ${s.name}` : ''}${c.label}`;
  recordRevenue(c.value, text, null, lead?.id || null, { strategyId: s?.id || null, source: String(source).slice(0, 40), original: { amount: c.n, currency: c.from } });
  return strategyView();
}

/** Platformdan IBAN'a geçen ödeme: kasayı değiştirmez (para zaten şirketin), "platformda bekleyen" tutarı düşürür. */
export async function recordPayout({ amount, currency, platform = '', account = '' } = {}) {
  const c = await convert(amount, currency);
  const acc = String(account || profile().ibanLabel || 'IBAN').replace(/TR\d{2}[\d ]{10,}/gi, (m) => `****${m.replace(/\D/g, '').slice(-4)}`).slice(0, 40);
  ledger.entries.push({ id: uid('led'), t: Date.now(), type: 'payout', amount: c.value, platform: String(platform).slice(0, 40), account: acc, note: `${String(platform || L('Platform', 'Platform')).slice(0, 40)} → ${acc}${c.label}`, original: { amount: c.n, currency: c.from } });
  persist('ledger');
  emit('ledger:changed', {});
  toast(L(`🏦 IBAN'a ödeme kaydedildi: ${c.value} ${company.currency}`, `🏦 Payout to IBAN recorded: ${company.currency}${c.value}`), 'money');
  return strategyView();
}

export function strategyView() {
  const list = strategies().map((s) => ({ ...s, income: incomeOf(s.id), daysLeft: Math.max(0, Math.ceil((s.reviewAt - Date.now()) / 864e5 * 10) / 10), minutesLeft: Math.max(0, Math.round((s.reviewAt - Date.now()) / 60000)) }));
  const payouts = ledger.entries.filter((e) => e.type === 'payout');
  const earned = ledger.entries.filter((e) => e.type === 'revenue').reduce((s, e) => s + e.amount, 0);
  const paid = payouts.reduce((s, e) => s + e.amount, 0);
  const p = profile();
  return {
    profile: p,
    accounts: ACCOUNTS,
    catalog: CATALOG.map((c) => ({ id: c.id, name: T(c.name), pitch: T(c.pitch), days: c.days })),
    ranking: rankStrategies().slice(0, 5),
    strategies: list.reverse(),
    earned: Math.round(earned * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    waiting: Math.round((earned - paid) * 100) / 100,
    // bilgi amaçlı: 20/B özel hesaba yatan tutardan banka ~%15 keser (muhasebeciyle teyit edilmeli)
    withholdingEstimate: p.special20b ? Math.round(paid * 0.15 * 100) / 100 : 0,
    payouts: payouts.slice(-30).reverse(),
    income: ledger.entries.filter((e) => e.type === 'revenue').slice(-30).reverse(),
  };
}
