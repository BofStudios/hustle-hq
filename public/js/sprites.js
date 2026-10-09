// Prosedürel pixel art: harici asset yok, telif riski yok. Her sprite bir kez çizilip önbelleğe alınır.

export const PAL = {
  skin: ['#f6d5b8', '#e3b08a', '#c68a5a', '#8f5a35', '#5e3a22'],
  hair: ['#1b1b1f', '#3a2418', '#6b4423', '#a0522d', '#d9a95b', '#efe0a8', '#b83a2e', '#5b6b7c'],
  shirt: ['#2d3446', '#e9e9ef', '#3b6ea8', '#3f8f5f', '#d0573a', '#8a55b5', '#e2b33c', '#2a7f86', '#d97a3a', '#c2457a', '#6d7f3a', '#4a4e8f'],
  pants: ['#283246', '#1f232b', '#4c4c54', '#3e5a7e'],
  tie: ['#c0392b', '#2e86c1', '#f39c12', '#1e1e24'],
};

const cache = new Map();

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function P(g, x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

function cached(key, w, h, draw) {
  let c = cache.get(key);
  if (!c) {
    const [cv, g] = canvas(w, h);
    draw(g, w, h);
    cache.set(key, cv);
    c = cv;
  }
  return c;
}

// ======================= KARAKTERLER (Dan The Man tarzı chibi) =======================
// 16x24. Büyük kafa (12x11), beyaz gözler + göz bebeği, kaşlar, ifade. dir: 0 aşağı, 1 yukarı, 2 sol, 3 sağ.
// pose: stand|walk|sit|type|sleep. mood: happy|neutral|stress|panic
export function character(look, dir = 0, frame = 0, pose = 'stand', blink = false, mood = 'neutral') {
  const key = `ch|${JSON.stringify(look)}|${dir}|${frame}|${pose}|${blink}|${mood}`;
  return cached(key, 16, 26, (g) => {
    if (dir === 3) {
      g.translate(16, 2);
      g.scale(-1, 1);
      drawChar(g, look, 2, frame, pose, blink, mood);
    } else {
      g.translate(0, 2);
      drawChar(g, look, dir, frame, pose, blink, mood);
    }
  });
}

function drawChar(g, L, dir, frame, pose, blink, mood) {
  const skin = PAL.skin[L.skin ?? 0];
  const skinD = shade(skin, -0.2);
  const hair = PAL.hair[L.hair ?? 0];
  const hairD = shade(hair, -0.35);
  const shirt = PAL.shirt[L.shirt ?? 0];
  const shirtD = shade(shirt, -0.28);
  const pants = PAL.pants[L.pants ?? 0];
  const shoe = '#17161b';
  const ink = '#1a1420';
  const typing = pose === 'type';
  const sleeping = pose === 'sleep';
  const walking = pose === 'walk' && frame > 0;
  const y0 = walking ? -1 : 0;

  // ---- bacaklar
  if (dir !== 2) {
    const lUp = walking && frame === 1 ? 1 : 0;
    const rUp = walking && frame === 2 ? 1 : 0;
    P(g, 4, 19 + y0 - lUp, 3, 4, pants);
    P(g, 9, 19 + y0 - rUp, 3, 4, pants);
    P(g, 3, 22 + y0 - lUp, 4, 2, shoe);
    P(g, 9, 22 + y0 - rUp, 4, 2, shoe);
  } else if (walking) {
    const f = frame === 1;
    P(g, f ? 3 : 9, 19 + y0, 3, 3, pants);
    P(g, f ? 9 : 3, 19 + y0, 3, 3, shade(pants, -0.25));
    P(g, f ? 2 : 9, 22 + y0, 4, 2, shoe);
    P(g, f ? 9 : 2, 22 + y0, 4, 2, shoe);
  } else {
    P(g, 6, 19, 4, 3, pants);
    P(g, 4, 22, 6, 2, shoe);
  }

  // ---- gövde (kısa, tıknaz)
  const jacket = L.suit ? '#2b2f3a' : shirt;
  const jacketD = L.suit ? '#1c1f27' : shirtD;
  const sw = walking ? (frame === 1 ? 1 : -1) : 0;
  if (dir === 0 || dir === 1) {
    P(g, 3, 12 + y0, 10, 8, jacket);
    P(g, 3, 19 + y0, 10, 1, jacketD);
    if (dir === 0) {
      if (L.suit) {
        P(g, 6, 12 + y0, 4, 5, '#f2f2f2');
        P(g, 7, 13 + y0, 2, 5, PAL.tie[L.tie >= 0 ? L.tie : 0]);
      } else if (L.hoodie) {
        P(g, 5, 12 + y0, 6, 2, jacketD);
        P(g, 6, 14 + y0, 1, 3, '#eee');
        P(g, 9, 14 + y0, 1, 3, '#eee');
        P(g, 5, 17 + y0, 6, 2, jacketD);
      } else {
        P(g, 6, 12 + y0, 4, 1, shade(shirt, 0.3));
        if (L.tie >= 0) P(g, 7, 13 + y0, 2, 5, PAL.tie[L.tie]);
      }
    } else P(g, 7, 13 + y0, 2, 6, jacketD);
    // kollar
    if (typing && dir === 0) {
      const up = frame % 2;
      P(g, 1, 13 + y0, 2, 4, jacketD);
      P(g, 13, 13 + y0, 2, 4, jacketD);
      P(g, 3, 17 - up, 3, 2, skin);
      P(g, 10, 17 - (1 - up), 3, 2, skin);
    } else if (pose === 'panicArms') {
      P(g, 1, 8, 2, 5, jacketD);
      P(g, 13, 8, 2, 5, jacketD);
      P(g, 1, 7, 2, 1, skin);
      P(g, 13, 7, 2, 1, skin);
    } else {
      P(g, 1, 13 + y0 + sw, 2, 5, jacketD);
      P(g, 13, 13 + y0 - sw, 2, 5, jacketD);
      P(g, 1, 18 + y0 + sw, 2, 2, skin);
      P(g, 13, 18 + y0 - sw, 2, 2, skin);
    }
  } else {
    P(g, 4, 12 + y0, 8, 8, jacket);
    P(g, 4, 19 + y0, 8, 1, jacketD);
    if (L.suit) P(g, 4, 12 + y0, 2, 4, '#f2f2f2');
    const s2 = walking ? (frame === 1 ? -2 : 2) : 0;
    P(g, 6 + Math.sign(s2), 13 + y0, 3, 5, jacketD);
    P(g, 6 + s2, 18 + y0, 3, 2, skin);
  }

  // ---- kafa (büyük)
  const hy = 1 + y0;
  if (dir === 0) {
    P(g, 3, hy, 10, 11, skin);
    P(g, 2, hy + 1, 12, 9, skin);
    P(g, 3, hy + 10, 10, 1, skinD);
    P(g, 1, hy + 5, 1, 3, skinD);
    P(g, 14, hy + 5, 1, 3, skinD);
    if (mood === 'panic') { g.fillStyle = 'rgba(230,60,60,0.28)'; g.fillRect(2, hy + 1, 12, 10); }
    face(g, mood, hy, blink || sleeping, L, hairD);
  } else if (dir === 1) {
    P(g, 3, hy, 10, 11, skin);
    P(g, 2, hy + 1, 12, 9, skin);
    P(g, 1, hy + 5, 1, 3, skinD);
    P(g, 14, hy + 5, 1, 3, skinD);
  } else {
    P(g, 3, hy, 10, 11, skin);
    P(g, 2, hy + 2, 1, 7, skin);
    P(g, 1, hy + 6, 1, 2, skin); // burun
    P(g, 3, hy + 10, 10, 1, skinD);
    P(g, 9, hy + 5, 2, 3, skinD); // kulak
    if (blink || sleeping) P(g, 3, hy + 6, 3, 1, ink);
    else {
      P(g, 3, hy + 4, 3, 4, '#ffffff');
      P(g, 3, hy + 5, 2, 3, ink);
    }
    const browY = mood === 'stress' || mood === 'panic' ? hy + 2 : hy + 3;
    P(g, 3, browY, 3, 1, hairD);
    if (mood === 'happy') { P(g, 2, hy + 8, 3, 1, ink); P(g, 4, hy + 7, 1, 1, ink); }
    else if (mood === 'panic') P(g, 2, hy + 8, 3, 2, '#5a1a1a');
    else P(g, 2, hy + 8, 2, 1, ink);
    if (L.glasses) { P(g, 2, hy + 4, 5, 1, ink); P(g, 6, hy + 4, 3, 1, ink); }
  }

  hairShape(g, L.hairStyle ?? 0, dir, hair, hairD, y0, mood);

  if (L.headphones) {
    const hp = '#26262c';
    P(g, 3, 0 + y0, 10, 1, hp);
    if (dir !== 2) {
      P(g, 0, 4 + y0, 3, 5, hp);
      P(g, 13, 4 + y0, 3, 5, hp);
      P(g, 0, 5 + y0, 1, 3, '#e05a2b');
    } else P(g, 8, 4 + y0, 4, 5, hp);
  }

  // kalın dış hat
  g.globalCompositeOperation = 'destination-over';
  outlinePass(g, ink);
  g.globalCompositeOperation = 'source-over';
}

/** Önden yüz ifadesi. */
function face(g, mood, hy, closed, L, brow) {
  const ink = '#1a1420';
  const ey = hy + 4;
  if (closed) {
    P(g, 4, ey + 2, 3, 1, ink);
    P(g, 9, ey + 2, 3, 1, ink);
  } else {
    // beyaz göz + göz bebeği (Dan The Man)
    P(g, 4, ey, 3, 4, '#ffffff');
    P(g, 9, ey, 3, 4, '#ffffff');
    const big = mood === 'panic';
    const px = mood === 'stress' ? 0 : 1;
    P(g, 4 + px, ey + 1, big ? 1 : 2, big ? 2 : 3, ink);
    P(g, 9 + px, ey + 1, big ? 1 : 2, big ? 2 : 3, ink);
  }
  // kaşlar
  if (mood === 'stress' || mood === 'panic') {
    P(g, 4, ey - 1, 2, 1, brow);
    P(g, 6, ey - 2, 1, 1, brow);
    P(g, 10, ey - 1, 2, 1, brow);
    P(g, 9, ey - 2, 1, 1, brow);
  } else if (mood === 'happy') {
    P(g, 4, ey - 2, 3, 1, brow);
    P(g, 9, ey - 2, 3, 1, brow);
  } else {
    P(g, 4, ey - 1, 3, 1, brow);
    P(g, 9, ey - 1, 3, 1, brow);
  }
  // ağız
  const my = hy + 8;
  if (mood === 'happy') {
    P(g, 6, my + 1, 4, 1, ink);
    P(g, 5, my, 1, 1, ink);
    P(g, 10, my, 1, 1, ink);
    P(g, 6, my + 1, 4, 1, '#5a1a1a');
    P(g, 3, my - 1, 1, 1, 'rgba(240,110,110,0.55)');
    P(g, 12, my - 1, 1, 1, 'rgba(240,110,110,0.55)');
  } else if (mood === 'stress') {
    P(g, 5, my + 1, 1, 1, ink);
    P(g, 6, my, 1, 1, ink);
    P(g, 7, my + 1, 1, 1, ink);
    P(g, 8, my, 1, 1, ink);
    P(g, 9, my + 1, 1, 1, ink);
    P(g, 10, my, 1, 1, ink);
  } else if (mood === 'panic') {
    P(g, 6, my - 1, 4, 3, '#5a1a1a');
    P(g, 6, my - 1, 4, 1, '#ffffff');
  } else {
    P(g, 7, my + 1, 2, 1, ink);
  }
  if (L.glasses && !closed) {
    P(g, 3, ey - 1 + 1, 5, 1, ink);
    P(g, 8, ey - 1 + 1, 5, 1, ink);
    P(g, 3, ey + 3, 5, 1, ink);
    P(g, 8, ey + 3, 5, 1, ink);
    P(g, 3, ey, 1, 3, ink);
    P(g, 12, ey, 1, 3, ink);
  }
}

function hairShape(g, style, dir, c, d, y0, mood) {
  const H = (x, y, w, h, col = c) => P(g, x, y + y0, w, h, col);
  const hl = shade(c, 0.2);
  if (dir === 1) {
    H(2, 0, 12, 10);
    H(2, 9, 12, 1, d);
    if (style === 3) { H(2, 9, 12, 5); H(3, 13, 10, 1, d); }
    if (style === 4) H(6, -1, 4, 2, d);
    if (style === 5) { H(1, -1, 14, 11); }
    if (style === 2) { H(3, -1, 1, 1); H(6, -1, 1, 1); H(9, -1, 1, 1); H(12, -1, 1, 1); }
    return;
  }
  if (dir === 2) {
    H(3, 0, 10, 3);
    H(8, 2, 5, 6);
    H(12, 3, 1, 6, d);
    H(3, 2, 3, 1);
    H(4, 0, 6, 1, hl);
    if (style === 3) { H(9, 6, 5, 8); H(11, 13, 3, 1, d); }
    if (style === 4) H(9, -1, 4, 2, d);
    if (style === 5) { H(2, -1, 12, 4); H(9, 3, 5, 7); }
    if (style === 2) { H(4, -1, 1, 1); H(7, -2, 1, 2); H(10, -1, 1, 1); }
    if (style === 1) H(3, 3, 4, 1);
    return;
  }
  // önden
  switch (style) {
    case 0:
      H(2, 0, 12, 3);
      H(1, 1, 1, 5);
      H(14, 1, 1, 5);
      H(2, 3, 2, 1);
      H(12, 3, 2, 1);
      H(4, 0, 6, 1, hl);
      break;
    case 1:
      H(2, 0, 12, 3);
      H(1, 1, 1, 6);
      H(14, 1, 1, 5);
      H(2, 3, 7, 1);
      H(2, 4, 3, 1);
      H(9, 0, 1, 2, d);
      H(4, 0, 4, 1, hl);
      break;
    case 2:
      H(2, 0, 12, 3);
      H(1, 1, 1, 5);
      H(14, 1, 1, 5);
      H(2, -1, 1, 1); H(5, -2, 2, 2); H(9, -1, 1, 1); H(12, -2, 1, 2);
      H(3, 3, 1, 1); H(6, 3, 1, 1); H(10, 3, 1, 1); H(12, 3, 1, 1);
      break;
    case 3:
      H(2, 0, 12, 3);
      H(1, 1, 2, 14);
      H(13, 1, 2, 14);
      H(0, 6, 1, 8, d);
      H(15, 6, 1, 8, d);
      H(3, 3, 3, 1);
      H(10, 3, 3, 1);
      H(4, 0, 6, 1, hl);
      break;
    case 4:
      H(2, 0, 12, 3);
      H(1, 1, 1, 6);
      H(14, 1, 1, 6);
      H(6, -2, 4, 2, d);
      H(2, 3, 2, 1);
      H(12, 3, 2, 1);
      break;
    case 5:
      H(1, -1, 14, 4);
      H(0, 1, 2, 8);
      H(14, 1, 2, 8);
      H(2, 3, 1, 1); H(13, 3, 1, 1);
      H(3, -1, 1, 1, d); H(8, -1, 1, 1, d); H(12, 0, 1, 1, d);
      break;
  }
  // panikte saç diken diken
  if (mood === 'panic') { H(3, -2, 1, 2); H(7, -3, 1, 3); H(11, -2, 1, 2); }
}

function outlinePass(g, color) {
  const { width: w, height: h } = g.canvas;
  const img = g.getImageData(0, 0, w, h);
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]);
  g.fillStyle = color;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!a(x, y) && (a(x - 1, y) > 200 || a(x + 1, y) > 200 || a(x, y - 1) > 200 || a(x, y + 1) > 200)) g.fillRect(x, y, 1, 1);
}

/** Portre (UI için): büyük ölçekli önden kafa+gövde. */
export function portrait(look, size = 64) {
  const [c, g] = canvas(size, size);
  const spr = character(look, 0, 0, 'stand', false, 'happy');
  const s = Math.floor(size / 16);
  g.drawImage(spr, 0, 1, 16, 16, (size - 16 * s) / 2, size - 16 * s, 16 * s, 16 * s);
  return c;
}

// ======================= MOBİLYA =======================
const WOOD = '#8a5a34', WOOD_L = '#a8723f', WOOD_D = '#5e3b20';

export const FURN = {
  desk: () => cached('desk', 32, 20, (g) => {
    P(g, 0, 0, 32, 4, WOOD_L); // üst yüzey
    P(g, 0, 4, 32, 12, WOOD);
    P(g, 0, 15, 32, 1, WOOD_D);
    P(g, 1, 0, 30, 1, shade(WOOD_L, 0.15));
    P(g, 20, 6, 10, 4, WOOD_D); // çekmeceler
    P(g, 20, 11, 10, 4, WOOD_D);
    P(g, 24, 7, 2, 1, '#d6b679');
    P(g, 24, 12, 2, 1, '#d6b679');
    P(g, 2, 16, 2, 4, WOOD_D);
    P(g, 28, 16, 2, 4, WOOD_D);
    P(g, 0, 18, 32, 2, 'rgba(0,0,0,0.15)');
  }),
  bossDesk: () => cached('bossDesk', 48, 22, (g) => {
    P(g, 0, 0, 48, 5, '#6d3f22');
    P(g, 0, 5, 48, 13, '#5a321a');
    P(g, 1, 0, 46, 1, '#8a5530');
    P(g, 4, 7, 40, 9, '#4a2913');
    P(g, 18, 9, 12, 5, '#d1a54a'); // isim plakası
    P(g, 19, 10, 10, 3, '#1f1a14');
    P(g, 0, 18, 48, 4, 'rgba(0,0,0,0.18)');
  }),
  chair: (color = '#2f3340') => cached('chair' + color, 14, 18, (g) => {
    P(g, 2, 0, 10, 9, color);
    P(g, 3, 1, 8, 7, shade(color, 0.12));
    P(g, 1, 9, 12, 3, shade(color, -0.1));
    P(g, 6, 12, 2, 3, '#222');
    P(g, 2, 15, 10, 1, '#222');
    P(g, 1, 16, 2, 2, '#111');
    P(g, 11, 16, 2, 2, '#111');
  }),
  monitorFrame: () => cached('monitor', 14, 12, (g) => {
    P(g, 0, 0, 14, 9, '#1c1c22');
    P(g, 6, 9, 2, 2, '#2a2a30');
    P(g, 3, 11, 8, 1, '#2a2a30');
  }),
  laptop: () => cached('laptop', 12, 8, (g) => {
    P(g, 1, 0, 10, 6, '#c9ccd3');
    P(g, 2, 1, 8, 4, '#3d6fa5');
    P(g, 0, 6, 12, 2, '#a7abb5');
  }),
  plant: (v = 0) => cached('plant' + v, 14, 22, (g) => {
    const leaf = ['#3f8f4a', '#4f9f45', '#2f7a43'][v % 3];
    const leafD = shade(leaf, -0.3);
    const leafL = shade(leaf, 0.2);
    P(g, 3, 15, 8, 7, '#b5653a');
    P(g, 2, 14, 10, 2, '#c9774a');
    P(g, 4, 21, 6, 1, '#7a4024');
    const leaves = [[6, 0, 2, 6], [3, 3, 3, 5], [8, 2, 3, 6], [1, 7, 4, 3], [9, 6, 4, 4], [5, 5, 4, 6], [2, 10, 4, 3], [8, 10, 4, 3]];
    leaves.forEach(([x, y, w, h], i) => P(g, x, y, w, h, i % 3 === 0 ? leafD : i % 3 === 1 ? leaf : leafL));
    P(g, 6, 9, 2, 5, leafD);
  }),
  bigPlant: () => cached('bigPlant', 18, 32, (g) => {
    P(g, 4, 24, 10, 8, '#8c8f99');
    P(g, 3, 23, 12, 2, '#a3a6b0');
    const L = ['#2f7a43', '#3f8f4a', '#5aa64f'];
    const leaves = [[7, 0, 3, 10], [2, 4, 5, 8], [10, 3, 5, 9], [0, 10, 6, 5], [12, 10, 6, 5], [4, 12, 10, 8], [1, 16, 6, 5], [11, 16, 6, 5], [6, 6, 6, 8]];
    leaves.forEach(([x, y, w, h], i) => P(g, x, y, w, h, L[i % 3]));
  }),
  cabinet: () => cached('cabinet', 14, 24, (g) => {
    P(g, 0, 0, 14, 24, '#6f7480');
    P(g, 1, 1, 12, 22, '#858b97');
    for (let i = 0; i < 3; i++) {
      P(g, 1, 1 + i * 7.3, 12, 1, '#5d626d');
      P(g, 5, 4 + i * 7.3, 4, 1, '#c9ccd3');
    }
  }),
  bookshelf: () => cached('bookshelf', 28, 30, (g) => {
    P(g, 0, 0, 28, 30, WOOD_D);
    P(g, 1, 1, 26, 28, '#4a2d18');
    const cols = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085'];
    for (let row = 0; row < 3; row++) {
      P(g, 1, 9 + row * 9, 26, 1, WOOD);
      let x = 2;
      let i = row * 3;
      while (x < 25) {
        const w = 2 + ((i * 7) % 3);
        P(g, x, 2 + row * 9 + ((i * 5) % 2), w, 7 - ((i * 5) % 2), cols[i % cols.length]);
        x += w + 1;
        i++;
      }
    }
  }),
  waterCooler: () => cached('water', 12, 26, (g) => {
    P(g, 2, 0, 8, 9, '#8fd3f4');
    P(g, 3, 1, 3, 7, '#bfe7fa');
    P(g, 1, 9, 10, 15, '#e6e8ec');
    P(g, 1, 9, 10, 1, '#c9ccd3');
    P(g, 3, 12, 2, 2, '#3a7bd5');
    P(g, 7, 12, 2, 2, '#d64545');
    P(g, 1, 24, 10, 2, '#9aa0aa');
  }),
  coffee: () => cached('coffee', 14, 16, (g) => {
    P(g, 0, 0, 14, 16, '#2b2b30');
    P(g, 1, 1, 12, 4, '#43434b');
    P(g, 2, 2, 3, 2, '#e05a2b');
    P(g, 4, 7, 6, 6, '#18181c');
    P(g, 5, 10, 4, 3, '#f2f2f2');
  }),
  counter: (w = 48) => cached('counter' + w, w, 18, (g) => {
    P(g, 0, 0, w, 4, '#d9dce2');
    P(g, 0, 4, w, 14, '#7a8494');
    for (let x = 2; x < w - 4; x += 12) {
      P(g, x, 6, 10, 10, '#6a7383');
      P(g, x + 4, 8, 2, 1, '#cfd3da');
    }
  }),
  fridge: () => cached('fridge', 16, 32, (g) => {
    P(g, 0, 0, 16, 32, '#dfe3ea');
    P(g, 1, 1, 14, 30, '#eef1f5');
    P(g, 1, 11, 14, 1, '#b7bcc6');
    P(g, 12, 4, 1, 5, '#9aa0aa');
    P(g, 12, 14, 1, 8, '#9aa0aa');
    P(g, 3, 15, 4, 3, '#f39c12'); // mıknatıs
  }),
  couch: () => cached('couch', 48, 24, (g) => {
    const c = '#2d3550', l = '#3a4466', d = '#1f253a';
    P(g, 0, 4, 48, 16, c);
    P(g, 2, 0, 44, 8, l);
    P(g, 0, 6, 5, 14, d);
    P(g, 43, 6, 5, 14, d);
    P(g, 5, 10, 18, 8, l);
    P(g, 25, 10, 18, 8, l);
    P(g, 23, 10, 2, 8, d);
    P(g, 2, 20, 3, 3, '#111');
    P(g, 43, 20, 3, 3, '#111');
  }),
  armchair: () => cached('armchair', 20, 22, (g) => {
    P(g, 0, 4, 20, 14, '#7a3b2e');
    P(g, 2, 0, 16, 8, '#94493a');
    P(g, 0, 6, 4, 12, '#5e2c22');
    P(g, 16, 6, 4, 12, '#5e2c22');
    P(g, 4, 10, 12, 6, '#a65846');
    P(g, 2, 18, 2, 3, '#111');
    P(g, 16, 18, 2, 3, '#111');
  }),
  rug: (w = 64, h = 40, c = '#8a3b3b') => cached(`rug${w}${h}${c}`, w, h, (g) => {
    P(g, 0, 0, w, h, shade(c, -0.25));
    P(g, 2, 2, w - 4, h - 4, c);
    P(g, 5, 5, w - 10, h - 10, shade(c, 0.12));
    P(g, 8, 8, w - 16, h - 16, c);
  }),
  table: (w = 64, h = 28) => cached(`table${w}${h}`, w, h, (g) => {
    P(g, 0, 0, w, h - 6, WOOD_L);
    P(g, 1, 1, w - 2, 1, shade(WOOD_L, 0.15));
    P(g, 0, h - 6, w, 3, WOOD_D);
    P(g, 2, h - 3, 3, 3, WOOD_D);
    P(g, w - 5, h - 3, 3, 3, WOOD_D);
  }),
  serverRack: () => cached('rack', 16, 34, (g) => {
    P(g, 0, 0, 16, 34, '#16181d');
    P(g, 1, 1, 14, 32, '#23262e');
    for (let i = 0; i < 7; i++) {
      P(g, 2, 2 + i * 4.4, 12, 3, '#2f333d');
      P(g, 3, 3 + i * 4.4, 6, 1, '#3d4250');
    }
    P(g, 0, 32, 16, 2, '#0e0f12');
  }),
  printer: () => cached('printer', 16, 14, (g) => {
    P(g, 0, 3, 16, 9, '#d7dae0');
    P(g, 2, 0, 12, 4, '#f4f5f7');
    P(g, 1, 12, 14, 2, '#9aa0aa');
    P(g, 3, 6, 10, 1, '#2b2b30');
    P(g, 12, 4, 2, 1, '#27ae60');
  }),
  papers: () => cached('papers', 10, 8, (g) => {
    for (let i = 0; i < 4; i++) P(g, i % 2, 6 - i * 2, 9, 2, i % 2 ? '#f4f1e8' : '#e6e1d3');
  }),
  mug: (c = '#e9e9ef') => cached('mug' + c, 6, 6, (g) => {
    P(g, 0, 1, 4, 5, c);
    P(g, 4, 2, 2, 2, c);
    P(g, 1, 0, 2, 1, '#5a3a22');
  }),
  lamp: () => cached('lamp', 10, 30, (g) => {
    P(g, 1, 0, 8, 6, '#f1e3b0');
    P(g, 0, 5, 10, 1, '#d9c48a');
    P(g, 4, 6, 2, 22, '#333');
    P(g, 2, 28, 6, 2, '#222');
  }),
  safe: () => cached('safe', 18, 20, (g) => {
    P(g, 0, 0, 18, 20, '#3d4048');
    P(g, 1, 1, 16, 18, '#555963');
    P(g, 6, 6, 6, 6, '#2c2e34');
    P(g, 8, 8, 2, 2, '#d1a54a');
    P(g, 14, 8, 2, 4, '#c9ccd3');
  }),
  vending: () => cached('vending', 18, 32, (g) => {
    P(g, 0, 0, 18, 32, '#b83a2e');
    P(g, 2, 2, 10, 22, '#1d2a3a');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) P(g, 3 + c * 3, 4 + r * 5, 2, 3, ['#f1c40f', '#2ecc71', '#3498db', '#e67e22'][(r + c) % 4]);
    P(g, 13, 6, 3, 8, '#e8e8ea');
    P(g, 2, 26, 10, 4, '#111');
  }),
  acUnit: () => cached('ac', 30, 22, (g) => {
    P(g, 0, 0, 30, 22, '#9aa3b0');
    P(g, 1, 1, 28, 20, '#c3cad4');
    for (let i = 0; i < 6; i++) P(g, 3, 3 + i * 3, 24, 1, '#7d8794');
    P(g, 24, 2, 3, 2, '#2ecc71');
  }),
  globe: () => cached('globe', 12, 22, (g) => {
    P(g, 2, 0, 8, 8, '#3a7bd5');
    P(g, 3, 1, 3, 3, '#3f8f4a');
    P(g, 6, 4, 3, 2, '#3f8f4a');
    P(g, 1, 2, 1, 5, '#d1a54a');
    P(g, 5, 8, 2, 10, '#5e3b20');
    P(g, 2, 18, 8, 3, '#5e3b20');
  }),
  candle: () => cached('candle', 6, 10, (g) => {
    P(g, 1, 4, 4, 6, '#f4f1e8');
    P(g, 2, 1, 2, 3, '#ffb347');
    P(g, 2, 0, 1, 1, '#fff3b0');
  }),
  pingpong: () => cached('pingpong', 80, 34, (g) => {
    P(g, 0, 0, 80, 26, '#1f6f4a');
    P(g, 1, 1, 78, 24, '#27855a');
    P(g, 39, 0, 2, 26, '#f2f2f2');
    P(g, 0, 12, 80, 1, '#f2f2f2');
    P(g, 0, 26, 80, 3, '#174d36');
    P(g, 4, 29, 3, 5, '#333');
    P(g, 73, 29, 3, 5, '#333');
    P(g, 36, -1, 8, 3, '#ddd');
    P(g, 20, 6, 2, 2, '#ff8c42');
  }),
  beanbag: (c = '#c0392b') => cached('bean' + c, 20, 14, (g) => {
    P(g, 2, 3, 16, 10, c);
    P(g, 4, 1, 12, 4, shade(c, 0.15));
    P(g, 5, 6, 10, 4, shade(c, -0.15));
    P(g, 2, 13, 16, 1, 'rgba(0,0,0,0.2)');
  }),
  trash: () => cached('trash', 8, 10, (g) => {
    P(g, 0, 0, 8, 2, '#5d626d');
    P(g, 1, 2, 6, 8, '#858b97');
    P(g, 2, 3, 1, 6, '#6f7480');
    P(g, 5, 3, 1, 6, '#6f7480');
  }),
  bench: () => cached('bench', 48, 14, (g) => {
    P(g, 0, 0, 48, 4, '#a8723f');
    P(g, 0, 4, 48, 3, '#8a5a34');
    P(g, 3, 7, 3, 7, '#333');
    P(g, 42, 7, 3, 7, '#333');
  }),
  multiMonitor: () => cached('mmon', 48, 26, (g) => {
    P(g, 0, 10, 48, 16, '#2b2f3a');
    P(g, 0, 10, 48, 3, '#3a3f4b');
    for (let i = 0; i < 3; i++) {
      P(g, 1 + i * 16, 0, 14, 10, '#111');
      P(g, 2 + i * 16, 1, 12, 8, '#0d1b16');
    }
  }),
  microwave: () => cached('micro', 16, 10, (g) => {
    P(g, 0, 0, 16, 10, '#d7dae0');
    P(g, 1, 1, 10, 8, '#2b2b30');
    P(g, 12, 2, 3, 1, '#2ecc71');
    P(g, 12, 5, 3, 3, '#9aa0aa');
  }),
  reception: () => cached('recep', 80, 24, (g) => {
    P(g, 0, 0, 80, 6, '#e8e2d4');
    P(g, 0, 6, 80, 16, '#7a2f3f');
    P(g, 0, 6, 80, 2, '#d1a54a');
    P(g, 30, 10, 20, 8, '#d1a54a');
    P(g, 31, 11, 18, 6, '#5a1f2c');
    P(g, 6, 1, 10, 4, '#2b2f3a');
    P(g, 64, 1, 6, 4, '#3f8f4a');
    P(g, 0, 22, 80, 2, 'rgba(0,0,0,0.2)');
  }),
  aquarium: () => cached('aqua', 48, 30, (g) => {
    P(g, 0, 0, 48, 22, '#1d2a3a');
    P(g, 2, 2, 44, 18, '#3fa7d6');
    P(g, 2, 16, 44, 4, '#d9c48a');
    P(g, 8, 10, 2, 6, '#3f8f4a');
    P(g, 36, 8, 2, 8, '#2f7a43');
    P(g, 0, 22, 48, 8, '#5e3b20');
  }),
  arcade: () => cached('arcade', 18, 34, (g) => {
    P(g, 0, 0, 18, 34, '#3b2a6b');
    P(g, 2, 2, 14, 4, '#e05a2b');
    P(g, 2, 8, 14, 11, '#111');
    P(g, 1, 21, 16, 5, '#2b1f52');
    P(g, 4, 22, 2, 2, '#e74c3c');
    P(g, 9, 22, 2, 2, '#f1c40f');
    P(g, 12, 23, 2, 2, '#2ecc71');
    P(g, 2, 28, 14, 6, '#2b1f52');
  }),
  box: () => cached('box', 12, 9, (g) => {
    P(g, 0, 1, 12, 8, '#b0834f');
    P(g, 0, 1, 12, 2, '#c99a62');
    P(g, 5, 1, 2, 3, '#e8d6a8');
    P(g, 2, 0, 3, 2, '#3b6ea8'); // kupa/eşya
    P(g, 8, -1, 2, 3, '#3f8f4a');
    P(g, 0, 8, 12, 1, '#7a5a34');
  }),
  tree: () => cached('tree', 32, 46, (g) => {
    const L = ['#2f6e3a', '#3c8a45', '#56a64f', '#24572f'];
    P(g, 13, 30, 6, 16, '#6b4423');
    P(g, 14, 30, 2, 16, '#83552d');
    const blobs = [[4, 10, 24, 16, 0], [8, 2, 16, 12, 1], [2, 16, 12, 12, 3], [18, 16, 12, 12, 0], [10, 6, 12, 10, 2], [6, 20, 20, 10, 1]];
    for (const [x, y, w, h, c] of blobs) P(g, x, y, w, h, L[c]);
    P(g, 10, 4, 4, 3, '#7cc46b');
    P(g, 20, 12, 3, 2, '#7cc46b');
    P(g, 9, 44, 14, 2, 'rgba(0,0,0,0.25)');
  }),
  streetLamp: () => cached('slamp', 12, 50, (g) => {
    P(g, 5, 8, 2, 40, '#2b2f3a');
    P(g, 1, 4, 10, 5, '#2b2f3a');
    P(g, 2, 8, 8, 2, '#ffe9a8');
    P(g, 3, 46, 6, 4, '#1c1f27');
  }),
  car: (c = '#c0392b') => cached('car' + c, 48, 30, (g) => {
    P(g, 2, 8, 44, 16, c);
    P(g, 10, 2, 26, 10, shade(c, -0.15));
    P(g, 12, 4, 10, 7, '#9fd3f2');
    P(g, 24, 4, 10, 7, '#9fd3f2');
    P(g, 2, 14, 44, 2, shade(c, 0.2));
    P(g, 0, 16, 4, 4, '#ffe08a');
    P(g, 44, 16, 4, 3, '#d64545');
    P(g, 6, 22, 10, 8, '#17161b');
    P(g, 32, 22, 10, 8, '#17161b');
    P(g, 9, 25, 4, 3, '#8a919c');
    P(g, 35, 25, 4, 3, '#8a919c');
  }),
  busStop: () => cached('bus', 48, 44, (g) => {
    P(g, 2, 0, 44, 5, '#1b2440');
    P(g, 4, 5, 2, 39, '#3a3f4b');
    P(g, 42, 5, 2, 39, '#3a3f4b');
    P(g, 6, 7, 36, 24, 'rgba(160,210,240,0.45)');
    P(g, 8, 30, 32, 4, '#8a5a34');
    P(g, 20, 1, 8, 3, '#f1c40f');
  }),
  hydrant: () => cached('hyd', 10, 16, (g) => {
    P(g, 2, 2, 6, 12, '#c0392b');
    P(g, 3, 0, 4, 3, '#e74c3c');
    P(g, 0, 6, 10, 3, '#a93226');
    P(g, 1, 14, 8, 2, '#5d1a14');
  }),
  trophy: () => cached('trophy', 9, 11, (g) => {
    P(g, 1, 0, 7, 1, '#ffe27a');
    P(g, 1, 1, 7, 4, '#f1c40f');
    P(g, 0, 1, 1, 3, '#d4a017');
    P(g, 8, 1, 1, 3, '#d4a017');
    P(g, 2, 1, 1, 3, '#fff3b0');
    P(g, 3, 5, 3, 2, '#d4a017');
    P(g, 4, 7, 1, 1, '#b8860b');
    P(g, 2, 8, 5, 2, '#6b4a2e');
    P(g, 1, 10, 7, 1, '#4a321e');
  }),
  doorMat: () => cached('mat', 32, 10, (g) => {
    P(g, 0, 0, 32, 10, '#5a4636');
    P(g, 2, 2, 28, 6, '#6e5743');
  }),
  elevator: () => cached('elev', 32, 34, (g) => {
    P(g, 0, 0, 32, 34, '#7d8592');
    P(g, 2, 4, 28, 30, '#aab2bf');
    P(g, 15, 4, 2, 30, '#6c7480');
    P(g, 10, 0, 12, 3, '#222');
    P(g, 13, 1, 6, 1, '#e05a2b');
  }),
  // ---- v1.1 yaşayan dünya
  atm: () => cached('atm', 18, 32, (g) => {
    P(g, 0, 0, 18, 32, '#3a2a22');
    P(g, 1, 1, 16, 30, '#e05a2b');
    P(g, 1, 1, 16, 4, '#b8431a');
    P(g, 3, 7, 12, 8, '#0d1b14');
    P(g, 4, 8, 10, 1, '#2ecc71');
    P(g, 4, 10, 6, 1, '#2ecc71');
    P(g, 4, 12, 8, 1, '#1e8c4e');
    P(g, 3, 17, 7, 6, '#2b2f3a');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) P(g, 4 + c * 2, 18 + r * 2, 1, 1, '#c9ccd3');
    P(g, 11, 17, 4, 2, '#17161b');
    P(g, 11, 21, 4, 1, '#17161b');
    P(g, 3, 25, 12, 3, '#2b2f3a');
    P(g, 2, 30, 14, 2, '#24181a');
  }),
  bus: () => cached('cbus', 96, 40, (g) => {
    P(g, 2, 4, 92, 28, '#e05a2b');
    P(g, 2, 4, 92, 3, '#ff8a50');
    P(g, 2, 24, 92, 3, '#b8431a');
    for (let i = 0; i < 7; i++) P(g, 8 + i * 12, 9, 9, 9, '#9fd3f2');
    for (let i = 0; i < 7; i++) P(g, 8 + i * 12, 9, 2, 9, 'rgba(255,255,255,0.45)');
    P(g, 0, 10, 4, 14, '#f4f1e8');
    P(g, 0, 22, 3, 3, '#ffe08a');
    P(g, 92, 22, 4, 3, '#d64545');
    P(g, 30, 20, 26, 3, '#f4f1e8');
    P(g, 10, 30, 14, 10, '#17161b');
    P(g, 70, 30, 14, 10, '#17161b');
    P(g, 14, 34, 6, 3, '#8a919c');
    P(g, 74, 34, 6, 3, '#8a919c');
  }),
  van: () => cached('van', 56, 34, (g) => {
    P(g, 2, 4, 52, 22, '#2f4a3a');
    P(g, 2, 4, 52, 3, '#3f6650');
    P(g, 2, 4, 14, 12, '#3f6650');
    P(g, 4, 6, 10, 8, '#9fd3f2');
    P(g, 22, 10, 26, 10, '#1f3328');
    P(g, 30, 12, 10, 6, '#d1a54a');
    P(g, 33, 13, 4, 4, '#2f4a3a');
    P(g, 0, 18, 3, 4, '#ffe08a');
    P(g, 53, 18, 3, 4, '#d64545');
    P(g, 8, 24, 12, 10, '#17161b');
    P(g, 38, 24, 12, 10, '#17161b');
    P(g, 11, 27, 5, 3, '#8a919c');
    P(g, 41, 27, 5, 3, '#8a919c');
  }),
  scooter: () => cached('scoot', 28, 20, (g) => {
    P(g, 6, 6, 16, 6, '#c0392b');
    P(g, 16, 2, 10, 8, '#f4f1e8');
    P(g, 17, 3, 8, 6, '#e05a2b');
    P(g, 2, 2, 2, 8, '#2b2f3a');
    P(g, 0, 12, 8, 8, '#17161b');
    P(g, 20, 12, 8, 8, '#17161b');
    P(g, 2, 14, 4, 4, '#8a919c');
    P(g, 22, 14, 4, 4, '#8a919c');
  }),
  pizzaBox: () => cached('pizza', 14, 6, (g) => {
    P(g, 0, 1, 14, 5, '#e8d6a8');
    P(g, 0, 1, 14, 1, '#f4e9c8');
    P(g, 4, 2, 6, 2, '#c0392b');
    P(g, 0, 5, 14, 1, '#b8a170');
  }),
  pizzaOpen: () => cached('pizzaO', 14, 8, (g) => {
    P(g, 0, 2, 14, 6, '#e8d6a8');
    P(g, 1, 3, 12, 4, '#e0a23a');
    P(g, 2, 3, 10, 3, '#d4542a');
    P(g, 3, 4, 1, 1, '#7a2a1a'); P(g, 7, 3, 1, 1, '#7a2a1a'); P(g, 10, 5, 1, 1, '#7a2a1a');
    P(g, 5, 5, 1, 1, '#3f8f4a'); P(g, 9, 4, 1, 1, '#3f8f4a');
  }),
  cake: () => cached('cake', 14, 13, (g) => {
    P(g, 1, 6, 12, 6, '#f6d5e5');
    P(g, 1, 6, 12, 2, '#ffffff');
    P(g, 1, 9, 12, 1, '#e05a8f');
    P(g, 0, 12, 14, 1, '#c9ccd3');
    for (let i = 0; i < 3; i++) { P(g, 3 + i * 4, 2, 1, 4, ['#4cc9f0', '#ffd23f', '#3ddc97'][i]); P(g, 3 + i * 4, 0, 1, 2, '#ff8c42'); }
  }),
  moneyBag: () => cached('mbag', 10, 11, (g) => {
    P(g, 3, 0, 4, 2, '#8a6a3a');
    P(g, 2, 2, 6, 1, '#5a4636');
    P(g, 1, 3, 8, 7, '#b08a4a');
    P(g, 0, 5, 10, 4, '#b08a4a');
    P(g, 4, 4, 2, 5, '#2e7d32');
    P(g, 3, 5, 4, 1, '#2e7d32');
    P(g, 3, 7, 4, 1, '#2e7d32');
    P(g, 1, 10, 8, 1, '#7a5a2a');
  }),
  wetSign: () => cached('wet', 10, 14, (g) => {
    P(g, 3, 0, 4, 2, '#f1c40f');
    P(g, 2, 2, 6, 4, '#f1c40f');
    P(g, 1, 6, 8, 4, '#f1c40f');
    P(g, 0, 10, 10, 3, '#f1c40f');
    P(g, 4, 4, 2, 4, '#1a1420');
    P(g, 4, 9, 2, 1, '#1a1420');
    P(g, 0, 13, 10, 1, '#b8941a');
  }),
};

// ======================= ŞEHİR HAYVANLARI =======================
export function pigeon(frame = 0, flying = false) {
  return cached(`pig${frame}${flying}`, 9, 8, (g) => {
    if (flying) {
      P(g, 3, 3, 4, 3, '#8a919c');
      P(g, 6, 2, 2, 2, '#6c7480');
      const up = frame % 2;
      P(g, 0, up ? 0 : 4, 4, 2, '#aab1bc');
      P(g, 5, up ? 0 : 4, 4, 2, '#aab1bc');
    } else {
      P(g, 1, 3, 6, 3, '#8a919c');
      P(g, 6, 1 + (frame % 2), 2, 3, '#6c7480');
      P(g, 7, 2 + (frame % 2), 1, 1, '#2ecc71');
      P(g, 8, 3 + (frame % 2), 1, 1, '#e0a23a');
      P(g, 0, 4, 2, 1, '#5a616c');
      P(g, 3, 6, 1, 2, '#e05a2b');
      P(g, 5, 6, 1, 2, '#e05a2b');
    }
  });
}

export function cat(frame = 0, pose = 'sit') {
  return cached(`cat${frame}${pose}`, 16, 12, (g) => {
    const c = '#6c7480', d = '#4a505a', w = '#e8e8ea';
    if (pose === 'sleep') {
      P(g, 2, 6, 12, 5, c);
      P(g, 10, 4, 5, 5, c);
      P(g, 10, 3, 1, 1, d); P(g, 14, 3, 1, 1, d);
      P(g, 11, 6, 3, 1, d);
      P(g, 0, 8 + (frame % 2), 3, 2, d);
      P(g, 4, 8, 4, 2, w);
    } else if (pose === 'walk') {
      P(g, 2, 4, 10, 4, c);
      P(g, 10, 1, 5, 5, c);
      P(g, 10, 0, 1, 1, d); P(g, 14, 0, 1, 1, d);
      P(g, 12, 3, 1, 1, '#f1c40f');
      P(g, 0, 2 - (frame % 2), 2, 4, d);
      P(g, 3, 8, 2, 3 - (frame % 2), d);
      P(g, 9, 8, 2, 2 + (frame % 2), d);
    } else {
      P(g, 5, 4, 7, 7, c);
      P(g, 6, 0, 6, 5, c);
      P(g, 6, 0, 1, 1, d); P(g, 11, 0, 1, 1, d);
      P(g, 7, 2, 1, 1, '#f1c40f'); P(g, 10, 2, 1, 1, '#f1c40f');
      P(g, 7, 7, 4, 3, w);
      P(g, 2, 9 + (frame % 2), 4, 2, d);
    }
  });
}

// ======================= HAYVAN / ROBOT =======================
export function dog(frame = 0, sleeping = true) {
  return cached(`dog${frame}${sleeping}`, 20, 12, (g) => {
    const c = '#d39b4a', d = '#a8732f', l = '#e8bb72';
    if (sleeping) {
      P(g, 2, 5, 15, 6, c);
      P(g, 3, 4, 12, 2, l);
      P(g, 14, 3, 5, 6, c);
      P(g, 15, 2, 2, 2, d);
      P(g, 18, 6, 1, 1, '#222');
      P(g, 15, 6, 2, 1, '#5a3a1a');
      P(g, 0, 7 + (frame % 2), 3, 2, d);
      P(g, 2, 11, 15, 1, 'rgba(0,0,0,0.2)');
    } else {
      P(g, 3, 3, 12, 5, c);
      P(g, 14, 0, 5, 5, c);
      P(g, 15, 0, 2, 1, d);
      P(g, 17, 2, 1, 1, '#222');
      P(g, 19, 3, 1, 1, '#222');
      P(g, 1, 2 - (frame % 2), 2, 2, d);
      P(g, 4, 8, 2, 3 - (frame % 2), d);
      P(g, 12, 8, 2, 2 + (frame % 2), d);
    }
  });
}

export function robot(frame = 0, carrying = false, cash = false) {
  return cached(`robot${frame}${carrying}${cash}`, 14, 20, (g) => {
    P(g, 2, 2, 10, 8, '#e6e9ef');
    P(g, 3, 3, 8, 5, '#20283a');
    P(g, 4, 4, 2, 2, '#46d4ff');
    P(g, 8, 4, 2, 2, '#46d4ff');
    P(g, 6, 0, 2, 2, '#9aa0aa');
    P(g, 6, 0, 2, 1, frame % 2 ? '#e05a2b' : '#ff9a5a');
    P(g, 3, 10, 8, 6, '#cfd4dc');
    P(g, 5, 12, 4, 2, '#e05a2b');
    P(g, 1, 11, 2, 4, '#aab1bc');
    P(g, 11, 11, 2, 4, '#aab1bc');
    P(g, 4, 16, 2, 3 - (frame % 2), '#8a919c');
    P(g, 8, 16, 2, 2 + (frame % 2), '#8a919c');
    if (carrying && cash) {
      P(g, 9, 7, 5, 7, '#b08a4a');
      P(g, 10, 6, 3, 1, '#8a6a3a');
      P(g, 11, 8, 1, 5, '#2e7d32');
      P(g, 10, 9, 3, 1, '#2e7d32');
    } else if (carrying) {
      P(g, 9, 9, 6, 5, '#f4e3b5');
      P(g, 9, 9, 6, 1, '#d9c48a');
      P(g, 11, 11, 2, 1, '#c0392b');
    }
  });
}

export function ghost(frame = 0) {
  return cached(`ghost${frame}`, 16, 20, (g) => {
    g.globalAlpha = 0.75;
    P(g, 3, 2, 10, 14, '#dfe6f2');
    P(g, 4, 1, 8, 1, '#dfe6f2');
    for (let i = 0; i < 5; i++) P(g, 3 + i * 2, 16 + ((i + frame) % 2), 2, 2, '#dfe6f2');
    P(g, 5, 6, 2, 3, '#2a2f3a');
    P(g, 9, 6, 2, 3, '#2a2f3a');
    P(g, 7, 11, 2, 2, '#2a2f3a');
  });
}
