// Sunucu içi olay yolu; WS katmanı buna abone olup istemcilere yayınlar.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

/** İstemcilere gidecek olay. */
export function emit(type, payload) {
  bus.emit('client', { type, payload });
}

export function toast(text, kind = 'info') {
  emit('toast', { text, kind });
}
