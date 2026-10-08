// Sağlayıcı kataloğu. Hepsi OpenAI uyumlu /chat/completions konuşur.
// "alias" = mantıksal model adı. Ajanların motor zinciri alias'lardan oluşur ve router
// her alias'ı anahtarı olan sağlayıcılardaki somut modellere çözer.
// Model kimlikleri zamanla değişebilir: Yönetim > Motorlar'dan ya da data/engines.json'dan ezilebilir.

export const PROVIDERS = [
  {
    id: 'openrouter', name: 'OpenRouter', keyEnv: 'OPENROUTER_API_KEY', free: true,
    baseUrl: 'https://openrouter.ai/api/v1', signup: 'https://openrouter.ai/keys',
    headers: { 'HTTP-Referer': 'http://localhost', 'X-Title': 'Hustle HQ' },
    models: {
      deepseek: ['deepseek/deepseek-chat-v3-0324:free', 'deepseek/deepseek-chat-v3.1:free'],
      reasoner: ['deepseek/deepseek-r1-0528:free', 'deepseek/deepseek-r1:free'],
      kimi: ['moonshotai/kimi-k2:free'],
      qwen: ['qwen/qwen3-235b-a22b:free', 'qwen/qwen3-30b-a3b:free'],
      'qwen-coder': ['qwen/qwen3-coder:free'],
      llama: ['meta-llama/llama-3.3-70b-instruct:free'],
      gemini: ['google/gemini-2.0-flash-exp:free'],
      glm: ['z-ai/glm-4.5-air:free'],
    },
  },
  {
    id: 'gemini', name: 'Google Gemini', keyEnv: 'GEMINI_API_KEY', free: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', signup: 'https://aistudio.google.com/apikey',
    models: { gemini: ['gemini-2.5-flash', 'gemini-2.0-flash'], 'gemini-lite': ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'] },
  },
  {
    id: 'groq', name: 'Groq', keyEnv: 'GROQ_API_KEY', free: true,
    baseUrl: 'https://api.groq.com/openai/v1', signup: 'https://console.groq.com/keys',
    models: {
      llama: ['llama-3.3-70b-versatile'],
      kimi: ['moonshotai/kimi-k2-instruct'],
      qwen: ['qwen/qwen3-32b'],
      fast: ['llama-3.1-8b-instant'],
    },
  },
  {
    // Zhipu'nun uluslararası platformu: GLM Flash modelleri süresiz ücretsiz, kart yok, Çin telefonu gerekmez
    id: 'zai', name: 'Z.ai GLM (ücretsiz)', keyEnv: 'ZAI_API_KEY', free: true,
    baseUrl: 'https://api.z.ai/api/paas/v4', signup: 'https://z.ai/manage-apikey/apikey-list',
    models: { glm: ['glm-4.7-flash', 'glm-4.5-flash'], qwen: ['glm-4.7-flash'], deepseek: ['glm-4.7-flash'] },
  },
  {
    id: 'zhipu', name: 'Zhipu GLM', keyEnv: 'ZHIPU_API_KEY', free: true,
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', signup: 'https://open.bigmodel.cn',
    models: { glm: ['glm-4-flash', 'glm-4.5-flash'] },
  },
  {
    id: 'siliconflow', name: 'SiliconFlow', keyEnv: 'SILICONFLOW_API_KEY', free: true,
    baseUrl: 'https://api.siliconflow.cn/v1', signup: 'https://cloud.siliconflow.cn',
    models: {
      qwen: ['Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen3-8B'],
      'qwen-coder': ['Qwen/Qwen2.5-Coder-7B-Instruct'],
      glm: ['THUDM/glm-4-9b-chat'],
      deepseek: ['deepseek-ai/DeepSeek-R1-Distill-Qwen-7B'],
    },
  },
  {
    id: 'deepseek', name: 'DeepSeek', keyEnv: 'DEEPSEEK_API_KEY', free: false,
    baseUrl: 'https://api.deepseek.com/v1', signup: 'https://platform.deepseek.com',
    models: { deepseek: ['deepseek-chat'], reasoner: ['deepseek-reasoner'] },
  },
  {
    id: 'moonshot', name: 'Moonshot Kimi', keyEnv: 'MOONSHOT_API_KEY', free: false,
    baseUrl: 'https://api.moonshot.ai/v1', signup: 'https://platform.moonshot.ai',
    models: { kimi: ['kimi-k2-0711-preview', 'moonshot-v1-32k'] },
  },
  {
    id: 'dashscope', name: 'Qwen (DashScope)', keyEnv: 'DASHSCOPE_API_KEY', free: false,
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', signup: 'https://dashscope-intl.aliyuncs.com',
    models: { qwen: ['qwen-plus', 'qwen-turbo'], 'qwen-coder': ['qwen3-coder-plus', 'qwen-coder-plus'] },
  },
  {
    id: 'ollama', name: 'Ollama (lokal)', keyEnv: null, free: true, local: true,
    baseUrl: null, signup: 'https://ollama.com/download',
    models: {}, // çalışma anında doldurulur
  },
];

export const ALIASES = {
  deepseek: 'DeepSeek V3',
  reasoner: 'DeepSeek R1 (akıl yürütme)',
  kimi: 'Kimi K2',
  qwen: 'Qwen 3',
  'qwen-coder': 'Qwen Coder',
  llama: 'Llama 3.3 70B',
  gemini: 'Gemini Flash',
  'gemini-lite': 'Gemini Flash Lite',
  glm: 'GLM (Zhipu)',
  fast: 'Hızlı küçük model',
  local: 'Ollama lokal',
};
