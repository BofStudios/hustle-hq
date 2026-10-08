// Oyun dünyası: render, kamera, oyuncu, ajan görsel davranışları, robot/köpek, ışık, efektler.
import { T, W, H, floor, wall, FLOOR, furniture, DESKS, seatOf, POI, SPAWN, BOSS_SEAT, findPath, collides, walkable, isWall, ROOMS, roomAt, roomById, roomBounds, WINDOWS } from './map.js';
import { character, FURN, dog, robot, ghost, shade, PAL } from './sprites.js';
import { S, on, api } from './net.js';
import { sfx, setAmbience } from './sound.js';
import { tr } from './i18n.js';
import { employeeOfMonth } from './ui.js';

const FONT = "'Silkscreen', 'Courier New', monospace";
let cv, ctx, staticLayer, lightCv, lightCtx;
let zoom = 3;
const cam = { x: 0, y: 0 };
const keys = new Set();
let hooks = {};
let time = 0;
let portfolio = null;

export const player = { x: SPAWN.x, y: SPAWN.y, dir: 1, frame: 0, animT: 0, moving: false, path: null, sitting: false };
const vis = new Map(); // agentId -> görsel durum
const fx = [];
const speech = new Map(); // agentId -> { text, until }
const robotV = { x: POI.robotDock.x * T + 8, y: POI.robotDock.y * T + 12, path: null, jobs: [], frame: 0, animT: 0, carrying: false, wait: 0 };
const dogV = { x: POI.dog.x * T + 8, y: POI.dog.y * T + 12, frame: 0, animT: 0, sleeping: true, path: null, wakeUntil: 0 };
let minimapOn = true;
let hoverInteract = null;

// ---- sokak trafiği (sadece görsel)
const traffic = [];
let nextCar = 0;
const CAR_COLORS = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#ecf0f1', '#8e44ad', '#2b2f3a'];
function updateTraffic(dt, now) {
  if (room.id !== 'street') { traffic.length = 0; return; }
  if (now > nextCar) {
    nextCar = now + 2500 + Math.random() * 6000;
    const ltr = Math.random() < 0.5;
    traffic.push({ x: ltr ? -60 : W * T + 10, y: (ltr ? 59 : 57) * T + 4, v: (ltr ? 1 : -1) * (110 + Math.random() * 80), color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] });
    sfx.carPass();
    if (Math.random() < 0.15) setTimeout(() => sfx.horn(), 400);
  }
  for (const c of traffic) c.x += c.v * dt;
  for (let i = traffic.length - 1; i >= 0; i--) if (traffic[i].x < -80 || traffic[i].x > W * T + 80) traffic.splice(i, 1);
}

// ---- asansör: lobi ↔ çatı (Undertale tarzı geçiş + "ding")
function elevatorRide() {
  const toRoof = room.id !== 'roof';
  const dst = toRoof ? POI.roofElevator : POI.elevator;
  sfx.ding();
  player.x = dst.x * T + 8;
  player.y = dst.y * T + 12;
  player.dir = 0;
  player.path = null;
  follow = null;
  enterRoom(roomAt(dst.x, dst.y));
}

// ---- Undertale diyalog kutusu
const dialog = { open: false, agentId: null, text: '', shown: 0, sel: 0, blipAcc: 0, pitch: 520 };
const DIALOG_OPTS = [['Konuş', 'chat'], ['Görev ver', 'task'], ['Panel', 'log'], ['Kapat', null]];
function lastLine(id) {
  const logs = S.logs.get(id) || [];
  for (let i = logs.length - 1; i >= 0; i--) if (logs[i].kind === 'thought' || logs[i].kind === 'say') return logs[i].text;
  return '';
}
function openDialog(id) {
  const a = S.agents.get(id);
  if (!a) return;
  const v = vis.get(id);
  const m = v ? moodOf(a, v, performance.now()) : 'neutral';
  const ll = lastLine(id).replace(/\s+/g, ' ').slice(0, 110);
  let t;
  if (a.status === 'dead') t = `* Burada eskiden ${a.name} otururdu.\n* Masada yarım kalmış bir kahve var.`;
  else if (a.role === 'claude') t = `* ${a.name} sakin sakin bekliyor.\n* "Beni çağırırsan gerçek kod yazarım, patron."`;
  else if (a.status === 'sleeping') t = `* ${a.name} kanepede uyuyor. Zzz...\n* (Motorlarının kotası dolmuş.)`;
  else if (m === 'panic') t = `* ${a.name} titriyor, terden sırılsıklam.\n* "${ll || 'AAAA! Runway bitiyor patron!'}"`;
  else if (m === 'stress') t = `* ${a.name} ekrana kilitlenmiş, alnında ter var.\n* "${ll || 'Bir saniye patron, yetiştiriyorum!'}"`;
  else if (a.status === 'working' || a.status === 'thinking') t = `* ${a.name} hızlı hızlı yazıyor.\n* "${ll || 'Üzerinde çalışıyorum!'}"`;
  else t = `* ${a.name} sana dönüyor.\n* "${ll || 'Patron! Bugün ne satıyoruz?'}"`;
  document.body.classList.add('dlg');
  Object.assign(dialog, { open: true, agentId: id, text: tr(t), shown: 0, sel: 0, blipAcc: 0, pitch: 380 + ((a.slot || 0) * 47) % 380 });
}
function closeDialog() {
  dialog.open = false;
  document.body.classList.remove('dlg');
}
function dialogKey(k) {
  const full = dialog.shown >= dialog.text.length;
  if (k === 'escape' || k === 'x' || k === 'shift') return closeDialog();
  if (k === 'arrowleft' || k === 'a') { dialog.sel = (dialog.sel + DIALOG_OPTS.length - 1) % DIALOG_OPTS.length; sfx.select(); return; }
  if (k === 'arrowright' || k === 'd') { dialog.sel = (dialog.sel + 1) % DIALOG_OPTS.length; sfx.select(); return; }
  if (k === 'e' || k === 'enter' || k === 'z' || k === ' ') {
    if (!full) { dialog.shown = dialog.text.length; return; }
    const [, tab] = DIALOG_OPTS[dialog.sel];
    sfx.select();
    const id = dialog.agentId;
    closeDialog();
    if (tab) hooks.openAgent?.(id, tab);
  }
}
function updateDialog(dt) {
  if (!dialog.open) return;
  if (dialog.shown < dialog.text.length) {
    const before = Math.floor(dialog.shown);
    dialog.shown = Math.min(dialog.text.length, dialog.shown + dt * 38);
    const after = Math.floor(dialog.shown);
    for (let i = before; i < after; i++) if (i % 2 === 0 && /\S/.test(dialog.text[i])) sfx.blip(dialog.pitch);
  }
  // uzaklaşırsa kapanır
  const v = vis.get(dialog.agentId);
  if (!v || Math.hypot(player.x - v.x, player.y - v.y) > 60) closeDialog();
}
function drawDialog() {
  if (!dialog.open) return;
  const a = S.agents.get(dialog.agentId);
  if (!a) return;
  const dpr = cv.width / cv.clientWidth;
  const W2 = cv.width, H2 = cv.height;
  const bw = Math.min(W2 - 40 * dpr, 900 * dpr), bh = 170 * dpr;
  const bx = (W2 - bw) / 2, by = H2 - bh - H2 * 0.06 - 18 * dpr;
  ctx.fillStyle = '#000';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5 * dpr;
  ctx.strokeRect(bx + 2.5 * dpr, by + 2.5 * dpr, bw - 5 * dpr, bh - 5 * dpr);
  // portre (kafa, büyük piksel)
  const v = vis.get(dialog.agentId);
  const mood = v ? moodOf(a, v, performance.now()) : 'neutral';
  const talking = dialog.shown < dialog.text.length && Math.floor(performance.now() / 120) % 2;
  const spr = a.status === 'dead' ? ghost(0) : character(a.look, 0, 0, 'stand', false, talking && mood === 'neutral' ? 'happy' : mood);
  const ps = Math.floor(7 * dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr, 0, 0, 16, 16, bx + 22 * dpr, by + 22 * dpr, 16 * ps / 1.25, 16 * ps / 1.25);
  // metin
  const tx = bx + 22 * dpr + (16 * ps) / 1.25 + 24 * dpr;
  const fs = Math.round(17 * dpr);
  ctx.font = `bold ${fs}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  const shown = dialog.text.slice(0, Math.floor(dialog.shown));
  const maxW = bx + bw - tx - 24 * dpr;
  let line = '', y = by + 24 * dpr;
  const flush = () => { ctx.fillText(line, tx, y); y += fs * 1.45; line = ''; };
  for (const para of shown.split('\n')) {
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { flush(); line = '  ' + word; } else line = test;
    }
    flush();
  }
  // seçenekler (❤ imleç)
  if (dialog.shown >= dialog.text.length) {
    const oy = by + bh - 34 * dpr;
    const ow = (bw - 40 * dpr) / DIALOG_OPTS.length;
    DIALOG_OPTS.forEach(([label], i) => {
      const ox = bx + 20 * dpr + i * ow + 26 * dpr;
      const on = i === dialog.sel;
      ctx.fillStyle = on ? '#ffde3d' : '#fff';
      ctx.font = `bold ${Math.round(15 * dpr)}px ${FONT}`;
      ctx.fillText(tr(label).toUpperCase(), ox, oy);
      if (on) {
        ctx.fillStyle = '#ff2a2a';
        ctx.font = `${Math.round(15 * dpr)}px sans-serif`;
        ctx.fillText('❤', ox - 22 * dpr, oy - 1 * dpr);
      }
    });
  }
}

// ---- kamera takip modu (F veya ajan panelindeki 🎥): oyuncu yerinde kalır, kamera ajanı izler
let follow = null;
export function followAgent(id) {
  if (!id || follow === id) { follow = null; hooks.toast?.('🎥 Takip bırakıldı'); return; }
  follow = id;
  hooks.toast?.(`🎥 ${S.agents.get(id)?.name || 'Ajan'} takip ediliyor. Yürü ya da Esc ile bırak.`);
}
function camTarget() {
  if (follow) {
    if (!S.agents.has(follow)) follow = null; // ajan gitti (yerine yenisi alındı)
    else {
      const v = vis.get(follow);
      if (v) return v; // görsel henüz oluşmadıysa bir kare oyuncuda kal
    }
  }
  return player;
}

// ---- Undertale tarzı oda sahnesi
let room = roomById('boss');
const trans = { phase: null, t: 0, to: null }; // phase: out | in
const banner = { text: room.name, t: 0 };
let fxScanlines = true;
try { fxScanlines = localStorage.getItem('hq_scanlines') !== '0'; } catch {}
export function toggleScanlines() {
  fxScanlines = !fxScanlines;
  try { localStorage.setItem('hq_scanlines', fxScanlines ? '1' : '0'); } catch {}
  return fxScanlines;
}
export function getScanlines() {
  return fxScanlines;
}
let reduceFx = false;
try { reduceFx = localStorage.getItem('hq_reducefx') === '1'; } catch {}
export function getReduceFx() {
  return reduceFx;
}
export function setReduceFx(v) {
  reduceFx = !!v;
  try { localStorage.setItem('hq_reducefx', reduceFx ? '1' : '0'); } catch {}
}
export function currentRoom() {
  return room;
}
function inRoom(x, y, r = room) {
  const b = roomBounds(r);
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}
function enterRoom(r, instant = false) {
  if (!r || r === room) return;
  if (instant) {
    room = r;
    banner.text = r.name;
    banner.t = 0;
    trans.phase = 'in';
    trans.t = 0;
    return;
  }
  if (trans.phase === 'out') return;
  trans.phase = 'out';
  trans.t = 0;
  trans.to = r;
  sfx.door?.();
}
function updateRoom(dt) {
  if (trans.phase === 'out') {
    trans.t += dt;
    if (trans.t >= 0.22) {
      room = trans.to;
      banner.text = room.name;
      banner.t = 0;
      trans.phase = 'in';
      trans.t = 0;
    }
  } else if (trans.phase === 'in') {
    trans.t += dt;
    if (trans.t >= 0.35) trans.phase = null;
  }
  banner.t += dt;
  const tgt = camTarget();
  const r = roomAt(Math.floor(tgt.x / T), Math.floor((tgt.y - 2) / T));
  if (r && r !== room && trans.phase !== 'out') enterRoom(r);
}

// ======================= BAŞLATMA =======================
export function initWorld(canvas, h) {
  cv = canvas;
  hooks = h;
  ctx = cv.getContext('2d');
  lightCv = document.createElement('canvas');
  lightCtx = lightCv.getContext('2d');
  buildStatic();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  cv.addEventListener('mousedown', onClick);
  cv.addEventListener('mousemove', onMouseMove);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });

  on('walk', onWalkEvent);
  on('say', (p) => say(p.agentId, p.text, 6000));
  on('agent:log', (e) => {
    if (e.kind === 'thought' || e.kind === 'say') say(e.agentId, e.text, 5000);
    if (e.kind === 'sleep') say(e.agentId, 'Kotam doldu… 💤', 4000);
  });
  on('fx', onFx);
  on('meeting', onMeeting);
  on('agent:replace', (p) => {
    vis.delete(p.oldId);
    const s = seatOf(p.agent.role);
    const v = ensureVis(p.agent);
    // yeni çalışan asansörden gelir
    v.x = POI.elevator.x * T + 8; v.y = POI.elevator.y * T + 12;
    goTo(v, s.tx, s.ty, 'seat');
    say(p.agent.id, `Merhaba! Ben ${p.agent.name}, ilk günüm 👋`, 6000);
  });
  pollPortfolio();
  setInterval(pollPortfolio, 60000);
  requestAnimationFrame(loop);
}

async function pollPortfolio() {
  try { portfolio = await api('GET', '/api/portfolio'); } catch {}
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.floor(window.innerWidth * dpr);
  cv.height = Math.floor(window.innerHeight * dpr);
  cv.style.width = window.innerWidth + 'px';
  cv.style.height = window.innerHeight + 'px';
  const auto = Math.max(2, Math.round((window.innerWidth * dpr) / (T * 30)));
  if (!resize.done) { zoom = auto; resize.done = true; }
  lightCv.width = Math.ceil(cv.width / 4);
  lightCv.height = Math.ceil(cv.height / 4);
}

export function setZoom(z) {
  zoom = Math.max(1, Math.min(7, z));
}

// ======================= STATİK KATMAN =======================
const FLOOR_COL = {
  [FLOOR.carpet]: ['#d8cfbd', '#d2c8b4'],
  [FLOOR.wood]: ['#9a6a40', '#8e5f37'],
  [FLOOR.tile]: ['#e9ecef', '#d5dae0'],
  [FLOOR.server]: ['#3b4150', '#353a48'],
  [FLOOR.meet]: ['#7c8ca6', '#7486a0'],
  [FLOOR.lounge]: ['#c9b48f', '#c1ab85'],
  [FLOOR.trade]: ['#2f3d3a', '#2a3734'],
  [FLOOR.door]: ['#b9a98c', '#b0a084'],
  [FLOOR.ceo]: ['#a8784a', '#9c6e42'],
  [FLOOR.hall]: ['#b7b2a8', '#aea89d'],
  [FLOOR.lobby]: ['#ece6dc', '#dfd8cc'],
  [FLOOR.lab]: ['#3b2c26', '#35271f'],
  [FLOOR.archive]: ['#6e5642', '#664f3c'],
  [FLOOR.walk]: ['#b9b6ae', '#aeaba3'],
  [FLOOR.road]: ['#3a3d45', '#383b42'],
  [FLOOR.roof]: ['#8b6b4a', '#836446'],
};

function buildStatic() {
  staticLayer = document.createElement('canvas');
  staticLayer.width = W * T;
  staticLayer.height = H * T;
  const g = staticLayer.getContext('2d');
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const f = floor[y * W + x];
      const w = wall[y * W + x];
      const px = x * T, py = y * T;
      if (f) {
        const [a, b] = FLOOR_COL[f] || ['#ccc', '#bbb'];
        g.fillStyle = (x + y) % 2 ? a : b;
        g.fillRect(px, py, T, T);
        if (f === FLOOR.wood || f === FLOOR.ceo) {
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fillRect(px, py + ((x % 2) * 8), T, 1);
          g.fillRect(px + ((y * 5) % 16), py, 1, 8);
        } else if (f === FLOOR.tile) {
          g.fillStyle = 'rgba(0,0,0,0.07)';
          g.fillRect(px, py, T, 1);
          g.fillRect(px, py, 1, T);
        } else if (f === FLOOR.server) {
          g.fillStyle = 'rgba(120,200,255,0.06)';
          g.fillRect(px, py, T, 1);
          g.fillRect(px, py, 1, T);
        } else if (f === FLOOR.lab) {
          g.fillStyle = 'rgba(255,138,80,0.08)';
          g.fillRect(px, py, T, 1);
          g.fillRect(px, py, 1, T);
        } else if (f === FLOOR.lobby) {
          g.fillStyle = 'rgba(120,100,80,0.10)';
          g.fillRect(px + ((x * 3 + y) % 12), py + 3, 4, 1);
          g.fillStyle = 'rgba(255,255,255,0.25)';
          if ((x + y) % 2) g.fillRect(px + 1, py + 1, 3, 1);
        } else if (f === FLOOR.walk) {
          g.fillStyle = 'rgba(0,0,0,0.10)';
          g.fillRect(px, py + T - 1, T, 1);
          g.fillRect(px + T - 1, py, 1, T);
        } else if (f === FLOOR.roof) {
          g.fillStyle = 'rgba(0,0,0,0.18)';
          g.fillRect(px, py + T - 1, T, 1);
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(px, py + 3, T, 1);
          if ((x + y) % 3 === 0) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 2, py + 7, 1, 1); g.fillRect(px + 13, py + 7, 1, 1); }
        } else if (f === FLOOR.road) {
          g.fillStyle = 'rgba(255,255,255,0.03)';
          if ((x * 13 + y * 7) % 5 === 0) g.fillRect(px + (x % 7), py + (y % 9), 2, 1);
        } else if (f === FLOOR.hall) {
          g.fillStyle = 'rgba(0,0,0,0.08)';
          if (x % 2 === 0) g.fillRect(px, py, 1, T);
        } else if (f === FLOOR.carpet && (x * 7 + y * 13) % 11 === 0) {
          g.fillStyle = 'rgba(0,0,0,0.04)';
          g.fillRect(px + 4, py + 6, 2, 2);
        }
      }
      if (w === 1) {
        g.fillStyle = '#4b3b30';
        g.fillRect(px, py, T, T);
        g.fillStyle = '#5c4a3c';
        g.fillRect(px, py, T, 2);
      } else if (w === 2) {
        g.fillStyle = '#e6d8bd';
        g.fillRect(px, py, T, T);
        g.fillStyle = '#d4c3a3';
        g.fillRect(px, py, T, 2);
        g.fillStyle = '#6b4a2e';
        g.fillRect(px, py + T - 3, T, 3);
        g.fillStyle = 'rgba(0,0,0,0.05)';
        if (x % 4 === 0) g.fillRect(px, py + 2, 1, T - 5);
      } else if (w === 3) {
        g.fillStyle = '#37474f';
        g.fillRect(px, py, T, T);
        g.fillStyle = '#90caf9';
        g.fillRect(px, py + 6, T, 4);
      } else if (w === 4) {
        g.fillStyle = 'rgba(160,210,240,0.55)';
        g.fillRect(px, py, T, T);
        g.fillStyle = '#37474f';
        g.fillRect(px, py, T, 2);
        g.fillRect(px, py + T - 2, T, 2);
        if (x % 3 === 0) g.fillRect(px, py, 1, T);
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.fillRect(px + 3, py + 4, 1, 6);
        g.fillRect(px + 5, py + 3, 1, 4);
      }
      // dikey duvarın alt ucunda ön yüz
      if (w === 1 && y + 1 < H && !wall[(y + 1) * W + x] && floor[(y + 1) * W + x]) {
        g.fillStyle = '#d4c3a3';
        g.fillRect(px, py + T - 6, T, 6);
        g.fillStyle = '#6b4a2e';
        g.fillRect(px, py + T - 2, T, 2);
      }
    }
  // bina cephesi (dışarıdan görünen ön yüz): tuğla
  for (let x = 1; x < W - 1; x++) {
    if (wall[52 * W + x] !== 2) continue;
    const px = x * T, py = 52 * T;
    g.fillStyle = '#8e4a3a';
    g.fillRect(px, py, T, T);
    g.fillStyle = '#a65a47';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) g.fillRect(px + ((r % 2) * 4) + c * 8, py + r * 4, 7, 3);
    g.fillStyle = '#5e2f25';
    g.fillRect(px, py + T - 2, T, 2);
  }
  // kaldırım kenar taşları
  g.fillStyle = '#8a8780';
  for (let x = 1; x < W - 1; x++) { g.fillRect(x * T, 57 * T - 2, T, 2); g.fillRect(x * T, 62 * T, T, 2); }

  // kapılar: pervaz + eşik gölgesi + paspas
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (floor[y * W + x] !== FLOOR.door || floor[(y - 1) * W + x] === FLOOR.door) continue;
      // kapı karosu dikey çiftin üstü; sol kenarsa pervazı çiz
      const px = x * T, py = y * T;
      if (floor[y * W + x - 1] !== FLOOR.door) {
        g.fillStyle = '#3a2a1e';
        g.fillRect(px - 2, py - 2, 3, T * 2 + 2);
      }
      if (floor[y * W + x + 1] !== FLOOR.door) {
        g.fillStyle = '#3a2a1e';
        g.fillRect(px + T - 1, py - 2, 3, T * 2 + 2);
      }
      const sh = g.createLinearGradient(0, py, 0, py + T * 2);
      sh.addColorStop(0, 'rgba(0,0,0,0.45)');
      sh.addColorStop(0.5, 'rgba(0,0,0,0.05)');
      sh.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = sh;
      g.fillRect(px, py, T, T * 2);
      g.fillStyle = 'rgba(90,60,40,0.55)';
      g.fillRect(px + 1, py + T * 2 + 2, T - 2, 5);
    }
}

// ======================= GİRDİ =======================
function onKeyDown(e) {
  if (hooks.isTyping?.()) return;
  const k = e.key.toLowerCase();
  if (dialog.open) {
    e.preventDefault();
    return dialogKey(k);
  }
  keys.add(k);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
  if (k === 'e' || k === 'enter') interact();
  else if (k === 'escape') {
    if (follow) { follow = null; enterRoom(roomAt(Math.floor(player.x / T), Math.floor((player.y - 2) / T))); }
    hooks.closeAll?.();
  } else if (k === 'f') {
    if (follow) followAgent(null);
    else if (hoverInteract?.type === 'agent') followAgent(hoverInteract.id);
    else hooks.toast?.('🎥 Takip için bir ajana yaklaş ya da panelinden 🎥 Takip et');
  }
  else if (k === 'tab') hooks.open?.('tasks');
  else if (k === 'b') hooks.open?.('boss');
  else if (k === 'q') hooks.open?.('approvals');
  else if (k === 'm') minimapOn = !minimapOn;
  else if (k === '+' || k === '=') setZoom(zoom + 1);
  else if (k === '-') setZoom(zoom - 1);
  else if (/^[0-9]$/.test(k)) teleportToSlot(k === '0' ? 9 : Number(k) - 1);
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    if (follow) { follow = null; enterRoom(roomAt(Math.floor(player.x / T), Math.floor((player.y - 2) / T))); }
    player.path = null;
    player.sitting = false;
  }
}

function teleportToSlot(slot) {
  const a = [...S.agents.values()].find((x) => x.slot === slot);
  if (!a) return;
  const d = DESKS[a.role];
  player.x = d.x * T + 16;
  player.y = (d.y + 1) * T + 12;
  if (collides(player.x, player.y)) player.y += T;
  player.dir = 1;
  player.path = null;
  enterRoom(roomAt(Math.floor(player.x / T), Math.floor((player.y - 2) / T)));
}

function screenToWorld(mx, my) {
  const dpr = cv.width / cv.clientWidth;
  return { x: (mx * dpr) / zoom + cam.x, y: (my * dpr) / zoom + cam.y };
}

function agentAt(wx, wy) {
  let best = null;
  for (const [id, v] of vis) {
    if (!inRoom(v.x, v.y)) continue;
    if (Math.abs(wx - v.x) < 10 && wy < v.y + 2 && wy > v.y - 30) best = id;
  }
  return best;
}

function onClick(e) {
  const p = screenToWorld(e.offsetX, e.offsetY);
  const id = agentAt(p.x, p.y);
  if (id) return hooks.openAgent?.(id);
  const f = furniture.find((f) => f.interact && f.room === room.id && p.x >= f.x && p.x <= f.x + (f.w || 32) && p.y >= f.y - 8 && p.y <= f.y + (f.h || 24));
  if (f) return hooks.open?.(f.interact.id);
  const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
  const path = findPath(Math.floor(player.x / T), Math.floor((player.y - 4) / T), tx, ty);
  if (path) { player.path = path.slice(1); player.sitting = false; }
}

function onMouseMove(e) {
  const p = screenToWorld(e.offsetX, e.offsetY);
  cv.style.cursor = agentAt(p.x, p.y) ? 'pointer' : 'default';
}

function nearestInteract() {
  let best = null, bestD = Infinity;
  for (const [id, v] of vis) {
    if (!inRoom(v.x, v.y)) continue;
    const d = Math.hypot(player.x - v.x, player.y - v.y);
    if (d < 42 && d < bestD) { bestD = d; best = { type: 'agent', id, label: `${S.agents.get(id)?.name || ''} ile konuş` }; }
  }
  const ptx = player.x / T, pty = player.y / T;
  for (const f of furniture) {
    if (!f.interact || f.room !== room.id) continue;
    const d = Math.hypot(ptx - (f.interact.tx + 0.5), pty - (f.interact.ty + 0.5));
    if (d < f.interact.range && d * T < bestD) { bestD = d * T; best = { type: 'obj', id: f.interact.id, label: f.interact.label }; }
  }
  return best;
}

function interact() {
  const n = nearestInteract();
  if (!n) return;
  if (n.type === 'agent') openDialog(n.id);
  else if (n.id === 'coffee') {
    hooks.toast?.('☕ Kahve içtin. Ekip seni izliyor, gaza geldiler.');
    fx.push({ kind: 'text', x: player.x, y: player.y - 30, text: '☕ +enerji', color: '#ffd28a', t: 0, life: 1.5 });
  } else if (n.id === 'elevator') elevatorRide();
  else if (n.id === 'telescope') {
    const a = [...S.agents.values()];
    const work = a.filter((x) => x.status === 'working' || x.status === 'thinking').length;
    hooks.toast?.(`🔭 Şehrin ışıkları… Aşağıda ${work} ajan çalışıyor, kasa ${Math.round(S.ledger.balance || 0)} ${S.company?.currency || '₺'}, gelir ${Math.round(S.ledger.revenue || 0)}.`);
  }
  else if (n.id === 'arcade') {
    hooks.toast?.('🕹️ HIGH SCORE: ' + (S.company?.boss?.name || 'BOSS') + ' — ' + Math.floor(1000 + Math.random() * 9000));
    sfx.hire();
  } else if (n.id === 'reception') hooks.help?.();
  else if (n.id === 'home') hooks.goHome?.();
  else hooks.open?.(n.id);
}

// ======================= OYUNCU =======================
function updatePlayer(dt) {
  const run = keys.has('shift');
  const sp = (run ? 150 : 85) * dt;
  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (hooks.isTyping?.() || trans.phase === 'out' || dialog.open) dx = dy = 0;
  if (!dx && !dy && player.path?.length && trans.phase !== 'out') {
    const [tx, ty] = player.path[0];
    const gx = tx * T + 8, gy = ty * T + 12;
    const ddx = gx - player.x, ddy = gy - player.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 2) player.path.shift();
    else { dx = ddx / dist; dy = ddy / dist; }
    if (!player.path.length) player.path = null;
  }
  player.moving = !!(dx || dy);
  if (player.moving) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    if (Math.abs(dx) > Math.abs(dy)) player.dir = dx < 0 ? 2 : 3;
    else player.dir = dy < 0 ? 1 : 0;
    const nx = player.x + dx * sp;
    const ny = player.y + dy * sp;
    if (!collides(nx, player.y)) player.x = nx;
    else if (player.path) player.x = nx; // yol takibinde köşe toleransı
    if (!collides(player.x, ny)) player.y = ny;
    else if (player.path) player.y = ny;
    const prevF = player.frame;
    player.animT += dt * (run ? 14 : 9);
    player.frame = 1 + (Math.floor(player.animT) % 2);
    if (prevF !== player.frame) dust(player.x, player.y, run ? 3 : 1);
  } else player.frame = 0;
}

// ======================= AJAN GÖRSELLERİ =======================
function ensureVis(a) {
  let v = vis.get(a.id);
  if (!v) {
    const s = seatOf(a.role);
    v = { id: a.id, x: s.x, y: s.y, dir: 0, frame: 0, animT: Math.random() * 10, path: null, mode: 'seat', wait: 0, nextWander: performance.now() + 15000 + Math.random() * 40000, blinkT: Math.random() * 4, lookKey: '' };
    vis.set(a.id, v);
  }
  return v;
}

function goTo(v, tx, ty, mode, wait = 0, after = null) {
  const path = findPath(Math.round((v.x - 8) / T), Math.floor((v.y - 4) / T), tx, ty);
  if (!path) return false;
  v.path = path.slice(1);
  v.mode = 'walking';
  v.next = mode;
  v.wait = wait;
  v.after = after;
  return true;
}

function frontOfDesk(role) {
  const d = DESKS[role];
  if (role === 'ceo') return POI.ceoVisit[Math.floor(Math.random() * 2)];
  return { x: d.x + (Math.random() < 0.5 ? 0 : 1), y: d.y + 1 };
}

function onWalkEvent(p) {
  if (p.agentId === 'router') {
    const from = S.agents.get(p.from);
    const to = S.agents.get(p.to);
    if (to) robotV.jobs.push({ from: from?.role, to: to.role, toId: to.id });
    return;
  }
  const a = S.agents.get(p.agentId);
  if (!a) return;
  const v = ensureVis(a);
  if (v.mode === 'walking' || a.status === 'dead') return;
  let dest;
  if (p.to === 'boss') dest = POI.bossVisit[Math.floor(Math.random() * 2)];
  else {
    const t = S.agents.get(p.to);
    if (!t) return;
    dest = frontOfDesk(t.role);
  }
  v.face = 1;
  const reasonText = { teslim: 'İş bitti, teslim! ✅', mesaj: 'Bir şey söyleyeceğim…', eskalasyon: 'Patron, karar lazım ❗', hedef: 'Hedefi aldım patron 🎯' }[p.reason] || '';
  const target = p.to !== 'boss' && (p.reason === 'mesaj' || p.reason === 'teslim') ? S.agents.get(p.to) : null;
  if (target) {
    goTo(v, dest.x, dest.y, 'visit', 9000, () => converse(a, target, p));
    return;
  }
  goTo(v, dest.x, dest.y, 'visit', 4500, () => reasonText && say(a.id, reasonText, 4000));
}

// iki ajan karşı karşıya: ziyaretçi masanın önünde yukarı, masadaki aşağı bakar; sırayla konuşma balonu
const REPLY = {
  mesaj: ['Tamamdır, bakıyorum 👍', 'Anladım, hallederim.', 'Hmm, mantıklı 🤔', 'Not aldım ✍️'],
  teslim: ['Eline sağlık! 🙌', 'Süper, inceliyorum 👀', 'Harika iş ✅', 'Tam zamanında 🔥'],
};
function converse(a, target, p) {
  const tv = vis.get(target.id);
  const v = vis.get(a.id);
  if (!v || !tv || target.status === 'dead') return;
  const now = performance.now();
  v.face = tv.y < v.y ? 1 : 0;
  tv.talkUntil = now + 8500; // masadaysa yazmayı bırakıp dinler
  if (tv.mode !== 'seat') tv.dir = v.y < tv.y ? 1 : 0;
  const first = p.reason === 'teslim' ? `Teslim: ${p.text || 'iş bitti'} ✅` : p.text || 'Bir şey söyleyeceğim…';
  const pool = REPLY[p.reason] || REPLY.mesaj;
  const lines = [
    [a.id, first],
    [target.id, pool[Math.floor(Math.random() * pool.length)]],
    [a.id, p.reason === 'teslim' ? 'Başka bir şey lazım mı?' : 'Süper, sende 👍'],
    [target.id, p.reason === 'teslim' ? 'Şimdilik bu kadar, sağ ol!' : '👌'],
  ];
  lines.forEach(([id, t], i) => setTimeout(() => {
    if (S.agents.get(id)?.status === 'dead') return;
    say(id, t, 2300);
    if (inRoom(vis.get(id)?.x ?? -1e9, vis.get(id)?.y ?? -1e9)) sfx.blip(id === a.id ? 560 : 440);
  }, i * 2100));
}

// gelir gelince tüm ekip zıplar (high-five) + konfeti
const CHEERS = ['🙌 HIGH FIVE!', 'YEEES! 💰', 'Satış geldi! 🎉', 'Başardık! 🥳', 'Çak bir beşlik ✋'];
const CONFETTI = ['#ff5d8f', '#ffd23f', '#3ddc97', '#4cc9f0', '#b36bff', '#ff8c42'];
function celebrate() {
  const now = performance.now();
  let n = 0;
  for (const a of S.agents.values()) {
    if (a.status === 'dead' || a.status === 'sleeping') continue;
    const v = vis.get(a.id);
    if (!v) continue;
    v.hopUntil = now + 2600;
    v.hopPhase = Math.random() * 6;
    v.happyUntil = now + 8000;
    if (n++ < 4 || Math.random() < 0.3) setTimeout(() => say(a.id, CHEERS[Math.floor(Math.random() * CHEERS.length)], 2500), Math.random() * 600);
  }
  const b = roomBounds(room);
  for (let i = 0; i < 90; i++) {
    fx.push({ kind: 'confetti', x: b.x + Math.random() * b.w, y: b.y - Math.random() * 30, vx: (Math.random() - 0.5) * 30, vy: 10 + Math.random() * 30, grav: 25, t: 0, life: 2.5 + Math.random() * 1.5, color: CONFETTI[i % CONFETTI.length], spin: Math.random() * 6 });
  }
}

// Max plan/stand-up başlatınca uyanık ekip toplantı odasına toplanır (görsel).
let lastMeeting = -Infinity;
function onMeeting(p) {
  const now = performance.now();
  if (now - lastMeeting < 90000) return;
  lastMeeting = now;
  const seats = [...POI.meeting];
  const lines = ['Toplantı! 📋', 'Geliyorum…', 'Kahvemi alıp geliyorum ☕', 'Yine mi toplantı 😅', 'Hedef ne patron?'];
  for (const a of S.agents.values()) {
    if (a.status === 'dead' || a.status === 'sleeping' || a.role === 'claude') continue;
    const v = ensureVis(a);
    if (v.mode === 'walking') continue;
    const dst = a.role === 'ceo' ? POI.meetingHead : seats.shift();
    if (!dst) break;
    v.face = a.role === 'ceo' ? 2 : dst.y < 6 ? 0 : 1;
    goTo(v, dst.x, dst.y, 'visit', 14000 + Math.random() * 4000, () => {
      if (a.role === 'ceo') say(a.id, `Ekip, odak: ${String(p.title || '').slice(0, 40)}`, 6000);
      else if (Math.random() < 0.4) say(a.id, lines[Math.floor(Math.random() * lines.length)], 3500);
    });
  }
}

function say(agentId, text, ms = 4000) {
  if (!text) return;
  const t = tr(String(text)).replace(/\s+/g, ' ').trim();
  speech.set(agentId, { text: t.length > 64 ? t.slice(0, 62) + '…' : t, until: performance.now() + ms });
}

function onFx(p) {
  if (p.kind === 'money') {
    for (let i = 0; i < 24; i++) fx.push({ kind: 'coin', x: BOSS_SEAT.x + (Math.random() - 0.5) * 40, y: BOSS_SEAT.y - 20, vx: (Math.random() - 0.5) * 60, vy: -60 - Math.random() * 60, t: 0, life: 1.6 });
    fx.push({ kind: 'text', x: BOSS_SEAT.x, y: BOSS_SEAT.y - 40, text: `+${p.amount} ${S.company?.currency || '₺'}`, color: '#ffd700', t: 0, life: 2.5, big: true });
    celebrate();
    return;
  }
  const v = vis.get(p.agentId);
  if (!v) return;
  if (p.kind === 'levelup') {
    v.happyUntil = performance.now() + 8000;
    v.hopUntil = performance.now() + 2400;
    v.hopPhase = 0;
    for (let i = 0; i < 40; i++) fx.push({ kind: 'confetti', x: v.x + (Math.random() - 0.5) * 40, y: v.y - 40 - Math.random() * 20, vx: (Math.random() - 0.5) * 40, vy: -20 + Math.random() * 20, grav: 40, t: 0, life: 2 + Math.random(), color: ['#ffd23f', '#ffffff', '#ff8c42', '#4cc9f0'][i % 4], spin: Math.random() * 6 });
    fx.push({ kind: 'text', x: v.x, y: v.y - 44, text: `LEVEL UP! Lv${p.level}`, color: '#ffd23f', t: 0, life: 3, big: true });
    if (inRoom(v.x, v.y)) { sfx.hire(); setTimeout(() => sfx.money(), 250); }
    return;
  }
  if (p.kind === 'heal') v.happyUntil = performance.now() + 6000;
  if (p.kind === 'heal') fx.push({ kind: 'text', x: v.x, y: v.y - 30, text: `+${p.amount} ❤`, color: '#5dff8a', t: 0, life: 1.8 });
  if (p.kind === 'hurt') fx.push({ kind: 'text', x: v.x, y: v.y - 30, text: `${p.amount} ❤`, color: '#ff5d5d', t: 0, life: 1.8 });
  if (p.kind === 'death') {
    v.leave = { done: false };
    v.path = null;
    if (!goTo(v, POI.elevator.x, POI.elevator.y, 'left')) v.leave.done = true;
    else say(p.agentId, ['Eşyalarımı topluyorum…', 'Bu iş bana göre değilmiş 😢', 'Bir gün geri döneceğim!'][Math.floor(Math.random() * 3)], 4000);
    for (let i = 0; i < 16; i++) fx.push({ kind: 'spark', x: v.x, y: v.y - 12, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.8) * 80, t: 0, life: 1.2, color: '#c9d1e0' });
    fx.push({ kind: 'text', x: v.x, y: v.y - 36, text: 'KOVULDU', color: '#ff5d5d', t: 0, life: 3, big: true });
  }
}

const sleepSpots = new Map();
function sleepSpotFor(id) {
  if (!sleepSpots.has(id)) {
    const used = new Set(sleepSpots.values());
    const free = POI.couch.findIndex((_, i) => !used.has(i));
    sleepSpots.set(id, free >= 0 ? free : Math.floor(Math.random() * POI.couch.length));
  }
  return POI.couch[sleepSpots.get(id)];
}

function updateAgents(dt, now) {
  for (const a of S.agents.values()) {
    const v = ensureVis(a);
    v.animT += dt;
    v.blinkT -= dt;
    if (v.blinkT < -0.15) v.blinkT = 2 + Math.random() * 4;
    const seat = seatOf(a.role);

    if (a.status === 'dead' && v.leave && !v.leave.done) {
      if (v.path?.length) {
        const [tx, ty] = v.path[0];
        const gx = tx * T + 8, gy = ty * T + 12;
        const dx = gx - v.x, dy = gy - v.y;
        const dist = Math.hypot(dx, dy);
        const sp = 45 * dt;
        if (dist <= sp) { v.x = gx; v.y = gy; v.path.shift(); }
        else { v.x += (dx / dist) * sp; v.y += (dy / dist) * sp; v.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0); }
        v.frame = 1 + (Math.floor(v.animT * 5) % 2);
        v.mode = 'leaving';
      } else {
        v.leave.done = true;
        if (inRoom(v.x, v.y)) { fx.push({ kind: 'text', x: v.x, y: v.y - 30, text: '👋 Hoşça kal', color: '#c9d1e0', t: 0, life: 2.5 }); sfx.door(); }
      }
      continue;
    }
    if (a.status === 'dead') {
      v.mode = 'ghost';
      v.path = null;
      v.x += (seat.x - v.x) * Math.min(1, dt * 2);
      v.y += (seat.y - 6 - v.y) * Math.min(1, dt * 2);
      continue;
    }
    if (a.status !== 'sleeping') sleepSpots.delete(a.id);

    // istenen konum
    if (v.mode !== 'walking' && v.mode !== 'visit' && v.mode !== 'wander') {
      if (a.status === 'sleeping') {
        const sp = sleepSpotFor(a.id);
        if (v.mode !== 'sleep') {
          if (!goTo(v, sp.x, sp.y, 'sleep')) { v.mode = 'sleep'; }
        }
      } else if (v.mode !== 'seat') {
        if (!goTo(v, seat.tx, seat.ty, 'seat')) { v.x = seat.x; v.y = seat.y; v.mode = 'seat'; }
      } else if (a.status === 'idle' && now > v.nextWander) {
        v.nextWander = now + 25000 + Math.random() * 60000;
        if (Math.random() < 0.55) {
          const kinds = ['coffee', 'water', 'vending', 'printer', 'window', 'pingpong', 'aquarium'];
          const pool = POI[kinds[Math.floor(Math.random() * kinds.length)]];
          const dst = pool[Math.floor(Math.random() * pool.length)];
          goTo(v, dst.x, dst.y, 'wander', 5000 + Math.random() * 7000, () => {
            if (Math.random() < 0.5) say(a.id, ((a.stress || 0) > 60 ? ['Nefes al… nefes ver…', 'Kovulmayacağım, kovulmayacağım', 'Bir kahve daha lazım ☕', 'Runway’e bakamıyorum 😰'] : ['☕ Kahve molası', 'Fikir lazım…', 'Bugün satış çıkacak', 'Biraz hava…', 'Ping-pong? 🏓'])[Math.floor(Math.random() * 4)], 3500);
          });
        }
      }
    }

    // hareket
    if (v.mode === 'walking' && v.path) {
      if (!v.path.length) {
        v.path = null;
        v.mode = v.next || 'seat';
        if (v.mode === 'seat') { v.x = seat.x; v.y = seat.y; v.dir = 0; }
        if (v.mode === 'sleep') { v.dir = 0; }
        v.waitUntil = now + (v.wait || 0);
        v.after?.();
        v.after = null;
        continue;
      }
      const [tx, ty] = v.path[0];
      const gx = tx * T + 8, gy = ty * T + 12;
      const dx = gx - v.x, dy = gy - v.y;
      const dist = Math.hypot(dx, dy);
      const stressed = (a.stress || 0) > 60;
      const sp = (stressed ? 105 : 70) * dt;
      if (dist <= sp) { v.x = gx; v.y = gy; v.path.shift(); }
      else {
        v.x += (dx / dist) * sp;
        v.y += (dy / dist) * sp;
        v.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
      }
      const nf = 1 + (Math.floor(v.animT * (stressed ? 12 : 8)) % 2);
      if (nf !== v.frame && inRoom(v.x, v.y)) dust(v.x, v.y, stressed ? 2 : 1);
      v.frame = nf;
    } else if ((v.mode === 'visit' || v.mode === 'wander') && now > v.waitUntil) {
      if (!goTo(v, seat.tx, seat.ty, 'seat')) { v.mode = 'seat'; v.x = seat.x; v.y = seat.y; }
    } else v.frame = 0;

    if (v.mode === 'visit' || v.mode === 'wander') {
      // ziyarette yüzünü hedefe dön
      v.dir = v.mode === 'visit' ? (v.face ?? 1) : v.dir;
    }
  }
  for (const id of vis.keys()) if (!S.agents.has(id)) vis.delete(id);
}

// ======================= ROBOT & KÖPEK =======================
function moveAlong(e, dt, speed) {
  if (!e.path?.length) return true;
  const [tx, ty] = e.path[0];
  const gx = tx * T + 8, gy = ty * T + 12;
  const dx = gx - e.x, dy = gy - e.y;
  const dist = Math.hypot(dx, dy);
  const sp = speed * dt;
  if (dist <= sp) { e.x = gx; e.y = gy; e.path.shift(); }
  else { e.x += (dx / dist) * sp; e.y += (dy / dist) * sp; e.flip = dx < 0; }
  e.animT += dt * 8;
  e.frame = Math.floor(e.animT) % 2;
  return !e.path.length;
}

function updateRobot(dt, now) {
  const r = robotV;
  if (r.wait > now) return;
  if (!r.path?.length) {
    if (r.stage === 'toFrom') {
      r.stage = 'toTarget';
      r.carrying = true;
      const d = frontOfDesk(r.job.to);
      r.path = findPath(Math.floor(r.x / T), Math.floor((r.y - 4) / T), d.x, d.y)?.slice(1) || [];
      r.wait = now + 600;
    } else if (r.stage === 'toTarget') {
      r.carrying = false;
      say(r.job.toId, '📨 Yeni görev geldi!', 3000);
      r.stage = 'home';
      r.path = findPath(Math.floor(r.x / T), Math.floor((r.y - 4) / T), POI.robotDock.x, POI.robotDock.y)?.slice(1) || [];
      r.wait = now + 900;
    } else if (r.jobs.length) {
      r.job = r.jobs.shift();
      r.stage = r.job.from ? 'toFrom' : 'toTarget';
      r.carrying = !r.job.from;
      const d = r.job.from ? frontOfDesk(r.job.from) : frontOfDesk(r.job.to);
      r.path = findPath(Math.floor(r.x / T), Math.floor((r.y - 4) / T), d.x, d.y)?.slice(1) || [];
    } else r.stage = null;
    return;
  }
  moveAlong(r, dt, 95);
}

function updateDog(dt, now) {
  const d = dogV;
  d.animT += dt * 1.5;
  const near = Math.hypot(player.x - d.x, player.y - d.y) < 40;
  if (d.sleeping && near && Math.random() < dt * 0.6) { d.sleeping = false; d.wakeUntil = now + 8000; }
  if (!d.sleeping) {
    if (!d.path?.length && Math.hypot(player.x - d.x, player.y - d.y) > 26) {
      d.path = findPath(Math.floor(d.x / T), Math.floor((d.y - 4) / T), Math.floor(player.x / T), Math.floor((player.y - 4) / T))?.slice(1, -1);
    }
    if (d.path?.length) moveAlong(d, dt, 80);
    else d.frame = Math.floor(d.animT * 3) % 2;
    if (now > d.wakeUntil) {
      d.sleeping = true;
      d.path = findPath(Math.floor(d.x / T), Math.floor((d.y - 4) / T), POI.dog.x, POI.dog.y)?.slice(1);
    }
  } else if (d.path?.length) { moveAlong(d, dt, 60); }
  else d.frame = Math.floor(d.animT) % 2;
}

// ======================= DÖNGÜ =======================
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  updatePlayer(dt);
  updateRoom(dt);
  updateDialog(dt);
  updateTraffic(dt, now);
  updateAgents(dt, now);
  updateRobot(dt, now);
  updateDog(dt, now);
  for (const f of fx) {
    f.t += dt;
    if (f.vx != null) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += (f.grav ?? 140) * dt; }
  }
  for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t > fx[i].life) fx.splice(i, 1);
  hoverInteract = nearestInteract();
  ambientSound(dt);
  stressEffects(dt, now);
  render(now);
  requestAnimationFrame(loop);
}

// yakındaki çalışan ajanların klavye tıkırtısı + oyuncu adımları
let keyAcc = 0;
let stepAcc = 0;
function ambientSound(dt) {
  if (!document.hidden) setAmbience(trans.phase === 'out' ? null : room.id);
  keyAcc += dt;
  if (keyAcc > 0.09) {
    keyAcc = 0;
    for (const [id, v] of vis) {
      const a = S.agents.get(id);
      if (!a || a.status !== 'working' || v.mode !== 'seat' || !inRoom(v.x, v.y)) continue;
      const d = Math.hypot(player.x - v.x, player.y - v.y);
      if (d < 90 && Math.random() < 0.5) sfx.key(0.28 * (1 - d / 90));
    }
  }
  if (player.moving) {
    stepAcc += dt;
    if (stepAcc > (keys.has('shift') ? 0.18 : 0.28)) { stepAcc = 0; sfx.step(); }
  }
}

// ======================= RENDER =======================
function dayLight() {
  const d = new Date();
  const h = d.getHours() + d.getMinutes() / 60;
  // 0 = gündüz, 1 = gece
  if (h >= 8 && h < 17.5) return 0;
  if (h >= 17.5 && h < 20) return (h - 17.5) / 2.5;
  if (h >= 6 && h < 8) return 1 - (h - 6) / 2;
  return 1;
}

function render(now) {
  const vw = cv.width / zoom, vh = cv.height / zoom;
  const b = roomBounds(room);
  // oda ekrandan küçükse ortala (etrafı simsiyah), büyükse oyuncuyu takip et ama oda dışına taşma
  const ct = camTarget();
  cam.x = b.w <= vw ? b.x - (vw - b.w) / 2 : Math.max(b.x, Math.min(b.x + b.w - vw, ct.x - vw / 2));
  cam.y = b.h <= vh ? b.y - (vh - b.h) / 2 : Math.max(b.y, Math.min(b.y + b.h - vh, ct.y - 10 - vh / 2));
  cam.x = Math.round(cam.x);
  cam.y = Math.round(cam.y);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(zoom, 0, 0, zoom, -cam.x * zoom, -cam.y * zoom);
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  ctx.drawImage(staticLayer, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);

  const night = dayLight();
  drawWallDecor(now, night);

  for (const f of furniture) if (f.flat && f.room === room.id) drawFurniture(f, now);

  const list = [];
  for (const f of furniture) if (!f.flat && !f.wallMounted && f.room === room.id) list.push({ y: f.sortY ?? f.y + 16, draw: () => drawFurniture(f, now) });
  for (const [id, v] of vis) if (inRoom(v.x, v.y)) list.push({ y: v.mode === 'seat' ? v.y - 3 : v.y, draw: () => drawAgent(id, v, now) });
  list.push({ y: player.y, draw: drawPlayer });
  if (inRoom(robotV.x, robotV.y)) list.push({ y: robotV.y, draw: () => { shadow(robotV.x, robotV.y, 6); drawSprite(robot(Math.floor(time * 4) % 2, robotV.carrying), robotV.x - 7, robotV.y - 19, robotV.flip); } });
  for (const c of traffic) list.push({ y: c.y + 26, draw: () => drawSprite(FURN.car(c.color), c.x, c.y, c.v < 0) });
  if (inRoom(dogV.x, dogV.y)) list.push({ y: dogV.y, draw: () => drawSprite(dog(dogV.frame, dogV.sleeping), dogV.x - 10, dogV.y - 11, dogV.flip) });
  list.sort((a, c) => a.y - c.y);
  for (const it of list) it.draw();

  for (const f of fx) if (inRoom(f.x, f.y) || f.global) drawFx(f);

  // oda içi gölgelendirme: duvar diplerinde yumuşak karanlık (Undertale derinliği)
  roomShade(b);
  ctx.restore();

  if (night > 0.02) drawLighting(night, now);

  ctx.setTransform(zoom, 0, 0, zoom, -cam.x * zoom, -cam.y * zoom);
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x - 40, b.y - 60, b.w + 80, b.h + 80);
  ctx.clip();
  for (const [id, v] of vis) if (inRoom(v.x, v.y)) drawAgentOverlay(id, v, now);
  drawPlayerOverlay();
  ctx.restore();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  screenEffects(b);
  if (minimapOn && !dialog.open) drawMinimap();
  drawDialog();
}

function shadow(x, y, r = 6) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
}

function dust(x, y, n = 1) {
  for (let i = 0; i < n; i++) fx.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 6, y: y - 1, vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 8, t: 0, life: 0.45 + Math.random() * 0.2, grav: 10 });
}

let shadeCache = { key: '', cv: null };
function roomShade(b) {
  const key = `${b.x},${b.y},${b.w},${b.h}`;
  if (shadeCache.key !== key) {
    const c = document.createElement('canvas');
    c.width = b.w;
    c.height = b.h;
    const g = c.getContext('2d');
    const edge = (x0, y0, x1, y1, w, h) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(10,6,20,0.38)');
      gr.addColorStop(1, 'rgba(10,6,20,0)');
      g.fillStyle = gr;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h);
    };
    edge(0, 2 * T, 0, 2 * T + 22, b.w, 22); // üst duvar dibi
    edge(T, 0, T + 18, 0, 18, b.h); // sol
    edge(b.w - T, 0, b.w - T - 18, 0, 18, b.h); // sağ
    edge(0, b.h - T, 0, b.h - T - 14, b.w, 14); // alt
    shadeCache = { key, cv: c };
  }
  ctx.drawImage(shadeCache.cv, b.x, b.y);
}

/** Ekran efektleri: vinyet, CRT tarama çizgileri, sinematik siyah şeritler, kararma geçişi, oda başlığı. */
function screenEffects(b) {
  const W2 = cv.width, H2 = cv.height;
  // vinyet
  if (!reduceFx) {
  const vg = ctx.createRadialGradient(W2 / 2, H2 / 2, Math.min(W2, H2) * 0.35, W2 / 2, H2 / 2, Math.max(W2, H2) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W2, H2);
  }
  // tarama çizgileri (uzun ince siyah çizgiler)
  if (fxScanlines) {
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    const step = Math.max(3, Math.round(zoom));
    for (let y = 0; y < H2; y += step) ctx.fillRect(0, y, W2, 1);
  }
  // sinematik şeritler: geçişte kapanır, odaya girince açılır
  let bar = 0;
  if (trans.phase === 'out') bar = Math.min(1, trans.t / 0.22);
  else if (trans.phase === 'in') bar = Math.max(0, 1 - trans.t / 0.35);
  const base = reduceFx ? 0 : H2 * 0.06;
  const bh = base + bar * H2 * 0.44;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W2, bh);
  ctx.fillRect(0, H2 - bh, W2, bh);
  // kararma
  let fade = 0;
  if (trans.phase === 'out') fade = Math.min(1, trans.t / 0.22);
  else if (trans.phase === 'in') fade = Math.max(0, 1 - trans.t / 0.35);
  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, W2, H2);
  }
  if (follow) {
    const dpr = cv.width / cv.clientWidth;
    const a = S.agents.get(follow);
    ctx.font = `bold ${Math.round(14 * dpr)}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = Math.floor(performance.now() / 500) % 2 ? '#ff3b3b' : '#fff';
    ctx.fillText(`● REC  ${a?.name || ''}`, W2 - 24 * dpr, base + 16 * dpr);
  }
  // Undertale tarzı oda başlığı
  if (banner.t < 3.2) {
    const a = banner.t < 0.3 ? banner.t / 0.3 : banner.t > 2.5 ? Math.max(0, 1 - (banner.t - 2.5) / 0.7) : 1;
    const dpr = cv.width / cv.clientWidth;
    const fs = Math.round(22 * dpr);
    ctx.globalAlpha = a;
    ctx.font = `bold ${fs}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label = `* ${tr(banner.text)}`;
    const tw = ctx.measureText(label).width;
    const x = 28 * dpr, y = base + 34 * dpr;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 12 * dpr, y - fs * 0.9, tw + 24 * dpr, fs * 1.8);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeRect(x - 12 * dpr, y - fs * 0.9, tw + 24 * dpr, fs * 1.8);
    ctx.fillStyle = '#fff';
    const shown = Math.min(label.length, Math.floor(banner.t * 40));
    ctx.fillText(label.slice(0, shown), x, y);
    ctx.globalAlpha = 1;
  }
}

function drawSprite(img, x, y, flip = false) {
  if (flip) {
    ctx.save();
    ctx.translate(Math.round(x) + img.width, Math.round(y));
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  } else ctx.drawImage(img, Math.round(x), Math.round(y));
}

function text(str, x, y, size = 5, color = '#fff', align = 'center', bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(tr(str), x, y);
}

function pill(x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(3, h / 2));
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

// ---------- duvar dekorları ----------
function drawWallDecor(now, night) {
  if (room.y0 === 2) for (const [x, w] of WINDOWS) if (x >= room.x0 && x + w <= room.x1 + 1) drawWindow(x * T, 1 * T, w * T, night, now);
  for (const f of furniture) if (f.wallMounted && f.room === room.id) drawFurniture(f, now);
}

function drawWindow(x, y, w, night, now) {
  const h = 12;
  const top = x;
  const sky = ctx.createLinearGradient(0, y + 1, 0, y + 1 + h);
  const hr = new Date().getHours();
  if (night > 0.85) { sky.addColorStop(0, '#0b1030'); sky.addColorStop(1, '#1d2350'); }
  else if (night > 0.05 || hr < 9) { sky.addColorStop(0, '#3b3a78'); sky.addColorStop(0.6, '#e2725b'); sky.addColorStop(1, '#f6c26b'); }
  else { sky.addColorStop(0, '#6db3f2'); sky.addColorStop(1, '#bfe3ff'); }
  ctx.fillStyle = '#5a4636';
  ctx.fillRect(x - 1, y, w + 2, h + 3);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y + 1, w, h);
  // şehir silueti
  for (let i = 0; i < w; i += 5) {
    const bh = 3 + ((i * 7 + x) % 7);
    ctx.fillStyle = night > 0.5 ? '#151a33' : '#6e7f99';
    ctx.fillRect(x + i, y + 1 + h - bh, 4, bh);
    if (night > 0.5 && (i + Math.floor(now / 2000)) % 3) {
      ctx.fillStyle = '#ffd86b';
      ctx.fillRect(x + i + 1, y + 1 + h - bh + 1, 1, 1);
    }
  }
  if (night > 0.85) {
    ctx.fillStyle = '#fff';
    for (let i = 3; i < w; i += 11) ctx.fillRect(x + i, y + 2 + ((i * 3) % 4), 1, 1);
  }
  // çerçeve
  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(x, y + 1 + h / 2, w, 1);
  for (let i = 0; i <= w; i += 16) ctx.fillRect(x + i - (i === w ? 1 : 0), y + 1, 1, h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 2, y + 2, 1, 4);
}

// ---------- mobilya ----------
function drawFurniture(f, now) {
  switch (f.kind) {
    case 'desk':
      drawSprite(FURN.desk(), f.x, f.y);
      if (topRole() === f.role) {
        const b = Math.sin(now / 500) > 0.6 ? 1 : 0;
        drawSprite(FURN.trophy(), f.x + 2, f.y - 10 - b);
      }
      return;
    case 'bossDesk': return drawSprite(FURN.bossDesk(), f.x, f.y);
    case 'chair': return drawSprite(FURN.chair(f.color), f.x, f.y);
    case 'monitor': return drawMonitor(f, now);
    case 'laptop': return drawSprite(FURN.laptop(), f.x, f.y);
    case 'plant': return drawSprite(FURN.plant(f.v), f.x + 1, f.y);
    case 'bigPlant': return drawSprite(FURN.bigPlant(), f.x - 1, f.y);
    case 'cabinet': return drawSprite(FURN.cabinet(), f.x + 1, f.y);
    case 'bookshelf': return drawSprite(FURN.bookshelf(), f.x + 2, f.y);
    case 'waterCooler': return drawSprite(FURN.waterCooler(), f.x + 2, f.y);
    case 'coffee': return drawSprite(FURN.coffee(), f.x, f.y);
    case 'counter': return drawSprite(FURN.counter(f.w), f.x, f.y);
    case 'fridge': return drawSprite(FURN.fridge(), f.x, f.y);
    case 'vending': return drawSprite(FURN.vending(), f.x - 1, f.y);
    case 'couch': return drawSprite(FURN.couch(), f.x, f.y);
    case 'armchair': return drawSprite(FURN.armchair(), f.x, f.y);
    case 'rug': return drawSprite(FURN.rug(f.w, f.h, f.color), f.x, f.y);
    case 'table': return drawSprite(FURN.table(f.w, f.h), f.x, f.y);
    case 'printer': return drawSprite(FURN.printer(), f.x, f.y);
    case 'papers': return drawSprite(FURN.papers(), f.x, f.y);
    case 'mug': return drawSprite(FURN.mug(f.color), f.x, f.y);
    case 'lamp': return drawSprite(FURN.lamp(), f.x + 3, f.y);
    case 'safe': return drawSprite(FURN.safe(), f.x, f.y);
    case 'elevator': return drawSprite(FURN.elevator(), f.x, f.y);
    case 'rack': return drawRack(f, now);
    case 'deskLabel': return drawDeskLabel(f);
    case 'whiteboard': return drawWhiteboard(f);
    case 'clock': return drawClock(f);
    case 'sign': return drawSign(f);
    case 'poster': return drawPoster(f);
    case 'companySign': return drawCompanySign(f);
    case 'ticker': return drawTicker(f, now);
    case 'tv': return drawTv(f, now);
    case 'memorial': return drawMemorial(f);
    case 'inbox': return drawInbox(f, now);
    case 'acUnit': return drawSprite(FURN.acUnit(), f.x, f.y);
    case 'globe': return drawSprite(FURN.globe(), f.x + 2, f.y);
    case 'candle': {
      drawSprite(FURN.candle(), f.x + 5, f.y);
      if (Math.sin(now / 90 + f.x) > 0.3) { ctx.fillStyle = '#fff3b0'; ctx.fillRect(f.x + 7, f.y - 1, 1, 1); }
      return;
    }
    case 'pingpong': {
      drawSprite(FURN.pingpong(), f.x, f.y);
      // top sekiyor (biri oynuyorsa hızlı)
      const t = (now / 700) % 2;
      const bx = f.x + 8 + (t < 1 ? t : 2 - t) * 64;
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx, f.y + 10 - Math.abs(Math.sin(now / 120)) * 6, 2, 2);
      return;
    }
    case 'beanbag': return drawSprite(FURN.beanbag(f.color), f.x - 2, f.y);
    case 'trash': return drawSprite(FURN.trash(), f.x + 4, f.y);
    case 'bench': return drawSprite(FURN.bench(), f.x, f.y);
    case 'microwave': return drawSprite(FURN.microwave(), f.x, f.y);
    case 'reception': return drawSprite(FURN.reception(), f.x, f.y);
    case 'aquarium': {
      drawSprite(FURN.aquarium(), f.x, f.y);
      for (let i = 0; i < 4; i++) {
        const fxp = f.x + 4 + ((now / (30 + i * 9) + i * 40) % 38);
        const fyp = f.y + 4 + i * 3 + Math.sin(now / 400 + i) * 1.5;
        ctx.fillStyle = ['#ff8c42', '#f1c40f', '#ff5d8f', '#fff'][i];
        ctx.fillRect(fxp, fyp, 3, 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(f.x + 20, f.y + 14 - ((now / 60) % 12), 1, 1);
      return;
    }
    case 'arcade': {
      drawSprite(FURN.arcade(), f.x - 1, f.y);
      const hue = (now / 10) % 360;
      ctx.fillStyle = `hsl(${hue},80%,55%)`;
      ctx.fillRect(f.x + 2, f.y + 10 + (Math.floor(now / 200) % 7), 4, 2);
      ctx.fillStyle = '#46d4ff';
      ctx.fillRect(f.x + 9 + Math.sin(now / 300) * 3, f.y + 14, 2, 2);
      return;
    }
    case 'multiMonitor': {
      drawSprite(FURN.multiMonitor(), f.x, f.y);
      for (let m = 0; m < 3; m++) for (let i = 0; i < 4; i++) {
        const h = 1 + Math.abs(Math.sin(now / 700 + i + m * 2)) * 6;
        ctx.fillStyle = (i + m) % 2 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(f.x + 3 + m * 16 + i * 3, f.y + 9 - h, 2, h);
      }
      return;
    }
    case 'cable':
      ctx.fillStyle = '#1a1d24';
      ctx.fillRect(f.x, f.y + 6, f.w * T, 3);
      ctx.fillStyle = '#46d4ff';
      ctx.fillRect(f.x + ((now / 20) % (f.w * T)), f.y + 7, 3, 1);
      return;
    case 'runner':
      ctx.fillStyle = '#5a2e2e';
      ctx.fillRect(f.x, f.y + 4, f.w, f.h - 8);
      ctx.fillStyle = '#7a3b3b';
      ctx.fillRect(f.x + 2, f.y + 6, f.w - 4, f.h - 12);
      ctx.fillStyle = '#d1a54a';
      ctx.fillRect(f.x + 2, f.y + 8, f.w - 4, 1);
      ctx.fillRect(f.x + 2, f.y + f.h - 9, f.w - 4, 1);
      return;
    case 'tree': {
      const sway = Math.round(Math.sin(now / 900 + f.x) * 0.6);
      return drawSprite(FURN.tree(), f.x + sway, f.y);
    }
    case 'streetLamp': return drawSprite(FURN.streetLamp(), f.x, f.y);
    case 'car': return drawSprite(FURN.car(f.color), f.x, f.y, f.flip);
    case 'busStop': return drawSprite(FURN.busStop(), f.x, f.y);
    case 'hydrant': return drawSprite(FURN.hydrant(), f.x + 3, f.y);
    case 'fence':
      for (let i = 0; i < f.w; i += 6) { ctx.fillStyle = '#5a4636'; ctx.fillRect(f.x + i, f.y - 10, 2, 12); }
      ctx.fillStyle = '#6e5743';
      ctx.fillRect(f.x, f.y - 8, f.w, 2);
      ctx.fillRect(f.x, f.y - 3, f.w, 2);
      return;
    case 'roadMarks':
      ctx.fillStyle = '#e8d76a';
      for (let i = 0; i < f.w * T; i += 24) ctx.fillRect(f.x + i, f.y + 7, 12, 2);
      return;
    case 'glassDoor': {
      ctx.fillStyle = 'rgba(160,210,240,0.35)';
      ctx.fillRect(f.x, f.y, f.w, T * 2);
      ctx.fillStyle = '#37474f';
      ctx.fillRect(f.x, f.y, f.w, 1);
      ctx.fillRect(f.x + f.w / 2 - 0.5, f.y, 1, T * 2);
      return;
    }
    case 'neon': return drawNeon(f, now);
    case 'facadeWindow': return drawFacadeWindow(f, now);
    case 'skyline': return drawSkyline(f, now);
    case 'helipad': {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x + 24, f.y + 24, 22, 0, Math.PI * 2);
      ctx.stroke();
      text('H', f.x + 24, f.y + 25, 22, 'rgba(255,255,255,0.8)', 'center', true);
      return;
    }
    case 'deckChair': {
      const c = f.color || '#e05a2b';
      ctx.fillStyle = '#6b4a2e';
      ctx.fillRect(f.x + 2, f.y + 10, 24, 3);
      ctx.fillRect(f.x + 4, f.y + 13, 2, 3);
      ctx.fillRect(f.x + 22, f.y + 13, 2, 3);
      ctx.fillStyle = c;
      ctx.fillRect(f.x + 2, f.y + 4, 8, 7);
      ctx.fillRect(f.x + 9, f.y + 8, 17, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(f.x + 3, f.y + 5, 6, 1);
      return;
    }
    case 'umbrella': {
      const c = f.color || '#e05a2b';
      ctx.fillStyle = '#3a2a1e';
      ctx.fillRect(f.x + 15, f.y + 8, 2, 30);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y + 12);
      ctx.quadraticCurveTo(f.x + 16, f.y - 4, f.x + 32, f.y + 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) ctx.fillRect(f.x + 3 + i * 8, f.y + 9, 3, 3);
      return;
    }
    case 'grill': {
      ctx.fillStyle = '#2b2b30';
      ctx.fillRect(f.x + 2, f.y + 4, 12, 7);
      ctx.fillStyle = '#17161b';
      ctx.fillRect(f.x + 4, f.y + 11, 2, 8);
      ctx.fillRect(f.x + 10, f.y + 11, 2, 8);
      ctx.fillStyle = Math.sin(now / 120) > 0 ? '#ff8c42' : '#e74c3c';
      ctx.fillRect(f.x + 4, f.y + 3, 8, 1);
      ctx.fillStyle = 'rgba(200,200,200,0.35)';
      ctx.fillRect(f.x + 6 + Math.sin(now / 300) * 2, f.y - 4 - ((now / 60) % 8), 2, 2);
      return;
    }
    case 'telescope': {
      ctx.fillStyle = '#3a3f4b';
      ctx.fillRect(f.x + 7, f.y + 8, 2, 12);
      ctx.fillRect(f.x + 3, f.y + 19, 10, 2);
      ctx.fillStyle = '#c9ccd3';
      ctx.save();
      ctx.translate(f.x + 8, f.y + 8);
      ctx.rotate(-0.5);
      ctx.fillRect(-2, -10, 4, 14);
      ctx.restore();
      return;
    }
    case 'stringLights': {
      for (let i = 0; i < f.w; i += 12) {
        const sag = Math.sin((i / f.w) * Math.PI * 6) * 3;
        const on = (Math.floor(now / 400) + i / 12) % 3 !== 0;
        ctx.fillStyle = on ? ['#ffd23f', '#ff8c42', '#4cc9f0', '#ff5d8f'][(i / 12) % 4] : '#5a4636';
        ctx.fillRect(f.x + i, f.y + 4 + sag, 2, 2);
      }
      return;
    }
    case 'painting': return drawPainting(f);
    case 'labSign': return drawLabSign(f, now);
    case 'logoWall': return drawLogoWall(f);
    case 'entrance': return drawEntrance(f, now);
    case 'tvBig': return drawTvBig(f, now);
    case 'robotDock':
      ctx.fillStyle = 'rgba(70,212,255,0.25)';
      ctx.fillRect(f.x + 2, f.y + 6, 12, 6);
      return;
  }
}

let topCache = { t: 0, role: null };
function topRole() {
  const now = performance.now();
  if (now - topCache.t > 2000) topCache = { t: now, role: employeeOfMonth()?.role || null };
  return topCache.role;
}

function agentByRole(role) {
  for (const a of S.agents.values()) if (a.role === role) return a;
  return null;
}

function drawMonitor(f, now) {
  const a = agentByRole(f.role);
  const x = f.x, y = f.y;
  drawSprite(FURN.monitorFrame(), x, y);
  const sx = x + 1, sy = y + 1, sw = 12, sh = 7;
  const t = now / 1000;
  if (!a || a.status === 'dead') { ctx.fillStyle = '#050507'; ctx.fillRect(sx, sy, sw, sh); return; }
  if (a.status === 'sleeping') {
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = '#46d4ff';
    ctx.fillRect(sx + Math.floor((Math.sin(t) + 1) * 5), sy + Math.floor((Math.cos(t * 1.3) + 1) * 3), 1, 1);
    return;
  }
  const act = a.status === 'idle' ? 'idle' : a.status === 'oncall' ? 'idle' : a.activity;
  switch (act) {
    case 'coding': {
      ctx.fillStyle = '#1b1f2b';
      ctx.fillRect(sx, sy, sw, sh);
      const off = Math.floor(t * 4);
      const cols = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff'];
      for (let i = 0; i < 5; i++) {
        const k = (i + off) * 7;
        ctx.fillStyle = cols[k % 5];
        ctx.fillRect(sx + 1 + (k % 3), sy + 1 + i * 1.3, 3 + (k % 7), 1);
      }
      break;
    }
    case 'research': {
      ctx.fillStyle = '#f4f6fa';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = '#4285f4';
      ctx.fillRect(sx + 1, sy + 1, 10, 1);
      ctx.fillStyle = '#9aa0aa';
      for (let i = 0; i < 3; i++) ctx.fillRect(sx + 1, sy + 3 + i * 1.3, 4 + ((i * 3 + Math.floor(t * 2)) % 6), 1);
      break;
    }
    case 'writing':
    case 'talking': {
      ctx.fillStyle = '#fbfbf7';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = '#555';
      const n = Math.floor(t * 3) % 6;
      for (let i = 0; i < 5; i++) ctx.fillRect(sx + 1, sy + 1 + i * 1.2, i === 4 ? n + 1 : 9, 0.8);
      break;
    }
    case 'design': {
      ctx.fillStyle = '#2a2a33';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = `hsl(${(t * 60) % 360},80%,60%)`;
      ctx.fillRect(sx + 1, sy + 1, 5, 5);
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.arc(sx + 9, sy + 3.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'analyzing':
    case 'trading': {
      ctx.fillStyle = '#0d1b16';
      ctx.fillRect(sx, sy, sw, sh);
      for (let i = 0; i < 5; i++) {
        const h = 1 + Math.abs(Math.sin(t + i * 1.3)) * 5;
        ctx.fillStyle = i % 2 ? '#2ecc71' : '#27ae60';
        ctx.fillRect(sx + 1 + i * 2.2, sy + sh - h, 1.5, h);
      }
      break;
    }
    case 'reviewing': {
      ctx.fillStyle = '#f4f6fa';
      ctx.fillRect(sx, sy, sw, sh);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = (i + Math.floor(t)) % 3 ? '#27ae60' : '#e74c3c';
        ctx.fillRect(sx + 1, sy + 1 + i * 2, 1.5, 1.5);
        ctx.fillStyle = '#9aa0aa';
        ctx.fillRect(sx + 4, sy + 1.3 + i * 2, 6, 0.8);
      }
      break;
    }
    case 'planning': {
      ctx.fillStyle = '#eef1f6';
      ctx.fillRect(sx, sy, sw, sh);
      const cols = ['#f39c12', '#3498db', '#2ecc71'];
      for (let c = 0; c < 3; c++) for (let r = 0; r < 2 + ((c + Math.floor(t)) % 2); r++) {
        ctx.fillStyle = cols[c];
        ctx.fillRect(sx + 1 + c * 3.7, sy + 1 + r * 2, 3, 1.5);
      }
      break;
    }
    default: {
      // boşta: masaüstü
      ctx.fillStyle = a.role === 'claude' ? '#c96442' : '#2b4a7a';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(sx + 1, sy + 1, 2, 1.5);
      ctx.fillRect(sx + 1, sy + 3.5, 2, 1.5);
      if (a.role === 'claude') { ctx.fillStyle = '#fff'; ctx.fillRect(sx + 5, sy + 2, 3, 3); }
    }
  }
  // ekran parıltısı
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(sx, sy, 4, 2);
}

function drawRack(f, now) {
  drawSprite(FURN.serverRack(), f.x, f.y);
  const p = f.provIdx >= 0 ? S.providers[f.provIdx] : { state: 'ok', name: '' };
  const t = now / 1000;
  if (f.provIdx < 0) {
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = (i + Math.floor(t * 4)) % 3 ? '#ff8a50' : '#3a1d10';
      ctx.fillRect(f.x + 11, f.y + 3 + i * 4.4, 2, 1);
    }
    return;
  }
  const color = !p || p.state === 'off' ? '#3a3f4b' : p.state === 'ok' ? '#2ecc71' : p.state === 'cool' ? '#f1c40f' : '#e74c3c';
  for (let i = 0; i < 7; i++) {
    const on = p && p.state !== 'off' && ((i * 13 + Math.floor(t * (p.state === 'ok' ? 6 : 2))) % 3 !== 0);
    ctx.fillStyle = on ? color : '#1a1d24';
    ctx.fillRect(f.x + 11, f.y + 3 + i * 4.4, 2, 1);
    ctx.fillStyle = on && i % 2 ? '#46d4ff' : '#1a1d24';
    ctx.fillRect(f.x + 9, f.y + 3 + i * 4.4, 1, 1);
  }
  if (p) {
    pill(f.x - 4, f.y + 35, 24, 6, 'rgba(10,12,18,0.8)');
    text(p.name.split(' ')[0].slice(0, 9), f.x + 8, f.y + 38, 3.2, p.state === 'off' ? '#7b8494' : color);
  }
}

function drawDeskLabel(f) {
  const a = agentByRole(f.role);
  const w = Math.max(30, f.text.length * 3.9 + 8);
  const x = f.x + 16 - w / 2;
  const dead = a?.status === 'dead';
  pill(x, f.y, w, 8, dead ? '#5a1d1d' : '#f2e6c9', dead ? '#ff6b6b' : '#7a5c3e');
  text(dead ? 'KOVULDU' : f.text, f.x + 16, f.y + 4.2, 4, dead ? '#ffb3b3' : '#3a2a1a', 'center', true);
}

function drawWhiteboard(f) {
  const x = f.x, y = f.y + 1;
  ctx.fillStyle = '#9aa0aa';
  ctx.fillRect(x - 1, y - 1, f.w + 2, 14 + 2);
  ctx.fillStyle = '#fbfbfb';
  ctx.fillRect(x, y, f.w, 14);
  text('DEVAM EDEN İŞLER', x + 3, y + 2.5, 2.6, '#c0392b', 'left', true);
  const list = [...S.tasks.values()].filter((t) => t.status !== 'failed').sort((a, b) => (a.status === 'doing' ? -1 : 0) - (b.status === 'doing' ? -1 : 0) || b.updatedAt - a.updatedAt).slice(0, 4);
  list.forEach((t, i) => {
    const done = t.status === 'done';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.4;
    ctx.strokeRect(x + 3, y + 5 + i * 2.3, 1.6, 1.6);
    if (done) text('✓', x + 3.8, y + 5.8 + i * 2.3, 2.2, '#27ae60');
    if (t.status === 'doing') { ctx.fillStyle = '#f39c12'; ctx.fillRect(x + 3.3, y + 5.3 + i * 2.3, 1, 1); }
    text(t.title.slice(0, 44), x + 6, y + 5.9 + i * 2.3, 2, done ? '#888' : '#222', 'left');
  });
}

function drawClock(f) {
  const cx = f.x + 8, cy = f.y + 7;
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbfbf5';
  ctx.beginPath(); ctx.arc(cx, cy, 4.6, 0, Math.PI * 2); ctx.fill();
  const d = new Date();
  const hA = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2;
  const mA = d.getMinutes() / 60 * Math.PI * 2;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(hA) * 2.5, cy - Math.cos(hA) * 2.5); ctx.stroke();
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(mA) * 3.8, cy - Math.cos(mA) * 3.8); ctx.stroke();
}

function drawNeon(f, now) {
  const x = f.x, y = f.y + 2, w = f.w, h = 11;
  ctx.fillStyle = '#120d18';
  ctx.fillRect(x, y, w, h);
  const flick = Math.sin(now / 70) > -0.95 ? 1 : 0.3; // ara sıra titrer
  ctx.globalAlpha = flick;
  ctx.shadowColor = '#ff5a2b';
  ctx.shadowBlur = 6;
  text((S.company?.name || 'HUSTLE HQ').toUpperCase(), x + w / 2, y + h / 2, 6, '#ff8a50', 'center', true);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawFacadeWindow(f, now) {
  const x = f.x + 4, y = f.y + 2, w = 24, h = 11;
  ctx.fillStyle = '#4a2a22';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const night = dayLight();
  // içeride çalışan varsa gece pencere yanar
  const lit = night > 0.3 && (Math.floor(f.x / 7) + Math.floor(now / 60000)) % 4 !== 0;
  ctx.fillStyle = lit ? '#ffd86b' : night > 0.3 ? '#1d2350' : '#8fc3e8';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x + 2, y + 1, 1, 5);
  ctx.fillStyle = '#4a2a22';
  ctx.fillRect(x + w / 2, y, 1, h);
}

function drawSkyline(f, now) {
  const x = f.x, y = f.y, w = f.w, h = T * 2;
  const night = dayLight();
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  if (night > 0.85) { sky.addColorStop(0, '#070a24'); sky.addColorStop(1, '#1d2350'); }
  else if (night > 0.05) { sky.addColorStop(0, '#3b3a78'); sky.addColorStop(0.6, '#e2725b'); sky.addColorStop(1, '#f6c26b'); }
  else { sky.addColorStop(0, '#5aa4ec'); sky.addColorStop(1, '#bfe3ff'); }
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  if (night > 0.85) {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < w; i += 17) if ((i * 7) % 5 !== 0) ctx.fillRect(x + i, y + 2 + ((i * 13) % 12), 1, 1);
    ctx.fillStyle = '#f4f1e8';
    ctx.beginPath(); ctx.arc(x + w * 0.8, y + 8, 4, 0, Math.PI * 2); ctx.fill();
  } else if (night < 0.05) {
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.arc(x + w * 0.2, y + 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const cx = (now / 400) % (w + 60);
    ctx.fillRect(x + cx - 30, y + 6, 22, 4);
    ctx.fillRect(x + cx - 26, y + 3, 12, 4);
  }
  for (let i = 0; i < w; i += 9) {
    const bh = 7 + ((i * 7 + 3) % 15);
    ctx.fillStyle = night > 0.5 ? '#141831' : '#7d8ca6';
    ctx.fillRect(x + i, y + h - bh, 8, bh);
    if (night > 0.4) {
      ctx.fillStyle = '#ffd86b';
      for (let k = 0; k < bh - 3; k += 3) if (((i + k) * 31 + Math.floor(now / 3000)) % 4 === 0) ctx.fillRect(x + i + 2, y + h - bh + 2 + k, 1, 1);
    }
  }
  // cam korkuluk
  ctx.fillStyle = 'rgba(180,220,240,0.25)';
  ctx.fillRect(x, y + h - 8, w, 8);
  ctx.fillStyle = '#9aa3b0';
  ctx.fillRect(x, y + h - 9, w, 1);
  for (let i = 0; i < w; i += 32) ctx.fillRect(x + i, y + h - 9, 1, 9);
}

function drawPainting(f) {
  const x = f.x + 2, y = f.y + 1, w = 24, h = 12;
  ctx.fillStyle = '#c9a66b';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const pal = [['#f6c26b', '#e2725b', '#3b3a78'], ['#6db3f2', '#3f8f4a', '#2f7a43'], ['#2a2a33', '#e05a2b', '#f1c40f']][f.v || 0];
  ctx.fillStyle = pal[0];
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = pal[1];
  ctx.fillRect(x, y + h * 0.55, w, h * 0.45);
  ctx.fillStyle = pal[2];
  ctx.beginPath();
  ctx.arc(x + w * 0.7, y + h * 0.35, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawLabSign(f, now) {
  const x = f.x, y = f.y + 2, w = f.w, h = 11;
  ctx.fillStyle = '#1a0f0a';
  ctx.fillRect(x, y, w, h);
  const glow = 0.75 + Math.sin(now / 300) * 0.25;
  ctx.globalAlpha = glow;
  text('✳ CLAUDE AR-GE LAB', x + w / 2, y + h / 2, 4.4, '#ff9a5a', 'center', true);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e07a4a';
  ctx.fillRect(x, y + h - 1, w, 1);
}

function drawLogoWall(f) {
  const x = f.x, y = f.y + 1, w = f.w, h = 13;
  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e05a2b';
  ctx.fillRect(x + 4, y + 3, 7, 7);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 5, y + 4, 2, 2);
  ctx.fillRect(x + 8, y + 7, 2, 2);
  text((S.company?.name || 'HUSTLE HQ').toUpperCase(), x + 14, y + 6.5, 4.6, '#1b2440', 'left', true);
}

function drawEntrance(f, now) {
  const x = f.x, y = f.y, w = f.w;
  ctx.fillStyle = 'rgba(160,210,240,0.55)';
  ctx.fillRect(x, y + 2, w, T - 4);
  ctx.fillStyle = '#37474f';
  ctx.fillRect(x, y + 1, w, 1);
  ctx.fillRect(x + w / 2 - 0.5, y + 1, 1, T - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x + 4 + ((now / 80) % (w - 8)), y + 4, 1, 6);
  text('GİRİŞ', x + w / 2, y + T / 2, 3.4, '#1b2440', 'center', true);
}

function drawTvBig(f, now) {
  const x = f.x, y = f.y + 1, w = f.w, h = 13;
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#0c1630';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x, y, 16, 4);
  text('HABER', x + 8, y + 2.2, 2.6, '#fff', 'center', true);
  const d = S.decisions.at(-1);
  const msg = d ? `${d.by}: ${d.title}` : 'Hustle HQ açıldı';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + 5, w, 8);
  ctx.clip();
  const off = (now / 25) % (msg.length * 2.6 + w);
  text(msg, x + w - off, y + 9, 3.4, '#f6f0e1', 'left', true);
  ctx.restore();
}

function drawSign(f) {
  pill(f.x, f.y + 3, f.w, 8, '#1f2a44', '#d1a54a');
  text(f.text, f.x + f.w / 2, f.y + 7.2, 3.6, '#f2e6c9', 'center', true);
}

function drawPoster(f) {
  const x = f.x + 1, y = f.y + 1, w = 30, h = 13;
  ctx.fillStyle = '#5a4636';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = f.color;
  ctx.fillRect(x, y, w, h);
  const lines = f.text.split('\n');
  lines.forEach((l, i) => text(l, x + w / 2, y + 3.6 + i * 3.6, 2.7, '#2a1d12', 'center', true));
  ctx.fillStyle = '#e05a2b';
  ctx.fillRect(x + 6, y + h - 2.5, w - 12, 0.8);
}

function drawCompanySign(f) {
  const x = f.x, y = f.y + 1, w = f.w, h = 13;
  ctx.fillStyle = '#1b2440';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#d1a54a';
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  text((S.company?.name || 'HUSTLE HQ').toUpperCase(), x + w / 2, y + 5, 5, '#f6f0e1', 'center', true);
  text('YAPAY ZEKÂ OFİS A.Ş.', x + w / 2, y + 10, 2.4, '#d1a54a', 'center');
}

let tickerOff = 0;
function drawTicker(f, now) {
  const x = f.x, y = f.y + 1, w = f.w, h = 13;
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#04110b';
  ctx.fillRect(x, y, w, h);
  text('BORSA MASASI · PAPER TRADING (SANAL)', x + 3, y + 2.6, 2.4, '#f1c40f', 'left', true);
  let s = '';
  if (portfolio) {
    const pnl = portfolio.pnl;
    s = `PORTFÖY ${portfolio.value.toFixed(0)} (${pnl >= 0 ? '▲' : '▼'}${pnl.toFixed(0)})   ` + portfolio.positions.map((p) => `${p.sym} ${p.price} ${p.pnl >= 0 ? '▲' : '▼'}`).join('   ') + '   ' + portfolio.watch.join(' · ');
  } else s = 'Fiyatlar yükleniyor…';
  tickerOff = (tickerOff + 0.25) % (s.length * 2.2 + w);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + 5, w, 7);
  ctx.clip();
  text(s, x + w - tickerOff, y + 8.5, 3.4, portfolio?.pnl >= 0 ? '#2ecc71' : '#ff6b6b', 'left', true);
  ctx.restore();
}

function drawTv(f) {
  const x = f.x, y = f.y + 1, w = f.w, h = 13;
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#10213a';
  ctx.fillRect(x, y, w, h);
  const cur = S.company?.currency || '₺';
  text(`KASA ${Math.round(S.ledger.balance || 0)}${cur}`, x + w / 2, y + 3.5, 3, '#f1c40f', 'center', true);
  text(`GELİR ${Math.round(S.ledger.revenue || 0)}${cur}`, x + w / 2, y + 7.5, 3, '#2ecc71', 'center', true);
  text(S.demo ? 'DEMO MODU' : 'CANLI', x + w / 2, y + 11, 2.4, S.demo ? '#ff9f43' : '#46d4ff', 'center');
}

function drawMemorial(f) {
  const x = f.x, y = f.y + 1, w = f.w, h = 13;
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#d1a54a';
  ctx.fillRect(x, y, w, 0.8);
  text('ANMA DUVARI · KOVULANLAR', x + w / 2, y + 3, 2.6, '#d1a54a', 'center', true);
  const g = S.graveyard.slice(-4);
  text(g.length ? g.map((a) => `† ${a.name}`).join('  ') : 'Henüz kimse kovulmadı', x + w / 2, y + 8, 2.6, '#c9d1e0', 'center');
}

function drawInbox(f, now) {
  ctx.fillStyle = '#c9a66b';
  ctx.fillRect(f.x, f.y, 10, 5);
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(f.x + 1, f.y - 1, 8, 2);
  if (S.pending > 0) {
    const b = Math.sin(now / 200) > 0 ? 1 : 0;
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.arc(f.x + 10, f.y - 3 - b, 3.2, 0, Math.PI * 2); ctx.fill();
    text(String(S.pending), f.x + 10, f.y - 3 - b, 3.6, '#fff', 'center', true);
  }
}

// ---------- karakterler ----------
function lookKey(a) {
  return a.look;
}

function drawAgent(id, v, now) {
  const a = S.agents.get(id);
  if (!a) return;
  if (v.mode === 'leaving') {
    shadow(v.x, v.y, 6);
    drawSprite(character(lookKey(a), v.dir, v.frame, 'walk', false, 'stress'), v.x - 8, v.y - 25);
    if (v.dir !== 1) drawSprite(FURN.box(), v.x - 6 + (v.dir === 2 ? -2 : v.dir === 3 ? 2 : 0), v.y - 13);
    return;
  }
  if (v.mode === 'ghost') {
    const bob = Math.sin(now / 400) * 2;
    ctx.globalAlpha = 0.8;
    drawSprite(ghost(Math.floor(now / 300) % 2), v.x - 8, v.y - 26 + bob);
    ctx.globalAlpha = 1;
    return;
  }
  let pose = 'stand';
  let dir = v.dir;
  let dy = 0;
  const mood = moodOf(a, v, now);
  let shake = 0;
  if (mood === 'panic') shake = Math.round(Math.sin(now / 35 + v.animT * 7) * 0.8);
  if (v.mode === 'walking') pose = 'walk';
  else if (v.mode === 'seat') {
    dir = 0;
    dy = 3;
    pose = a.status === 'working' && !((v.talkUntil || 0) > now) ? 'type' : a.status === 'sleeping' ? 'sleep' : 'sit';
  } else if (v.mode === 'sleep') { pose = 'sleep'; dir = 0; dy = 2; }
  if ((v.hopUntil || 0) > now && pose !== 'sleep') dy -= Math.round(Math.abs(Math.sin(now / 110 + v.hopPhase)) * 2);
  if (mood === 'panic' && (v.mode === 'visit' || v.mode === 'wander') && Math.floor(now / 450) % 2) pose = 'panicArms';
  const frame = pose === 'type' ? Math.floor(now / (mood === 'panic' ? 70 : mood === 'stress' ? 100 : 140)) % 2 : v.frame;
  const blink = v.blinkT < 0 && pose !== 'sleep';
  if (v.mode !== 'seat') shadow(v.x, v.y, 6);
  const spr = character(lookKey(a), dir, frame, pose, blink, pose === 'sleep' ? 'neutral' : mood);
  drawSprite(spr, v.x - 8 + shake, v.y - 25 + dy);
}

/** Ruh hali: stres ve can ajanın yüzüne yansır. */
function moodOf(a, v, now) {
  if ((v.happyUntil || 0) > now) return 'happy';
  const stress = a.stress ?? Math.max(0, 100 - (a.hp ?? 100));
  if (stress >= 80 || (a.hp ?? 100) < 18) return 'panic';
  if (stress >= 55) return 'stress';
  if (a.bubble === '✅' || a.bubble === '💰' || a.bubble === '😇') return 'happy';
  return 'neutral';
}

const PANIC_LINES = ['AAAA RUNWAY BİTİYOR!', 'Kovulmak istemiyorum 😱', 'SATIŞ LAZIM, SATIŞ!', 'Patron bakıyor, çalış çalış!', 'Kahve… daha çok kahve…', 'Bu hafta ya hep ya hiç!'];
const STRESS_LINES = ['Deadline yaklaşıyor…', 'Bir saniye, odaklanıyorum', 'Of, iş çok…', 'Hadi hadi hadi…'];
let stressAcc = 0;
function stressEffects(dt, now) {
  stressAcc += dt;
  if (stressAcc < 0.5) return;
  stressAcc = 0;
  for (const [id, v] of vis) {
    const a = S.agents.get(id);
    if (!a || a.status === 'dead' || !inRoom(v.x, v.y)) continue;
    const m = moodOf(a, v, now);
    if (m === 'stress' || m === 'panic') {
      if (Math.random() < (m === 'panic' ? 0.9 : 0.45)) fx.push({ kind: 'sweat', x: v.x + (Math.random() < 0.5 ? -6 : 5), y: v.y - 22 + (v.mode === 'seat' ? 3 : 0), vx: (Math.random() - 0.5) * 6, vy: -4, t: 0, life: 0.7, grav: 60 });
      if (!speech.has(id) && Math.random() < (m === 'panic' ? 0.04 : 0.012)) {
        const pool = m === 'panic' ? PANIC_LINES : STRESS_LINES;
        say(id, pool[Math.floor(Math.random() * pool.length)], 2800);
        if (m === 'panic') sfx.error();
      }
    }
  }
}

function drawPlayer() {
  if (!S.company) return;
  shadow(player.x, player.y, 6);
  const spr = character(S.company.boss.look, player.dir, player.frame, player.moving ? 'walk' : 'stand', false, 'happy');
  drawSprite(spr, player.x - 8, player.y - 25);
}

function hpColor(hp) {
  return hp > 60 ? '#2ecc71' : hp > 30 ? '#f1c40f' : '#e74c3c';
}

function drawAgentOverlay(id, v, now) {
  const a = S.agents.get(id);
  if (!a) return;
  const sitting = v.mode === 'seat';
  const headY = v.y - 26 + (sitting ? 3 : 0) + (v.mode === 'ghost' ? -4 : 0);
  // isim etiketi
  const name = a.name.toUpperCase() + ((a.level || 1) > 1 ? ` ·${a.level}` : '');
  const w = name.length * 4 + 7;
  const nameY = sitting ? v.y + 16 : v.y + 3;
  if (!sitting) {
    pill(v.x - w / 2, nameY, w, 7, 'rgba(20,24,34,0.85)', a.role === 'claude' ? '#e07a4a' : '#3b4a66');
    text(name, v.x, nameY + 3.6, 4, a.status === 'dead' ? '#ff9b9b' : '#e8f0ff', 'center', true);
  }
  // can barı
  if (a.role !== 'claude' && a.status !== 'dead') {
    const bw = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(v.x - bw / 2 - 0.5, headY - 3.5, bw + 1, 2.2);
    ctx.fillStyle = hpColor(a.hp);
    ctx.fillRect(v.x - bw / 2, headY - 3, (bw * Math.max(0, a.hp)) / 100, 1.2);
    const st = a.stress ?? 0;
    if (st > 5) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(v.x - bw / 2 - 0.5, headY - 1.4, bw + 1, 1.6);
      ctx.fillStyle = st >= 80 ? '#ff3df0' : st >= 55 ? '#b36bff' : '#7d6bd6';
      ctx.fillRect(v.x - bw / 2, headY - 1.1, (bw * st) / 100, 1);
    }
    if (a.hp < 25 && Math.sin(now / 150) > 0) {
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(v.x - bw / 2 - 1, headY - 4, bw + 2, 3.2);
    }
  }
  // seviye tacı: Lv3+ altın, Lv5+ mor taç (kafanın tepesinde)
  if ((a.level || 1) >= 3 && a.status !== 'dead') {
    const cy = headY + 1 + (v.mode === 'seat' ? 0 : 0);
    const gold = (a.level || 1) >= 5 ? '#b36bff' : '#ffd23f';
    ctx.fillStyle = '#1a1420';
    ctx.fillRect(v.x - 4.5, cy - 0.5, 9, 3.5);
    ctx.fillStyle = gold;
    ctx.fillRect(v.x - 4, cy, 8, 2.5);
    ctx.fillRect(v.x - 4, cy - 2, 1.5, 2);
    ctx.fillRect(v.x - 0.75, cy - 2.5, 1.5, 2.5);
    ctx.fillRect(v.x + 2.5, cy - 2, 1.5, 2);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(v.x - 0.5, cy + 0.5, 1, 1);
  }
  // durum balonu (emoji)
  const b = a.status === 'dead' ? '💀' : a.status === 'sleeping' ? '💤' : a.bubble;
  if (b) {
    const by = headY - 9 + Math.sin(now / 300 + v.animT) * 0.8;
    pill(v.x + 3, by - 3.5, 9, 7, '#ffffff', '#2b2f3a');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(v.x + 4, by + 3); ctx.lineTo(v.x + 3, by + 5); ctx.lineTo(v.x + 6, by + 3); ctx.fill();
    ctx.font = `5px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b, v.x + 7.5, by + 0.3);
  }
  // konuşma balonu
  const sp = speech.get(id);
  if (sp && sp.until > now && onScreen(v.x, v.y)) {
    ctx.font = `4.2px ${FONT}`;
    const words = sp.text.split(' ');
    const lines = [];
    let cur = '';
    for (const wd of words) {
      if ((cur + ' ' + wd).length > 22) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd;
    }
    if (cur) lines.push(cur);
    const ls = lines.slice(0, 3);
    const bw = Math.max(...ls.map((l) => ctx.measureText(l).width)) + 6;
    const bh = ls.length * 5.2 + 3;
    const bx = v.x - bw / 2, by = headY - 12 - bh;
    pill(bx, by, bw, bh, 'rgba(255,255,255,0.96)', '#2b2f3a');
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath(); ctx.moveTo(v.x - 2, by + bh); ctx.lineTo(v.x, by + bh + 3); ctx.lineTo(v.x + 2, by + bh); ctx.fill();
    ls.forEach((l, i) => text(l, v.x, by + 4.1 + i * 5.2, 4.2, '#1d2230'));
  } else if (sp && sp.until <= now) speech.delete(id);
}

function drawPlayerOverlay() {
  if (!S.company) return;
  const name = (S.company.boss.name || 'BOSS').toUpperCase();
  const w = name.length * 4 + 12;
  pill(player.x - w / 2, player.y + 3, w, 7, 'rgba(224,90,43,0.95)', '#ffd2b8');
  text('★ ' + name, player.x, player.y + 6.6, 4, '#fff', 'center', true);
  if (hoverInteract) {
    const label = `E · ${hoverInteract.label}`;
    ctx.font = `bold 4.4px ${FONT}`;
    const tw = ctx.measureText(label).width + 8;
    pill(player.x - tw / 2, player.y - 37, tw, 9, 'rgba(15,18,28,0.92)', '#e05a2b');
    text(label, player.x, player.y - 32.4, 4.4, '#ffd2b8', 'center', true);
  }
}

function onScreen(x, y) {
  const vw = cv.width / zoom, vh = cv.height / zoom;
  return x > cam.x - 40 && x < cam.x + vw + 40 && y > cam.y - 40 && y < cam.y + vh + 40;
}

function drawFx(f) {
  const a = 1 - f.t / f.life;
  ctx.globalAlpha = Math.max(0, a);
  if (f.kind === 'text') text(f.text, f.x, f.y - f.t * 14, f.big ? 7 : 4.5, f.color, 'center', true);
  else if (f.kind === 'coin') {
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(f.x, f.y, 2.5, 2.5);
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(f.x + 1.5, f.y, 1, 2.5);
  } else if (f.kind === 'dust') {
    ctx.fillStyle = 'rgba(235,225,205,0.8)';
    const r = 1 + f.t * 4;
    ctx.fillRect(f.x - r / 2, f.y - r / 2, r, r);
  } else if (f.kind === 'sweat') {
    ctx.fillStyle = '#7fd3ff';
    ctx.fillRect(f.x, f.y, 1.2, 1.8);
  } else if (f.kind === 'spark') {
    ctx.fillStyle = f.color;
    ctx.fillRect(f.x, f.y, 1.5, 1.5);
  } else if (f.kind === 'confetti') {
    ctx.fillStyle = f.color;
    const w = Math.abs(Math.cos(f.t * 8 + f.spin)) * 2 + 0.4; // dönen kâğıt
    ctx.fillRect(f.x - w / 2, f.y, w, 1.6);
    f.vx += Math.sin(f.t * 4 + f.spin) * 0.6; // salınım
  }
  ctx.globalAlpha = 1;
}

// ---------- ışık ----------
function drawLighting(night, now) {
  const lw = lightCv.width, lh = lightCv.height;
  const s = zoom / 4;
  lightCtx.globalCompositeOperation = 'source-over';
  lightCtx.clearRect(0, 0, lw, lh);
  lightCtx.fillStyle = `rgba(8,10,35,${0.58 * night})`;
  lightCtx.fillRect(0, 0, lw, lh);
  lightCtx.globalCompositeOperation = 'destination-out';
  const glow = (wx, wy, r, strength) => {
    const x = (wx - cam.x) * s, y = (wy - cam.y) * s, rr = r * s;
    if (x < -rr || y < -rr || x > lw + rr || y > lh + rr) return;
    const g = lightCtx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = g;
    lightCtx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  };
  for (const f of furniture) {
    if (f.kind === 'lamp') glow(f.x + 8, f.y + 4, 70, 0.95);
    if (f.kind === 'stringLights') for (let i = 0; i < f.w; i += 48) glow(f.x + i, f.y + 6, 40, 0.6);
    if (f.kind === 'grill') glow(f.x + 8, f.y + 4, 26, 0.6);
    if (f.kind === 'streetLamp') glow(f.x + 6, f.y + 30, 80, 0.95);
    if (f.kind === 'facadeWindow') glow(f.x + 16, f.y + 10, 22, 0.4);
    if (f.kind === 'neon') glow(f.x + f.w / 2, f.y + 8, 70, 0.8);
    if (f.kind === 'monitor') {
      const a = agentByRole(f.role);
      if (a && a.status !== 'dead') glow(f.x + 7, f.y + 6, 34, 0.8);
    }
    if (f.kind === 'rack') glow(f.x + 8, f.y + 16, 22, 0.5);
    if (f.kind === 'ticker' || f.kind === 'tv' || f.kind === 'vending') glow(f.x + (f.w || 16) / 2, f.y + 12, 50, 0.7);
  }
  // tavan lambaları (gece ofis yine de çalışır)
  for (let y = 5; y < H; y += 11) for (let x = 6; x < W; x += 12) glow(x * T, y * T + 8, 80, 0.45);
  glow(player.x, player.y - 10, 50, 0.6);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCv, 0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  // sıcak renk tonu
  ctx.fillStyle = `rgba(255,170,90,${0.05 * night})`;
  ctx.fillRect(0, 0, cv.width, cv.height);
}

// ---------- mini harita (kat planı) ----------
let miniCache = null;
function drawMinimap() {
  const dpr = cv.width / cv.clientWidth;
  const touch = document.body.classList.contains('touch');
  // ekranın en fazla %28'i kadar yer kaplasın
  const s = Math.max(1, Math.min(Math.round(2.4 * dpr), Math.floor((cv.width * 0.28) / W)));
  const mw = W * s, mh = H * s;
  const x0 = cv.width - mw - 14 * dpr;
  const y0 = touch ? 70 * dpr : cv.height - mh - 40 * dpr;
  if (!miniCache || miniCache.s !== s) {
    const c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    const g = c.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const f = floor[y * W + x], w = wall[y * W + x];
      if (!f && !w) continue;
      g.fillStyle = w ? '#4b3b30' : f === FLOOR.door ? '#d8c39a' : (FLOOR_COL[f]?.[0] || '#999');
      g.fillRect(x * s, y * s, s, s);
    }
    miniCache = { c, s };
  }
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x0 - 5, y0 - 5, mw + 10, mh + 10);
  ctx.drawImage(miniCache.c, x0, y0);
  // bulunduğun oda
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeRect(x0 + room.x0 * s - 1, y0 + room.y0 * s - 1, (room.x1 - room.x0 + 1) * s + 2, (room.y1 - room.y0 + 1) * s + 2);
  for (const [id, v] of vis) {
    const a = S.agents.get(id);
    ctx.fillStyle = !a ? '#999' : a.status === 'dead' ? '#777' : a.status === 'sleeping' ? '#5dade2' : a.status === 'working' || a.status === 'thinking' ? '#2ecc71' : '#f1c40f';
    ctx.fillRect(x0 + (v.x / T) * s - s / 2, y0 + (v.y / T) * s - s, s * 1.4, s * 1.4);
  }
  const blink = Math.sin(performance.now() / 200) > 0;
  ctx.fillStyle = blink ? '#e05a2b' : '#fff';
  ctx.fillRect(x0 + (player.x / T) * s - s, y0 + (player.y / T) * s - s * 1.5, s * 2, s * 2);
  ctx.font = `bold ${Math.round(9 * dpr)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#fff';
  ctx.fillText(`★ ${tr(room.name)}`, x0, y0 - 8 * dpr);
  ctx.globalAlpha = 1;
}

export function focusAgent(id) {
  const a = S.agents.get(id);
  if (!a) return;
  teleportToSlot(a.slot);
}
