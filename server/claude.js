// Claude masası: otonom DEĞİL. Sadece patron tetikleyince yerel Claude Code CLI (`claude -p`) çalışır.
// Prompt stdin'den verilir (kabuk kaçış riski yok); çıktı stream-json olarak canlı aktarılır.
import { spawn } from 'node:child_process';
import { killTree } from './platform.js';
import fs from 'node:fs';
import { agents, updateAgent, agentLog, addDeliverable, createTask, updateTask } from './state.js';
import { load, save } from './store.js';
import { num } from './config.js';
import { safePath, listFiles } from './agents/sandbox.js';
import { emit, toast } from './bus.js';

const usage = load('claude-usage', { day: '', count: 0 });
let running = null;

export function claudeStatus() {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) Object.assign(usage, { day: today, count: 0 });
  return { running: !!running, usedToday: usage.count, limit: num('CLAUDE_DAILY_LIMIT', 10) };
}

export async function runClaude({ prompt, project = 'claude' }) {
  const a = agents.find((x) => x.role === 'claude');
  if (!a) throw new Error('Claude masası yok');
  if (running) throw new Error('Claude zaten çalışıyor');
  const st = claudeStatus();
  if (st.usedToday >= st.limit) throw new Error(`Günlük Claude sınırı doldu (${st.limit}). .env içinde CLAUDE_DAILY_LIMIT ile değiştirilebilir.`);
  const text = String(prompt || '').trim();
  if (!text) throw new Error('görev metni gerekli');

  const cwd = safePath(String(project).replace(/[^a-zA-Z0-9_\-/]/g, '-') || 'claude');
  fs.mkdirSync(cwd, { recursive: true });
  usage.count++;
  save('claude-usage', usage);

  const task = createTask({ title: text.slice(0, 120), detail: text, assignee: a.id, createdBy: 'Boss', priority: 3 });
  updateTask(task, { status: 'doing' });
  updateAgent(a, { status: 'working', activity: 'coding', bubble: '⚡', currentTaskId: task.id, monitor: 'claude -p' });
  agentLog(a, 'task', `▶ Claude Code başlatıldı (workspace/${project})`);

  const args = [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', '"Read,Write,Edit,Glob,Grep,Bash(node:*),Bash(npm run:*),Bash(npm test:*),Bash(python:*)"',
  ];
  const full = `Çalışma klasörün: ${cwd}. Sadece bu klasör içinde çalış. Hustle HQ şirketinin Senior Mimarısın; görev patrondan:\n\n${text}\n\nBitince ne yaptığını 3-5 maddede özetle.`;
  const child = spawn('claude', args, { cwd, shell: true, windowsHide: true });
  running = child;
  child.stdin.write(full);
  child.stdin.end();

  let buf = '';
  let finalText = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { agentLog(a, 'raw', line.slice(0, 300)); continue; }
      if (ev.type === 'assistant') {
        for (const c of ev.message?.content || []) {
          if (c.type === 'text' && c.text.trim()) agentLog(a, 'thought', c.text.slice(0, 1500));
          if (c.type === 'tool_use') {
            const desc = `${c.name} ${JSON.stringify(c.input).slice(0, 200)}`;
            agentLog(a, 'tool', desc);
            updateAgent(a, { monitor: desc.slice(0, 120), bubble: c.name === 'Write' || c.name === 'Edit' ? '📝' : '⚙️' });
          }
        }
      } else if (ev.type === 'result') {
        finalText = ev.result || '';
      }
    }
  });
  child.stderr.on('data', (d) => agentLog(a, 'warn', d.toString().slice(0, 500)));

  return new Promise((resolve) => {
    child.on('close', (code) => {
      running = null;
      const files = listFiles(project, 3).filter((f) => !f.endsWith('/'));
      const d = addDeliverable({
        taskId: task.id, agentId: a.id, agentName: a.name, title: `Claude: ${text.slice(0, 80)}`,
        kind: 'code', path: files[0] || null, files: files.slice(0, 40), summary: (finalText || `Çıkış kodu ${code}`).slice(0, 2000),
      });
      updateTask(task, { status: code === 0 ? 'done' : 'failed', result: finalText.slice(0, 2000), deliverableIds: [d.id] });
      a.stats.done += code === 0 ? 1 : 0;
      updateAgent(a, { status: 'oncall', bubble: code === 0 ? '✅' : '❌', currentTaskId: null, monitor: '' });
      agentLog(a, 'done', code === 0 ? `✅ Bitti: ${finalText.slice(0, 300)}` : `❌ Çıkış kodu ${code}`);
      toast(code === 0 ? '⚡ Claude işi bitirdi' : '❌ Claude hata ile bitti (Claude Code kurulu ve giriş yapılmış mı?)', code === 0 ? 'done' : 'error');
      emit('walk', { agentId: a.id, to: 'boss', reason: 'teslim' });
      resolve({ code, deliverable: d });
    });
    child.on('error', (e) => {
      running = null;
      updateAgent(a, { status: 'oncall', bubble: '❌' });
      agentLog(a, 'error', `Claude CLI başlatılamadı: ${e.message}`);
      resolve({ code: -1 });
    });
  });
}

export function stopClaude() {
  if (running) {
    killTree(running);
  }
}
