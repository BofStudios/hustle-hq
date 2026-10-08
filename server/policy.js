// Değişmez güvenlik kuralları: kodda sabit, ayarlardan kapatılamaz.
// Ajanlar bunları ne yapabilir ne de onaya sunabilir. Eşleşen öneri otomatik reddedilir.

const HARD_BLOCK = [
  [/\b(para\s*(transfer|gönder|yatır|çek)|havale|eft|swift|wire\s*transfer|send\s*money|withdraw)/i, 'Para transferi yasak'],
  [/\b(kredi\s*kart|card\s*number|cvv|iban|bank\s*account|banka\s*hesab)/i, 'Kart veya banka bilgisi işlemek yasak'],
  [/\b(şifre|parola|password|passwd|2fa\s*code|otp\s*kod)/i, 'Şifre veya kimlik bilgisi girmek yasak'],
  [/\b(hesap\s*aç|kayıt\s*ol|sign\s*up|create\s*(an\s*)?account|register\s*account)/i, 'Hesap açmak yasak (patron kendisi açar)'],
  [/\b(captcha)/i, 'CAPTCHA aşmak yasak'],
  [/\b(gerçek\s*(para|hesap)la\s*(al|sat)|real\s*(money\s*)?trade|place\s*(an?\s*)?order\s*on\s*(broker|exchange)|binance|coinbase\s*order|kaldıraç|leverage)/i, 'Gerçek alım satım yasak (sadece paper trading)'],
  [/\b(sahte\s*(yorum|takipçi|hesap|review)|fake\s*(review|follower|account)|bot\s*takipçi|spam)/i, 'Sahte etkileşim ve spam yasak'],
  [/\b(kimliğine\s*bürün|impersonat|phishing|oltalama)/i, 'Kimlik taklidi ve oltalama yasak'],
];

export function hardBlockReason(text) {
  const s = String(text || '');
  for (const [re, why] of HARD_BLOCK) if (re.test(s)) return why;
  return null;
}

// Onaysız çalışabilen komutlar (workspace içinde). Kabuk operatörü varsa daima onaya düşer.
const ALLOW = [
  /^node(\s|$)/i,
  /^npm\s+(init\s+-y|-v|--version)(\s|$)/i,
  /^git\s+(status|diff|log|init|add|commit|branch)(\s|$)/i,
  /^(dir|ls|type|cat|echo|where|pwd)(\s|$)/i,
];
const SHELL_META = /[|&;<>`$]|\b(rm|del|rmdir|rd|format|shutdown|reg|curl|wget|Invoke-WebRequest|powershell|cmd)\b/i;

// Node izin modeli (--permission) Node 24+ ile kararlı; eski sürümde node komutları otomatik çalışmaz, onaya düşer.
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
export const NODE_SANDBOX = NODE_MAJOR >= 24;

export function commandNeedsApproval(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return 'boş komut';
  if (/^node(\s|$)/i.test(c) && !NODE_SANDBOX) return `Node ${process.versions.node}: sandbox için Node 24+ gerekli`;
  if (SHELL_META.test(c)) return 'kabuk operatörü veya riskli komut';
  if (!ALLOW.some((re) => re.test(c))) return 'izin listesinde değil';
  if (/\.\.[\\/]|[a-z]:\\/i.test(c)) return 'workspace dışına erişim';
  return null;
}

/** Otomatik izinli `node` komutu, Node izin modeliyle workspace'e hapsedilir (alt süreç ve dış dosya yok).
 *  python / npm run keyfi kod çalıştırabildiği için izin listesinde değil, onaya düşer. */
export function sandboxCommand(cmd, workspaceAbs) {
  const c = String(cmd).trim();
  if (!/^node(\s|$)/i.test(c)) return c;
  if (/--allow|--permission|--experimental-permission/i.test(c)) throw new Error('izin bayrakları yasak');
  return `node --permission "--allow-fs-read=${workspaceAbs}" "--allow-fs-write=${workspaceAbs}"${c.slice(4)}`;
}

// PC kontrolü (onaylı) için bile yasak PowerShell kalıpları: yıkıcı, kalıcı sistem değişikliği, uzaktan kod.
const PC_DENY = /(Remove-Item[^\n]*-Recurse|\brm\s+-r|\bdel\s+\/s|format(-volume)?\b|diskpart|reg(\.exe)?\s+(delete|add)|Set-ExecutionPolicy|bcdedit|Stop-Computer|Restart-Computer|shutdown|Invoke-Expression|\biex\b|DownloadString|DownloadFile|Start-BitsTransfer|cipher\s+\/w|vssadmin|wevtutil\s+cl|net\s+user|Add-MpPreference|Set-MpPreference|schtasks|New-Service|sc(\.exe)?\s+(create|delete|config)|Get-Credential|ConvertFrom-SecureString|cmdkey)/i;

// macOS/Linux kabuğu için ek kalıcı yasaklar
const PC_DENY_UNIX = /(\brm\s+-[a-z]*[rf]|\bmkfs|\bdd\s+if=|:\(\)\s*\{|chmod\s+-R\s+777\s+\/|\bsudo\b|\bsu\s|(curl|wget)[^|]*\|\s*(ba|z)?sh|\breboot\b|\bhalt\b|\bpoweroff\b|launchctl|crontab|systemctl|\bkill\s+-9\s+1\b|security\s+find-generic-password|\/etc\/(passwd|shadow|sudoers))/i;

export function pcActionBlockReason(action, target) {
  const t = String(target || '');
  if (!['open_url', 'open_app', 'powershell', 'open_folder'].includes(action)) return 'bilinmeyen PC eylemi';
  if (action === 'open_url' && !urlAllowed(t)) return 'URL izinli değil';
  if (action === 'powershell' && (PC_DENY.test(t) || PC_DENY_UNIX.test(t))) return 'yıkıcı veya güvenliği düşüren komut (kalıcı yasak)';
  if (action === 'open_app' && /[;&|`$<>]/.test(t)) return 'uygulama adında kabuk karakteri';
  return hardBlockReason(t);
}

/** SSRF koruması: lokal ve özel ağ adreslerine okuma yok. */
export function urlAllowed(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (!/^https?:$/.test(url.protocol)) return false;
  const h = url.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1\]?$)/i.test(h)) return false;
  return true;
}
