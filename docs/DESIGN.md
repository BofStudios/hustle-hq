# Hustle HQ — Tasarım Belgesi (v1, 2026-10-06)

> Çalışma adı. "Dunder Mifflin", "The Office", "Transformers" gibi markaları **kullanmıyoruz**:
> ürünü satacağız, telifli/ticari marka isimleri ürünü yayından kaldırtır. Tüm karakterler,
> isimler ve pikseller orijinal.

## 1. Ürün tek cümlede

**Yön tuşları/WASD ile gezilen pixel-art bir ofis; içinde 7/24 çalışan 10 yapay zekâ çalışanı
var, sen patronsun. Ofisin tek amacı para kazanmak: para getirmeyen ajanın canı azalır, sıfırlanınca
"kovulur" ve yerine öncekinin derslerini devralan yeni bir ajan işe alınır.**

Ekrandaki her şey gerçek bir sürecin görselleştirmesi:
- Bir ajan masasında yazı yazıyorsa arkada gerçekten bir LLM çağrısı akıyordur. Monitördeki satırlar o çağrının çıktısıdır.
- Ajan başka bir ajanın masasına yürüyorsa gerçekten ona bir görev ya da mesaj teslim ediyordur.
- Ajan kanepede uyuyorsa sağlayıcının kotası bitmiştir (429) ve cooldown'dadır.
- Server odasındaki raf ışıkları sağlayıcıların canlı durumunu gösterir (yeşil, sarı veya kırmızı).
- CEO odasındaki beyaz tahta gerçek görev listesidir.

## 2. Rakipler ve farkımız

| Ürün | Ne yapıyor | Eksiği |
|---|---|---|
| a16z AI Town | Sohbet eden ajanlardan bir kasaba simülasyonu | İş üretmiyor, oyuncu patron değil, para yok |
| pixel-agents (VS Code eklentisi) | Claude Code oturumlarını pixel karakter olarak gösterir | Sadece görselleştirme, orkestrasyon ve ekonomi yok |
| Instagram'daki "AI office" (ekran görüntüleri) | Michael orkestratör ve departmanlar | Kapalı ürün, ücretli modellere bağlı |
| Türk "Transformers HQ" videosu | Birden fazla HQ, motor değiştirme, kararlar ve teslimler | Ücretsiz modellerle çalışmıyor, hayatta kalma ekonomisi yok |

**Bizim farkımız:**
1. **%100 ücretsiz çalışır.** OpenRouter `:free` modelleri, Gemini, Groq, DeepSeek, Kimi, Qwen, GLM, SiliconFlow ve Ollama arasında otomatik geçiş yapılır. Bir sağlayıcının kotası bitince ajan diğerine geçer. Hiçbir sağlayıcı yoksa **demo modu** ofisi canlı tutar.
2. **Hayatta kalma ekonomisi:** can barı, kasa, runway, ölüm ve evrimsel işe alım. Bu hem oyunu bağımlılık yapan şeye çevirir hem de ajanları gerçekten sonuca iter.
3. **Patron olarak oynarsın:** WASD ile yürür, masaya gidip `E` ile konuşur, iş verir, kovar, işe alırsın.
4. **Onay kuyruğu:** Dışarıya giden her şey (paylaşım, mail, yayın, harcama, silme) Boss masasına kart olarak düşer. Ürün güvenli olduğu için satılabilir.
5. **Yerel:** Veri senin diskinde kalır, `npm start` ile çalışır. İleride Electron ile exe yapılabilir.

## 3. Ofis haritası

Ana bina katı yaklaşık 60×40 karodan oluşur, karolar 16 px ve 3× ölçekle çizilir. Odalar:

```
+--------------------------------------------------------------+
| SERVER ODASI | CEO CAM OFİSİ (Max)      | TOPLANTI ODASI      |
| (sağlayıcı   | beyaz tahta = canlı      | (stand-up, toplu    |
|  rafları)    | görev listesi            |  karar)             |
|--------------+-----------+--------------+---------------------|
|  AÇIK OFİS: 3x3 masa grubu                                    |
|  [Fikir] [Araştırma] [Developer]                              |
|  [Tasarım] [Pazarlama] [Reklam Denetim]                       |
|  [QA] [CFO/Analist] [Claude (on-call)]                        |
|---------------------------------------------------------------|
| BORSA MASASI   | MUTFAK / KAHVE | LOUNGE (kanepe, köpek) | BOSS|
| (paper trade,  | (mola animas.) | (kota bitince uyuma)   |MASASI|
|  ticker ekr.)  |                |                        |(sen) |
+--------------------------------------------------------------+
```

Ortam detayları: pencerelerde gerçek saate bağlı gün döngüsü (gün batımı, gece şehir ışıkları), bitkiler,
dosya dolapları, su sebili, motivasyon posterleri ("GOOD IDEAS DON'T SLEEP" gibi, TR/EN), patron
kupası, uyuyan köpek ve mesaj taşıyan küçük robot "Router".

**Çoklu HQ (v2):** Her "şirket" ayrı bir kat olur. Asansörden ya da haritadan geçilir. Her katın kendi
kasası ve hedefi vardır (ör. "E-ticaret HQ", "İçerik HQ").

## 4. Kadro (10 ajan)

| # | Ad | Rol | Varsayılan motor zinciri | Araçlar |
|---|---|---|---|---|
| 1 | **Max** | Orkestratör / Genel Müdür | DeepSeek V3 → Kimi K2 → Gemini Flash | görev oluşturma ve atama, rapor, Boss'a eskalasyon |
| 2 | **Nova** | Fikir Avcısı (sadece fikir) | Gemini Flash → Qwen → Llama | web arama, fikir defteri |
| 3 | **Atlas** | Araştırmacı | Gemini Flash → DeepSeek | web arama, sayfa okuma, rapor yazma |
| 4 | **Byte** | Developer | Qwen3 Coder → DeepSeek → Kimi | dosya yazma/okuma, shell (allowlist), proje iskeleti |
| 5 | **Claude** | Senior Mimar (**sadece sen çağırınca**) | `claude -p` (senin Claude Code'un) | workspace'de tam geliştirme |
| 6 | **Pixel** | Grafik Tasarımcı | Gemini → Qwen | SVG/HTML tasarım, Pollinations (ücretsiz görsel) |
| 7 | **Echo** | Pazarlamacı | Kimi → DeepSeek → Llama | metin, sosyal medya taslakları, SEO |
| 8 | **Shield** | Reklam ve İçerik Denetçisi | GLM-4-Flash → Gemini | dışarı giden her içeriği politika, iddia ve spam açısından denetler |
| 9 | **Lint** | QA / Reviewer | DeepSeek → Qwen Coder | kod inceleme, test çalıştırma |
| 10 | **Penny** | CFO / Analist + Borsa Masası | DeepSeek R1 → Gemini | kasa, ROI, runway raporu, sanal portföy |

Router robotu ve köpek ajan değil, maskot ve görselleştirme amaçlı.
"Motoru değiştir" menüsünden her ajanın motor zinciri değiştirilebilir.
"Karakterim" menüsünden patron karakterinin saçı, teni ve kıyafeti seçilir.

## 5. Ekonomi: "Para kazan ya da öl"

- **Kasa (₺/$):** Boss "Yönetim → Kasaya para ekle" ile bütçe tanımlar. Bu bir **kayıt defteri**, sistem hiçbir hesaba bağlanmaz. Harcama önerisi onaylanırsa ödemeyi Boss kendisi yapar, defterden düşülür.
- **Gelir:** Boss "Gelir kaydet" ile gerçek satışı girer ve hangi teslimden geldiğini işaretler. v2'de Lemon Squeezy/Gumroad webhook ile otomatik.
- **Can (HP 0-100):** Her ajan için:
  - Zamanla azalır (burn: saatte −2, "maaş").
  - Her LLM çağrısında token maliyeti kadar düşer (ücretsiz olsa da sanal maliyet).
  - Teslimi Boss onaylayınca/puanlayınca artar (1-5 yıldız → +5..+25).
  - Teslimi gerçek gelire bağlanınca büyük artış alır (+40 ve "Ayın Çalışanı" kupası).
- **Runway:** kasa / günlük yakım. Ekranın üstünde sürekli görünür ve prompt'lara enjekte edilir ("Şirketin 3 günlük ömrü kaldı").
- **Ölüm ve evrim:** HP 0 olunca ajan gri hayalete döner, masası boşalır ve masaya "KOVULDU" tabelası konur. Max ve Penny kısa bir "işten çıkış raporu" yazar (neden başarısız oldu?). Ardından yeni ajan aynı rolde işe alınır: yeni ad, mutasyona uğramış prompt stratejisi ve önceki ajanın dersleri hafızada. Boss isterse ajanı **diriltebilir**.
- **Kararlar sekmesi:** Max'in aldığı önemli kararlar (hangi fikre gidildi, hangi ajan kovuldu, harcama) gerekçesiyle listelenir.
- **Teslimler sekmesi:** Ajanların ürettiği her şey (dosya, rapor, tasarım, kod) önizleme, puan ve "gelirle eşle" butonuyla listelenir.

### Borsa masası (Paper Trading)
- Penny'nin masasında bir ticker ekranı var. Fiyatlar Yahoo Finance'ten gelir (ücretsiz ve gecikmeli; BIST için `.IS` uzantısı, ör. THYAO.IS). Yedek kaynak stooq, o da erişilemezse simülasyon kullanılır.
- Sanal sermaye ₺ cinsindendir. USD fiyatlar canlı `USDTRY=X` kuruyla çevrilir.
- **Sanal** portföy: Boss sanal sermaye tanımlar, Penny strateji yazar, al-sat kararlarını gerekçesiyle kaydeder, P/L gerçek fiyatlarla hesaplanır.
- **Gerçek işlem yok.** Hiçbir brokera bağlanmaz. UI'da açıkça "Simülasyon, yatırım tavsiyesi değildir" yazar. Bu hem yasal hem güvenlik zorunluluğu.

## 6. Ajan çalışma motoru

```
Boss hedef verir ──► Max (plan) ──► görevler (tasks.json)
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
       Nova (fikir)          Atlas (araştırma)     Byte (kod) ...
            │ teslim (deliverable) + mesaj
            ▼
       Shield denetimi (dışarı gidecekse) ──► Onay kuyruğu ──► Boss
            ▼
       Max ilerlemeyi takip eder, tıkananı Boss'a eskale eder
```

- **Zamanlayıcı:** Her ajan kendi döngüsünde çalışır (yaklaşık 20-60 sn tick). Görevi yoksa
  rolüne uygun "proaktif iş" yapar: Nova fikir, Penny rapor, Max stand-up. Aynı anda en fazla N LLM
  çağrısı çalışır (varsayılan 3), böylece ücretsiz kotalar korunur.
- **Protokol:** Ücretsiz modellerin tool-calling desteği tutarsız olduğu için **JSON eylem protokolü**
  kullanılır. Model `{"thought": "...", "action": "tool_adı", "args": {...}}` döndürür. Ayrıştırıcı toleranslıdır
  (kod bloğunu soyar, ilk JSON nesnesini bulur). Bir görev en fazla K adım sürer, ardından `finish` ile
  teslim edilir.
- **Araçlar:** `web_search`, `read_url`, `write_file`, `read_file`, `list_files`, `run_command`
  (allowlist, değilse onaya düşer), `generate_image` (Pollinations), `send_message`, `create_task`
  (yalnızca Max), `request_approval`, `propose_spend`, `paper_trade` (yalnızca Penny), `note` (kalıcı hafıza), `finish`.
- **Hafıza:** Her ajanın `memory.md` dosyası (dersler, notlar) ve son 20 olayı tutulur. Kovulan ajanın dersleri halefine aktarılır.
- **Sağlayıcı yönlendirici:** Tümü OpenAI uyumlu `/chat/completions` üzerinden konuşur:

| Sağlayıcı | Base URL | Ücretsiz durum |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | `:free` modeller (DeepSeek, Kimi K2, Qwen3, Llama, GLM) |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | AI Studio ücretsiz kota |
| Groq | `https://api.groq.com/openai/v1` | ücretsiz katman |
| DeepSeek | `https://api.deepseek.com/v1` | çok ucuz, kayıtta bazen hediye kredi |
| Moonshot (Kimi) | `https://api.moonshot.ai/v1` | hediye kredi |
| Qwen (DashScope intl) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | ücretsiz kota |
| Zhipu GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` ücretsiz |
| SiliconFlow | `https://api.siliconflow.cn/v1` | ücretsiz Qwen/GLM modelleri |
| Ollama | `http://localhost:11434/v1` | lokal, sınırsız |
| Mock | — | demo, anahtar gerekmez |

  429 veya 5xx gelince sağlayıcı üstel cooldown'a girer ve zincirdeki sıradaki denenir. Hepsi düşerse ajan
  "uyur". Günlük istek sayaçları `data/usage.json` dosyasında tutulur.
- **Claude masası:** Otonom değildir. Boss masaya gidip `E` → "Claude'a iş ver" der. Sunucu workspace'deki
  proje klasöründe `claude -p "<görev>" --output-format stream-json` başlatır ve çıktı canlı olarak monitöre ve log
  paneline akar. Günlük çağrı sayacı da gösterilir.

## 7. Güvenlik ve onay kuyruğu

**Ajanların serbestçe yapabildikleri:** `workspace/` içinde dosya okuma/yazma, `node` (Node 24 izin modeliyle
`--permission --allow-fs-read/write=workspace` ile hapsedilir: workspace dışına dosya erişimi ve alt süreç yoktur),
`git status/diff/log/init/add/commit`, `dir`, `ls`, `type`, `echo` ve web'den okuma (localhost ve özel ağ adresleri hariç).
`python`, `npm run` ve `npm install` keyfi kod çalıştırabildiği için onaya düşer.

**Onaya düşenler (Boss masasında kart):** allowlist dışı komutlar, `npm install` ve `pip install`,
workspace dışına erişim, dosya silme, dışarı içerik gönderme (paylaşım, mail, yayın), harcama
önerileri ve URL veya uygulama açma.

**Her durumda yasak (kodda sabit):** para transferi, gerçek alım-satım, hesap açma, şifre ve kart
girme, CAPTCHA aşma, spam, sahte yorum ve kimlik taklidi. Shield bunları içerik düzeyinde de reddeder.

Her onay kartında şunlar yer alır: kim istedi, ne yapılacak, neden, beklenen getiri ve Shield'ın notu. `Y` ile onaylanır, `N` ile reddedilir.

## 8. Arayüz

- **Kontroller:** WASD veya ok tuşları yürür, Shift koşar. `E` yakındaki ajan veya nesneyle etkileşir.
  `Tab` görev panosunu, `M` haritayı, `B` Boss konsolunu açar (hedef ver). `Esc` paneli kapatır.
  `1-0` ile ajana ışınlanılır. Mouse ile karaktere tıklanabilir.
- **Üst menü:** Hedef Ver · Motoru Değiştir · Karakterim · Kişiler · Kararlar · Teslimler · Onaylar (sayaçlı) · Kasa · Borsa · Yönetim/Ayarlar.
- **HUD:** kasa, runway, gün/saat, aktif görev, çalışan/uyuyan sayısı, sağlayıcı ışıkları.
- **Dünyada:** Her ajanın başında durum balonu (💬, ⚙, 📄, 💤, ❗), altında isim etiketi ve can barı. Monitör durumuna göre farklı içerik gösterir (kod, grafik, belge veya terminal).
- **Ajan paneli:** portre, rol, motor, can, şu anki görev, canlı log (terminal görünümü), sohbet kutusu, "iş ver", "kov" ve "dirilt" butonları.
- **Dil:** TR ve EN (i18n sözlüğü). Satış için EN de hazır olur.

### Canlılık detayları (uygulandı)
- Max plan veya stand-up başlatınca uyanık ekip toplantı odasına yürür ve masanın etrafına toplanır.
- Router robotu yeni görevleri ilgili masaya zarfla taşır. Köpek, patron yaklaşınca uyanıp onu takip eder.
- "Sen yokken" raporu: 10 dakikadan uzun aradan sonra tamamlanan görevler, teslimler, gelir ve kovulanlar gösterilir.
- Gece/gündüz gerçek saate bağlıdır. Gece monitör, lamba ve tavan ışıkları ışık havuzu bırakır.

## 9. Teknik mimari

- **Sunucu:** Node 24 (ESM). Bağımlılık olarak yalnızca `ws` kullanılır. Statik dosya, REST (`/api/*`) ve WebSocket (`/ws`) sunar.
- **Veri:** `data/*.json` dosyaları atomik yazılır (tmp + rename). Loglar `data/logs/*.jsonl`. Ajan çıktıları `workspace/`.
- **İstemci:** Saf Canvas 2D motoru, build adımı yok. Tüm pixel art **prosedürel** üretilir (palet + piksel
  matrisleri), harici asset ve telif riski yoktur. Sprite'lar başlangıçta offscreen canvas'a bir kez çizilip önbelleğe alınır.
- **Senkron:** Sunucu otoriterdir (ajan durumu, görevler). İstemci ajanların *görsel* hareketini kendisi yapar:
  sunucudan "Byte → Lint masasına git" olayı gelince yol bulmayı (A*) istemci çalıştırır.
- **WS mesajları:** `snapshot`, `agent:update`, `agent:log`, `task:update`, `approval:new`, `ledger:update`,
  `walk` (görsel), `toast`.

## 10. Yol haritası

- **F1 (bu oturum):** sunucu, veri, WS; ofis haritası, sprite'lar, yürüme, çarpışma ve kamera; 10 ajan
  ve animasyonları; demo modu; sağlayıcı yönlendirici; ajan döngüsü ve araçlar; onay kuyruğu; ekonomi
  (HP, ölüm, işe alım); paneller; Claude masası; paper trading.
- **F2:** Lemon Squeezy webhook ile otomatik gelir, çoklu HQ ve asansör, karakter editörü, sesler, Playwright ile tarayıcı aracı (onaylı).
- **F3 (satış):** Electron paketleme ve lisans anahtarı (Lemon Squeezy lisans API), açılış sayfası, tanıtım videosu, EN çeviri.


## 11. v1.0 — Finish Update (2026-10-08)

- **Sahne yapısı:** 14 sahne (12 iç oda + sokak + çatı). Simülasyon tek global ızgarada, render sadece bulunulan odayı çizer. Çatı, binadan kopuk bir bölgedir ve sadece oyuncu asansörle gider.
- **Dil:** Kaynak dil Türkçe. `i18n.js` İngilizce seçiliyse DOM'u (MutationObserver) ve canvas metinlerini sözlükle çevirir. Sunucu tarafı `LANG` ile prompt dilini ve demo içeriğini seçer.
- **Satışa hazırlık:** kurulum sihirbazı, çapraz platform desteği, yedekleme ve sıfırlama, uçtan uca test, ticari lisans.
- **Değişmezler (aynen geçerli):** gerçek para hareketi yok, gerçek alım-satım yok, hesap açma ve şifre girişi yok, dışarıya giden her iş onaylı, PC kontrolü işlem başına onaylı, ajan dosyaları CSP sandbox'ta, Claude otonom değil.
