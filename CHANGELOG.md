# Changelog

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
