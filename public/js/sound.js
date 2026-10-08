// Prosedürel ses efektleri (WebAudio, dosya yok). Tarayıcı kuralı: ilk kullanıcı etkileşiminden sonra açılır.
let ac = null;
let master = null;
let enabled = true;
try { enabled = localStorage.getItem('hq_sound') !== '0'; } catch {}

function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.12;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

const unlock = () => { if (enabled) audio(); };
window.addEventListener('keydown', unlock, { once: true });
window.addEventListener('mousedown', unlock, { once: true });

function tone(freq, dur = 0.08, { type = 'square', vol = 1, slide = 0, delay = 0, out = null } = {}) {
  if (!enabled || !ac || ac.state !== 'running') return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out || master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur = 0.02, vol = 0.3) {
  if (!enabled || !ac || ac.state !== 'running') return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  const g = ac.createGain();
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 2000 + Math.random() * 1500;
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(f).connect(g).connect(master);
  src.start();
}

// ---- oda ambiyansı: her oda için sürekli çalan küçük bir ses grafiği, oda değişince yumuşak geçiş
let ambRoom = null;
let ambLayer = null; // { gain, stop() }
let echo = null; // koridor adım yankısı (delay + geri besleme)

function noiseBuffer(sec = 2, brown = false) {
  const len = Math.floor(ac.sampleRate * sec);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}

function loopNoise(out, { brown = false, type = 'lowpass', freq = 400, q = 0.7, vol = 0.3 } = {}) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(2, brown);
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start();
  return src;
}

function drone(out, freq, { type = 'sine', vol = 0.1, lfo = 0, lfoDepth = 0 } = {}) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = vol;
  const nodes = [o];
  if (lfo) {
    const l = ac.createOscillator();
    const lg = ac.createGain();
    l.frequency.value = lfo;
    lg.gain.value = lfoDepth;
    l.connect(lg).connect(g.gain);
    l.start();
    nodes.push(l);
  }
  o.connect(g).connect(out);
  o.start();
  return nodes;
}

const LOFI = [[220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 349.2], [164.8, 196, 246.9, 293.7]];

const AMBIENCE = {
  // motor odası: alçak uğultu + fan hışırtısı
  servers(out) {
    const srcs = [loopNoise(out, { brown: true, freq: 260, vol: 0.55 }), loopNoise(out, { type: 'bandpass', freq: 1800, q: 0.5, vol: 0.03 })];
    srcs.push(...drone(out, 50, { vol: 0.12, lfo: 0.3, lfoDepth: 0.03 }), ...drone(out, 100, { type: 'triangle', vol: 0.03 }));
    return () => srcs.forEach((s) => s.stop());
  },
  // mutfak: buzdolabı vızıltısı (dalgalanan)
  kitchen(out) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    f.connect(out);
    const srcs = drone(f, 118, { type: 'sawtooth', vol: 0.05, lfo: 0.13, lfoDepth: 0.02 });
    srcs.push(...drone(f, 236, { type: 'sine', vol: 0.015 }));
    return () => srcs.forEach((s) => s.stop());
  },
  // dinlenme salonu: çok kısık lo-fi akorlar
  lounge(out) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    f.connect(out);
    const vinyl = loopNoise(out, { type: 'highpass', freq: 3000, vol: 0.012 });
    let i = 0;
    const play = () => {
      const t0 = ac.currentTime + 0.05;
      LOFI[i++ % LOFI.length].forEach((fr, k) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'triangle';
        o.frequency.value = fr;
        o.detune.value = (Math.random() - 0.5) * 12; // kaset sallantısı
        const st = t0 + k * 0.04;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.06, st + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 3.1);
        o.connect(g).connect(f);
        o.start(st);
        o.stop(st + 3.2);
      });
    };
    play();
    const iv = setInterval(play, 3200);
    return () => { clearInterval(iv); vinyl.stop(); };
  },
  // sokak: uzaktan trafik uğultusu + gündüz kuş cıvıltısı
  street(out) {
    const rumble = loopNoise(out, { brown: true, freq: 220, vol: 0.4 });
    const hiss = loopNoise(out, { type: 'bandpass', freq: 900, q: 0.4, vol: 0.02 });
    const chirp = () => {
      const h = new Date().getHours();
      if (h < 6 || h > 19) return;
      const t0 = ac.currentTime + 0.05;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        const st = t0 + k * 0.12;
        o.type = 'sine';
        o.frequency.setValueAtTime(2600 + Math.random() * 900, st);
        o.frequency.exponentialRampToValueAtTime(3600 + Math.random() * 600, st + 0.07);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.04, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
        o.connect(g).connect(out);
        o.start(st);
        o.stop(st + 0.1);
      }
    };
    const iv = setInterval(() => { if (Math.random() < 0.5) chirp(); }, 2600);
    return () => { clearInterval(iv); rumble.stop(); hiss.stop(); };
  },
  // çatı: rüzgâr (yavaşça dalgalanan bant geçiren gürültü) + uzaktan şehir
  roof(out) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(3, false);
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 0.6;
    const g = ac.createGain();
    g.gain.value = 0.05;
    const lfo = ac.createOscillator();
    const lg = ac.createGain();
    lfo.frequency.value = 0.15;
    lg.gain.value = 250;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
    const city = loopNoise(out, { brown: true, freq: 160, vol: 0.18 });
    return () => { src.stop(); lfo.stop(); city.stop(); };
  },
  // koridor: hafif hava + adımlar yankılanır (bkz. sfx.step)
  hall(out) {
    const s = loopNoise(out, { brown: true, freq: 180, vol: 0.15 });
    return () => s.stop();
  },
};

/** Bulunulan odaya göre ambiyansı ayarlar; her karede çağrılabilir (aynı odaysa hiçbir şey yapmaz). */
export function setAmbience(roomId) {
  if (!ac || ac.state !== 'running') return;
  if (!enabled) roomId = null;
  if (roomId === ambRoom) return;
  ambRoom = roomId;
  const t = ac.currentTime;
  if (ambLayer) {
    const old = ambLayer;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + 0.8);
    setTimeout(() => { try { old.stop(); } catch {} old.gain.disconnect(); }, 900);
    ambLayer = null;
  }
  const make = AMBIENCE[roomId];
  if (!make) return;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(1, t + 1.2);
  g.connect(master);
  ambLayer = { gain: g, stop: make(g) };
}

// sekme gizlenince ambiyans susar; görünür olunca world.js bir sonraki karede yeniden kurar
document.addEventListener('visibilitychange', () => { if (document.hidden) setAmbience(null); });

function stepOut() {
  if (ambRoom !== 'hall') return master;
  if (!echo) {
    const d = ac.createDelay(1);
    const fb = ac.createGain();
    const wet = ac.createGain();
    d.delayTime.value = 0.16;
    fb.gain.value = 0.38;
    wet.gain.value = 0.6;
    d.connect(fb).connect(d);
    d.connect(wet).connect(master);
    const inp = ac.createGain();
    inp.connect(master);
    inp.connect(d);
    echo = inp;
  }
  return echo;
}

export const sfx = {
  key: (vol = 0.25) => noise(0.018, vol),
  ding: () => { tone(880, 0.12, { type: 'triangle', vol: 0.6 }); tone(1320, 0.18, { type: 'triangle', vol: 0.5, delay: 0.08 }); },
  approval: () => { tone(660, 0.1, { vol: 0.4 }); tone(990, 0.12, { vol: 0.4, delay: 0.1 }); },
  money: () => { [988, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.35, delay: i * 0.06 })); noise(0.25, 0.15); },
  death: () => { tone(330, 0.5, { type: 'sawtooth', vol: 0.4, slide: -260 }); tone(220, 0.6, { type: 'triangle', vol: 0.4, slide: -160, delay: 0.15 }); },
  hire: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.45, delay: i * 0.07 })); },
  step: () => { if (ac) tone(120 + Math.random() * 30, 0.03, { type: 'triangle', vol: 0.12, out: stepOut() }); },
  blip: (pitch = 520) => tone(pitch + Math.random() * 30, 0.035, { type: 'square', vol: 0.16 }),
  select: () => tone(880, 0.05, { type: 'square', vol: 0.25 }),
  horn: () => { tone(392, 0.22, { type: 'square', vol: 0.18 }); tone(494, 0.22, { type: 'square', vol: 0.12 }); },
  carPass: () => noise(0.6, 0.08),
  door: () => { noise(0.08, 0.2); tone(180, 0.12, { type: 'triangle', vol: 0.35, slide: -60 }); },
  error: () => tone(160, 0.2, { type: 'square', vol: 0.3, slide: -40 }),
};

export function soundEnabled() {
  return enabled;
}

export function toggleSound() {
  enabled = !enabled;
  try { localStorage.setItem('hq_sound', enabled ? '1' : '0'); } catch {}
  if (enabled) { audio(); sfx.ding(); } else setAmbience(null);
  return enabled;
}
