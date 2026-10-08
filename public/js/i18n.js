// Dil katmanı (TR → EN). Kaynak dil Türkçe; İngilizce seçiliyse görünen metinler sözlükle çevrilir.
// DOM: MutationObserver ile her yeni metin/placeholder/title otomatik çevrilir (paneller, toast'lar, sunucu mesajları).
// Canvas: world.js metinleri tr() üzerinden geçer. Sözlükte olmayan metin olduğu gibi kalır (hiçbir şey bozulmaz).

let lang = 'tr';
try {
  lang = localStorage.getItem('hq_lang') || ((navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en');
} catch {}
export function getLang() {
  return lang;
}
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'tr';
  try { localStorage.setItem('hq_lang', lang); } catch {}
  document.documentElement.lang = lang;
}

// Tam eşleşme: metin düğümünün tamamı (kırpılmış) bu ise değiştirilir. Tek kelimeler burada durur.
const EXACT = {
  'Hedef Ver': 'Set Goal', 'Motorlar': 'Engines', 'Karakterim': 'My Character', 'Kişiler': 'People', 'Görevler': 'Tasks',
  'Kararlar': 'Decisions', 'Teslimler': 'Deliverables', 'Dosyalar': 'Files', 'Onaylar': 'Approvals', 'Kasa': 'Treasury',
  'Borsa': 'Market', 'Yönetim': 'Admin', 'KASA': 'CASH', 'GELİR': 'REVENUE', 'EKİP': 'TEAM', 'CANLI': 'LIVE', 'DEMO': 'DEMO',
  'Adet': 'Qty', 'Ajan': 'Agent', 'Bağla': 'Connect', 'Boss': 'Boss', 'Boş': 'Empty', 'Boşta': 'Idle', 'Can': 'HP',
  'Diken': 'Spiky', 'Durum': 'Status', 'Düşünüyor': 'Thinking', 'Ekle': 'Add', 'Ekstra': 'Extras', 'Fiyat': 'Price',
  'Gelir': 'Revenue', 'Gerekçe': 'Reason', 'Gönder': 'Send', 'Görünüm': 'Look', 'Gözlük': 'Glasses', 'Kapşon': 'Hoodie',
  'Kaydet': 'Save', 'Kaydedildi': 'Saved', 'Kim': 'Who', 'Kovuldu': 'Fired', 'Kravat': 'Tie', 'Kulaklık': 'Headphones',
  'Kırmızı': 'Red', 'Kısa': 'Short', 'Kıvırcık': 'Curly', 'Mavi': 'Blue', 'Motor': 'Engine', 'NAKİT': 'CASH', 'Not': 'Note',
  'OFİS': 'OFFICE', 'ONAY': 'APPROVALS', 'PANO': 'BOARD', 'PERFORMANS': 'PERFORMANCE', 'POZİSYONLAR': 'POSITIONS',
  'PUAN': 'RATING', 'Pantolon': 'Pants', 'Puan': 'Rating', 'Rol': 'Role', 'SAT': 'SELL', 'AL': 'BUY', 'Sembol': 'Symbol',
  'Siyah': 'Black', 'Skor': 'Score', 'Sohbet': 'Chat', 'Sıfırla': 'Reset', 'TESLİM': 'DELIVERED', 'Ten': 'Skin',
  'Teslim': 'Delivered', 'Topuz': 'Bun', 'Turuncu': 'Orange', 'Tutar': 'Amount', 'Tür': 'Type', 'Uzun': 'Long', 'Yan': 'Side',
  'Yok.': 'None.', 'Yürüyor': 'Walking', 'Zaman': 'Time', 'ÇAĞRI': 'CALLS', 'Çalışıyor': 'Working', 'Üst': 'Top',
  'İndir': 'Download', 'İşlem': 'Trade', 'BAKİYE': 'BALANCE', 'BAŞLANGIÇ': 'START', 'HARCAMA': 'SPEND', 'DEĞER': 'VALUE',
  'DEĞER ₺': 'VALUE ₺', 'K/Z': 'P/L', 'Ort. ₺': 'Avg ₺', 'K/Z ₺': 'P/L ₺', 'BİTTİ': 'DONE', 'SIRADA': 'QUEUED',
  'YAPILIYOR': 'IN PROGRESS', 'KADRO': 'ROSTER', 'GÖREV': 'TASKS', 'GEÇMİŞ': 'HISTORY', 'DEFTER': 'LEDGER', 'ŞİRKET': 'COMPANY',
  'HAKKINDA': 'ABOUT', 'AÇIK': 'ON', 'KAPALI': 'OFF', 'iptal': 'cancel', 'Test': 'Test', 'ücretsiz': 'free', 'lokal': 'local', 'sim': 'sim', 'Bütçe ver': 'Give budget',
  'Gelir bağla': 'Link revenue', 'Görev ver': 'Assign task', 'Canlı log': 'Live log', 'Takım elbise': 'Suit', 'Saç modeli': 'Hair style',
  'Saç rengi': 'Hair color', 'Para birimi': 'Currency', 'Patron adı': 'Boss name', 'Şirket adı': 'Company name', 'Anahtar al': 'Get key',
  'Anahtar yok': 'No key', 'Yeniden algıla': 'Re-detect', 'Ne zaman': 'When', 'Reklam ROI': 'Ad ROI', 'Adı kaydet': 'Save name',
  'Uyuyor (kota)': 'Sleeping (quota)', 'Çağrıda bekliyor': 'On call', 'KOVULDU': 'FIRED', 'TAKİP': 'FOLLOW', 'ARAŞTIRMA': 'RESEARCH',
  'FİKİR': 'IDEAS', 'GELİŞTİRME': 'ENGINEERING', 'TASARIM': 'DESIGN', 'PAZARLAMA': 'MARKETING', 'DENETİM': 'COMPLIANCE',
  'QA / İNCELEME': 'QA / REVIEW', 'CLAUDE · ON-CALL': 'CLAUDE · ON-CALL', 'GENEL MÜDÜR': 'CEO', 'FİNANS & BORSA': 'FINANCE & MARKET',
  'BOSS': 'BOSS', 'GİRİŞ': 'ENTRANCE', 'Kişiler': 'People', 'Yönetim ': 'Admin', 'İş ver': 'Give a job', 'Türkçe': 'Türkçe',
  // rol unvanları
  'Genel Müdür / Orkestratör': 'CEO / Orchestrator', 'Fikir Avcısı': 'Idea Hunter', 'Araştırmacı': 'Researcher', 'Developer': 'Developer',
  'Senior Mimar (Claude, on-call)': 'Senior Architect (Claude, on-call)', 'Grafik Tasarımcı': 'Graphic Designer', 'Pazarlamacı': 'Marketer',
  'Reklam ve İçerik Denetçisi': 'Ad & Content Compliance', 'QA / Kod İnceleme': 'QA / Code Review', 'CFO / Analist + Borsa Masası': 'CFO / Analyst + Trading Desk', 'HABER': 'NEWS', 'Kahve makinesi': 'Coffee machine', 'Kasa ': 'Safe',
};

// İfade eşleşmesi: metnin içinde geçtiği yerde değiştirilir (uzun olan önce).
const PHRASES = [
  // rol açıklamaları (sunucudaki roster.js ile aynı metin)
  ['Patrondan gelen hedefi parçalara böler, doğru ajana görev atar, ilerlemeyi takip eder, tıkananı patrona eskale eder. Kendisi üretim yapmaz, yönetir. Para getirmeyen işi keser.', "Splits the boss's goal into tasks, assigns the right agent, tracks progress and escalates blockers. Manages instead of producing. Cuts work that doesn't make money."],
  ['SADECE hızlı para kazandıracak, düşük maliyetli, yasal fikirler bulur: dijital ürünler, mikro-SaaS, şablonlar, hizmetler, niş içerik. Her fikirde hedef kitle, fiyat, ilk 7 günde ilk satış planı ve tahmini gelir olur.', 'Finds ONLY fast, low-cost, legal money ideas: digital products, micro-SaaS, templates, services, niche content. Every idea has an audience, price, a first-sale plan for the first 7 days and estimated revenue.'],
  ['Pazar, rakip, fiyat ve talep araştırması yapar. Web’de arar, sayfa okur, kaynaklı ve kısa rapor yazar. Varsayım değil veri getirir.', 'Researches markets, competitors, pricing and demand. Searches the web, reads pages and writes short sourced reports. Brings data, not assumptions.'],
  ['Fikirleri çalışan ürüne çevirir: landing page, mikro-SaaS, script, bot, şablon. workspace içinde dosya yazar, komut çalıştırır. Basit, çalışan, satılabilir şeyler yapar.', 'Turns ideas into working products: landing pages, micro-SaaS, scripts, bots, templates. Writes files and runs commands in the workspace. Builds simple, working, sellable things.'],
  ['Otonom çalışmaz. Sadece patron masasına gelip iş verince Claude Code ile gerçek geliştirme yapar.', 'Never runs on its own. Only does real development with Claude Code when the boss gives it a job.'],
  ['Logo, sosyal medya görseli, ürün kapağı, landing page görsel dili üretir. SVG/HTML yazar, gerekirse ücretsiz görsel üretici ile görsel çizer.', 'Creates logos, social posts, product covers and landing page visuals. Writes SVG/HTML and uses a free image generator when needed.'],
  ['Satış metni, sosyal medya postları, e-posta, SEO başlıkları, lansman planı yazar. Dışarı yayınlanacak her şeyi onay kuyruğuna gönderir, asla kendisi yayınlamaz.', 'Writes sales copy, social posts, emails, SEO titles and launch plans. Sends everything public to the approval queue and never publishes on its own.'],
  ['Dışarı çıkacak her içeriği ve harcamayı denetler: yanıltıcı iddia, spam, telif, marka ihlali, platform reklam politikaları, yasa dışı veya etik dışı yöntem. Riskliyi reddeder ve düzeltme önerir.', 'Reviews every outgoing piece of content and spend: misleading claims, spam, copyright, trademark issues, ad platform policies, illegal or unethical methods. Rejects risky items and suggests fixes.'],
  ['Developer’ın kodunu inceler, çalıştırır, hataları bulur, net düzeltme listesi verir. Kalite kapısıdır.', "Reviews and runs the developer's code, finds bugs and gives a clear fix list. The quality gate."],
  ['Kasa, gelir, gider, runway ve ajan ROI’sini takip eder. Hangi işin para getirdiğini ölçer. Sanal (paper) portföyü yönetir: gerçek para ile asla işlem yapmaz.', 'Tracks treasury, revenue, costs, runway and agent ROI. Measures which work makes money. Runs the paper portfolio and never trades real money.'],
  ["Örn: 7 gün içinde Shopier'de satılacak bir Notion şablonu çıkar", 'e.g. Ship a Notion template we can sell on Gumroad within 7 days'],
  ['Örn: urun/index.html satış sayfasını profesyonelleştir, Shopier butonu ekle, mobil uyumu düzelt.', 'e.g. Polish product/index.html into a pro sales page, add a buy button, fix mobile layout.'],
  ['Arayüz ve ajanların yazdığı içerik bu dile geçer. / Interface and agent output switch to this language.', 'Interface and agent output switch to this language.'],
  ['DİL / LANGUAGE', 'LANGUAGE'], ['(ücretsiz)', '(free)'], ['Expected return:', 'Expected return:'],
  ['10 kişilik ekip işe alındı. Kural:', 'Hired a team of 10. Rule:'], ['Hustle HQ kuruldu', 'Hustle HQ founded'], ['Odak:', 'Focus:'],
  ['Görev bitti.', 'Task done.'], ['Yazıldı:', 'Written:'], ['karakter', 'characters'],
  // çatı
  ['Asansör: çatı terası', 'Elevator: rooftop'], ['Asansör: lobi', 'Elevator: lobby'], ['Dürbün: şehre bak', 'Telescope: look at the city'],
  ['Şehrin ışıkları… Aşağıda', 'City lights… Below,'], ['ajan çalışıyor, kasa', 'agents are working, treasury'], [', gelir', ', revenue'],
  ['VERİ', 'DATA'], ['Yedeği indir (zip)', 'Download backup (zip)'], ['Şirketi sıfırla', 'Reset company'],
  ['Yedek; şirket verisini ve workspace dosyalarını içerir, API anahtarlarını içermez. Sıfırlamadan önce otomatik yedek alınır (data/backups).', 'The backup contains company data and workspace files, never API keys. An automatic backup is taken before a reset (data/backups).'],
  ['Hustle HQ v1.0 · Veriler', 'Hustle HQ v1.0 · Data in'], [', ajan çıktıları', ', agent output in'],
  ['▶ Görev:', '▶ Task:'], ['Görev:', 'Task:'], [' karakter)', ' chars)'], ['Format dışı yanıt', 'Malformed reply'], ['Beklenmeyen hata:', 'Unexpected error:'],
  ['Tüm motorların kotası dolu, kanepede uyuyorum 💤', 'All my engines hit their quota, napping on the couch 💤'], ['Onay sonucu:', 'Approval result:'],
  // v1.0 eklemeleri
  ['Sıraya ekle', 'Add to queue'], ['SIRADAKİ HEDEFLER', 'GOAL QUEUE'], ['Aktif hedefin tüm işleri bitince sıradaki otomatik başlar.', 'When every task of the active goal is done, the next goal starts automatically.'],
  ["Penny'den şimdi günlük rapor iste", 'Ask Penny for a daily report now'], ['GÖRSEL EFEKTLER', 'VISUAL EFFECTS'], ['CRT tarama çizgileri:', 'CRT scanlines:'], ['Efektleri azalt:', 'Reduce effects:'],
  ['"Efektleri azalt" vinyeti ve sinematik şeritleri kapatır; zayıf bilgisayarlar ve uzun oturumlar için.', '"Reduce effects" turns off the vignette and cinematic bars; good for slower computers and long sessions.'],
  ['Hedef sıraya eklendi', 'Goal added to the queue'], ['Rapor görevi Penny’ye verildi', 'Report task given to Penny'], ['Penny günlük raporu hazırlıyor', 'Penny is preparing the daily report'],
  ['Rapor şu an verilemedi (Penny yok ya da ofis duraklatılmış)', "Couldn't request a report (no Penny or the office is paused)"],
  [' seviye ', ' reached level '], [' oldu!', '!'], ['LEVEL UP! Seviye', 'LEVEL UP! Level'], ['kuşak', 'gen'], ['Günlük rapor', 'Daily report'],
  ['Hedef tamamlandı, sıradakine geçildi:', 'Goal completed, moving to the next:'],
  // kurulum sihirbazı
  ['ŞİRKETİN', 'YOUR COMPANY'], ['Bu bilgiler sadece bu bilgisayarda saklanır.', 'This information is stored only on this computer.'],
  ['Devam →', 'Continue →'], ['← Geri', '← Back'], ['Şimdilik atla →', 'Skip for now →'], ['MOTORLAR', 'ENGINES'], ['HAZIRSIN', "YOU'RE READY"],
  ['Ajanların beyni. En az bir', "The agents' brains. Add at least one"], ['anahtar ekle; istersen sonra ⚙️ Motorlar menüsünden de ekleyebilirsin. Anahtar olmadan ofis DEMO modunda çalışır.', 'key; you can also add more later in ⚙️ Engines. Without a key the office runs in DEMO mode.'],
  ['ile yürü, ajanlara', 'to walk, talk to agents with'], ['ile konuş.', '.'], ["ile Max'e hedef ver. Max işi ekibe dağıtır.", 'to give Max a goal. Max splits the work for the team.'],
  ["'a düşer. Teslimleri puanla: puan ajanın canıdır.", '. Rate deliverables: rating is HP.'], ['Para getirmeyen ajan kovulur, yerine yenisi gelir.', "Agents that don't make money get fired and replaced."],
  ['İlk hedef (opsiyonel)', 'First goal (optional)'], ['Ofise gir', 'Enter the office'], ['Ofis CANLI. İyi kazançlar patron!', 'The office is LIVE. Happy earning, boss!'],
  ['DEMO modunda başladın. ⚙️ Motorlar menüsünden anahtar ekleyince ofis canlanır.', 'You started in DEMO mode. Add a key in ⚙️ Engines to bring the office to life.'],
  // proaktif görev başlıkları (eski veriler)
  ['3 yeni hızlı para fikri', '3 new fast money ideas'], ['Finans raporu + sanal portföy', 'Finance report + paper portfolio'], ['STANDUP: takımı yönet', 'STANDUP: run the team'],
  ['Türkiye’de yükselen dijital ürün trendleri', 'Rising digital product trends'], ['Fikir listesi', 'Idea list'], ['Finans raporu', 'Finance report'], ['QA incelemesi', 'QA review'], ['Görev planı', 'Task plan'],
  // odalar
  ['MOTOR ODASI', 'ENGINE ROOM'], ['GENEL MÜDÜR OFİSİ', "CEO'S OFFICE"], ['TOPLANTI ODASI', 'MEETING ROOM'], ['ARŞİV & ANMA SALONU', 'ARCHIVE & MEMORIAL'],
  ['AÇIK OFİS', 'OPEN OFFICE'], ['CLAUDE AR-GE LAB', 'CLAUDE R&D LAB'], ['KORİDOR', 'HALLWAY'], ['BORSA MASASI', 'TRADING DESK'],
  ['MUTFAK', 'KITCHEN'], ['LOBİ', 'LOBBY'], ['DİNLENME SALONU', 'LOUNGE'], ['BOSS OFİSİ', "BOSS'S OFFICE"], ['SOKAK', 'STREET'], ['ÇATI TERASI', 'ROOFTOP'],
  // posterler / tabelalar
  ['İYİ FİKİRLER', 'GOOD IDEAS'], ['UYUMAZ', "DON'T SLEEP"], ['PARA KAZAN', 'MAKE MONEY'], ['YA DA KOVUL', 'OR GET FIRED'],
  ['FARKLI AJANLAR', 'DIFFERENT AGENTS'], ['AYNI HEDEF', 'SAME GOAL'], ['FİKİR > GÖREV', 'IDEA > TASK'], ['> SONUÇ', '> RESULT'],
  ['KOTA DOLARSA', 'QUOTA FULL?'], ['SIRADAKİNE', 'NEXT ONE'], ['İYİ İŞ BİRLİKTE', 'GOOD WORK HAPPENS'], ['YAPILIR', 'TOGETHER'],
  ['SADECE PATRON', 'ONLY THE BOSS'], ['ÇAĞIRIR', 'CALLS IT'], ['KAHVE = YAKIT', 'COFFEE = FUEL'], ['YAPAY ZEKÂ OFİS A.Ş.', 'AI OFFICE INC.'],
  ['DEVAM EDEN İŞLER', 'IN PROGRESS'], ['ANMA DUVARI · KOVULANLAR', 'MEMORIAL · FIRED'], ['Henüz kimse kovulmadı', 'Nobody fired yet'],
  ['BORSA MASASI · PAPER TRADING (SANAL)', 'TRADING DESK · PAPER TRADING (SIMULATED)'], ['PORTFÖY', 'PORTFOLIO'], ['Fiyatlar yükleniyor…', 'Loading prices…'],
  ['DEMO MODU', 'DEMO MODE'], ['MOTOR ODASI ↑', 'ENGINE ROOM ↑'], ['AÇIK OFİS ↑', 'OPEN OFFICE ↑'], ['TOPLANTI ↑', 'MEETING ↑'], ['CLAUDE LAB ↑', 'CLAUDE LAB ↑'],
  // etkileşim etiketleri
  ['ile konuş', '— talk'], ['Görev panosu', 'Task board'], ['Motor odası (sağlayıcılar)', 'Engine room (providers)'],
  ['Toplantı masası: Kararlar & Teslimler', 'Meeting table: decisions & deliverables'], ['Arşiv masası: tüm teslimler', 'Archive desk: all deliverables'],
  ['Anma duvarı & kişiler', 'Memorial wall & people'], ['Borsa masası (paper trading)', 'Trading desk (paper trading)'], ['Kahve makinesi', 'Coffee machine'],
  ['Resepsiyon: nasıl oynanır?', 'Reception: how to play?'], ['Asansör (yeni HQ katları)', 'Elevator (floors)'], ['Atari makinesi', 'Arcade machine'],
  ['Haber kanalı: Kararlar', 'News channel: decisions'], ['Boss masası: Hedef ver & Onaylar', "Boss desk: set goal & approvals"],
  ['Claude’a iş ver (Claude Code)', 'Give Claude a job (Claude Code)'], ['Otobüs durağı: eve git', 'Bus stop: go home'],
  // diyalog
  ['sana dönüyor.', 'turns to you.'], ['hızlı hızlı yazıyor.', 'is typing furiously.'], ['ekrana kilitlenmiş, alnında ter var.', 'is glued to the screen, sweating.'],
  ['titriyor, terden sırılsıklam.', 'is shaking, drenched in sweat.'], ['kanepede uyuyor. Zzz...', 'is asleep on the couch. Zzz...'],
  ['(Motorlarının kotası dolmuş.)', '(Their engines hit the quota.)'], ['Burada eskiden', 'This used to be'], ['otururdu.', "'s desk."],
  ['Masada yarım kalmış bir kahve var.', 'There is a half-finished coffee on the desk.'], ['sakin sakin bekliyor.', 'waits calmly.'],
  ['Beni çağırırsan gerçek kod yazarım, patron.', "Call me and I'll write real code, boss."], ['Patron! Bugün ne satıyoruz?', 'Boss! What are we selling today?'],
  ['Üzerinde çalışıyorum!', "I'm on it!"], ['Bir saniye patron, yetiştiriyorum!', 'One sec boss, almost there!'], ['AAAA! Runway bitiyor patron!', 'AAAA! The runway is ending, boss!'],
  ['Konuş', 'Talk'], ['Panel', 'Panel'], ['Kapat', 'Close'],
  // balon/konuşma
  ['AAAA RUNWAY BİTİYOR!', 'AAAA RUNWAY IS ENDING!'], ['Kovulmak istemiyorum', "I don't wanna get fired"], ['SATIŞ LAZIM, SATIŞ!', 'WE NEED SALES!'],
  ['Patron bakıyor, çalış çalış!', "Boss is watching, work work!"], ['Kahve… daha çok kahve…', 'Coffee… more coffee…'], ['Bu hafta ya hep ya hiç!', 'All or nothing this week!'],
  ['Deadline yaklaşıyor…', 'Deadline is coming…'], ['Bir saniye, odaklanıyorum', 'One sec, focusing'], ['Of, iş çok…', 'Ugh, so much work…'], ['Hadi hadi hadi…', 'Come on come on…'],
  ['Satış geldi!', 'We got a sale!'], ['Başardık!', 'We did it!'], ['Çak bir beşlik', 'High five'], ['Kahve molası', 'Coffee break'], ['Fikir lazım…', 'Need ideas…'],
  ['Bugün satış çıkacak', "Today's the day we sell"], ['Biraz hava…', 'Some fresh air…'], ['Yeni görev geldi!', 'New task arrived!'], ['Hoşça kal', 'Goodbye'],
  ['Eşyalarımı topluyorum…', 'Packing my things…'], ['Bu iş bana göre değilmiş', "This job wasn't for me"], ['Bir gün geri döneceğim!', "I'll be back one day!"],
  ['İş bitti, teslim!', 'Done, delivering!'], ['Bir şey söyleyeceğim…', 'I need to tell you something…'], ['Patron, karar lazım', 'Boss, we need a decision'],
  ['Hedefi aldım patron', 'Got the goal, boss'], ['Toplantı!', 'Meeting!'], ['Geliyorum…', 'Coming…'], ['Kahvemi alıp geliyorum', 'Grabbing coffee, coming'],
  ['Yine mi toplantı', 'Another meeting?'], ['Hedef ne patron?', "What's the goal, boss?"], ['Ekip, odak:', 'Team, focus:'], ['Kotam doldu…', 'My quota is full…'],
  ['ilk günüm', 'my first day'], ['Merhaba! Ben', 'Hi! I am'], ['Eline sağlık!', 'Nice work!'], ['Harika iş', 'Great work'], ['Tam zamanında', 'Right on time'],
  ['Tamamdır, bakıyorum', 'Okay, looking into it'], ['Anladım, hallederim.', "Got it, I'll handle it."], ['Not aldım', 'Noted'], ['Süper, inceliyorum', 'Great, reviewing'],
  ['Başka bir şey lazım mı?', 'Need anything else?'], ['Şimdilik bu kadar, sağ ol!', "That's all for now, thanks!"], ['Süper, sende', 'Great, over to you'],
  ['LEVEL UP!', 'LEVEL UP!'], ['Seviye', 'Level'],
  // HUD / toast / sunucu
  ['DEMO modu: gerçek zekâ için Motorlar menüsünden ücretsiz API anahtarı ekle.', 'DEMO mode: add a free API key in the Engines menu for real AI.'],
  ['Onay bekliyor:', 'Awaiting approval:'], ['kovuldu', 'was fired'], ['işe başladı', 'started working'], ['Yeni hedef verildi:', 'New goal set:'],
  ['Kasaya', 'Added to treasury:'], ['eklendi', ''], ['gelir!', 'revenue!'], ['bütçesi:', 'budget:'], ['Claude işi bitirdi', 'Claude finished the job'],
  ['Takip bırakıldı', 'Stopped following'], ['takip ediliyor. Yürü ya da Esc ile bırak.', 'is being followed. Walk or press Esc to stop.'],
  ['Kahve içtin. Ekip seni izliyor, gaza geldiler.', 'You had a coffee. The team saw that and got hyped.'],
  ['Yeni HQ katları yakında: her kat ayrı şirket, ayrı kasa.', 'More floors coming soon: each floor its own company.'],
  ['Görev verildi', 'Task assigned'], ['Motor zinciri kaydedildi', 'Engine chain saved'], ['Hedef yaz', 'Write a goal'], ['Başlık yaz', 'Write a title'],
  ['Tutar yaz', 'Enter an amount'], ['Anahtarı yapıştır', 'Paste the key'], ['Test ediliyor…', 'Testing…'], ['Çalışıyor:', 'Working:'],
  ['Kaydedildi. Ofis CANLI moda geçti!', 'Saved. The office is now LIVE!'], ['Onaylandı', 'Approved'], ['Reddedildi', 'Rejected'],
  ['Lemon Squeezy bağlandı', 'Lemon Squeezy connected'], ['Ürün bağlandı', 'Product linked'], ['Reklam sonucu kaydedildi', 'Ad result saved'],
  ['Claude çalışıyor…', 'Claude is working…'], ['Claude için görev yaz', 'Write a task for Claude'],
  // paneller (başlıklar)
  ['Boss Masası', 'Boss Desk'], ['Onay Kuyruğu', 'Approval Queue'], ['Görev Panosu', 'Task Board'], ['Motorlar & Sağlayıcılar', 'Engines & Providers'],
  ['Borsa Masası (Sanal)', 'Trading Desk (Simulated)'], ['Claude Masası', 'Claude Desk'], ['Dosyalar (workspace)', 'Files (workspace)'],
  // paneller (metin)
  ['Patron sensin. Hedefi', "You're the boss. Give the goal to"], ["'e verirsin, Max görevlere böler ve ekibe dağıtır. Dışarı giden her şey senin onayına düşer.", '; Max splits it into tasks for the team. Anything leaving the office needs your approval.'],
  ['AKTİF HEDEF', 'ACTIVE GOAL'], ['YENİ HEDEF VER', 'SET A NEW GOAL'], ['Hedef yok. Ekip kendi kendine fikir üretiyor.', 'No goal. The team is generating ideas on its own.'],
  ['Hedefi kaldır', 'Clear goal'], ["Hedefi Max'e ver", 'Give the goal to Max'], ['ONAY BEKLEYENLER', 'PENDING APPROVALS'], ['Bekleyen onay yok.', 'No pending approvals.'],
  ['Tümünü gör →', 'See all →'], ['önce verildi', 'ago'], ['7 gün içinde ilk 1.000 ₺ gelirini getir', 'Make the first ₺1,000 in 7 days'],
  ['Satılabilir bir dijital ürün (şablon/e-kitap) çıkar ve satış sayfasını hazırla', 'Ship a sellable digital product (template/e-book) with a sales page'],
  ['Küçük işletmelere satılacak bir hizmet paketi kur ve ilk 10 müşteri listesini çıkar', 'Build a service package for small businesses and list the first 10 leads'],
  ['Bir mikro-SaaS fikri seç, MVP yap ve lansman planı hazırla', 'Pick a micro-SaaS idea, build the MVP and a launch plan'],
  ['Instagram/TikTok için 30 günlük içerik makinesi kur', 'Build a 30-day content machine for Instagram/TikTok'],
  ['Ajanlar dışarıya hiçbir şey göndermez. Komut, yayın, harcama ve dış işlemler buraya düşer.', 'Agents never send anything out on their own. Commands, posts, spending and external actions land here.'],
  ['ilk kartı onaylar,', 'approves the first card,'], ['reddeder.', 'rejects it.'], ['BEKLEYEN', 'PENDING'], ['Temiz. ☕', 'All clear. ☕'],
  ['Onaylarsan tutar kasadan (defterden) düşer.', 'If you approve, the amount is deducted from the treasury ledger.'], ['Ödemeyi sen kendin yaparsın', 'You make the payment yourself'],
  [', sistem para göndermez.', '; the system never sends money.'], ['Onay = içeriği kendin yayınlayacağın anlamına gelir. Ajan otomatik paylaşım yapmaz.', 'Approve = you will publish it yourself. Agents never post automatically.'],
  ['Onaylarsan bu işlem', 'If you approve, this runs'], ['senin bilgisayarında', 'on your computer'], ['çalışır. Komutu okumadan onaylama. Yıkıcı komutlar kodda zaten engelli.', '. Read the command before approving. Destructive commands are blocked in code.'],
  ['Onay = kampanyayı reklam panelinde', 'Approve = you set up and pay for the campaign'], ['sen kurup ödersin', 'yourself in the ad manager'], ['. Tutar ajanın bütçesinden ve kasadan düşer.', '. The amount comes out of the agent budget and treasury.'],
  ['Cevabın (zorunlu değil)', 'Your answer (optional)'], ['Not (opsiyonel)', 'Note (optional)'], ['Onayla', 'Approve'], ['Reddet', 'Reject'],
  ['denetleniyor…', 'reviewing…'], ['temiz', 'clean'], ['riskli', 'risky'], ['engellendi', 'blocked'], ['onaylandı', 'approved'], ['reddedildi', 'rejected'],
  ['Beklenen getiri:', 'Expected return:'], ['Komut', 'Command'], ['Kurulum', 'Install'], ['Yayın', 'Publish'], ['Harcama', 'Spend'], ['Dış işlem', 'External'],
  ['URL aç', 'Open URL'], ['Soru', 'Question'], ['PC kontrolü', 'PC control'], ['Reklam kampanyası', 'Ad campaign'],
  ['YENİ GÖREV (doğrudan ajana)', 'NEW TASK (direct to agent)'], ['Görev başlığı', 'Task title'], ['Detay: ne bekliyorsun, teslim formatı', 'Details: what you expect, delivery format'],
  ['Görevi ver', 'Assign task'],
  ['Bu ajan artık yok (kovulmuş ve yerine biri gelmiş olabilir).', 'This agent is gone (fired and replaced).'], ['ŞU AN', 'NOW'], ['Can ', 'HP '], ['saatlik yakım', 'hourly burn'],
  ['Yerine yenisi birazdan işe alınacak.', 'A replacement will be hired shortly.'], ['Masasına git', 'Go to desk'], ['Takip et', 'Follow'], ['Kov', 'Fire'], ['Dirilt', 'Revive'],
  ['Yenisini işe al', 'Hire replacement'], ['Bir şey yaz, konuşalım.', "Write something, let's talk."], ['yazıyor…', 'typing…'], ['Ne yapsın?', 'What should they do?'],
  ['Detay / teslim formatı', 'Details / delivery format'], ['AÇIK GÖREVLERİ', 'OPEN TASKS'], ['(öncelik: yüksek)', '(priority: high)'],
  ['Motor zinciri: soldan sağa denenir. Bir sağlayıcının kotası dolunca sıradakine geçilir. Alias (ör.', 'Engine chain: tried left to right. When a provider hits its quota the next one is used. Alias (e.g.'],
  ['ya da', 'or'], ['yazabilirsin.', 'are accepted.'], ['Son kullanılan:', 'Last used:'], ['Henüz teslim yok.', 'No deliverables yet.'],
  ['Puanla → ajanın canı artar/azalır', 'Rate → agent HP goes up/down'], ['Ajanların ürettiği her şey.', 'Everything the agents produced.'],
  ['Puanlaman', 'Your rating'], ['ajanın canını belirler: 1★ = −10, 5★ = +25. Bir teslim gerçek satış getirdiyse', "sets the agent's HP: 1★ = −10, 5★ = +25. If a deliverable made a real sale,"],
  [': ajan +40 can alır, tüm takım +8.', ': the agent gets +40 HP and the team +8.'], ['Bu teslimden gelen gerçek gelir tutarı?', 'Real revenue from this deliverable?'],
  ['Henüz karar yok.', 'No decisions yet.'], ['AYIN ÇALIŞANI:', 'EMPLOYEE OF THE MONTH:'], ['LİDERLİK TABLOSU', 'LEADERBOARD'], ['ANMA DUVARI · KOVULANLAR', 'MEMORIAL · FIRED'],
  ['Henüz kimse kovulmadı. Şimdilik.', 'Nobody fired yet. For now.'], ['Masasında altın kupa var.', 'Has the gold trophy on their desk.'], ['teslim', 'delivered'],
  ['DEMO MODU:', 'DEMO MODE:'], ['Hiç API anahtarı yok, ajanlar şablonla çalışıyor. Aşağıdan', 'No API keys yet, agents run on templates. Add a'],
  ['bir anahtar ekle (en kolayı OpenRouter, Gemini ve Groq). Anahtar sadece bu bilgisayardaki', 'key below (easiest: OpenRouter, Gemini, Groq). Keys are only written to this computer’s'],
  ['dosyasına yazılır.', 'file.'], ['Canlı mod. Kotası dolan motor otomatik soğumaya alınır, ajan zincirdeki sıradaki motora geçer.', 'Live mode. Providers that hit their quota cool down automatically and agents fall back to the next engine.'],
  ['SAĞLAYICILAR', 'PROVIDERS'], ['ucuz / hediye kredi', 'cheap / trial credit'], ['Bugün', 'Today'], ['çağrı', 'calls'], ['soğuma', 'cooldown'],
  ['(kayıtlı, değiştirmek için yaz)', '(saved, type to replace)'], ['Algılanan modeller:', 'Detected models:'],
  ['Ollama çalışmıyor. Kurup', 'Ollama is not running. Install it and run'], ['çalıştır, 5 dakika içinde otomatik algılanır.', '; it is detected within 5 minutes.'],
  ['AJAN MOTOR ZİNCİRLERİ', 'AGENT ENGINE CHAINS'], ["Alias'lar:", 'Aliases:'], ['Eşzamanlı LLM çağrısı', 'Concurrent LLM calls'], ['Tick (sn)', 'Tick (s)'],
  ['Ollama modeli', 'Ollama model'], ['Not: tick ve eşzamanlılık değişikliği sunucu yeniden başlatılınca tam uygulanır.', 'Note: tick and concurrency fully apply after a server restart.'],
  ['Karakterin ofiste WASD ile yürüyen patrondur.', 'Your character is the boss you walk around with WASD.'],
  ['Kasa bir', 'The treasury is a'], ['kayıt defteridir', 'ledger'], ['. Sistem hiçbir banka, kart veya cüzdana bağlanmaz, para göndermez. Ajanlar harcama önerir, onaylarsan ödemeyi sen yaparsın.', '. It never connects to a bank, card or wallet and never sends money. Agents propose spending; if you approve, you pay.'],
  ['GERÇEK SATIŞLAR (LEMON SQUEEZY)', 'REAL SALES (LEMON SQUEEZY)'], ["Lemon Squeezy'deki", 'Your'], ['gerçek satışlar', 'real Lemon Squeezy sales'],
  ['5 dakikada bir okunur ve otomatik gelir olarak kaydedilir. Sadece okuma yapılır. Ürünü bir teslime bağlarsan satış gelince o ajan +40 can alır. İlk bağlantıda geçmiş siparişler sayılmaz.', 'are read every 5 minutes and recorded as revenue automatically. Read-only. Link a product to a deliverable and that agent gets +40 HP per sale. Past orders are skipped on first connect.'],
  ['Lemon Squeezy API anahtarı', 'Lemon Squeezy API key'], ['Bağlı değil. Anahtar: app.lemonsqueezy.com → Settings → API', 'Not connected. Key: app.lemonsqueezy.com → Settings → API'],
  ['(bağlı, değiştirmek için yaz)', '(connected, type to replace)'], ['Bağlı', 'Connected'], ['son senkron', 'last sync'], ['sipariş görüldü', 'orders seen'], ['Senkron', 'Sync'],
  ['teslime bağla', 'link to deliverable'], ['AJAN BÜTÇELERİ', 'AGENT BUDGETS'], ['tahsisli', 'allocated'],
  ['Ajan panelinden "Bütçe ver" ile kasadan pay ayır. Ajanlar sadece kendi bütçeleri kadar harcama ya da reklam önerebilir. Ödemeyi yine sen yaparsın.', 'Use "Give budget" in an agent panel to allocate from the treasury. Agents can only propose spend or ads within their budget. You still make the payment.'],
  ['Henüz kimseye bütçe verilmedi.', 'No budgets allocated yet.'], ['KASAYA BÜTÇE EKLE', 'ADD FUNDS TO TREASURY'], ['Not (ör. reklam bütçesi)', 'Note (e.g. ad budget)'],
  ['GERÇEK GELİR KAYDET', 'RECORD REAL REVENUE'], ['Nereden? (ör. Shopier satışı)', 'From where? (e.g. Gumroad sale)'], ['Hangi teslimden geldi? (ajan ödül alır)', 'Which deliverable? (agent gets rewarded)'],
  ['Gelir kaydet', 'Record revenue'], ['REKLAM KAMPANYALARI', 'AD CAMPAIGNS'],
  ['Kampanyayı yayınlayıp bitirdiysen gerçek sonucu gir. Harcanmayan bütçe kasaya iade olur, satış gelir olur, ajanın ROI\'si hesaplanır.', 'When the campaign is over, enter the real result. Unspent budget is refunded, sales become revenue and the agent ROI is computed.'],
  ['Harcanan', 'Spent'], ['Tıklama', 'Clicks'], ['Satış ₺', 'Sales ₺'], ['tıklama', 'clicks'], ['satış', 'sales'],
  ['Bütçe', 'Budget'], ['Gelir', 'Revenue'],
  ['Simülasyon.', 'Simulation.'], ['Gerçek para yok, hiçbir aracı kuruma bağlanmaz. Penny (CFO) stratejilerini burada sanal sermayeyle dener.', 'No real money and no broker connection. Penny (CFO) tests strategies here with virtual capital.'],
  ['Yatırım tavsiyesi değildir.', 'Not investment advice.'], ["Fiyatlar Yahoo Finance'ten gecikmeli gelir (BIST için .IS: THYAO.IS); erişilemezse simüle edilir.", 'Prices are delayed from Yahoo Finance (use .IS for Borsa Istanbul); simulated if unavailable.'],
  ['SANAL İŞLEM (patron)', 'PAPER TRADE (boss)'], ['SON İŞLEMLER', 'RECENT TRADES'], ['SANAL SERMAYEYİ SIFIRLA', 'RESET VIRTUAL CAPITAL'], ['Yenile', 'Refresh'],
  ['Pozisyon yok', 'No positions'], ['Sanal portföy sıfırlansın mı?', 'Reset the paper portfolio?'],
  ['otonom çalışmaz', 'never runs on its own'], ['. Burada iş verdiğinde bilgisayarındaki Claude Code (', '. When you give it a job here, the Claude Code ('],
  [') workspace içindeki proje klasöründe gerçek geliştirme yapar ve senin Claude kullanım limitinden harcar. Bugün:', ') on your computer does real development in the workspace project folder and uses your Claude quota. Today:'],
  ['Proje klasörü (workspace/…)', 'Project folder (workspace/…)'], ["Claude'u çalıştır", 'Run Claude'], ['Durdur', 'Stop'], ['CANLI ÇIKTI', 'LIVE OUTPUT'], ['Claude masası yok.', 'No Claude desk.'],
  ['HAYATTA KALMA EKONOMİSİ', 'SURVIVAL ECONOMY'], ['Saatlik can yakımı', 'Hourly HP burn'], ['Proaktif iş aralığı (dk)', 'Proactive work interval (min)'],
  ['Kovulanın yerine otomatik işe al', 'Auto-hire a replacement for fired agents'], ['Ofisi duraklat', 'Pause office'], ['Ofisi çalıştır', 'Resume office'],
  ['Duraklatınca ajanlar yeni LLM çağrısı yapmaz ve canları erimez.', 'While paused, agents make no LLM calls and HP does not burn.'],
  ['Tanıtımı tekrar göster', 'Show intro again'], ['Veriler', 'Data in'], ['ajan çıktıları', 'agent output in'],
  ['klasöründe. Kurallar kodda sabittir: gerçek para transferi, gerçek borsa işlemi, hesap açma ve şifre girişi yoktur.', '. Rules are hard-coded: no real money transfers, no real trading, no account creation and no password entry.'],
  ['Ajanların ürettiği her şey burada: fikirler, raporlar, kod, tasarımlar, ürün paketleri. Sadece okunur.', 'Everything the agents produced: ideas, reports, code, designs, product packs. Read-only.'],
  ['Boş klasör', 'Empty folder'], ['ÖNİZLEME', 'PREVIEW'], ['aç ↗', 'open ↗'], ['Yükleniyor…', 'Loading…'],
  ['SEN YOKKEN', 'WHILE YOU WERE AWAY'], ['SAAT', 'HOURS'], ['Ofis çalışmaya devam etti. İşte özet:', 'The office kept working. Summary:'], ['ÖNE ÇIKAN TESLİMLER', 'HIGHLIGHTS'],
  ['Yeni teslim yok.', 'No new deliverables.'], ['Onaylara bak', 'Review approvals'], ['Teslimleri puanla', 'Rate deliverables'], ['Ofise gir →', 'Enter the office →'],
  ['EVE', 'YOU WENT'], ['GİTTİN', 'HOME'], ['Ofis seni beklemiyor: ajanlar çalışmaya devam ediyor. Döndüğünde neler olduğunu göreceksin.', "The office doesn't wait: agents keep working. You'll see what happened when you come back."],
  ['Ofise dön', 'Back to the office'],
  // onboarding
  ['7/24 çalışan 10 yapay zekâ çalışanın var. Tek kural:', 'You have 10 AI employees working 24/7. One rule:'], ['para kazan ya da kovul.', 'make money or get fired.'],
  ['ya da oklarla ofiste yürü,', 'or arrow keys to walk,'], ['ile koş. Bir ajana yaklaşıp', 'to run. Walk up to an agent and press'], ["'ye bas ya da üstüne tıkla.", ' or click them.'],
  ['Motor odasına', 'Go to the Engine room'], ['(sol üst, server rafları) git ya da', '(top left, server racks) or open'], ['menüsünü aç,', 'and add a'],
  ['bir API anahtarı ekle (OpenRouter, Gemini veya Groq). O zamana kadar ofis', 'API key (OpenRouter, Gemini or Groq). Until then the office runs in'],
  ['modunda çalışır.', 'mode.'], ['Boss masanda', 'At your Boss desk'], ['(sağ alt)', '(bottom right) press'], ["ile Max'e hedef ver. Max işi ekibe dağıtır, küçük robot görevleri masalara taşır.", 'to give Max a goal. Max splits the work and a little robot delivers tasks to desks.'],
  ['Dışarı giden her şey', 'Anything going outside lands in'], ["'a düşer. Teslimleri", '. Rate deliverables'], [': puan ajanın canıdır. Gerçek satış olunca', ': rating is HP. When a real sale happens,'],
  ['gelir bağla', 'link revenue'], ['Canı biten ajan kovulur, yerine öncülünün derslerini taşıyan yeni biri gelir.', 'Agents at 0 HP get fired and replaced by a successor who keeps their lessons.'],
  ['Güvenlik: Ajanlar gerçek para göndermez, gerçek borsada işlem yapmaz, hesap açmaz ve şifre girmez. Borsa masası sadece sanal portföydür.', 'Safety: agents never send real money, never trade real stocks, never create accounts or enter passwords. The trading desk is paper only.'],
  ['Motor ekle', 'Add engine'],
  // durum
  ['Boşta', 'Idle'], ['Uyuyor', 'Sleeping'],
  // görev türleri
  ['Satılık ürün', 'Product for sale'], ['Fikir', 'Idea'], ['Rapor', 'Report'], ['Kod', 'Code'], ['Görsel', 'Image'],
  // ipucu satırı
  ['WASD / Oklar: yürü · Shift: koş · E: etkileşim · Tıkla: git/konuş · F: ajanı takip · Tab: görevler · B: hedef · Q: onaylar · 1-0: ajana ışınlan · +/-: yakınlaş · M: harita',
    'WASD / Arrows: walk · Shift: run · E: interact · Click: go/talk · F: follow agent · Tab: tasks · B: goal · Q: approvals · 1-0: jump to agent · +/-: zoom · M: map'],
  ['Ses aç/kapa', 'Sound on/off'], ['Motor durumu', 'Engine status'], ['Kasa (defter bakiyesi)', 'Treasury (ledger balance)'], ['Toplam gerçek gelir', 'Total real revenue'],
  ['Çalışan / uyuyan / kovulan', 'Working / sleeping / fired'], ['Sunucuya bağlanılıyor…', 'Connecting to server…'],
].sort((a, b) => b[0].length - a[0].length);

const exactMap = new Map(Object.entries(EXACT));
// Tek kelimelik girdiler başka kelimelerin içinde eşleşip bozuk çıktı üretmesin ("satışı" → "salesı"):
// boşluk/noktalama içermeyen kısa girdiler sadece tam eşleşmede kullanılır.
for (let i = PHRASES.length - 1; i >= 0; i--) {
  const [a, b] = PHRASES[i];
  if (!/[\s:!…?.,()→>]/.test(a) && a.length < 14) {
    if (!exactMap.has(a)) exactMap.set(a, b);
    PHRASES.splice(i, 1);
  }
}

/** Bir metni seçili dile çevirir (TR ise aynen döner). */
export function tr(str) {
  if (lang === 'tr' || str == null) return str;
  const s = String(str);
  const trimmed = s.trim();
  if (!trimmed) return s;
  if (exactMap.has(trimmed)) return s.replace(trimmed, exactMap.get(trimmed));
  // baş/son emoji ve simgeleri ayırıp çekirdeği dene ("👥 Kişiler", "İndir ↗")
  const m = trimmed.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}.]*)$/u);
  if (m && m[2] && exactMap.has(m[2])) return s.replace(trimmed, m[1] + exactMap.get(m[2]) + m[3]);
  let out = s;
  for (const [a, b] of PHRASES) if (out.includes(a)) out = out.split(a).join(b);
  return out;
}

const ATTRS = ['placeholder', 'title'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
function translateNode(node) {
  if (node.nodeType === 3) {
    const p = node.parentNode;
    if (!p || SKIP.has(p.nodeName)) return;
    const v = tr(node.nodeValue);
    if (v !== node.nodeValue) node.nodeValue = v;
    return;
  }
  if (node.nodeType !== 1 || SKIP.has(node.nodeName)) return;
  for (const a of ATTRS) {
    if (node.hasAttribute?.(a)) {
      const v = tr(node.getAttribute(a));
      if (v !== node.getAttribute(a)) node.setAttribute(a, v);
    }
  }
  if (node.nodeName === 'BUTTON' && node.value) node.value = tr(node.value);
  for (const c of node.childNodes) translateNode(c);
}

export function initI18n() {
  document.documentElement.lang = lang;
  if (lang === 'tr') return;
  translateNode(document.body);
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
      else for (const n of m.addedNodes) translateNode(n);
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // prompt/confirm metinleri
  const P = window.prompt.bind(window);
  const C = window.confirm.bind(window);
  window.prompt = (m, d) => P(tr(m), d);
  window.confirm = (m) => C(tr(m));
}
