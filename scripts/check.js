// Öz-test: sahte bir OpenAI uyumlu sunucu (Ollama gibi davranır) ile gerçek LLM yolunu doğrular.
// API anahtarı gerektirmez. Çalıştır: npm run check
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Kullanıcının data/ ve .env dosyasına dokunma: geçici klasörde çalış
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hustlehq-check-'));
process.env.HQ_DATA_DIR = path.join(TMP, 'data');
process.env.HQ_WORKSPACE_DIR = path.join(TMP, 'workspace');
process.env.HQ_ENV_FILE = path.join(TMP, '.env');

const PORT = 11999;
let mode = 'ok';
let calls = 0;
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ models: [{ name: 'fake-model' }] }));
    }
    if (req.url === '/v1/chat/completions') {
      calls++;
      if (mode === '429') {
        res.writeHead(429, { 'retry-after': '30' });
        return res.end('rate limited');
      }
      const content = mode === 'fenced'
        ? 'Tabii! İşte eylemim:\n```json\n{"thought":"dosya yazıyorum","action":"write_file","args":{"path":"x.md","content":"a\\nb"}}\n```'
        : '<think>hmm</think>{"thought":"bitti","action":"finish","args":{"summary":"tamam"}}';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 42 } }));
    }
    res.writeHead(404);
    res.end();
  });
});
await new Promise((r) => fake.listen(PORT, '127.0.0.1', r));

process.env.OLLAMA_URL = `http://127.0.0.1:${PORT}/v1`;
process.env.FORCE_DEMO = '0';
const { probeOllama, chat, isDemo, providerStatus } = await import('../server/providers/router.js');
const { parseAction } = await import('../server/agents/prompts.js');

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed++; };

const models = await probeOllama();
ok(models.includes('fake-model'), 'Ollama algılandı');
ok(!isDemo(), 'Anahtar/lokal motor varken demo kapalı');

let r = await chat({ messages: [{ role: 'user', content: 'x' }], chain: ['deepseek'] });
ok(r.provider === 'ollama' && r.model === 'fake-model', `Alias zinciri çözüldü → ${r.provider}/${r.model}`);
let a = parseAction(r.text);
ok(a?.action === 'finish' && a.args.summary === 'tamam', '<think> bloğu soyuldu, JSON ayrıştırıldı');

mode = 'fenced';
r = await chat({ messages: [{ role: 'user', content: 'x' }], chain: ['qwen'] });
a = parseAction(r.text);
ok(a?.action === 'write_file' && a.args.content === 'a\nb', 'Kod bloğu içindeki JSON ayrıştırıldı');
ok(parseAction('{"action":"note","args":{"text":"x",},}')?.action === 'note', 'Sondaki virgül toleransı');
ok(parseAction('selam') === null, 'JSON olmayan yanıt null');

mode = '429';
let err = null;
try { await chat({ messages: [{ role: 'user', content: 'x' }], chain: ['deepseek'] }); } catch (e) { err = e; }
ok(err?.code === 'ALL_COOLING', '429 → sağlayıcı soğumaya alındı, ALL_COOLING');
const st = providerStatus().find((p) => p.id === 'ollama');
ok(st.state === 'cool' && st.until > Date.now() + 20000, `Retry-After uygulandı (${Math.round((st.until - Date.now()) / 1000)} sn)`);
const before = calls;
try { await chat({ messages: [{ role: 'user', content: 'x' }], chain: ['deepseek'] }); } catch {}
ok(calls === before, 'Soğumadaki sağlayıcıya istek atılmadı');

fake.closeAllConnections();
fake.close();
// Node'un fetch bağlantı havuzunu kapat: Windows'ta açık soketle çıkış libuv assert'üne yol açıyor
await globalThis[Symbol.for('undici.globalDispatcher.1')]?.close?.().catch(() => {});
const { flush } = await import('../server/store.js');
flush();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `\n${failed} test başarısız` : '\nTüm testler geçti');
process.exitCode = failed ? 1 : 0;
