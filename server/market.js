// Borsa masası: SADECE paper trading (sanal portföy). Hiçbir brokera bağlanmaz.
// Fiyat kaynağı: Yahoo Finance (ücretsiz, gecikmeli; BIST .IS destekli), yedek stooq. Erişilemezse deterministik simülasyon ("sim").
import { load, save, uid } from './store.js';
import { emit } from './bus.js';
import { company } from './state.js';

export const portfolio = load('portfolio', {
  startCapital: 100000,
  cash: 100000,
  positions: {}, // SYM -> { qty, avg }
  trades: [],
  watch: ['AAPL', 'NVDA', 'MSFT', 'BTC-USD', 'THYAO.IS', 'ASELS.IS', 'BIMAS.IS'],
  history: [], // { t, value }
});

const cache = new Map(); // sym -> { price, t, source }

function stooqSymbol(sym) {
  const s = sym.toLowerCase();
  if (s === 'btc-usd') return 'btcusd';
  if (s === 'eth-usd') return 'ethusd';
  if (s.includes('.')) return s;
  return `${s}.us`;
}

function simPrice(sym) {
  // sembolden tohumlu, zamana göre dalgalanan sahte fiyat
  let seed = 0;
  for (const c of sym) seed = (seed * 31 + c.charCodeAt(0)) % 100000;
  const base = 20 + (seed % 480);
  const t = Date.now() / 3.6e6;
  return +(base * (1 + 0.04 * Math.sin(t / 5 + seed) + 0.015 * Math.sin(t * 1.7 + seed / 7))).toFixed(2);
}

export async function quote(symRaw) {
  const sym = String(symRaw || '').toUpperCase().replace(/[^A-Z0-9.=\-]/g, '').slice(0, 15);
  if (!sym) throw new Error('sembol gerekli');
  const c = cache.get(sym);
  if (c && Date.now() - c.t < 5 * 60 * 1000) return { sym, ...c };
  let price = null;
  let source = 'sim';
  let currency = null;
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    const meta = (await r.json())?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice > 0) {
      price = meta.regularMarketPrice;
      currency = meta.currency || null;
      source = 'yahoo';
    }
  } catch {}
  if (price == null) {
    try {
      const r = await fetch(`https://stooq.com/q/l/?s=${stooqSymbol(sym)}&f=sd2t2ohlcv&h&e=csv`, { signal: AbortSignal.timeout(6000) });
      const [, row] = (await r.text()).trim().split(/\r?\n/);
      const close = Number(row?.split(',')[6]);
      if (Number.isFinite(close) && close > 0) {
        price = close;
        source = 'stooq';
      }
    } catch {}
  }
  if (price == null) price = simPrice(sym);
  const v = { price, t: Date.now(), source, currency };
  cache.set(sym, v);
  return { sym, ...v };
}

// ---- döviz kuru (cüzdan yüklemesinde TL → USD gibi çeviri). Canlı kur yoksa tahmin YAPILMAZ, hata döner.
const SYMBOL_ISO = { '$': 'USD', 'US$': 'USD', '₺': 'TRY', 'TL': 'TRY', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
export function isoOf(cur) {
  const c = String(cur || '').trim();
  return SYMBOL_ISO[c] || SYMBOL_ISO[c.toUpperCase()] || (/^[A-Za-z]{3}$/.test(c) ? c.toUpperCase() : 'USD');
}
/** 1 birim `from` kaç `to` eder. Örn. fxRate('TRY','USD') ≈ 0.02 */
export async function fxRate(fromRaw, toRaw) {
  const from = isoOf(fromRaw), to = isoOf(toRaw);
  if (from === to) return { from, to, rate: 1, source: 'same', t: Date.now() };
  // küçük kurlarda (TRY→USD gibi) ters parite daha hassas: USDTRY=49.2712 → 1/49.2712
  let best = null;
  for (const [sym, inv] of [[`${to}${from}=X`, true], [`${from}${to}=X`, false]]) {
    const q = await quote(sym);
    if (q.source === 'sim' || !(q.price > 0)) continue;
    const r = { from, to, rate: inv ? 1 / q.price : q.price, source: q.source, t: q.t };
    if (q.price >= 1) return r;
    best ||= r;
  }
  if (best) return best;
  throw new Error(`Live exchange rate ${from}→${to} is unavailable right now. Try again in a minute or enter the amount in ${to}.`);
}

/** Portföyün para birimi. Eski kurulumlar TRY; boş yeni portföy şirket para birimini (ör. USD) alır. */
function base() {
  if (!portfolio.base) {
    const fresh = !portfolio.trades.length && !Object.keys(portfolio.positions).length;
    if (fresh) {
      portfolio.base = isoOf(company.currency);
      if (portfolio.base !== 'TRY' && portfolio.cash === 100000 && portfolio.startCapital === 100000) {
        portfolio.cash = portfolio.startCapital = 10000;
        portfolio.watch = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'SPY', 'BTC-USD'];
      }
    } else portfolio.base = 'TRY';
    save('portfolio');
  }
  return portfolio.base;
}
const SYM = { USD: '$', TRY: '₺', EUR: '€', GBP: '£' };

/** Yabancı para birimli fiyatlar canlı kurla portföy para birimine çevrilir. */
async function toBase(q) {
  const b = base();
  if (!q.currency || q.currency === b || q.source === 'sim') return q.price;
  const fx = await quote(`${q.currency}${b}=X`);
  return fx.source === 'sim' ? q.price : q.price * fx.price;
}

export async function paperTrade({ symbol, side, qty, reason = '', by = 'Penny' }) {
  const q = await quote(symbol);
  const n = Math.floor(Math.abs(Number(qty) || 0));
  if (!n) throw new Error('qty must be a positive whole number');
  const s = String(side).toLowerCase();
  const unit = await toBase(q);
  const pos = (portfolio.positions[q.sym] ||= { qty: 0, avg: 0 });
  const cost = n * unit;
  if (s === 'buy' || s === 'al') {
    if (cost > portfolio.cash) {
      if (!pos.qty) delete portfolio.positions[q.sym];
      const c = SYM[base()] || base();
      throw new Error(`not enough paper cash (${c}${portfolio.cash.toFixed(2)}, need ${c}${cost.toFixed(2)})`);
    }
    pos.avg = (pos.avg * pos.qty + cost) / (pos.qty + n);
    pos.qty += n;
    portfolio.cash -= cost;
  } else if (s === 'sell' || s === 'sat') {
    if (n > pos.qty) {
      if (!pos.qty) delete portfolio.positions[q.sym];
      throw new Error(`only ${pos.qty} shares held`);
    }
    pos.qty -= n;
    portfolio.cash += cost;
    if (!pos.qty) delete portfolio.positions[q.sym];
  } else throw new Error('side: buy veya sell');
  const tr = { id: uid('trd'), t: Date.now(), sym: q.sym, side: s.startsWith('b') || s === 'al' ? 'buy' : 'sell', qty: n, price: q.price, currency: q.currency, priceBase: +unit.toFixed(2), source: q.source, reason: String(reason).slice(0, 300), by };
  portfolio.trades.push(tr);
  if (portfolio.trades.length > 500) portfolio.trades.shift();
  save('portfolio');
  emit('portfolio', await portfolioView());
  return tr;
}

export async function portfolioView() {
  let value = portfolio.cash;
  const positions = [];
  for (const [sym, p] of Object.entries(portfolio.positions)) {
    const q = await quote(sym);
    const unit = await toBase(q);
    value += p.qty * unit;
    positions.push({ sym, qty: p.qty, avg: p.avg, price: q.price, currency: q.currency, priceBase: unit, source: q.source, pnl: (unit - p.avg) * p.qty });
  }
  const last = portfolio.history.at(-1);
  if (!last || Date.now() - last.t > 15 * 60 * 1000) {
    portfolio.history.push({ t: Date.now(), value });
    if (portfolio.history.length > 400) portfolio.history.shift();
    save('portfolio');
  }
  return {
    disclaimer: 'Simulation. No real money. Not investment advice.',
    base: base(),
    baseSymbol: SYM[base()] || base(),
    startCapital: portfolio.startCapital,
    cash: portfolio.cash,
    value,
    pnl: value - portfolio.startCapital,
    positions,
    trades: portfolio.trades.slice(-50),
    watch: portfolio.watch,
    history: portfolio.history.slice(-100),
  };
}

export function resetPortfolio(capital) {
  const c = Math.max(100, Number(capital) || 100000);
  Object.assign(portfolio, { startCapital: c, cash: c, positions: {}, trades: [], history: [], base: isoOf(company.currency) });
  save('portfolio');
}
