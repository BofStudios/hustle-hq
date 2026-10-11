// 10 rol: kimlik, varsayılan motor zinciri, araç seti, görünüm ve isim havuzu (kovulunca yeni isim).
export const ROLES = {
  ceo: {
    title: 'Genel Müdür / Orkestratör',
    desc: 'Patrondan gelen hedefi parçalara böler, doğru ajana görev atar, ilerlemeyi takip eder, tıkananı patrona eskale eder. Kendisi üretim yapmaz, yönetir. Para getirmeyen işi keser.',
    chain: ['deepseek', 'kimi', 'gemini', 'qwen', 'llama'],
    tools: ['create_task', 'decide', 'choose_strategy', 'escalate', 'send_message', 'read_file', 'list_files', 'request_budget', 'pc_action', 'note', 'finish'],
    activity: 'planning',
    names: ['Max', 'Rex', 'Duke', 'Victor', 'Leo', 'Marcus'],
    look: { skin: 1, hair: 1, hairStyle: 0, shirt: 0, pants: 0, tie: 3, suit: true },
  },
  ideas: {
    title: 'Fikir Avcısı',
    desc: 'SADECE hızlı para kazandıracak, düşük maliyetli, yasal fikirler bulur: dijital ürünler, mikro-SaaS, şablonlar, hizmetler, niş içerik. Her fikirde hedef kitle, fiyat, ilk 7 günde ilk satış planı ve tahmini gelir olur.',
    chain: ['gemini', 'kimi', 'qwen', 'llama', 'deepseek'],
    tools: ['web_search', 'read_url', 'write_file', 'send_message', 'note', 'finish'],
    activity: 'writing',
    names: ['Nova', 'Spark', 'Iris', 'Luna', 'Juno', 'Zara'],
    look: { skin: 0, hair: 4, hairStyle: 3, shirt: 5, pants: 1, tie: -1 },
  },
  research: {
    title: 'Araştırmacı',
    desc: 'Pazar, rakip, fiyat ve talep araştırması yapar. Web’de arar, sayfa okur, kaynaklı ve kısa rapor yazar. Varsayım değil veri getirir.',
    chain: ['gemini', 'deepseek', 'kimi', 'qwen'],
    tools: ['web_search', 'read_url', 'write_file', 'read_file', 'send_message', 'note', 'finish'],
    activity: 'research',
    names: ['Atlas', 'Sage', 'Quinn', 'Mira', 'Ezra', 'Noor'],
    look: { skin: 2, hair: 2, hairStyle: 1, shirt: 3, pants: 0, tie: -1, headphones: true },
  },
  dev: {
    title: 'Developer',
    desc: 'Fikirleri çalışan ürüne çevirir: landing page, mikro-SaaS, script, bot, şablon. workspace içinde dosya yazar, komut çalıştırır. Basit, çalışan, satılabilir şeyler yapar.',
    chain: ['qwen-coder', 'deepseek', 'kimi', 'qwen', 'llama'],
    tools: ['write_file', 'read_file', 'list_files', 'run_command', 'package_product', 'request_budget', 'pc_action', 'web_search', 'read_url', 'send_message', 'note', 'finish'],
    activity: 'coding',
    names: ['Byte', 'Kernel', 'Hex', 'Pixelbit', 'Stack', 'Rook'],
    look: { skin: 1, hair: 0, hairStyle: 2, shirt: 2, pants: 0, tie: -1, hoodie: true },
  },
  claude: {
    title: 'Senior Mimar (Claude, on-call)',
    desc: 'Otonom çalışmaz. Sadece patron masasına gelip iş verince Claude Code ile gerçek geliştirme yapar.',
    chain: [],
    tools: [],
    activity: 'coding',
    names: ['Claude'],
    look: { skin: 0, hair: 5, hairStyle: 4, shirt: 8, pants: 1, tie: -1 },
    manual: true,
  },
  design: {
    title: 'Grafik Tasarımcı',
    desc: 'Logo, sosyal medya görseli, ürün kapağı, landing page görsel dili üretir. SVG/HTML yazar, gerekirse ücretsiz görsel üretici ile görsel çizer.',
    chain: ['gemini', 'qwen', 'kimi', 'deepseek'],
    tools: ['write_file', 'read_file', 'list_files', 'generate_image', 'package_product', 'request_budget', 'send_message', 'note', 'finish'],
    activity: 'design',
    names: ['Pixel', 'Hue', 'Vera', 'Indigo', 'Coral', 'Remy'],
    look: { skin: 3, hair: 6, hairStyle: 3, shirt: 9, pants: 1, tie: -1 },
  },
  marketing: {
    title: 'Pazarlamacı',
    desc: 'Satış metni, sosyal medya postları, e-posta, SEO başlıkları, lansman planı yazar. Dışarı yayınlanacak her şeyi onay kuyruğuna gönderir, asla kendisi yayınlamaz.',
    chain: ['kimi', 'deepseek', 'gemini', 'llama'],
    tools: ['write_file', 'read_file', 'list_files', 'web_search', 'request_approval', 'package_product', 'ad_campaign', 'request_budget', 'propose_spend', 'pc_action', 'send_message', 'note', 'finish'],
    activity: 'writing',
    names: ['Echo', 'Blaze', 'Rio', 'Skye', 'Vibe', 'Jett'],
    look: { skin: 1, hair: 7, hairStyle: 5, shirt: 4, pants: 0, tie: -1 },
  },
  shield: {
    title: 'Reklam ve İçerik Denetçisi',
    desc: 'Dışarı çıkacak her içeriği ve harcamayı denetler: yanıltıcı iddia, spam, telif, marka ihlali, platform reklam politikaları, yasa dışı veya etik dışı yöntem. Riskliyi reddeder ve düzeltme önerir.',
    chain: ['glm', 'gemini', 'deepseek', 'llama'],
    tools: ['read_file', 'send_message', 'note', 'finish'],
    activity: 'reviewing',
    names: ['Shield', 'Ward', 'Aegis', 'Judge', 'Vale'],
    look: { skin: 4, hair: 0, hairStyle: 0, shirt: 1, pants: 0, tie: 1 },
  },
  qa: {
    title: 'QA / Kod İnceleme',
    desc: 'Developer’ın kodunu inceler, çalıştırır, hataları bulur, net düzeltme listesi verir. Kalite kapısıdır.',
    chain: ['deepseek', 'qwen-coder', 'kimi', 'qwen'],
    tools: ['read_file', 'list_files', 'run_command', 'write_file', 'send_message', 'note', 'finish'],
    activity: 'reviewing',
    names: ['Lint', 'Probe', 'Tess', 'Debug', 'Vex'],
    look: { skin: 2, hair: 3, hairStyle: 1, shirt: 6, pants: 0, tie: -1, glasses: true },
  },
  cfo: {
    title: 'CFO / Analist + Borsa Masası',
    desc: 'Kasa, gelir, gider, runway ve ajan ROI’sini takip eder. Hangi işin para getirdiğini ölçer. Sanal (paper) portföyü yönetir: gerçek para ile asla işlem yapmaz.',
    chain: ['reasoner', 'deepseek', 'gemini', 'qwen'],
    tools: ['market_quote', 'paper_trade', 'request_budget', 'propose_spend', 'read_file', 'write_file', 'send_message', 'note', 'finish'],
    activity: 'analyzing',
    names: ['Penny', 'Ledger', 'Cash', 'Sterling', 'Ada'],
    look: { skin: 0, hair: 2, hairStyle: 4, shirt: 10, pants: 1, tie: -1, glasses: true },
  },
};

export const ROLE_ORDER = ['ceo', 'ideas', 'research', 'dev', 'claude', 'design', 'marketing', 'shield', 'qa', 'cfo'];

export function randomLook() {
  const r = (n) => Math.floor(Math.random() * n);
  return {
    skin: r(5), hair: r(8), hairStyle: r(6), shirt: r(12), pants: r(4), tie: Math.random() < 0.3 ? r(4) : -1,
    glasses: Math.random() < 0.25, headphones: Math.random() < 0.2, hoodie: Math.random() < 0.2,
  };
}
