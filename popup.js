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
  console.log('[Popup] Config recuperada:', result);
  if (!result.githubToken || !result.gistId) {
    syncBtn.disabled = true;
    log('⚠️ Configure o Token e Gist ID!', 'error');
    return;
  }
  syncBtn.disabled = false;
  log('✅ Configuração OK', 'success');
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
    console.log('[Popup] Resposta:', response);
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
