// Yaşayan dünya (istemci): hava durumu, günün saatleri, şehir ve ofis NPC'leri, olay duyuruları.
// NPC'ler sadece görseldir; sunucu durumunu değiştirmez. Gerçek olaylara bağlanır: satış gelince müşteri gelir,
// bakiye yüklenince zırhlı araç kasaya para taşır, pizza ısmarlanınca kurye gelir.
import { T, W, POI, STREET, findPath } from './map.js';
import { character, FURN, pigeon, cat } from './sprites.js';
import { S, api } from './net.js';
import { sfx } from './sound.js';
import { getLang } from './i18n.js';

const L = (tr, en) => (getLang() === 'en' ? en : tr);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const cur = () => S.company?.currency || '₺';
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString(getLang() === 'en' ? 'en-US' : 'tr-TR');

let E = null; // world.js'nin verdiği çizim ve dünya yardımcıları

// ======================= HAVA =======================
export const weather = { kind: 'clear', temp: 18, source: 'sim', city: '' };
const WX_ICON = { clear: '☀️', cloudy: '☁️', rain: '🌧️', storm: '⛈️', snow: '❄️', fog: '🌫️' };
export function weatherIcon(night = false) {
  if (weather.kind === 'clear' && night) return '🌙';
  return WX_ICON[weather.kind] || '☀️';
}
export function weatherName() {
  return {
    clear: L('Açık', 'Clear'), cloudy: L('Bulutlu', 'Cloudy'), rain: L('Yağmurlu', 'Rainy'), storm: L('Fırtına', 'Storm'), snow: L('Karlı', 'Snowy'), fog: L('Sisli', 'Foggy'),
  }[weather.kind] || '';
}
export async function refreshWeather() {
  try {
    const r = await api('GET', '/api/world');
    if (r?.weather) Object.assign(weather, { city: '', error: '' }, r.weather);
  } catch {}
}
const wet = () => weather.kind === 'rain' || weather.kind === 'storm';

// ======================= GÜNÜN SAATLERİ =======================
/** Ajanların boş zamanını belirleyen dönem. Gerçek yerel saat kullanılır. */
export function period(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  const day = d.getDay();
  if (h >= 23 || h < 7) return 'night';
  if (day === 5 && h >= 17) return 'party';
  if (h < 9.5) return 'morning';
  if (h >= 12 && h < 13.5) return 'lunch';
  if (h >= 15.5 && h < 16.25) return 'tea';
  if (h >= 18) return 'evening';
  return 'work';
}
function periodText(p) {
  return {
    morning: L('Günaydın! Ofis kahve kokuyor.', 'Good morning! The office smells like coffee.'),
    work: L('Mesai saati. Ajanlar masalarında.', 'Work hours. Agents are at their desks.'),
    lunch: L('Öğle arası! Mutfak doluyor.', 'Lunch break! The kitchen is filling up.'),
    tea: L('Çay saati. Mutfakta demlik kaynıyor.', 'Tea time. The kettle is on in the kitchen.'),
    evening: L('Mesai bitti ama ajanlar asla durmaz.', "Work hours are over, but agents never stop."),
    party: L('Cuma akşamı! Çatıda parti var. (Lobi asansörü)', "Friday night! Party on the roof. (Lobby elevator)"),
    night: L('Gece vardiyası. Bekçi Rıza nöbette.', 'Night shift. Ray the guard is on duty.'),
  }[p];
}

/** Bugün doğum günü olan ajan (id'den türetilmiş sabit bir gün). */
export function birthdayAgent(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d - start) / 864e5);
  for (const a of S.agents.values()) {
    if (a.status === 'dead') continue;
    let h = 0;
    for (const c of String(a.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    if ((h % 365) + 1 === doy) return a;
  }
  return null;
}

// ======================= NPC'LER =======================
const npcs = [];
let nid = 0;
const NPC_NAME = { selin: () => L('SELİN', 'MAYA'), riza: () => L('RIZA', 'RAY'), hasan: () => L('HASAN', 'HANK') };
const LOOKS = {
  selin: { skin: 0, hair: 6, hairStyle: 3, shirt: 9, pants: 1, tie: -1, glasses: false },
  riza: { skin: 2, hair: 7, hairStyle: 0, shirt: 0, pants: 1, tie: 3 },
  hasan: { skin: 3, hair: 0, hairStyle: 1, shirt: 7, pants: 2, tie: -1, hoodie: true },
  guard: { skin: 1, hair: 0, hairStyle: 0, shirt: 11, pants: 1, tie: 3, suit: false },
  courier: { skin: 2, hair: 1, hairStyle: 2, shirt: 4, pants: 0, tie: -1, hoodie: true },
};
function randomLook() {
  const r = (n) => Math.floor(Math.random() * n);
  return { skin: r(5), hair: r(8), hairStyle: r(6), shirt: r(12), pants: r(4), tie: Math.random() < 0.2 ? r(4) : -1, glasses: Math.random() < 0.2, headphones: Math.random() < 0.15, hoodie: Math.random() < 0.25 };
}
// sabit bir görünüm havuzu: sprite önbelleği her yaya için büyümesin (saatlerce açık kalan oyun)
const LOOK_POOL = Array.from({ length: 28 }, randomLook);
const poolLook = () => pick(LOOK_POOL);
const UMB = ['#e05a2b', '#3b6ea8', '#2b2f3a', '#c2457a', '#f1c40f', '#3f8f5f'];

function spawn(o) {
  const n = { id: ++nid, x: 0, y: 0, dir: 0, frame: 0, animT: Math.random() * 10, speed: 45, path: null, say: null, sayUntil: 0, ...o };
  npcs.push(n);
  return n;
}
function remove(n) {
  const i = npcs.indexOf(n);
  if (i >= 0) npcs.splice(i, 1);
}
function walkTo(n, tx, ty, then) {
  const p = findPath(Math.floor(n.x / T), Math.floor((n.y - 4) / T), tx, ty);
  n.path = p ? p.slice(1) : [];
  n.then = then || null;
  return !!p;
}
function npcSay(n, text, ms = 3500) {
  n.say = text;
  n.sayUntil = performance.now() + ms;
}
function step(n, dt) {
  if (n.vx != null) { // düz çizgi (yayalar, araçlar)
    n.x += n.vx * dt;
    n.dir = n.vx < 0 ? 2 : 3;
    n.animT += dt * (n.run ? 10 : 7);
    n.frame = 1 + (Math.floor(n.animT) % 2);
    return;
  }
  if (!n.path?.length) {
    n.frame = 0;
    if (n.then) { const f = n.then; n.then = null; f(); }
    return;
  }
  const [tx, ty] = n.path[0];
  const gx = tx * T + 8, gy = ty * T + 12;
  const dx = gx - n.x, dy = gy - n.y;
  const dist = Math.hypot(dx, dy);
  const sp = n.speed * dt;
  if (dist <= sp) { n.x = gx; n.y = gy; n.path.shift(); }
  else {
    n.x += (dx / dist) * sp;
    n.y += (dy / dist) * sp;
    n.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
  }
  n.animT += dt * 8;
  n.frame = 1 + (Math.floor(n.animT) % 2);
}

// ---- sabit NPC'ler: resepsiyon (gündüz Selin, gece bekçi Rıza), gece temizlikçi Hasan, çatı kedisi Duman
const desk = { npc: null, who: null };
const janitor = { npc: null, sign: null, nextSign: 0 };
const catV = { x: POI.catHome.x * T + 8, y: POI.catHome.y * T + 12, path: null, pose: 'sleep', frame: 0, animT: 0, next: 0, flip: false, hearts: 0 };
let greetAt = 0;
export const stats = { customersToday: 0, day: new Date().getDate() };

function updateStaff(now) {
  const p = period();
  const who = p === 'night' ? 'riza' : 'selin';
  if (desk.who !== who) {
    if (desk.npc) remove(desk.npc);
    desk.who = who;
    desk.npc = spawn({ kind: 'staff', who, name: NPC_NAME[who](), look: LOOKS[who], x: POI.reception.x * T + 8, y: POI.reception.y * T + 12, dir: 0, fixed: true });
  }
  if (p === 'night') {
    if (!janitor.npc) {
      janitor.npc = spawn({ kind: 'staff', who: 'hasan', name: NPC_NAME.hasan(), look: LOOKS.hasan, x: 4 * T + 8, y: 34 * T + 12, speed: 22, mop: true });
      janitorNext();
    }
    if (now > janitor.nextSign) {
      janitor.nextSign = now + rnd(60000, 120000);
      janitor.sign = { x: janitor.npc.x + 10, y: janitor.npc.y, until: now + 50000 };
    }
  } else if (janitor.npc) { remove(janitor.npc); janitor.npc = null; janitor.sign = null; }
}
function janitorNext() {
  const n = janitor.npc;
  if (!n) return;
  const tx = Math.floor(n.x / T) < 40 ? Math.floor(rnd(60, 85)) : Math.floor(rnd(3, 30));
  walkTo(n, tx, Math.random() < 0.5 ? 33 : 35, () => setTimeout(janitorNext, rnd(3000, 9000)));
}

function updateCat(dt, now) {
  const c = catV;
  c.animT += dt * 2;
  const home = wet() ? { x: 41, y: 47 } : POI.catHome;
  if (c.path?.length) {
    const [tx, ty] = c.path[0];
    const gx = tx * T + 8, gy = ty * T + 12;
    const dx = gx - c.x, dy = gy - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.2) c.path.shift();
    else { c.x += (dx / d) * 30 * dt; c.y += (dy / d) * 30 * dt; c.flip = dx < 0; }
    c.pose = 'walk';
    c.frame = Math.floor(c.animT * 4) % 2;
    return;
  }
  // yağmur başlarsa kedi lobiye iner (asansörsüz, sahne dışı geçiş)
  const onRoof = c.y / T >= 67;
  const homeRoof = home.y >= 67;
  if (onRoof !== homeRoof) { c.x = home.x * T + 8; c.y = home.y * T + 12; c.pose = 'sleep'; return; }
  if (now > c.next) {
    c.next = now + rnd(20000, 50000);
    if (Math.random() < 0.5) {
      const spots = homeRoof ? POI.roofParty : [{ x: 40, y: 46 }, { x: 47, y: 46 }, { x: 41, y: 47 }];
      const s = Math.random() < 0.4 ? home : pick(spots);
      const p = findPath(Math.floor(c.x / T), Math.floor((c.y - 4) / T), s.x, s.y);
      c.path = p ? p.slice(1) : null;
    } else c.pose = Math.random() < 0.6 ? 'sleep' : 'sit';
  }
  c.frame = Math.floor(c.animT) % 2;
}

// ---- sokak: yayalar, güvercinler, otobüs
let nextPed = 0;
let nextBus = performance.now() + rnd(15000, 40000);
const pigeons = [];
let nextFlock = 0;
function updateStreet(dt, now, inStreet) {
  if (!inStreet) {
    for (let i = npcs.length - 1; i >= 0; i--) if (npcs[i].kind === 'ped' || npcs[i].kind === 'bus') npcs.splice(i, 1);
    pigeons.length = 0;
    return;
  }
  const night = period() === 'night';
  const peds = npcs.filter((n) => n.kind === 'ped').length;
  if (now > nextPed && peds < (night ? 3 : 9)) {
    nextPed = now + (night ? rnd(6000, 14000) : rnd(1500, 5000)) * (wet() ? 1.6 : 1);
    const ltr = Math.random() < 0.5;
    const top = Math.random() < 0.6;
    spawn({
      kind: 'ped', look: poolLook(), x: ltr ? -12 : W * T + 12, y: (top ? STREET.topWalk : STREET.bottomWalk) * T + rnd(-2, 3),
      vx: (ltr ? 1 : -1) * rnd(24, 40) * (wet() ? 1.35 : 1), run: wet() && Math.random() < 0.3,
      umbrella: wet() && Math.random() < 0.75 ? pick(UMB) : null, phone: !wet() && Math.random() < 0.25,
    });
  }
  // güvercinler (gündüz, yağmursuz)
  if (!night && !wet() && now > nextFlock && pigeons.filter((p) => !p.fly).length === 0) {
    nextFlock = now + rnd(30000, 60000);
    const cx = pick([31, 51, 70]);
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) pigeons.push({ x: (cx + rnd(-2, 2)) * T, y: rnd(53.4, 54.6) * T, fly: false, flip: Math.random() < 0.5, t: Math.random() * 5, vx: 0, vy: 0 });
  }
  const P = E.player;
  let scared = false;
  for (const p of pigeons) {
    p.t += dt;
    if (!p.fly && Math.hypot(P.x - p.x, P.y - p.y) < 34) { p.fly = true; p.vx = (p.x < P.x ? -1 : 1) * rnd(40, 70); p.vy = rnd(-70, -40); scared = true; }
    if (p.fly) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 10 * dt; p.flip = p.vx < 0; }
    else if (Math.random() < dt * 0.4) { p.x += rnd(-4, 4); p.flip = Math.random() < 0.5; }
  }
  if (scared) sfx.flap();
  for (let i = pigeons.length - 1; i >= 0; i--) if (pigeons[i].y < 50 * T || pigeons[i].x < -20 || pigeons[i].x > W * T + 20) pigeons.splice(i, 1);
  // otobüs: sağdan gelir, durakta durur, yolcu indirir
  if (now > nextBus && !npcs.some((n) => n.kind === 'bus')) {
    nextBus = now + rnd(70000, 130000);
    spawn({ kind: 'bus', x: W * T + 20, y: STREET.laneTop * T - 8, vx: -95, state: 'in' });
  }
  for (const n of npcs) {
    if (n.kind !== 'bus') continue;
    const stopX = STREET.busStopX * T - 20;
    if (n.state === 'in' && n.x <= stopX) { n.x = stopX; n.vx = 0; n.state = 'stop'; n.until = now + 4500; sfx.brake(); }
    if (n.state === 'stop' && now > n.until) {
      n.state = 'out';
      n.vx = -95;
      for (let k = 0; k < Math.floor(rnd(0, 3)); k++) spawn({ kind: 'ped', look: poolLook(), x: (STREET.busStopX + 1) * T + k * 10, y: STREET.topWalk * T, vx: (Math.random() < 0.5 ? -1 : 1) * rnd(26, 36), umbrella: wet() ? pick(UMB) : null });
      sfx.horn();
    }
  }
  for (let i = npcs.length - 1; i >= 0; i--) {
    const n = npcs[i];
    if ((n.kind === 'ped' || n.kind === 'bus') && (n.x < -120 || n.x > W * T + 120)) npcs.splice(i, 1);
  }
}

// ---- olay NPC'leri: müşteri, zırhlı araç + güvenlik, pizza kurye
export function spawnCustomer(amount) {
  if (npcs.filter((n) => n.kind === 'customer').length >= 3) return;
  const ltr = Math.random() < 0.5;
  const sx = ltr ? 2 : W - 3;
  const c = spawn({ kind: 'customer', look: poolLook(), x: sx * T + 8, y: 54 * T + 12, speed: 46, umbrella: wet() ? pick(UMB) : null });
  stats.customersToday++;
  walkTo(c, POI.receptionFront.x, POI.receptionFront.y, () => {
    c.dir = 1;
    c.umbrella = null;
    npcSay(c, pick([
      L(`Ürününüzü aldım! ⭐⭐⭐⭐⭐`, `I bought your product! ⭐⭐⭐⭐⭐`),
      L('Harika iş çıkarmışsınız 👏', 'You did a great job 👏'),
      L(`Ödemeyi yaptım (${fmt(amount)} ${cur()})`, `Paid (${fmt(amount)} ${cur()})`),
      L('Arkadaşıma da önereceğim!', "I'll recommend you to a friend!"),
    ]), 4000);
    if (desk.npc) npcSay(desk.npc, L('Teşekkürler, yine bekleriz! 😊', 'Thank you, come again! 😊'), 3500);
    setTimeout(() => {
      c.umbrella = wet() ? pick(UMB) : null;
      walkTo(c, sx, 54, () => remove(c));
    }, 4200);
  });
}

const van = { npc: null };
/** Bakiye yükleme/çekme: zırhlı araç kapıya yanaşır, güvenlik görevlisi para çantasını kasaya taşır (ya da alır). */
export function moneyRun(kind, amount) {
  if (van.npc) { // araç zaten yoldaysa sadece kasada efekt
    E.safeBurst(kind, amount);
    return;
  }
  const v = spawn({ kind: 'van', x: -70, y: STREET.laneBottom * T - 4, vx: 110, state: 'in', moneyKind: kind, amount });
  van.npc = v;
}
function updateVan(now) {
  const v = van.npc;
  if (!v) return;
  const stopX = STREET.vanX * T;
  if (v.state === 'in' && v.x >= stopX) {
    v.x = stopX; v.vx = 0; v.state = 'parked';
    if (E.room().id === 'street') sfx.brake();
    const g = spawn({ kind: 'guard', name: L('GÜVENLİK', 'SECURITY'), look: LOOKS.guard, x: (STREET.vanX + 1) * T + 8, y: 56 * T + 12, speed: 58, carry: v.moneyKind === 'deposit' ? 'bag' : null });
    walkTo(g, POI.safeFront.x, POI.safeFront.y, () => {
      g.dir = 2;
      E.safeBurst(v.moneyKind, v.amount);
      npcSay(g, v.moneyKind === 'deposit' ? L(`${fmt(v.amount)} ${cur()} kasaya teslim ✔`, `${fmt(v.amount)} ${cur()} delivered to the safe ✔`) : L(`${fmt(v.amount)} ${cur()} patrona ✔`, `${fmt(v.amount)} ${cur()} for the boss ✔`), 3500);
      g.carry = v.moneyKind === 'withdraw' ? 'bag' : null;
      setTimeout(() => walkTo(g, STREET.vanX + 1, 56, () => { remove(g); v.vx = 120; v.state = 'out'; }), 2500);
    });
  }
  if (v.state === 'out' && v.x > W * T + 80) { remove(v); van.npc = null; }
}

let pizzaCb = null;
export function pizzaRun(onArrive) {
  pizzaCb = onArrive;
  const s = spawn({ kind: 'scooter', x: W * T + 30, y: STREET.laneTop * T, vx: -120, state: 'in' });
  s.stopX = 47 * T;
}
function updateScooter(now) {
  for (const s of npcs) {
    if (s.kind !== 'scooter') continue;
    if (s.state === 'in' && s.x <= s.stopX) {
      s.x = s.stopX; s.vx = 0; s.state = 'parked';
      const c = spawn({ kind: 'staff', name: L('KURYE', 'COURIER'), look: LOOKS.courier, x: 47 * T + 8, y: 56 * T + 12, speed: 65, carry: 'pizza' });
      walkTo(c, 25, 42, () => {
        c.carry = null;
        npcSay(c, L('Pizzalar geldi! Afiyet olsun 🍕', 'Pizza delivery! Enjoy 🍕'), 3500);
        pizzaCb?.();
        pizzaCb = null;
        setTimeout(() => walkTo(c, 47, 56, () => { remove(c); s.vx = -130; s.state = 'out'; }), 2500);
      });
    }
    if (s.state === 'out' && s.x < -60) { remove(s); break; }
  }
}

// ======================= GÜNCELLEME =======================
let lastPeriod = null;
let announceAt = performance.now() + 2500;
let flash = 0;
let nextBolt = 0;
const drops = [];
const ripples = [];

export function initLife(env) {
  E = env;
  refreshWeather();
  setInterval(refreshWeather, 10 * 60000);
}

export function updateLife(dt, now) {
  const r = E.room();
  if (new Date().getDate() !== stats.day) { stats.day = new Date().getDate(); stats.customersToday = 0; }
  // dönem değişince duyuru
  const p = period();
  if (p !== lastPeriod && now > announceAt) {
    E.announce(periodText(p));
    lastPeriod = p;
    const bday = birthdayAgent();
    if (bday) setTimeout(() => E.announce(L(`Bugün ${bday.name}'in doğum günü! 🎂 Mutfakta pasta var.`, `It's ${bday.name}'s birthday today! 🎂 Cake in the kitchen.`)), 5200);
  }
  updateStaff(now);
  updateStreet(dt, now, r.id === 'street');
  updateVan(now);
  updateScooter(now);
  updateCat(dt, now);
  for (const n of npcs) step(n, dt);
  // lobiye girince resepsiyon selamlar
  if (r.id === 'lobby' && desk.npc && now > greetAt) {
    greetAt = now + 10 * 60000;
    const boss = S.company?.boss?.name || 'Boss';
    npcSay(desk.npc, desk.who === 'riza'
      ? L(`İyi geceler ${boss} bey/hanım, her şey sakin 🔦`, `Good evening ${boss}, all quiet 🔦`)
      : pick([L(`Hoş geldin ${boss}! ATM yanımda 💳`, `Welcome ${boss}! The ATM is right here 💳`), L(`Günaydın! Bugün ${stats.customersToday} müşteri uğradı.`, `Hi! ${stats.customersToday} customers came by today.`)]), 4500);
  }
  // fırtına: şimşek
  if (weather.kind === 'storm' && now > nextBolt) {
    nextBolt = now + rnd(9000, 26000);
    flash = 1;
    const out = !!r.outdoor;
    setTimeout(() => sfx.thunder(out ? 1 : 0.45), rnd(300, 1500));
  }
  flash = Math.max(0, flash - dt * 2.2);
  // yağış parçacıkları (sadece dış mekânda, görünür odada)
  if (r.outdoor && (wet() || weather.kind === 'snow') && !E.reduceFx()) {
    const b = E.bounds();
    const snow = weather.kind === 'snow';
    const rate = snow ? 60 : weather.kind === 'storm' ? 420 : 240;
    let n = rate * dt;
    while (n-- > 0 && drops.length < 900) drops.push({ x: b.x + Math.random() * (b.w + 60) - 30, y: b.y - 10, vy: snow ? rnd(14, 26) : rnd(260, 340), vx: snow ? rnd(-8, 8) : (weather.kind === 'storm' ? -70 : -30), ground: b.y + 30 + Math.random() * (b.h - 30), snow });
  } else drops.length = 0;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.x += d.vx * dt + (d.snow ? Math.sin(now / 500 + i) * 6 * dt : 0);
    d.y += d.vy * dt;
    if (d.y >= d.ground) {
      if (!d.snow && Math.random() < 0.25 && ripples.length < 80) ripples.push({ x: d.x, y: d.y, t: 0 });
      drops.splice(i, 1);
    }
  }
  for (let i = ripples.length - 1; i >= 0; i--) if ((ripples[i].t += dt) > 0.35) ripples.splice(i, 1);
}

// ======================= ÇİZİM =======================
function inView(x, y) {
  return E.inRoom(x, y);
}

/** Y sıralı çizim listesine NPC'leri ekler. */
export function lifeDrawables(list, now) {
  const ctx = E.ctx();
  for (const n of npcs) {
    if (!inView(n.x, n.y)) continue;
    if (n.kind === 'bus') { list.push({ y: n.y + 38, draw: () => E.drawSprite(FURN.bus(), n.x, n.y) }); continue; }
    if (n.kind === 'van') { list.push({ y: n.y + 30, draw: () => E.drawSprite(FURN.van(), n.x, n.y, n.vx < 0) }); continue; }
    if (n.kind === 'scooter') { list.push({ y: n.y + 18, draw: () => E.drawSprite(FURN.scooter(), n.x, n.y, n.vx > 0) }); continue; }
    list.push({ y: n.y, draw: () => drawPerson(ctx, n, now) });
  }
  if (janitor.sign && janitor.sign.until > now && inView(janitor.sign.x, janitor.sign.y)) {
    const s = janitor.sign;
    list.push({ y: s.y, draw: () => { E.shadow(s.x, s.y, 4); E.drawSprite(FURN.wetSign(), s.x - 5, s.y - 14); } });
  }
  if (inView(catV.x, catV.y)) list.push({ y: catV.y, draw: () => { E.shadow(catV.x, catV.y, 5); E.drawSprite(cat(catV.frame, catV.pose), catV.x - 8, catV.y - 11, catV.flip); } });
  for (const p of pigeons) if (inView(p.x, p.y)) list.push({ y: p.y, draw: () => E.drawSprite(pigeon(Math.floor(p.t * (p.fly ? 12 : 2)) % 2, p.fly), p.x - 4, p.y - 7, p.flip) });
}

function drawPerson(ctx, n, now) {
  E.shadow(n.x, n.y, 6);
  const moving = n.vx ? true : !!n.path?.length;
  const spr = character(n.look, n.dir, moving ? n.frame : 0, moving ? 'walk' : 'stand', false, n.kind === 'customer' && !moving ? 'happy' : 'neutral');
  E.drawSprite(spr, n.x - 8, n.y - 25);
  if (n.mop) {
    ctx.fillStyle = '#8a5a34';
    const sw = Math.sin(now / 180) * 3;
    ctx.fillRect(n.x + (n.dir === 2 ? -7 : 5), n.y - 16, 1, 15);
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(n.x + (n.dir === 2 ? -10 : 3) + sw, n.y - 2, 6, 2);
  }
  if (n.carry === 'bag') E.drawSprite(FURN.moneyBag(), n.x + (n.dir === 2 ? -11 : 2), n.y - 15);
  if (n.carry === 'pizza') { for (let i = 0; i < 3; i++) E.drawSprite(FURN.pizzaBox(), n.x - 7, n.y - 18 - i * 4); }
  if (n.phone && n.dir !== 1) { ctx.fillStyle = '#17161b'; ctx.fillRect(n.x + (n.dir === 2 ? -6 : 3), n.y - 15, 2, 3); ctx.fillStyle = '#9fd3f2'; ctx.fillRect(n.x + (n.dir === 2 ? -6 : 3), n.y - 15, 2, 1); }
  if (n.umbrella) {
    ctx.fillStyle = '#2b2f3a';
    ctx.fillRect(n.x, n.y - 30, 1, 14);
    ctx.fillStyle = n.umbrella;
    ctx.beginPath();
    ctx.moveTo(n.x - 11, n.y - 28);
    ctx.quadraticCurveTo(n.x, n.y - 42, n.x + 11, n.y - 28);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(n.x - 6, n.y - 34, 3, 1);
  }
}

/** Konuşma balonları ve isim etiketleri (ışıklandırmanın üstünde). */
export function lifeOverlay(now) {
  for (const n of npcs) {
    if (!inView(n.x, n.y)) continue;
    if (n.name && (n.kind === 'staff' || n.kind === 'guard')) {
      const w = n.name.length * 4 + 7;
      E.pill(n.x - w / 2, n.y + 3, w, 7, 'rgba(20,24,34,0.8)', '#6b5a3a');
      E.text(n.name, n.x, n.y + 6.6, 4, '#f3ead6', 'center', true);
    }
    if (n.say && n.sayUntil > now) E.bubble(n.x, n.y - 26, n.say);
    else n.say = null;
  }
  if (catV.hearts > now && inView(catV.x, catV.y)) E.text('♥', catV.x + Math.sin(now / 200) * 3, catV.y - 16 - ((now / 40) % 8), 6, '#ff5d8f', 'center', true);
}

/** Dış mekânda yağmur/kar, su birikintileri ve hava tonu (oda kırpma alanı içinde). */
export function drawWeatherWorld(now) {
  const r = E.room();
  if (!r.outdoor) return;
  const ctx = E.ctx();
  const b = E.bounds();
  if (wet()) {
    // ıslak zemin ve birikintiler
    ctx.fillStyle = 'rgba(40,60,90,0.12)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(160,190,220,0.22)';
    for (let i = 0; i < 14; i++) {
      const px = b.x + ((i * 173) % b.w), py = b.y + 3 * T + ((i * 97) % (b.h - 4 * T));
      ctx.beginPath(); ctx.ellipse(px, py, 9 + (i % 3) * 3, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (weather.kind === 'snow') {
    ctx.fillStyle = 'rgba(245,248,255,0.28)';
    ctx.fillRect(b.x, b.y + 2 * T, b.w, b.h - 2 * T);
  }
  ctx.strokeStyle = 'rgba(190,215,240,0.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const d of drops) {
    if (d.snow) continue;
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.vx * 0.025, d.y + 7);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const d of drops) if (d.snow) ctx.fillRect(d.x, d.y, 1.5, 1.5);
  ctx.strokeStyle = 'rgba(200,225,250,0.5)';
  for (const rp of ripples) {
    ctx.beginPath();
    ctx.ellipse(rp.x, rp.y, 1 + rp.t * 10, 0.5 + rp.t * 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Ekran uzayı: bulut karartması, sis, şimşek parlaması. */
export function drawWeatherScreen(W2, H2) {
  const ctx = E.ctx();
  const r = E.room();
  const out = !!r.outdoor;
  const dim = { cloudy: 0.08, rain: 0.16, storm: 0.26, snow: 0.06, fog: 0.05 }[weather.kind] || 0;
  if (dim) {
    ctx.fillStyle = `rgba(20,28,45,${out ? dim : dim * 0.4})`;
    ctx.fillRect(0, 0, W2, H2);
  }
  if (weather.kind === 'fog' && out) {
    const g = ctx.createLinearGradient(0, 0, 0, H2);
    g.addColorStop(0, 'rgba(220,225,232,0.45)');
    g.addColorStop(1, 'rgba(220,225,232,0.15)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W2, H2);
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(235,240,255,${flash * (out ? 0.7 : 0.25)})`;
    ctx.fillRect(0, 0, W2, H2);
  }
}

/** Pencere camına yağmur/kar (iç mekân pencereleri). */
export function windowWeather(ctx, x, y, w, h, now) {
  if (wet()) {
    ctx.fillStyle = 'rgba(70,90,120,0.35)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(210,230,255,0.7)';
    for (let i = 0; i < w; i += 3) {
      const yy = (now / (weather.kind === 'storm' ? 6 : 9) + i * 37) % (h + 4);
      ctx.fillRect(x + i, y + yy - 3, 0.6, 2.5);
    }
  } else if (weather.kind === 'snow') {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < w; i += 4) {
      const yy = (now / 60 + i * 23) % h;
      ctx.fillRect(x + i + Math.sin(now / 400 + i) * 1.2, y + yy, 1, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x, y + h - 1.5, w, 1.5);
  } else if (weather.kind === 'fog' || weather.kind === 'cloudy') {
    ctx.fillStyle = weather.kind === 'fog' ? 'rgba(225,230,236,0.55)' : 'rgba(200,205,215,0.3)';
    ctx.fillRect(x, y, w, h);
  }
  if (flash > 0.2) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.8})`; ctx.fillRect(x, y, w, h); }
}

/** Çatı gökyüzüne kuşlar (gündüz) ve uçak (gece). */
export function skyExtras(ctx, x, y, w, h, night, now) {
  if (wet()) {
    ctx.fillStyle = 'rgba(70,80,100,0.55)';
    ctx.fillRect(x, y, w, h);
    return;
  }
  if (night < 0.5) {
    for (let k = 0; k < 2; k++) {
      const bx = x + ((now / (60 + k * 20) + k * 300) % (w + 80)) - 40;
      const by = y + 6 + k * 5 + Math.sin(now / 900 + k) * 2;
      for (let i = 0; i < 3; i++) {
        const fx = bx - i * 6, fy = by + i * 2;
        const flap = Math.floor(now / 160 + i) % 2;
        ctx.fillStyle = '#2b2f3a';
        ctx.fillRect(fx - 2, fy - flap, 2, 1);
        ctx.fillRect(fx, fy, 1, 1);
        ctx.fillRect(fx + 1, fy - flap, 2, 1);
      }
    }
  } else {
    const px = x + w - ((now / 45) % (w + 60));
    ctx.fillStyle = '#c9ccd3';
    ctx.fillRect(px, y + 5, 6, 1);
    if (Math.floor(now / 400) % 2) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(px - 1, y + 5, 1, 1); }
    if (Math.floor(now / 400 + 1) % 2) { ctx.fillStyle = '#46ff7a'; ctx.fillRect(px + 6, y + 5, 1, 1); }
  }
}

// ======================= ETKİLEŞİM =======================
export function npcNear(px, py) {
  let best = null, bd = 30;
  for (const n of npcs) {
    if (n.kind !== 'staff' && n.kind !== 'customer' && n.kind !== 'guard') continue;
    if (!inView(n.x, n.y)) continue;
    const d = Math.hypot(px - n.x, py - n.y);
    if (d < bd) { bd = d; best = { type: 'npc', id: n.id, label: n.name ? L(`${n.name[0]}${n.name.slice(1).toLowerCase()} ile konuş`, `Talk to ${n.name[0]}${n.name.slice(1).toLowerCase()}`) : L('Müşteriyle konuş', 'Talk to the customer') }; }
  }
  if (inView(catV.x, catV.y)) {
    const d = Math.hypot(px - catV.x, py - catV.y);
    if (d < 26 && d < bd) best = { type: 'npc', id: 'cat', label: L('Duman’ı sev', 'Pet Duman') };
  }
  return best;
}

export function talkNpc(id) {
  if (id === 'cat') {
    catV.hearts = performance.now() + 2500;
    catV.pose = 'sit';
    sfx.meow();
    return E.openNpcDialog({ kind: 'cat', name: 'Duman' }, L('* Duman mırlıyor. 🐈\n* Ofisin gayriresmî maskotu. Satışlardan hiç anlamaz ama moral verir.', "* Duman purrs. 🐈\n* The office's unofficial mascot. Knows nothing about sales, great for morale."));
  }
  const n = npcs.find((x) => x.id === id);
  if (!n) return;
  n.dir = 0;
  const ag = [...S.agents.values()];
  const working = ag.filter((a) => a.status === 'working' || a.status === 'thinking').length;
  let text;
  if (n.who === 'selin') text = L(
    `* Selin: "Merhaba patron! Bugün ${stats.customersToday} müşteri uğradı."\n* "Hava ${weatherName().toLowerCase()}, ${weather.temp}°. ATM hemen sağımda, bütçe yüklemek istersen."`,
    `* Maya: "Hi boss! ${stats.customersToday} customers came by today."\n* "It's ${weatherName().toLowerCase()}, ${weather.temp}°. The ATM is right next to me if you want to top up."`);
  else if (n.who === 'riza') text = L(
    `* Rıza: "Her şey sakin patron. Şu an ${working} ajan çalışıyor."\n* "Bu robotlar hiç uyumuyor, ben de uyumuyorum. 🔦"`,
    `* Ray: "All quiet, boss. ${working} agents are working right now."\n* "These robots never sleep, so neither do I. 🔦"`);
  else if (n.who === 'hasan') text = L('* Hasan: "Yerler ıslak, kayma patron!"\n* "Gece ofis bir başka güzel oluyor."', '* Hank: "Floor\'s wet, don\'t slip, boss!"\n* "The office is beautiful at night."');
  else if (n.kind === 'customer') text = L('* Müşteri: "Ürününüz tam aradığım şeydi!"\n* "Yeni bir şey çıkarırsanız haber verin."', '* Customer: "Your product was exactly what I needed!"\n* "Let me know when you launch something new."');
  else if (n.kind === 'guard') text = L('* Güvenlik: "Para çantası kasaya, kayıt deftere."\n* "Ben sadece taşırım patron, para senin bankanda."', '* Security: "Bag to the safe, entry to the ledger."\n* "I just carry it, boss. The money stays in your bank."');
  else text = L(`* ${n.name}: "Kolay gelsin patron!"`, `* ${n.name}: "Have a good one, boss!"`);
  E.openNpcDialog({ kind: 'char', look: n.look, name: n.name || '', anchor: n }, text);
}

export function weatherNow() {
  return weather;
}
