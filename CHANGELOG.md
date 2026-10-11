# Changelog

## 1.2.0 — Strategy Engine (2026-10-11)

- **The agents decide how the company makes money.** Max reads your profile (skills, languages, hours per week, accounts you already have, risk) and picks 1-3 strategies from a catalog of 12 legal paths (freelance services, video channel, affiliate content, digital products, local business services, micro-SaaS, mini apps, print-on-demand, newsletter, translation and data work, tutoring, social media for brands) or proposes his own. Each company gets its own mix.
- Every strategy has a reason, a plan, a KPI, a lead agent and team tasks. Steps that need your identity (opening accounts, payout details, publishing) become **your to-dos**.
- **Pivot**: when a strategy's review window ends with no income, it is dropped and Max chooses a new one; earning strategies are kept and scaled.
- **Income by strategy** in TRY, USD or EUR (converted at the live rate); the lead agent is rewarded.
- **Payouts to your IBAN**: track what moved from platforms to your bank (earned vs paid vs still on platforms). Only a label such as "Bank ****1234" is stored, never the full IBAN. Optional Turkish 20/B note with an estimated 15% withholding.
- Real-money trading, gambling, MLM, spam and fake reviews are excluded from strategies.
- Tests: 18 policy + 10 engine + 63 end-to-end checks.

## 1.1.0 — Wallet & Living World (2026-10-09)

### Money
- **Fund on launch**: every time you open Hustle HQ it asks how much you are putting in. Pick **TRY, USD or EUR**; the amount is converted to your company currency at the live rate (Yahoo Finance) and can be split across the team by performance right away. Max then plans how to put the budget to work.
- **Wallet panel**: top up, split to the team (equal or by performance), budget requests, withdraw profit, invested capital, payback, net profit, a 30-day chart and per-agent budget / spend / revenue / ROI.
- **Lobby ATM**, in-person budgets (walk up to an agent, **E → Budget**), and a robot that carries budget bags from the safe to desks.
- Agents can **request a budget** (`request_budget`); approving it allocates from the free balance. Fired agents' budgets return to the treasury.
- The paper trading desk now uses your company currency (USD for new companies).

### Real-money safety
- **Safety rules** must be read and accepted before the first top-up.
- **Daily spend cap**, **stop-loss** (freezes spending when a share of capital is spent in 14 days with zero revenue) and **typed confirmation** for large spends. Real-money warnings on every spend and ad card.

### Living world
- Weather: seasonal simulation or real weather by city (Open-Meteo); rain, storms with lightning and thunder, snow, fog; rain on windows and puddles outside.
- Daily rhythm from the real clock: morning coffee, lunch, tea time, evening games, night naps, a Friday rooftop party (agents take the elevator).
- Water-cooler gossip between friends using real company data; friendships grow from messages and hand-offs.
- Birthdays with cake and party hats, boss-ordered pizza parties with a courier.
- Street life: pedestrians (umbrellas in the rain), pigeons that scatter, a city bus, customers who walk in when a real sale arrives, an armored van for top-ups.
- Staff: receptionist by day, guard and cleaner by night, a rooftop cat. Talk to them with **E**.
- Bring an agent coffee from the kitchen machine, or praise them: lower stress, more XP (no HP, so the survival rule still holds).

### Product
- **English by default**; Turkish stays available in Admin.
- **Desktop shortcut** (`npm run shortcut`) with an app icon; the game opens in its own window and the server runs in the background. **Shut down server** button in Admin.
- Short **5-step tutorial**.
- Tests: 18 policy + 10 engine + 55 end-to-end checks.


## 1.0.0 — Finish Update (2026-10-08)

### World
- The building grew to **14 scenes**: engine room, CEO office, meeting room, archive and memorial, open office, Claude R&D lab, hallway, trading desk, kitchen, lobby, lounge, boss office, **street** and **rooftop**.
- Room transitions use a fade with cinematic bars, an Undertale-style `* ROOM NAME` title, vignette, optional CRT scanlines, edge shading and a floor-plan minimap.
- The **street** has a brick facade, a flickering neon sign, lit windows at night, passing traffic, horns, birds, and a bus stop that lets you "go home".
- The **rooftop**, reached by elevator, has a live city skyline (sun, clouds, stars, lit windows), helipad, deck chairs, umbrellas, a BBQ, string lights and a telescope.
- Per-room ambient sound (server hum, fridge buzz, lo-fi lounge, hallway echo, street, rooftop wind).

### Characters
- Chibi characters with big heads, outlined eyes, eyebrows and four moods (happy, neutral, stressed, panic).
- **Stress system**: sweat, shaking, panic arms, shouting and faster walking under pressure.
- **XP and levels**: level-up confetti, plus gold and purple crowns.
- Undertale-style **dialog box** with typewriter text, blip voices and ❤ menu.
- Firing scene (the agent walks out carrying a cardboard box), agent-to-agent conversations, team high-fives and confetti on revenue.

### Business
- Lemon Squeezy sales import (read-only) with product → deliverable linking.
- Agent **budgets**, ad campaign plans with result tracking and ROI, and zip **product packaging**.
- PC control with per-action approval and permanently blocked destructive commands (Windows, macOS and Linux).
- **Goal queue**, **daily report** at 18:00, a leaderboard and Employee of the Month.

### Product
- **First-run setup wizard**: language, company, currency, boss name, AI keys and first goal.
- **English and Turkish** interface; demo content and agent output follow the selected language.
- **macOS and Linux** support (pure-JS zip, cross-platform process handling, `start.sh`).
- Backup download and company reset with an automatic backup first.
- File browser, camera follow mode, mobile joystick and reduce-effects options.
- New provider: Z.ai GLM (free).

### Security
- Agent-created files are served in a CSP sandbox so they cannot call the app API.
- Node sandbox (permission model) for agent scripts; requires Node 24+.
- The server no longer crashes on disk errors or unexpected exceptions, and "port busy" is reported clearly.

### Testing
- `npm test` runs the safety rules, the router test against a fake LLM, and a 34-step end-to-end run in a throwaway folder.
