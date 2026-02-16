const syncBtn = document.getElementById('syncBtn');
const optionsBtn = document.getElementById('optionsBtn');
const lastSyncEl = document.getElementById('lastSync');
const logEl = document.getElementById('log');

const Logger = {
  formatMessage(...args) {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  },

  async log(level, message) {
    const config = await chrome.storage.local.get(['mockServerUrl', 'useMockServer']);
    if (config.useMockServer && config.mockServerUrl) {
      try {
        await fetch(`${config.mockServerUrl}/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level, message })
        });
      } catch (e) {}
    }
  },

  info(...args) {
    this.log('INFO', this.formatMessage(...args));
  },
  
  error(...args) {
    this.log('ERROR', this.formatMessage(...args));
  }
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await updateLastSync();
  checkConfig();
}

async function updateLastSync() {
  const result = await chrome.storage.local.get('lastSync');
  if (result.lastSync) {
    const date = new Date(result.lastSync);
    lastSyncEl.textContent = date.toLocaleString('pt-BR');
  }
}

async function checkConfig() {
  const result = await chrome.storage.local.get(['githubToken', 'gistId', 'useMockServer', 'mockServerUrl']);
  Logger.info('[Popup] Config recuperada:', result);
  
  const isMockMode = result.useMockServer && result.mockServerUrl;
  const hasGitHubConfig = result.githubToken && result.gistId;
  
  if (!isMockMode && !hasGitHubConfig) {
    syncBtn.disabled = true;
    log('⚠️ Configure o Token e Gist ID!', 'error');
    return;
  }
  
  if (isMockMode && !result.mockServerUrl) {
    syncBtn.disabled = true;
    log('⚠️ Configure a URL do Servidor Mock!', 'error');
    return;
  }
  
  syncBtn.disabled = false;
  log(isMockMode ? '✅ Modo Mock configurado' : '✅ Configuração OK', 'success');
}

function log(message, type = '') {
  logEl.className = 'log visible';
  if (type) {
    logEl.classList.add(type);
  }
  logEl.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
}

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Sincronizando...';
  syncBtn.classList.add('syncing');
  log('Enviando comando de sync...', '');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'sync' });
    Logger.info('[Popup] Resposta:', response);
    if (response?.success) {
      log('✅ Sync concluído com sucesso!', 'success');
    } else {
      log(`❌ Erro: ${response?.error || 'Desconhecido'}`, 'error');
    }
    await updateLastSync();
  } catch (error) {
    log(`❌ Erro: ${error.message}`, 'error');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sincronizar Agora';
    syncBtn.classList.remove('syncing');
  }
});

optionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
