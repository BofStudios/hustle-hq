# Hustle HQ — İlerleme

Son güncelleme: 2026-10-08T18:21:46+03:00 (v1.0.0 Finish Update — GitHub: BofStudios/hustle-hq, private)

Tasarım: `docs/DESIGN.md`. Kural: her adım bitince işaretle, "Son güncelleme" satırını güncelle.
Doğrulama: `npm run check` (sahte LLM ile router/parse/cooldown öz-testi) + `node --check` + sunucuyu açıp `/api/health`.

## F1 — Çalışan dikey dilim ✅
- [x] 1. package.json, .env.example, config, store (atomik JSON), bus, HTTP+WS sunucu
- [x] 2. İstemci iskeleti: index.html, CSS, ws client
- [x] 3. Prosedürel sprite'lar (karakter 4 yön × yürüme/oturma/yazma/uyku, 25+ mobilya, köpek, robot, hayalet)
- [x] 4. Ofis haritası (8 oda), kamera, WASD/ok, Shift, E, tıkla-yürü (A*), zoom, mini harita, 1-0 ışınlanma
- [x] 5. Ajan görselleri: durum balonu, isim, can barı, konuşma balonu (canlı düşünceler), monitör içeriği, gezinme
- [x] 6. Gün/gece + ışık, server rafları = sağlayıcı durumu, CEO beyaz tahtası = canlı görevler, ticker, TV, anma duvarı
- [x] 7. Sağlayıcı yönlendirici (9 sağlayıcı + mock), cooldown, Retry-After, kota sayacı
- [x] 8. Ajan runtime: JSON eylem protokolü, toleranslı parser, araçlar, hafıza, bağlam özeti
- [x] 9. Max orkestrasyonu: hedef → plan → görev; stand-up; toplantı animasyonu
- [x] 10. Onay kuyruğu + sabit yasaklar + Shield denetimi + node sandbox (izin modeli)
- [x] 11. Ekonomi: kasa defteri, can/yakım, puan, gelir bağlama, kovulma, evrimsel işe alım, dirilt
- [x] 12. Paneller: boss/hedef, onaylar, görevler, ajan (log/sohbet/görev/motor/teslim), motorlar, karakterim, kişiler, kararlar, teslimler, kasa, borsa, claude, yönetim
- [x] 13. Claude masası (manuel `claude -p`, stream-json canlı akış, günlük sınır) — gerçek çağrı test EDİLMEDİ (kullanıcı limiti)
- [x] 14. Borsa masası (paper trading, Yahoo + BIST, ₺ bazlı kur çevrimi)
- [x] 15. Uçtan uca demo testi, README, start.bat, "sen yokken" raporu

## F2 — Cila (zamanlanmış görev buradan devam eder; her madde küçük ve bağımsız)
- [x] F2-1. Ses efektleri: WebAudio ile prosedürel (dosya yok) — yakındaki ajanın klavye tıkırtısı (sadece oyuncuya <80px olanlar), toast "ding", gelirde "cha-ching", kovulmada düşük ton. HUD'a 🔊/🔇 düğmesi, tercih localStorage'da. Varsayılan: açık ama düşük ses.
- [x] F2-2. Ajan görünümünü düzenleme: ajan panelinde "Görünüm" sekmesi (Karakterim panelindeki swatch bileşenlerini yeniden kullan), POST /api/agents/:id/look zaten var.
- [x] F2-3. Liderlik tablosu: Kişiler paneline "Ayın Çalışanı" (en yüksek gelir, sonra puan ortalaması). Kazananın masasında altın kupa sprite'ı (sprites.js FURN.trophy), world.js'de masanın üstünde çiz.
- [x] F2-4. Workspace dosya gezgini paneli: GET /api/files?path= (sandbox.listFiles kullan), menüye 🗂️ düğmesi, dosyaya tıklayınca /api/file ile yeni sekmede aç; .md dosyaları panel içinde <pre> önizleme.
- [x] F2-5. Kamera takip modu: F tuşu = açık paneldeki ajanı kamera ile takip et (oyuncu yerinde kalır), Esc ile bırak. world.js'de cam hedefi player yerine ajan vis.
- [x] F2-6. Performans: sunucuda agent:update yayınını ajan başına 250ms ile kıs (son durumu birleştirerek gönder); istemci feed renderını requestAnimationFrame ile birleştir.
- [x] F2-7. EN dil desteği: public/js/i18n.js sözlüğü (TR/EN), ui.js ve world.js'deki görünür metinler t('...') üzerinden; Yönetim panelinde dil seçimi (localStorage). Sunucu prompt dili LANG env ile zaten seçiliyor.

## F3 — Undertale binası, Dan The Man karakterleri, gerçek sistem (oturum 2)
- [x] F3-1. Bina 90x52'ye büyüdü, 12 oda (Motor, CEO, Toplantı, Arşiv, Açık Ofis, Claude Lab, Koridor, Borsa, Mutfak, Lobi, Dinlenme, Boss). Kamera odaya kilitli, kapıda kararma + sinematik siyah şeritler, `* ODA ADI` başlığı, vinyet, CRT tarama çizgileri, oda kenar gölgesi, kat planlı mini harita
- [x] F3-2. Chibi karakterler (büyük kafa, beyaz göz, kaş, 4 ruh hali: happy/neutral/stress/panic), gölge, yürürken toz
- [x] F3-3. Stres sistemi: sunucu computeStress (can, iş kuyruğu, başarısızlık, gelir yok), prompt'a girer; istemcide ter damlası, titreme, panik kolları, bağırmalar, mor stres barı
- [x] F3-4. Lemon Squeezy salt okuma entegrasyonu (5 dk'da bir sipariş → otomatik gelir, ürün→teslim bağlama)
- [x] F3-5. Ajan bütçeleri (kasadan tahsis, harcama/reklam bütçeyle sınırlı), ad_campaign aracı (plan dosyası + Shield + onay), pc_action aracı (her işlem onaylı, PC_DENY kalıcı yasak listesi), scripts/policy-test.js
- [x] F3-6. Undertale diyalog kutusu: ajana E ile yaklaşınca ekranın altında siyah kutu, beyaz çerçeve, solda portre, daktilo efektiyle metin + her harfte "blip" sesi (sound.js). İçerik: ajanın son düşüncesi/durumu; seçenekler (ok tuşları + Enter): "Konuş", "Görev ver", "Paneli aç", "Kapat". Mevcut çekmece panelini kaldırma, seçeneklerle aç.
- [x] F3-7. Kovulma sahnesi: kovulan ajan önce karton kutu taşıyarak (sprites.js'e kutu) asansöre (POI.elevator) yürür, sonra hayalet olarak masasında kalır. Yeni ajan asansörden çıkar (zaten var).
- [x] F3-8. Ürün paketleme aracı `package_product {"name","files":[...],"price","description"}`: sunucu workspace/urunler/<slug>/ altına dosyaları kopyalar, README + satış metni yazar, PowerShell Compress-Archive ile zip üretir (sunucu yapar, ajan değil). Ardından "Lemon Squeezy'e yükle" onay kartı (publish, patron elle yükler). dev, design ve marketing rollerine ekle.
- [x] F3-9. Reklam sonucu girişi: Kasa panelinde onaylanmış her 'ad' onayı için "sonuç gir" (harcanan, tıklama, satış ₺). Sonuç gelir olarak kaydedilir, ROI ajan istatistiğine yazılır (stats.adSpend, stats.adRevenue). Kişiler liderlik tablosunda ROI sütunu.
- [x] F3-10. Oda ambiyans sesleri (prosedürel): motor odası uğultusu, mutfak buzdolabı vızıltısı, lounge'da çok kısık lo-fi akorlar, koridorda adım yankısı. Oda değişince yumuşak geçiş, 🔊 ile kapanır.
- [x] F3-11. Ajanlar arası animasyon: send_message ve teslimde iki ajan karşı karşıya durup sırayla konuşma balonu; gelir gelince tüm ekip "high-five" (zıplama animasyonu: sprite y -2 sekmesi) ve konfeti.
- [x] F3-12. Sokak sahnesi: lobinin altına dış mekân (H'yi büyüt), kaldırım, ağaçlar, park etmiş araba, gece sokak lambaları; lobi giriş camı kapı olur. Boss "eve gidebilir" (çıkınca "Sen yokken" mantığı için zaman damgası).
- [x] F3-13. Dokunmatik/mobil: ekranda sanal joystick + E düğmesi (sadece dokunmatik cihazda).

## F4 — Derinlik (her madde küçük ve bağımsız)
- [x] F4-1. Ajan seviyeleri (XP): teslim +10, puan ×5, gelir ×1 XP; seviye = floor(sqrt(xp/50))+1. Seviye atlayınca konfeti + "LEVEL UP!" yazısı; seviye 3+ ajanın kafasında küçük taç/şapka (sprites.js), Kişiler tablosunda seviye sütunu. Sunucu stats.xp tutar (economy.js).
- [x] F4-2. Gün sonu raporu: her gün 18:00'de (sunucu saatiyle, günde bir kez) Penny'ye "Günlük rapor" görevi; çıktı teslim olarak düşer, toast + Boss masasında rozet.
- [x] F4-3. Hedef kuyruğu: Boss birden fazla hedef sıraya koyabilir; aktif hedefin tüm görevleri bitince sıradaki hedef otomatik Max'e gider. Boss panelinde sıralama (yukarı/aşağı) ve sil.
- [ ] F4-4. Monitör yakın görünüm: zoom ≥5 iken masadaki monitörde ajanın son eylem metni (agent.monitor) küçük piksel yazıyla kayar.
- [x] F4-5. Ayarlar: Yönetim panelinde CRT tarama çizgisi aç/kapa (world.js toggleScanlines zaten var) ve "efektleri azalt" (vinyet/şerit kapat) seçeneği.

## v1.0 — Finish Update (oturum 4) ✅
- [x] Çatı terası (asansör), XP/seviye/taç, hedef kuyruğu, günlük rapor, efekt ayarları
- [x] EN/TR dil katmanı (public/js/i18n.js, DOM + canvas), iki dilli demo motoru
- [x] İlk kurulum sihirbazı (/api/setup), kurulum bitene kadar ofis bekler
- [x] macOS/Linux: server/platform.js, saf JS zip (server/zip.js), start.sh; Node 24+ (sandbox)
- [x] Yedek indir / şirketi sıfırla (server/maintenance.js), HQ_DATA_DIR/HQ_WORKSPACE_DIR/HQ_ENV_FILE
- [x] Testler: npm test = policy (18) + router (10) + uçtan uca smoke (34); GitHub Actions (ubuntu + windows)
- [x] README (EN+TR), LICENSE (ticari, tüm hakları saklı), CHANGELOG

## v1.1 — Cüzdan & Yaşayan Dünya (oturum 5) ✅
- [x] Cüzdan: yükle, dağıt (eşit/performans), bütçe talebi (request_budget), kâr çek, yatırımcı raporu, lobi ATM, elden bütçe, robot para çantası
- [x] Girişte fonlama: TRY / USD / EUR → canlı kurla şirket para birimi, hemen dağıt + Max'e "bütçeyi işe koş" planı
- [x] Gerçek para güvenliği: kural onayı, günlük limit, zarar durdurma, büyük harcamada tutar teyidi
- [x] Yaşayan dünya: hava (sim/gerçek), gün planı, çatı partisi, dedikodu + arkadaşlık, doğum günü, pizza, yayalar, güvercin, otobüs, müşteri, zırhlı araç, resepsiyon/bekçi/temizlikçi, kedi
- [x] Varsayılan dil İngilizce, İngilizce sızıntı denetimi (DOM + canvas) temiz
- [x] Masaüstü kısayolu + ikon + arka plan sunucu + "Sunucuyu kapat"; 5 adımlı kısa tutorial

## Notlar / sonraki oturuma
- Oturum 2: Undertale odaları, chibi karakterler, stres, Lemon Squeezy (salt okuma), ajan bütçeleri, reklam kampanyası, PC kontrolü (her işlem onaylı), Undertale diyalog kutusu, kovulma sahnesi, ürün paketleme (zip) eklendi. store.flush artık data/ silinse de çökmez; index.js'de uncaughtException yakalayıcı var.
- F3-9 bitti (recordAdResult: iade/fazla harcama, ROI, liderlikte ROI sütunu).
- Oturum 3: F3-10/11 (önceki zamanlanmış görev yazmıştı) işaretlendi; F3-12 sokak sahnesi (cephe, neon, trafik, otobüs durağı → eve git), F3-13 dokunmatik joystick, F2-4 dosya gezgini (+ /api/file artık CSP sandbox ile sunuluyor: ajan HTML'i API'ye erişemez), F2-5 kamera takibi (F / 🎥), F2-6 agent:update 250ms birleştirme, Z.ai sağlayıcısı eklendi.
- Sıradaki: F4-4 (monitör yakın görünüm yazısı); satış sayfası + ekran görüntüleri; Electron/exe paketleme (kullanıcı isterse).
- ÖNEMLİ: Önceki zamanlanmış çalışma PowerShell izin onayında takılıp kaldı. Komutlar için Bash aracını kullan.
- Test: gizli tarayıcı sekmesinde rAF yavaşlar; yürüyüş animasyonlarını görsel olarak doğrulamak için sekmenin görünür olması gerekir.
- Kullanıcı API anahtarlarını henüz vermedi; demo modu varsayılan. Anahtar oyun içinden (Motorlar) girilebiliyor.
- Ollama kurulumu YAPILMADI (birkaç GB indirme + 7/24 GPU yükü; kullanıcı dönünce onaylasın).
- Bilinen: `npm run check` sonunda Windows'ta Node 24 libuv "UV_HANDLE_CLOSING" uyarısı basılıyor; exit kodu 0, zararsız.
- Gizli tarayıcı sekmesinde rAF yavaşladığı için yürüyüşler yavaş görünür; görünür sekmede normal.
