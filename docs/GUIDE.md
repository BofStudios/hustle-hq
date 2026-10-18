# 🏢 Hustle HQ — Full guide

**A pixel-art AI office you walk around in.** Ten AI employees work around the clock in a building you explore room by room like an RPG. You are the boss. One rule: **make money or get fired.**

**WASD ile gezilen pixel-art bir yapay zekâ ofisi.** On yapay zekâ çalışanı, oda oda keşfettiğin bir binada 7/24 çalışır. Patron sensin. Tek kural: **para kazan ya da kovul.**

> 🇹🇷 Türkçe kurulum ve kullanım için aşağıya, [Türkçe](#-türkçe) bölümüne geç.

---

## ✨ What you get

- **A real building to explore**: 14 scenes (engine room, CEO office, meeting room, archive and memorial, open office, Claude R&D lab, hallway, trading desk, kitchen, lobby, lounge, boss office, street and rooftop). Doors fade to black with cinematic bars and an Undertale-style `* ROOM NAME` title. The elevator goes to the rooftop.
- **Ten AI employees with jobs**:
  - Max: CEO and orchestrator
  - Nova: ideas
  - Atlas: research
  - Byte: developer
  - Pixel: design
  - Echo: marketing
  - Shield: ad and content compliance
  - Lint: QA
  - Penny: CFO and paper-trading desk
  - Claude: an on-call architect that runs only when you call it

  Give Max a goal, and he splits it into tasks. A little robot carries tasks to desks, the team meets in the meeting room, and work shows up as real files.
- **Everything on screen is real.** Monitors show what an agent is doing right now. Speech bubbles are their actual thoughts. Server-rack lights are your AI providers' live status. The whiteboard is the real task list.
- **Survival economy.** HP drains over time. Your ratings and real revenue keep agents alive. Stressed agents sweat, shake and panic. At 0 HP an agent packs a cardboard box, walks to the elevator, and a successor who keeps their lessons takes the desk. Agents earn XP, level up and get crowns.
- **Free AI**: OpenRouter (free DeepSeek, Kimi, Qwen, GLM and Llama), Google Gemini, Groq, Z.ai GLM, SiliconFlow, DeepSeek, Moonshot, Qwen DashScope and local Ollama. When one provider hits its quota, agents fall back to the next. With no keys at all, the office runs in **DEMO mode** so you can try everything first.
- **A real business layer, and you stay in control**:
  - Real sales from **Lemon Squeezy** are imported automatically (read-only).
  - Agents package sellable products as zip files, write ad campaigns and propose spending within the budgets you allocate.
  - Every action that leaves the office goes to your **approval queue** first: posting, spending, installs, risky commands and PC control.
- **Strategy engine (v1.2)**: the agents decide *how* to make money. Tell them about yourself (skills, hours, accounts you have) and Max picks 1-3 legal strategies such as freelance services, a video channel, affiliate content, digital products, local business services or a micro-SaaS. The team works on them, your identity-bound steps become to-dos, and strategies that earn nothing are dropped for new ones. Track income per strategy and payouts to your IBAN.
- **Wallet and funding (v1.1)**: on every launch Hustle HQ asks how much you are putting in. Choose **TRY, USD or EUR**; it is converted to your company currency at the live exchange rate and can be split across the team by performance right away. Top up at the lobby **ATM**, hand budgets to agents in person (walk up, **E → Budget**), approve their budget requests, withdraw profit, and track invested capital, payback and ROI per agent.
- **A living world (v1.1)**: real or simulated weather (rain, storms, snow, fog), a daily rhythm (morning coffee, lunch, tea time, night naps, Friday rooftop party), water-cooler gossip between friends, birthdays with cake, pizza parties, pedestrians, pigeons and buses on the street, a receptionist by day and a guard and cleaner by night, a rooftop cat, an armored van that carries your top-ups to the safe, and customers who walk in when a real sale arrives.
- **English by default** (Turkish optional), mobile touch controls, procedural sound and music, day/night cycle, daily reports, a goal queue, and file browser, backup and reset tools.

## 🔒 Safety (hard-coded, cannot be turned off)

> **Real money.** Hustle HQ never connects to your bank, card or crypto wallet and never moves money. Funding records money you set aside in your own account; every ad or purchase an agent proposes is paid **by you**, after you approve it. **No earnings are guaranteed.** Only use money you can afford to lose.

- Before the first top-up you read and accept the **real-money safety rules**.
- **Daily spend cap**, **stop-loss** (spending freezes if a set share of your capital is spent in 14 days with zero revenue) and **typed confirmation** for large spends. Configure them in Admin → Real-money safety.

- Agents **never** send money, place real trades, create accounts, or enter passwords or card numbers. Matching requests are rejected automatically.
- The trading desk is a **paper portfolio only** and is not investment advice. The treasury is a **ledger**: when you approve a spend, *you* make the payment.
- Agents work inside `workspace/`. Their `node` scripts run in Node's permission sandbox. Python, installs and everything else wait for your approval.
- PC control (open an app or URL, run a shell command) asks you **every single time**. Destructive commands (recursive delete, disk tools, disabling security, piping downloads into a shell, `sudo`, and others) are permanently blocked.
- Files that agents create open in an isolated sandbox and cannot talk to the app.
- The server listens on `127.0.0.1` only. Your data and API keys never leave your computer, except for the requests you make to the AI providers and services you configure yourself.

## 📦 Requirements

- **Node.js 24 LTS or newer**: https://nodejs.org
- Windows 10/11, macOS or Linux, and a modern browser.

## 🚀 Start

| OS | How |
|---|---|
| Windows | Run `npm run shortcut` once: a **Hustle HQ** icon appears on your desktop and opens the game in its own window. (Or double-click `start.bat`.) |
| macOS / Linux | `./start.sh` (run `chmod +x start.sh` once) |
| Any | `npm install`, then `npm start`, then open http://localhost:3777 |

On first launch a **setup wizard** asks for your language, company name, currency and boss name, then (optionally) your free AI keys and your first goal. A **short tutorial** and the **safety rules** follow, then you fund the company. That's it.

The desktop shortcut keeps the office running in the background after you close the window (agents work 24/7). Stop it from **Admin → Shut down server**.

### Free AI keys (2-3 minutes each)

| Provider | Get a key | Notes |
|---|---|---|
| OpenRouter | https://openrouter.ai/keys | One key unlocks free DeepSeek, Kimi K2, Qwen, GLM and Llama |
| Google Gemini | https://aistudio.google.com/apikey | Generous free tier |
| Groq | https://console.groq.com/keys | Very fast |
| Z.ai (GLM) | https://z.ai/manage-apikey/apikey-list | GLM Flash models are free |
| Ollama | https://ollama.com | Local, unlimited; detected automatically |

Paste keys in the wizard or later in **⚙️ Engines**. Keys are written only to the local `.env` file. Adding more keys gives more free throughput, because agents rotate between providers.

### Optional: real sales from Lemon Squeezy

In **🏦 Treasury**, paste a Lemon Squeezy API key (app.lemonsqueezy.com → Settings → API). New paid orders are recorded as revenue every 5 minutes. Link a product to a deliverable and the agent who made it is rewarded.

## 🎮 Controls

| Key | Action |
|---|---|
| WASD / Arrows | Walk (Shift: run) |
| E / Enter | Talk / interact (Undertale-style dialog, ← → to choose) |
| Click | Walk there / open an agent |
| F | Follow an agent with the camera |
| Tab · B · Q | Task board · Boss desk (goal) · Approvals (Y/N) |
| 1–0 | Jump to an agent |
| + / − / wheel | Zoom |
| M | Mini map |

On phones and tablets an on-screen joystick appears.

## 💡 How it is meant to be used

Hustle HQ is a **co-pilot for running small online projects**: digital products, micro-SaaS, services and content. Agents research, write, design, build and plan. You review, approve, publish and get paid. **No income is guaranteed.** Results depend on your market, your choices and the AI models you use. Treat agent output as drafts you check before using.

## 💾 Your data

- Everything lives locally: `data/` (company state, logs) and `workspace/` (everything agents produced). API keys live in `.env`.
- **🛠️ Admin → Download backup** saves a zip of `data/` and `workspace/` (never your keys).
- **Reset company** starts fresh. An automatic backup is saved to `data/backups/` first.

## 🧰 Troubleshooting

- **"Port 3777 is busy"**: the app is probably already open. Visit http://localhost:3777, or set `PORT=` in `.env`.
- **Agents stay in DEMO**: add at least one key in ⚙️ Engines and press **Test**.
- **Agents sleep on the couch**: every provider hit its free quota. They wake up automatically. Adding more providers helps.
- **Node older than 24**: the app runs, but agent `node` commands then go to your approval queue instead of running in the sandbox.

## 🧪 For developers

```bash
npm test
```

This runs the safety rules, the LLM router (against a fake provider) and a full end-to-end run on a throwaway data folder. No build step; the whole stack is plain JavaScript (Node + Canvas).

---

## 🇹🇷 Türkçe

**Hustle HQ**, oda oda gezdiğin pixel-art bir yapay zekâ ofisidir. 10 ajan 7/24 çalışır, sen patronsun. Para getirmeyen ajan kovulur.

### Kurulum

1. **Node.js 24** kur: https://nodejs.org
2. Windows'ta `start.bat` dosyasına çift tıkla. Mac ve Linux'ta `./start.sh` çalıştır.
3. Açılan **kurulum sihirbazında** dili, şirket adını, para birimini ve patron adını gir. İstersen ücretsiz AI anahtarlarını ve ilk hedefini de gir.
4. Masaüstü kısayolu için bir kez `npm run shortcut` çalıştır. Kısayol oyunu kendi penceresinde açar; pencere kapansa da ofis arka planda çalışır (Yönetim → Sunucuyu kapat).

### Strateji motoru

Para kazanma yolunu ajanlar seçer. **🧭 Strateji** panelinde kendinden bahset (beceriler, diller, haftalık saat, açık hesaplar, risk). Max buna göre 1-3 yasal strateji seçer (freelance, video kanalı, affiliate, dijital ürün, yerel işletme hizmeti, mikro-SaaS…), ekip çalışır, kimlik gerektiren adımlar (hesap açma, ödeme bilgisi, yayın) sana yapılacak olarak düşer. Süresi dolup para getirmeyen strateji bırakılır, yenisi seçilir. Gelirleri strateji bazında, platformdan IBAN'a geçen ödemeleri ayrıca takip edersin.

### Cüzdan ve gerçek para

Her açılışta oyun ne kadar koyacağını sorar: **TL, dolar ya da euro** seç, canlı kurla şirket para birimine çevrilir ve istersen hemen performansa göre ajanlara bütçe olarak dağıtılır. Lobideki ATM'den yükleme, ajana yürüyüp **E → Bütçe** ile elden bütçe verme, bütçe talepleri ve kâr çekme de var. Bu bir **kayıt defteridir**: uygulama bankana bağlanmaz, para çekmez, göndermez. Onayladığın reklam ve harcamaları sen ödersin. Günlük harcama limiti, zarar durdurma ve büyük harcamada tutar teyidi seni korur. **Kazanç garantisi yoktur.**

### Ücretsiz anahtarlar

OpenRouter (https://openrouter.ai/keys), Gemini (https://aistudio.google.com/apikey), Groq (https://console.groq.com/keys) ve Z.ai (https://z.ai/manage-apikey/apikey-list). Anahtarı sihirbaza ya da **⚙️ Motorlar** menüsüne yapıştır. Anahtarlar sadece bu bilgisayardaki `.env` dosyasında durur. Anahtar yoksa ofis **DEMO** modunda çalışır.

### Nasıl çalışır?

1. **Boss masasında** (B tuşu) Max'e hedef ver. Max işi ekibe dağıtır.
2. Ajanlar fikir, araştırma, satış sayfası, tasarım, reklam planı ve satılık ürün paketi üretir. Hepsi `workspace/` klasörüne yazılır ve **🗂️ Dosyalar** menüsünden görülebilir.
3. Dışarı giden her şey **📥 Onaylar**'a düşer: yayın, harcama, kurulum ve PC kontrolü. Onaylamadan hiçbir şey olmaz.
4. Teslimleri puanla: puan ajanın canıdır. Gerçek satış olunca gelir bağla ya da Lemon Squeezy'yi bağla, satışlar otomatik gelsin.

### Güvenlik

İlk yüklemeden önce gerçek para güvenlik kurallarını okuyup onaylarsın. Ajanlar gerçek para göndermez, gerçek borsada işlem yapmaz, hesap açmaz, şifre veya kart girmez. Borsa masası sanal portföydür, yatırım tavsiyesi değildir. Bilgisayar kontrolü her seferinde onay ister, yıkıcı komutlar kalıcı olarak engellidir. **Gelir garantisi yoktur.** Ajan çıktılarını kullanmadan önce kontrol et.

---

© 2026 BOF Studios. All rights reserved. See [LICENSE](../LICENSE).
