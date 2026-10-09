// Giriş noktası.
import { connect, on, S } from './net.js';
import { initI18n } from './i18n.js';
import { initWorld } from './world.js';
import { initTouch } from './touch.js';
import { initUI, open, openAgent, closeAll, isTyping, toast, showAwayReport, showOnboarding, goHome, showSetup, showFundModal, showTutorial } from './ui.js';

initI18n();
await initUI();
initWorld(document.getElementById('game'), { open, openAgent, closeAll, isTyping, toast, help: showOnboarding, goHome });
connect();
initTouch();

const lastSeen = Number(localStorage.getItem('hq_last_seen')) || 0;
let first = true;
on('snapshot', () => {
  if (first && !S.company?.setupDone) {
    showSetup();
    first = false;
    return;
  }
  if (first) {
    if (S.demo) setTimeout(() => toast('🟠 DEMO modu: gerçek zekâ için Motorlar menüsünden ücretsiz API anahtarı ekle.', 'info'), 1500);
    // 10 dakikadan uzun aradan sonra "sen yokken" raporu
    if (lastSeen && Date.now() - lastSeen > 10 * 60 * 1000 && localStorage.getItem('hq_onboarded')) showAwayReport(lastSeen);
    // oyuna girer girmez: "şirketi fonla" (TL → USD otomatik çeviri). Kapatılabilir.
    let ask = true;
    try { ask = localStorage.getItem('hq_fund_ask') !== '0'; } catch {}
    if (!(S.company.safetyAck?.v >= 1)) setTimeout(() => showTutorial({ thenFund: true }), 900); // önce kısa tutorial + güvenlik kuralları
    else if (ask) setTimeout(() => showFundModal(), 900);
  }
  first = false;
});
const markSeen = () => { try { localStorage.setItem('hq_last_seen', String(Date.now())); } catch {} };
setInterval(markSeen, 30000);
window.addEventListener('beforeunload', markSeen);
