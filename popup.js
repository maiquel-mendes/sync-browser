const syncBtn = document.getElementById('syncBtn');
const optionsBtn = document.getElementById('optionsBtn');
const lastSyncEl = document.getElementById('lastSync');
const logEl = document.getElementById('log');

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
  const result = await chrome.storage.local.get(['githubToken', 'gistId']);
  if (!result.githubToken || !result.gistId) {
    syncBtn.disabled = true;
    log('Configure o Token e Gist ID primeiro!', 'error');
    return;
  }
  syncBtn.disabled = false;
}

function log(message, type = '') {
  logEl.classList.add('visible', type);
  logEl.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
}

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Sincronizando...';
  syncBtn.classList.add('syncing');
  
  try {
    await chrome.runtime.sendMessage({ action: 'sync' });
    log('Sync iniciado! Verifique o background para detalhes.', 'success');
    await updateLastSync();
  } catch (error) {
    log(`Erro: ${error.message}`, 'error');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sincronizar Agora';
    syncBtn.classList.remove('syncing');
  }
});

optionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
