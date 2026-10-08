// Bina haritası: Undertale tarzı odalar. Her oda ayrı bir sahnedir; kapıdan geçince kamera o odaya kilitlenir.
// Simülasyon tek global ızgarada çalışır (ajanlar kapılardan geçerek yürür), render sadece bulunulan odayı çizer.

export const T = 16;
export const W = 90;
export const H = 80;

const F = { none: 0, carpet: 1, wood: 2, tile: 3, server: 4, meet: 5, lounge: 6, trade: 7, door: 8, ceo: 9, hall: 10, lobby: 11, lab: 12, archive: 13, walk: 14, road: 15, roof: 16 };
export const FLOOR = F;
export const floor = new Uint8Array(W * H);
export const wall = new Uint8Array(W * H); // 0 yok, 1 tepe, 2 ön yüz, 3 cam tepe, 4 cam yüz
export const block = new Uint8Array(W * H);

const idx = (x, y) => y * W + x;
const fillFloor = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) floor[idx(x, y)] = t; };
const hWall = (x0, x1, y, glass = false, doors = []) => {
  for (let x = x0; x <= x1; x++) {
    if (doors.some(([a, b]) => x >= a && x <= b)) { floor[idx(x, y)] = F.door; floor[idx(x, y + 1)] = F.door; continue; }
    wall[idx(x, y)] = glass ? 3 : 1;
    wall[idx(x, y + 1)] = glass ? 4 : 2;
  }
};
const vWall = (x, y0, y1, glass = false) => { for (let y = y0; y <= y1; y++) wall[idx(x, y)] = glass ? 3 : 1; };

// ---- odalar (iç alan, duvarlar hariç)
export const ROOMS = [
  { id: 'servers', name: 'MOTOR ODASI', x0: 1, y0: 2, x1: 18, y1: 11, floor: F.server },
  { id: 'ceo', name: 'GENEL MÜDÜR OFİSİ', x0: 20, y0: 2, x1: 41, y1: 11, floor: F.ceo },
  { id: 'meeting', name: 'TOPLANTI ODASI', x0: 43, y0: 2, x1: 66, y1: 11, floor: F.meet },
  { id: 'archive', name: 'ARŞİV & ANMA SALONU', x0: 68, y0: 2, x1: 88, y1: 11, floor: F.archive },
  { id: 'open', name: 'AÇIK OFİS', x0: 1, y0: 14, x1: 62, y1: 29, floor: F.carpet },
  { id: 'lab', name: 'CLAUDE AR-GE LAB', x0: 64, y0: 14, x1: 88, y1: 29, floor: F.lab },
  { id: 'hall', name: 'KORİDOR', x0: 1, y0: 32, x1: 88, y1: 36, floor: F.hall },
  { id: 'trade', name: 'BORSA MASASI', x0: 1, y0: 39, x1: 17, y1: 50, floor: F.trade },
  { id: 'kitchen', name: 'MUTFAK', x0: 19, y0: 39, x1: 35, y1: 50, floor: F.tile },
  { id: 'lobby', name: 'LOBİ', x0: 37, y0: 39, x1: 52, y1: 50, floor: F.lobby },
  { id: 'lounge', name: 'DİNLENME SALONU', x0: 54, y0: 39, x1: 70, y1: 50, floor: F.lounge },
  { id: 'boss', name: 'BOSS OFİSİ', x0: 72, y0: 39, x1: 88, y1: 50, floor: F.wood },
  { id: 'street', name: 'SOKAK', x0: 1, y0: 53, x1: 88, y1: 64, floor: F.walk, outdoor: true },
  // çatı terası: binadan ayrı bölge, sadece asansörle (oyuncu) çıkılır
  { id: 'roof', name: 'ÇATI TERASI', x0: 20, y0: 69, x1: 69, y1: 78, floor: F.roof, outdoor: true },
];
for (const r of ROOMS) fillFloor(r.x0, r.y0, r.x1, r.y1, r.floor);
fillFloor(1, 57, 88, 61, F.road); // asfalt (üst ve alt kaldırım arası)

// ---- duvarlar
hWall(0, W - 1, 0);
const STREET_BOTTOM = 65;
for (let x = 0; x < W; x++) wall[idx(x, STREET_BOTTOM)] = 1;
vWall(0, 0, STREET_BOTTOM);
vWall(W - 1, 0, STREET_BOTTOM);
// çatı: korkuluk (üst), yan ve alt kenar
hWall(19, 70, 67);
vWall(19, 67, 79);
vWall(70, 67, 79);
for (let x = 19; x <= 70; x++) wall[idx(x, 79)] = 1;
// A | B
hWall(1, 88, 12, false, [[9, 10], [30, 31], [54, 55], [77, 78]]);
for (let x = 20; x <= 41; x++) if (wall[idx(x, 12)]) { wall[idx(x, 12)] = 3; wall[idx(x, 13)] = 4; } // CEO'nun cam ön duvarı
vWall(19, 2, 11);
vWall(42, 2, 11, true);
vWall(67, 2, 11);
// B | C
hWall(1, 88, 30, false, [[12, 13], [48, 49], [75, 76]]);
vWall(63, 14, 29);
// C | D
hWall(1, 88, 37, false, [[8, 9], [27, 28], [44, 45], [61, 62], [80, 81]]);
// bina cephesi: D | SOKAK (lobide 4 karoluk cam giriş)
hWall(1, 88, 51, false, [[43, 46]]);
export const FACADE_ROW = 52;
vWall(18, 39, 50);
vWall(36, 39, 50);
vWall(53, 39, 50);
vWall(71, 39, 50);

export function isWall(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  return wall[idx(x, y)] > 0;
}

/** Karonun ait olduğu oda (kapı karoları ve duvarlar için null). */
const roomGrid = new Int8Array(W * H).fill(-1);
ROOMS.forEach((r, i) => { for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) roomGrid[idx(x, y)] = i; });
export function roomAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
  const i = roomGrid[idx(tx, ty)];
  return i >= 0 ? ROOMS[i] : null;
}
export function roomById(id) {
  return ROOMS.find((r) => r.id === id);
}
/** Kamera/çizim sınırı (px): üst duvar (2 sıra) + yan duvarlar + alttaki duvarın tepesi. */
export function roomBounds(r) {
  return { x: (r.x0 - 1) * T, y: (r.y0 - 2) * T, w: (r.x1 - r.x0 + 3) * T, h: (r.y1 - r.y0 + 4) * T };
}

// ---- masalar (rol → masa karosu)
export const DESKS = {
  ceo: { x: 30, y: 6, label: 'GENEL MÜDÜR', chair: '#1d2028' },
  ideas: { x: 6, y: 18, label: 'FİKİR' },
  research: { x: 16, y: 18, label: 'ARAŞTIRMA' },
  dev: { x: 26, y: 18, label: 'GELİŞTİRME' },
  design: { x: 36, y: 18, label: 'TASARIM' },
  marketing: { x: 6, y: 25, label: 'PAZARLAMA' },
  shield: { x: 16, y: 25, label: 'DENETİM' },
  qa: { x: 26, y: 25, label: 'QA / İNCELEME' },
  claude: { x: 75, y: 21, label: 'CLAUDE · ON-CALL', chair: '#7a3b1e' },
  cfo: { x: 8, y: 44, label: 'FİNANS & BORSA' },
};

export function seatOf(role) {
  const d = DESKS[role];
  return { x: d.x * T + 11, y: d.y * T + 2, tx: d.x, ty: d.y - 1 };
}

export const BOSS_DESK = { x: 79, y: 44 };
export const BOSS_SEAT = { x: 79 * T + 24, y: 44 * T + 2, tx: 80, ty: 43 };
export const SPAWN = { x: 80 * T + 8, y: 48 * T + 12 };

export const POI = {
  coffee: [{ x: 21, y: 41 }, { x: 22, y: 41 }],
  water: [{ x: 60, y: 15 }, { x: 40, y: 34 }],
  vending: [{ x: 31, y: 41 }, { x: 70, y: 34 }],
  printer: [{ x: 57, y: 27 }],
  window: [{ x: 47, y: 3 }, { x: 25, y: 3 }, { x: 80, y: 3 }],
  pingpong: [{ x: 45, y: 23 }, { x: 52, y: 23 }],
  aquarium: [{ x: 57, y: 47 }],
  couch: [{ x: 56, y: 42 }, { x: 57, y: 42 }, { x: 58, y: 42 }, { x: 63, y: 42 }, { x: 64, y: 42 }, { x: 65, y: 42 }, { x: 59, y: 48 }, { x: 66, y: 48 }],
  meeting: [{ x: 50, y: 4 }, { x: 53, y: 4 }, { x: 56, y: 4 }, { x: 59, y: 4 }, { x: 50, y: 8 }, { x: 53, y: 8 }, { x: 56, y: 8 }, { x: 59, y: 8 }],
  meetingHead: { x: 61, y: 6 },
  ceoVisit: [{ x: 30, y: 8 }, { x: 31, y: 8 }],
  bossVisit: [{ x: 78, y: 47 }, { x: 82, y: 47 }],
  robotDock: { x: 44, y: 41 },
  dog: { x: 61, y: 46 },
  elevator: { x: 50, y: 41 },
  roofElevator: { x: 23, y: 71 },
};

// ---- mobilya
export const furniture = [];
function add(kind, tx, ty, opts = {}) {
  const f = { kind, x: tx * T + (opts.ox || 0), y: ty * T + (opts.oy || 0), tx, ty, ...opts };
  furniture.push(f);
  if (opts.block) for (const [bx, by, bw = 1, bh = 1] of opts.block) for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) block[idx(x, y)] = 1;
  return f;
}
const plant = (x, y, v = 0) => add('plant', x, y, { v, block: [[x, y, 1, 1]], oy: -6, sortY: y * T + 16 });
const bigPlant = (x, y) => add('bigPlant', x, y, { block: [[x, y, 1, 1]], oy: -16, sortY: y * T + 16 });

// masalar
for (const [role, d] of Object.entries(DESKS)) {
  add('chair', d.x, d.y - 1, { ox: 4, oy: -4, color: d.chair || '#2f3340', sortY: d.y * T - 6 });
  add('desk', d.x, d.y, { block: [[d.x, d.y, 2, 1]], role, sortY: d.y * T + 14 });
  add('monitor', d.x, d.y, { ox: 18, oy: -9, role, sortY: d.y * T + 15 });
  add('deskLabel', d.x, d.y + 1, { oy: 4, text: d.label, role, sortY: d.y * T + 30, flat: true });
  add('mug', d.x, d.y, { ox: 3 + ((d.x * 7) % 8), oy: 1, color: ['#e9e9ef', '#e05a2b', '#3b6ea8', '#f1c40f'][d.x % 4], sortY: d.y * T + 16 });
  if (role !== 'ceo' && role !== 'cfo') add('papers', d.x, d.y, { ox: 12, oy: 1, sortY: d.y * T + 16 });
}

// ===== MOTOR ODASI
for (let i = 0; i < 6; i++) add('rack', 2 + i * 2, 2, { block: [[2 + i * 2, 2, 1, 2]], oy: -16, provIdx: i, sortY: 4 * T, interact: i === 2 ? { id: 'servers', label: 'Motor odası (sağlayıcılar)', range: 3, tx: 7, ty: 5 } : null });
for (let i = 0; i < 4; i++) add('rack', 3 + i * 3, 7, { block: [[3 + i * 3, 7, 1, 2]], oy: -16, provIdx: 6 + i, sortY: 9 * T });
add('acUnit', 16, 2, { block: [[16, 2, 2, 1]], oy: -10, sortY: 3 * T });
add('acUnit', 16, 9, { block: [[16, 9, 2, 1]], oy: -10, sortY: 10 * T });
add('cable', 2, 10, { flat: true, w: 13 });
add('sign', 4, 1, { wallMounted: true, text: 'MOTOR ODASI', w: 64 });
add('poster', 13, 1, { wallMounted: true, text: 'KOTA DOLARSA\nSIRADAKİNE', color: '#e1efff' });

// ===== CEO OFİSİ
add('rug', 26, 4, { w: 160, h: 80, color: '#7b2f2f', flat: true, sortY: 0 });
add('bookshelf', 21, 2, { block: [[21, 2, 2, 1]], oy: -12, sortY: 2 * T + 17 });
add('bookshelf', 23, 2, { block: [[23, 2, 2, 1]], oy: -12, sortY: 2 * T + 17 });
add('cabinet', 40, 2, { block: [[40, 2, 1, 1]], oy: -8, sortY: 2 * T + 15 });
add('bigPlant', 40, 10, { block: [[40, 10, 1, 1]], oy: -16, sortY: 10 * T + 16 });
plant(21, 10, 1);
add('armchair', 28, 9, { block: [[28, 9, 1, 1]], ox: -2, oy: -4, sortY: 9 * T + 16 });
add('armchair', 33, 9, { block: [[33, 9, 1, 1]], ox: -2, oy: -4, sortY: 9 * T + 16 });
add('globe', 37, 5, { block: [[37, 5, 1, 1]], oy: -8, sortY: 5 * T + 16 });
add('whiteboard', 33, 1, { wallMounted: true, w: 96, h: 40, interact: { id: 'whiteboard', label: 'Görev panosu', range: 3, tx: 35, ty: 3 } });
add('clock', 27, 1, { wallMounted: true });
add('painting', 22, 1, { wallMounted: true, v: 0 });

// ===== TOPLANTI ODASI
add('table', 49, 5, { w: 176, h: 36, block: [[49, 5, 11, 2]], oy: -4, sortY: 7 * T, interact: { id: 'archive', label: 'Toplantı masası: Kararlar & Teslimler', range: 2, tx: 54, ty: 8 } });
for (let i = 0; i < 4; i++) {
  add('chair', 50 + i * 3, 4, { oy: -6, color: '#4a4e8f', sortY: 4 * T + 6 });
  add('chair', 50 + i * 3, 8, { oy: 2, color: '#4a4e8f', sortY: 8 * T + 18 });
}
add('chair', 61, 6, { oy: -2, color: '#2b2f3a', sortY: 6 * T + 10 });
add('tv', 52, 1, { wallMounted: true, w: 64, h: 28 });
add('bookshelf', 44, 2, { block: [[44, 2, 2, 1]], oy: -12, sortY: 2 * T + 17 });
plant(65, 2, 2);
plant(44, 10, 0);
plant(65, 10, 1);
add('poster', 62, 1, { wallMounted: true, text: 'İYİ İŞ BİRLİKTE\nYAPILIR', color: '#f6f0e1' });

// ===== ARŞİV & ANMA
for (let i = 0; i < 4; i++) add('bookshelf', 69 + i * 3, 4, { block: [[69 + i * 3, 4, 2, 1]], oy: -12, sortY: 4 * T + 17 });
for (let i = 0; i < 4; i++) add('bookshelf', 69 + i * 3, 8, { block: [[69 + i * 3, 8, 2, 1]], oy: -12, sortY: 8 * T + 17 });
add('table', 83, 6, { w: 64, h: 28, block: [[83, 6, 4, 1]], oy: -6, sortY: 7 * T, interact: { id: 'deliverables', label: 'Arşiv masası: tüm teslimler', range: 2, tx: 84, ty: 8 } });
add('papers', 84, 6, { oy: -8, sortY: 7 * T + 1 });
add('memorial', 74, 1, { wallMounted: true, w: 112, h: 26, interact: { id: 'people', label: 'Anma duvarı & kişiler', range: 3, tx: 77, ty: 3 } });
add('candle', 73, 2, { oy: -2, sortY: 2 * T + 10 });
add('candle', 81, 2, { oy: -2, sortY: 2 * T + 10 });
add('cabinet', 87, 2, { block: [[87, 2, 1, 1]], oy: -8, sortY: 2 * T + 15 });
plant(87, 10, 2);

// ===== AÇIK OFİS
add('companySign', 21, 13, { wallMounted: true, w: 128 });
add('poster', 3, 13, { wallMounted: true, text: 'İYİ FİKİRLER\nUYUMAZ', color: '#f6f0e1' });
add('poster', 13, 13, { wallMounted: true, text: 'PARA KAZAN\nYA DA KOVUL', color: '#ffe3d1' });
add('poster', 36, 13, { wallMounted: true, text: 'FARKLI AJANLAR\nAYNI HEDEF', color: '#f6f0e1' });
add('poster', 46, 13, { wallMounted: true, text: 'FİKİR > GÖREV\n> SONUÇ', color: '#e1efff' });
add('clock', 57, 13, { wallMounted: true });
// bölüm halıları
add('rug', 4, 15, { w: 384, h: 64, color: '#b9ae98', flat: true, sortY: 0 });
add('rug', 4, 22, { w: 384, h: 64, color: '#b9ae98', flat: true, sortY: 0 });
for (const [x, y, v] of [[2, 14, 0], [12, 14, 1], [22, 14, 2], [32, 14, 0], [42, 14, 1], [2, 28, 2], [12, 28, 0], [22, 28, 1], [32, 28, 2], [40, 21, 0]]) plant(x, y, v);
// mola alanı
add('rug', 43, 17, { w: 176, h: 112, color: '#2f6d5a', flat: true, sortY: 0 });
add('pingpong', 46, 21, { block: [[46, 21, 5, 2]], oy: -2, sortY: 23 * T });
add('beanbag', 44, 18, { oy: 2, sortY: 18 * T + 14 });
add('beanbag', 53, 18, { oy: 2, sortY: 18 * T + 14, color: '#3b6ea8' });
add('beanbag', 44, 26, { oy: 2, sortY: 26 * T + 14, color: '#2ecc71' });
add('waterCooler', 61, 14, { block: [[61, 14, 1, 1]], oy: -10, sortY: 14 * T + 16 });
add('printer', 57, 25, { block: [[57, 25, 1, 1]], oy: 2, sortY: 25 * T + 16 });
add('cabinet', 61, 24, { block: [[61, 24, 1, 1]], oy: -8, sortY: 24 * T + 16 });
add('cabinet', 61, 26, { block: [[61, 26, 1, 1]], oy: -8, sortY: 26 * T + 16 });
bigPlant(61, 29);
bigPlant(56, 14);
add('trash', 33, 20, { oy: 4, sortY: 20 * T + 14 });
add('trash', 13, 27, { oy: 4, sortY: 27 * T + 14 });

// ===== CLAUDE AR-GE LAB
add('rug', 71, 18, { w: 192, h: 96, color: '#8a4a2a', flat: true, sortY: 0 });
add('labSign', 70, 13, { wallMounted: true, w: 144 });
add('whiteboard', 80, 13, { wallMounted: true, w: 96, h: 40, lab: true });
for (let i = 0; i < 3; i++) add('rack', 65 + i * 2, 14, { block: [[65 + i * 2, 14, 1, 2]], oy: -16, provIdx: -1, sortY: 16 * T });
add('table', 79, 25, { w: 96, h: 28, block: [[79, 25, 6, 1]], oy: -6, sortY: 26 * T });
add('laptop', 80, 25, { oy: -10, sortY: 26 * T + 1 });
add('laptop', 83, 25, { oy: -10, sortY: 26 * T + 1 });
add('bigPlant', 87, 14, { block: [[87, 14, 1, 1]], oy: -16, sortY: 14 * T + 16 });
plant(65, 28, 1);
plant(87, 28, 2);
add('poster', 66, 13, { wallMounted: true, text: 'SADECE PATRON\nÇAĞIRIR', color: '#ffe3d1' });

// ===== KORİDOR
add('runner', 2, 33, { w: 86 * T, h: 3 * T, flat: true, sortY: 0 });
for (const [x, t, c] of [[4, 'MOTOR ODASI ↑', '#e1efff'], [24, 'AÇIK OFİS ↑', '#f6f0e1'], [52, 'TOPLANTI ↑', '#f6f0e1'], [66, 'CLAUDE LAB ↑', '#ffe3d1']]) add('poster', x, 31, { wallMounted: true, text: t, color: c });
add('painting', 34, 31, { wallMounted: true, v: 1 });
add('painting', 58, 31, { wallMounted: true, v: 2 });
add('painting', 83, 31, { wallMounted: true, v: 0 });
add('waterCooler', 40, 32, { block: [[40, 32, 1, 1]], oy: -10, sortY: 32 * T + 16 });
add('vending', 70, 32, { block: [[70, 32, 1, 1]], oy: -16, sortY: 32 * T + 16 });
for (const x of [2, 18, 30, 57, 87]) plant(x, 32, x % 3);
add('bench', 20, 36, { block: [[20, 36, 3, 1]], oy: 0, sortY: 36 * T + 14 });
add('bench', 64, 36, { block: [[64, 36, 3, 1]], oy: 0, sortY: 36 * T + 14 });
add('robotDock', 86, 34, { flat: true, sortY: 0 });

// ===== BORSA
add('ticker', 2, 38, { wallMounted: true, w: 208, h: 26, interact: { id: 'market', label: 'Borsa masası (paper trading)', range: 3, tx: 8, ty: 41 } });
add('multiMonitor', 12, 44, { block: [[12, 44, 3, 1]], oy: -10, sortY: 44 * T + 14 });
add('chair', 13, 43, { oy: -4, color: '#2f3340', sortY: 43 * T + 10 });
add('cabinet', 1, 44, { block: [[1, 44, 1, 1]], oy: -8, sortY: 44 * T + 16 });
add('safe', 16, 49, { block: [[16, 49, 1, 1]], ox: -1, oy: -4, sortY: 49 * T + 16, interact: { id: 'cash', label: 'Kasa', range: 2, tx: 15, ty: 49 } });
add('rug', 4, 47, { w: 128, h: 48, color: '#1f4d3a', flat: true, sortY: 0 });
bigPlant(1, 50);
plant(17, 39, 1);

// ===== MUTFAK
add('counter', 19, 39, { w: 128, block: [[19, 39, 8, 1]], sortY: 39 * T + 16 });
add('coffee', 21, 39, { ox: 2, oy: -8, sortY: 39 * T + 17, interact: { id: 'coffee', label: 'Kahve makinesi', range: 2, tx: 21, ty: 41 } });
add('fridge', 28, 39, { block: [[28, 39, 1, 1]], oy: -16, sortY: 39 * T + 16 });
add('vending', 31, 39, { block: [[31, 39, 1, 1]], oy: -16, sortY: 39 * T + 16 });
add('microwave', 24, 39, { oy: -7, sortY: 39 * T + 17 });
for (const [x, y] of [[21, 44], [28, 44], [21, 48], [28, 48]]) {
  add('table', x, y, { w: 48, h: 22, block: [[x, y, 3, 1]], oy: -4, sortY: y * T + 14 });
  add('mug', x + 1, y, { oy: -6, sortY: y * T + 15, color: ['#e05a2b', '#3b6ea8', '#f1c40f', '#e9e9ef'][(x + y) % 4] });
}
add('clock', 33, 38, { wallMounted: true });
add('poster', 24, 38, { wallMounted: true, text: 'KAHVE = YAKIT', color: '#ffe3d1' });
plant(35, 50, 0);

// ===== LOBİ
add('rug', 39, 44, { w: 192, h: 80, color: '#7a2f3f', flat: true, sortY: 0 });
add('reception', 42, 43, { block: [[42, 43, 5, 1]], oy: -6, sortY: 43 * T + 14, interact: { id: 'reception', label: 'Resepsiyon: nasıl oynanır?', range: 2, tx: 44, ty: 45 } });
add('elevator', 49, 39, { block: [[49, 39, 2, 1]], oy: -18, sortY: 39 * T + 16, interact: { id: 'elevator', label: 'Asansör: çatı terası', range: 2, tx: 50, ty: 41 } });
add('logoWall', 38, 38, { wallMounted: true, w: 80 });
add('couch', 38, 48, { block: [[38, 48, 3, 1]], ox: 0, oy: -6, sortY: 48 * T + 4 });
add('aquarium', 49, 47, { block: [[49, 47, 3, 1]], oy: -10, sortY: 47 * T + 14 });
bigPlant(37, 39);
bigPlant(52, 44);
plant(41, 50, 2);

// ===== DİNLENME SALONU
add('rug', 55, 44, { w: 224, h: 96, color: '#3d5a80', flat: true, sortY: 0 });
add('couch', 56, 42, { ox: 0, oy: -6, sortY: 42 * T + 4 });
add('couch', 63, 42, { ox: 0, oy: -6, sortY: 42 * T + 4 });
add('table', 59, 45, { w: 48, h: 22, block: [[59, 45, 3, 1]], oy: -2, sortY: 46 * T });
add('armchair', 58, 48, { oy: -4, sortY: 48 * T + 16 });
add('armchair', 66, 48, { oy: -4, sortY: 48 * T + 16 });
add('lamp', 54, 41, { block: [[54, 41, 1, 1]], oy: -14, sortY: 41 * T + 16, light: true });
add('lamp', 70, 41, { block: [[70, 41, 1, 1]], oy: -14, sortY: 41 * T + 16, light: true });
add('arcade', 68, 39, { block: [[68, 39, 1, 1]], oy: -16, sortY: 39 * T + 16, interact: { id: 'arcade', label: 'Atari makinesi', range: 2, tx: 68, ty: 41 } });
add('tvBig', 59, 38, { wallMounted: true, w: 80, interact: { id: 'decisions', label: 'Haber kanalı: Kararlar', range: 3, tx: 61, ty: 41 } });
bigPlant(54, 50);
plant(70, 50, 1);

// ===== BOSS OFİSİ
add('rug', 75, 42, { w: 192, h: 112, color: '#5d2f4a', flat: true, sortY: 0 });
add('chair', 80, 43, { oy: -6, color: '#1a1a1a', sortY: 43 * T + 10 });
add('bossDesk', 79, 44, { block: [[79, 44, 3, 1]], oy: -2, sortY: 44 * T + 18, interact: { id: 'boss', label: 'Boss masası: Hedef ver & Onaylar', range: 2, tx: 80, ty: 46 } });
add('laptop', 80, 44, { ox: 2, oy: -6, sortY: 44 * T + 19 });
add('mug', 79, 44, { ox: 4, oy: -5, sortY: 44 * T + 19, color: '#ffffff', boss: true });
add('inbox', 78, 44, { ox: 4, oy: -4, sortY: 44 * T + 19 });
add('bookshelf', 73, 39, { block: [[73, 39, 2, 1]], oy: -12, sortY: 39 * T + 17 });
add('bookshelf', 86, 39, { block: [[86, 39, 2, 1]], oy: -12, sortY: 39 * T + 17 });
add('globe', 76, 45, { block: [[76, 45, 1, 1]], oy: -8, sortY: 45 * T + 16 });
add('lamp', 84, 44, { block: [[84, 44, 1, 1]], oy: -14, sortY: 44 * T + 16, light: true });
add('couch', 77, 49, { block: [[77, 49, 3, 1]], oy: -6, sortY: 49 * T + 4 });
bigPlant(88, 49);
plant(72, 50, 2);
add('sign', 78, 38, { wallMounted: true, text: 'BOSS', w: 48 });
add('painting', 82, 38, { wallMounted: true, v: 1 });

// ===== SOKAK (dış mekân)
add('neon', 37, 52, { wallMounted: true, w: 112 });
for (const x of [3, 9, 15, 21, 27, 33, 54, 60, 66, 72, 78, 84]) add('facadeWindow', x, 52, { wallMounted: true, w: 32 });
add('glassDoor', 43, 51, { flat: true, w: 64, sortY: 0 });
for (const [x, y] of [[6, 55], [24, 55], [62, 55], [80, 55], [14, 63], [34, 63], [56, 63], [74, 63]]) add('tree', x, y, { block: [[x, y, 1, 1]], ox: -8, oy: -30, sortY: y * T + 15 });
for (const [x, y] of [[12, 55], [30, 55], [50, 55], [70, 55], [86, 55], [4, 63], [44, 63], [66, 63], [86, 63]]) add('streetLamp', x, y, { block: [[x, y, 1, 1]], ox: 2, oy: -34, sortY: y * T + 15, light: true });
add('bench', 36, 55, { block: [[36, 55, 3, 1]], sortY: 55 * T + 14 });
add('busStop', 17, 54, { block: [[17, 55, 3, 1]], oy: -14, sortY: 55 * T + 15, interact: { id: 'home', label: 'Otobüs durağı: eve git', range: 2, tx: 18, ty: 56 } });
add('hydrant', 41, 56, { block: [[41, 56, 1, 1]], oy: -4, sortY: 56 * T + 14 });
add('trash', 52, 55, { oy: 4, sortY: 55 * T + 14 });
add('car', 6, 57, { block: [[6, 57, 3, 2]], color: '#c0392b', oy: -4, sortY: 58 * T + 14 });
add('car', 58, 57, { block: [[58, 57, 3, 2]], color: '#2e86c1', oy: -4, sortY: 58 * T + 14 });
add('car', 26, 60, { block: [[26, 60, 3, 2]], color: '#f1c40f', oy: -4, sortY: 61 * T + 14, flip: true });
add('fence', 1, 62, { flat: false, w: 88 * T, sortY: 62 * T });
add('roadMarks', 1, 59, { flat: true, w: 88, sortY: 0 });

// ===== ÇATI TERASI
add('skyline', 19, 67, { wallMounted: true, w: 52 * T });
add('elevator', 22, 69, { block: [[22, 69, 2, 1]], oy: -18, sortY: 69 * T + 16, interact: { id: 'elevator', label: 'Asansör: lobi', range: 2, tx: 23, ty: 71 } });
add('helipad', 50, 71, { flat: true, sortY: 0 });
add('rug', 30, 73, { w: 176, h: 64, color: '#2f6d5a', flat: true, sortY: 0 });
for (const [x, y, c] of [[31, 73, '#e05a2b'], [35, 73, '#3b6ea8'], [39, 73, '#f1c40f'], [31, 76, '#2ecc71']]) add('deckChair', x, y, { color: c, oy: -2, sortY: y * T + 14 });
add('umbrella', 33, 72, { oy: -30, sortY: 74 * T + 15 });
add('umbrella', 39, 75, { oy: -30, sortY: 77 * T + 15, color: '#3b6ea8' });
add('grill', 44, 76, { block: [[44, 76, 1, 1]], oy: -10, sortY: 76 * T + 14 });
add('telescope', 66, 70, { block: [[66, 70, 1, 1]], oy: -14, sortY: 70 * T + 14, interact: { id: 'telescope', label: 'Dürbün: şehre bak', range: 2, tx: 66, ty: 71 } });
add('stringLights', 20, 69, { wallMounted: true, w: 50 * T, light: true });
add('bench', 56, 77, { block: [[56, 77, 3, 1]], sortY: 77 * T + 14 });
for (const [x, y] of [[20, 78], [28, 69], [47, 69], [69, 78], [62, 69]]) add('bigPlant', x, y, { block: [[x, y, 1, 1]], oy: -16, sortY: y * T + 16 });
add('acUnit', 60, 76, { block: [[60, 76, 2, 1]], oy: -10, sortY: 77 * T });

// Claude masası etkileşimi
furniture.find((f) => f.kind === 'desk' && f.role === 'claude').interact = { id: 'claude', label: 'Claude’a iş ver (Claude Code)', range: 2, tx: 76, ty: 22 };

// her mobilyanın odası (render filtresi için)
for (const f of furniture) f.room = (roomAt(f.tx, f.ty) || roomAt(f.tx, f.ty + 1) || roomAt(f.tx, f.ty + 2))?.id || null;
furniture.find((f) => f.kind === 'skyline').room = 'roof';


// Pencereler (sadece dış üst duvar, [x, genişlik])
export const WINDOWS = [[8, 4], [15, 3], [24, 2], [29, 3], [45, 5], [57, 4], [69, 4], [82, 5]];

export function walkable(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
  const i = idx(tx, ty);
  return floor[i] > 0 && !wall[i] && !block[i];
}

// ---- A* (4 yön, ikili yığın)
export function findPath(sx, sy, ex, ey) {
  if (!walkable(ex, ey)) {
    let best = null;
    for (let r = 1; r < 4 && !best; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!best && walkable(ex + dx, ey + dy)) best = [ex + dx, ey + dy];
    if (!best) return null;
    [ex, ey] = best;
  }
  const N = W * H;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = []; // [f, key]
  const push = (f, k) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const sk = sy * W + sx, ek = ey * W + ex;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
  g[sk] = 0;
  push(Math.abs(ex - sx) + Math.abs(ey - sy), sk);
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    if (k === ek) {
      const path = [];
      for (let c = k; c !== -1; c = came[c]) path.unshift([c % W, (c / W) | 0]);
      return path;
    }
    closed[k] = 1;
    const cx = k % W, cy = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = ny * W + nx;
      if (closed[nk] || (!walkable(nx, ny) && nk !== ek)) continue;
      const ng = g[k] + 1;
      if (ng < g[nk]) {
        g[nk] = ng;
        came[nk] = k;
        push(ng + Math.abs(ex - nx) + Math.abs(ey - ny), nk);
      }
    }
  }
  return null;
}

/** Oyuncu çarpışması: ayak kutusu (px). */
export function collides(px, py) {
  const pts = [[px - 5, py - 3], [px + 5, py - 3], [px - 5, py + 1], [px + 5, py + 1]];
  return pts.some(([x, y]) => !walkable(Math.floor(x / T), Math.floor(y / T)));
}
