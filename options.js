const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');

document.addEventListener('DOMContentLoaded', loadSettings);

async function loadSettings() {
  const result = await chrome.storage.local.get(['githubToken', 'gistId', 'autoSync']);
  if (result.githubToken) {
    document.getElementById('githubToken').value = result.githubToken;
  }
  if (result.gistId) {
    document.getElementById('gistId').value = result.gistId;
  }
  if (result.autoSync !== false) {
    document.getElementById('autoSync').checked = result.autoSync !== false;
  }
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type;
}

saveBtn.addEventListener('click', async () => {
  const token = document.getElementById('githubToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();
  const autoSync = document.getElementById('autoSync').checked;
  
  if (!token || !gistId) {
    showStatus('Preencha todos os campos!', 'error');
    return;
  }
  
  await chrome.storage.local.set({ githubToken: token, gistId, autoSync });
  showStatus('Configurações salvas!', 'success');
});

testBtn.addEventListener('click', async () => {
  const token = document.getElementById('githubToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();
  const autoSync = document.getElementById('autoSync').checked;
  
  if (!token || !gistId) {
    showStatus('Preencha todos os campos!', 'error');
    return;
  }
  
  showStatus('Testando conexão...', 'testing');
  
  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.ok) {
      showStatus('✅ Conexão bem-sucedida! Gist encontrado.', 'success');
      await chrome.storage.local.set({ githubToken: token, gistId, autoSync });
    } else if (response.status === 404) {
      showStatus('❌ Gist não encontrado. Verifique o ID.', 'error');
    } else if (response.status === 401) {
      showStatus('❌ Token inválido. Verifique seu PAT.', 'error');
    } else {
      const err = await response.json();
      showStatus(`❌ Erro: ${err.message}`, 'error');
    }
  } catch (error) {
    showStatus(`❌ Erro de rede: ${error.message}`, 'error');
  }
});
