// Lemon Squeezy: GERÇEK satışları okur (sadece okuma). Yeni ödenmiş sipariş → otomatik gelir kaydı.
// Ürün bir teslime bağlandıysa o teslimi üreten ajan ödül alır. Para hareketi yapmaz, sadece okur.
import { env } from './config.js';
import { load, save } from './store.js';
import { deliverables } from './state.js';
import { recordRevenue } from './economy.js';
import { quote } from './market.js';
import { emit, toast } from './bus.js';

const API = 'https://api.lemonsqueezy.com/v1';
const state = load('lemonsqueezy', { seen: [], productLinks: {}, lastSync: null, lastError: null, products: [], firstSyncDone: false });

function headers() {
  return { Accept: 'application/vnd.api+json', Authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}` };
}

export function lsStatus() {
  return {
    connected: !!env.LEMONSQUEEZY_API_KEY,
    lastSync: state.lastSync,
    lastError: state.lastError,
    products: state.products,
    productLinks: state.productLinks,
    ordersSeen: state.seen.length,
  };
}

async function get(path) {
  const r = await fetch(API + path, { headers: headers(), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Lemon Squeezy ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

async function toTry(amount, currency) {
  if (!currency || currency === 'TRY') return amount;
  const fx = await quote(`${currency}TRY=X`);
  return fx.source === 'sim' ? amount : amount * fx.price;
}

export async function syncProducts() {
  const j = await get('/products?page[size]=50');
  state.products = (j.data || []).map((p) => ({ id: p.id, name: p.attributes.name, price: p.attributes.price_formatted, url: p.attributes.buy_now_url, status: p.attributes.status }));
  save('lemonsqueezy', state);
  return state.products;
}

/** Yeni ödenmiş siparişleri çek. İlk senkronda geçmiş siparişler "görüldü" sayılır, geliri şişirmez. */
export async function syncOrders() {
  if (!env.LEMONSQUEEZY_API_KEY) return { skipped: true };
  try {
    if (!state.products.length) await syncProducts().catch(() => {});
    const j = await get('/orders?page[size]=50&sort=-created_at');
    const seen = new Set(state.seen);
    let added = 0;
    for (const o of (j.data || []).reverse()) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const a = o.attributes;
      if (!state.firstSyncDone || a.status !== 'paid' || a.test_mode) continue;
      const item = a.first_order_item || {};
      const amount = await toTry((a.total || 0) / 100, a.currency);
      const dlvId = state.productLinks[String(item.product_id)] || null;
      const valid = dlvId && deliverables.some((d) => d.id === dlvId) ? dlvId : null;
      recordRevenue(Math.round(amount * 100) / 100, `Lemon Squeezy: ${item.product_name || 'ürün'} (#${a.order_number})`, valid);
      added++;
    }
    state.seen = [...seen].slice(-2000);
    state.firstSyncDone = true;
    state.lastSync = Date.now();
    state.lastError = null;
    save('lemonsqueezy', state);
    if (added) toast(`🍋 Lemon Squeezy: ${added} yeni satış!`, 'money');
    emit('lemonsqueezy', lsStatus());
    return { added };
  } catch (e) {
    state.lastError = e.message;
    save('lemonsqueezy', state);
    emit('lemonsqueezy', lsStatus());
    return { error: e.message };
  }
}

export function linkProduct(productId, deliverableId) {
  if (deliverableId) state.productLinks[String(productId)] = deliverableId;
  else delete state.productLinks[String(productId)];
  save('lemonsqueezy', state);
  return lsStatus();
}

export function startLemonSqueezy() {
  setTimeout(() => syncOrders(), 5000);
  setInterval(() => syncOrders(), 5 * 60 * 1000).unref();
}
