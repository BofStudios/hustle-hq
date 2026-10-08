// Dokunmatik kontroller: sol altta sanal joystick, sağ altta E (etkileşim) ve Esc düğmeleri.
// Sadece dokunmatik cihazda görünür; klavye olaylarını taklit eder, oyun kodu değişmeden çalışır.
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function key(type, k) {
  window.dispatchEvent(new KeyboardEvent(type, { key: k }));
}

export function initTouch() {
  if (!isTouch) return;
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `<div class="joy"><div class="knob"></div></div>
    <button class="tbtn tbtn-e">E</button><button class="tbtn tbtn-x">✕</button>`;
  document.body.appendChild(root);
  document.body.classList.add('touch');

  const joy = root.querySelector('.joy');
  const knob = root.querySelector('.knob');
  const held = new Set();
  const setDir = (want) => {
    for (const k of ['w', 'a', 's', 'd']) {
      if (want.has(k) && !held.has(k)) { key('keydown', k); held.add(k); }
      if (!want.has(k) && held.has(k)) { key('keyup', k); held.delete(k); }
    }
  };
  let id = null;
  const move = (t) => {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const max = r.width / 2;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const want = new Set();
    const dead = max * 0.3;
    if (dy < -dead) want.add('w');
    if (dy > dead) want.add('s');
    if (dx < -dead) want.add('a');
    if (dx > dead) want.add('d');
    setDir(want);
  };
  joy.addEventListener('touchstart', (e) => { e.preventDefault(); id = e.changedTouches[0].identifier; move(e.changedTouches[0]); }, { passive: false });
  joy.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === id) move(t);
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === id) { id = null; knob.style.transform = ''; setDir(new Set()); }
  };
  joy.addEventListener('touchend', end);
  joy.addEventListener('touchcancel', end);

  const tap = (sel, k) => root.querySelector(sel).addEventListener('touchstart', (e) => { e.preventDefault(); key('keydown', k); key('keyup', k); }, { passive: false });
  tap('.tbtn-e', 'e');
  tap('.tbtn-x', 'Escape');
}
