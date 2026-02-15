const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');

document.addEventListener('DOMContentLoaded', loadSettings);

async function loadSettings() {
  const result = await chrome.storage.local.get(['githubToken', 'gistId', 'autoSync', 'syncOnStartup', 'useMockServer', 'mockServerUrl']);
  if (result.githubToken) {
    document.getElementById('githubToken').value = result.githubToken;
  }
  if (result.gistId) {
    document.getElementById('gistId').value = result.gistId;
  }
  if (result.autoSync !== false) {
    document.getElementById('autoSync').checked = result.autoSync !== false;
  }
  if (result.syncOnStartup !== false) {
    document.getElementById('syncOnStartup').checked = result.syncOnStartup !== false;
  }
  if (result.useMockServer) {
    document.getElementById('useMockServer').checked = result.useMockServer;
  }
  if (result.mockServerUrl) {
    document.getElementById('mockServerUrl').value = result.mockServerUrl;
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
  const syncOnStartup = document.getElementById('syncOnStartup').checked;
  const useMockServer = document.getElementById('useMockServer').checked;
  const mockServerUrl = document.getElementById('mockServerUrl').value.trim();
  
  if (!useMockServer && (!token || !gistId)) {
    showStatus('Preencha o Token e Gist ID!', 'error');
    return;
  }
  
  if (useMockServer && !mockServerUrl) {
    showStatus('Preencha a URL do Servidor Mock!', 'error');
    return;
  }
  
  await chrome.storage.local.set({ 
    githubToken: token, 
    gistId, 
    autoSync, 
    syncOnStartup,
    useMockServer,
    mockServerUrl
  });
  showStatus('Configurações salvas!', 'success');
});

testBtn.addEventListener('click', async () => {
  const useMockServer = document.getElementById('useMockServer').checked;
  const mockServerUrl = document.getElementById('mockServerUrl').value.trim();
  const token = document.getElementById('githubToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();
  const autoSync = document.getElementById('autoSync').checked;
  const syncOnStartup = document.getElementById('syncOnStartup').checked;
  
  if (useMockServer) {
    if (!mockServerUrl) {
      showStatus('Preencha a URL do Servidor Mock!', 'error');
      return;
    }
    
    showStatus('Testando conexão com servidor mock...', 'testing');
    
    try {
      const response = await fetch(`${mockServerUrl}/data`);
      
      if (response.ok) {
        const data = await response.json();
        showStatus(`✅ Conexão bem-sucedida! ${data.bookmarks.length} favoritos no servidor mock.`, 'success');
        await chrome.storage.local.set({ useMockServer, mockServerUrl, autoSync, syncOnStartup });
      } else {
        showStatus('❌ Servidor mock não respondeu corretamente.', 'error');
      }
    } catch (error) {
      showStatus(`❌ Erro de conexão: ${error.message}. Execute 'node mock-server.js'!`, 'error');
    }
    return;
  }
  
  if (!token || !gistId) {
    showStatus('Preencha o Token e Gist ID!', 'error');
    return;
  }
  
  showStatus('Testando conexão com GitHub...', 'testing');
  
  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.ok) {
      showStatus('✅ Conexão bem-sucedida! Gist encontrado.', 'success');
      await chrome.storage.local.set({ githubToken: token, gistId, autoSync, syncOnStartup });
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
