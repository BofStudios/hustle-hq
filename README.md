# 🏢 Hustle HQ

**A pixel-art AI office.** Ten AI employees work 24/7 to make money. You are the boss. One rule: **make money or get fired.**

**Türkçe kısa özet:** Pixel-art bir yapay zekâ ofisi. 10 ajan 7/24 çalışır, sen patronsun. Para getirmeyen ajan kovulur. Gerçek para sana aittir; uygulama para göndermez, ödemeleri sen yaparsın.

> Full guide: [docs/GUIDE.md](docs/GUIDE.md) · Changes: [CHANGELOG.md](CHANGELOG.md)

## Quick start

| OS | Run |
|---|---|
| Windows | `start.bat` (or `npm run shortcut` once for a desktop icon) |
| macOS / Linux | `./start.sh` |

- Requires **Node.js 24+**: https://nodejs.org
- Open **http://localhost:3777**. The first launch runs a short tutorial and setup wizard.

## Controls

`WASD` / arrows move · `Shift` run · `E` interact · `B` goal · `Q` approvals · `Tab` tasks · `M` map

## What it does

- **Strategy engine.** Agents read your profile (skills, hours, accounts you own) and choose legal ways to earn. They drop what does not pay and try the next.
- **Approval queue.** Nothing leaves the office (posts, spends, installs, PC actions) without your OK.
- **Wallet ledger.** Fund in TRY, USD or EUR (live rate), give budgets to agents, track income and payouts. It is a record only; no bank connection.
- **Free AI providers.** OpenRouter, Gemini, Groq, DeepSeek, Ollama and more. With no key, the office runs in DEMO mode.
- **Lemon Squeezy** sales import (read-only).

## Safety

- The app **never** moves money, trades real assets, creates accounts or enters passwords and card numbers.
- Real-money safety rules are accepted before the first funding. Daily spend cap, stop-loss and typed confirmation for large spends are on by default.
- **No earnings are guaranteed.** Only use money you can afford to lose.

## Development

```bash
npm install
npm start      # run the server
npm test       # policy + engine + end-to-end checks (63 end-to-end)
npm run shortcut   # Windows desktop shortcut
```

Data lives in `data/` and agent output in `workspace/` (both git-ignored). API keys stay in your local `.env`.

## License

Commercial software. © 2026 BOF Studios. All rights reserved. See [LICENSE](LICENSE).
