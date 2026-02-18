const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const resetStorageBtn = document.getElementById('resetStorageBtn');
const clearDeviceIdBtn = document.getElementById('clearDeviceIdBtn');

let mockCurrentData = null;

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initTabs();
  initMockHandlers();
});

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`tab-${tabName}`).classList.add('active');
      
      chrome.storage.local.set({ lastSelectedTab: tabName });
    });
  });
  
  chrome.storage.local.get('lastSelectedTab').then(result => {
    if (result.lastSelectedTab) {
      const btn = document.querySelector(`[data-tab="${result.lastSelectedTab}"]`);
      if (btn) btn.click();
    }
  });
}

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
    document.getElementById('mockServerUrlInput').value = result.mockServerUrl;
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
  const mockServerUrl = document.getElementById('mockServerUrlInput').value.trim();
  
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
  const mockServerUrl = document.getElementById('mockServerUrlInput').value.trim();
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
        showStatus(`✅ Conexão bem-sucedida! ${data.bookmarks?.length || 0} favoritos no servidor mock.`, 'success');
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

resetStorageBtn.addEventListener('click', async () => {
  if (!confirm('Tem certeza que deseja resetar o storage local? Isso vai limpar os favoritos deletados rastreados.')) {
    return;
  }
  
  try {
    await chrome.storage.local.set({
      deletedBookmarks: {},
      lastSync: 0,
      gistExists: true
    });
    showStatus('✅ Storage local resetado!', 'success');
  } catch (error) {
    showStatus(`❌ Erro: ${error.message}`, 'error');
  }
});

clearDeviceIdBtn.addEventListener('click', async () => {
  if (!confirm('Tem certeza que deseja gerar um novo ID de dispositivo? Isso pode causar conflitos de sincronização.')) {
    return;
  }
  
  try {
    const newId = 'device_' + Math.random().toString(36).substr(2, 9);
    await chrome.storage.local.set({ deviceId: newId });
    showStatus(`✅ Novo ID gerado: ${newId}`, 'success');
  } catch (error) {
    showStatus(`❌ Erro: ${error.message}`, 'error');
  }
});

function getMockUrl() {
  return (document.getElementById('mockServerUrlInput')?.value || 'http://localhost:3000').trim();
}

function initMockHandlers() {
  document.getElementById('mockServerUrlInput')?.addEventListener('change', () => {
    const urlEl = document.getElementById('mockServerUrl');
    if (urlEl) urlEl.textContent = getMockUrl();
  });
  
  document.getElementById('mockCheckConnectionBtn')?.addEventListener('click', mockCheckConnection);
  document.getElementById('mockFetchDataBtn')?.addEventListener('click', mockFetchData);
  document.getElementById('mockLoadTestDataBtn')?.addEventListener('click', mockLoadTestData);
  document.getElementById('mockResetDataBtn')?.addEventListener('click', mockResetData);
  document.getElementById('mockSaveDataBtn')?.addEventListener('click', mockSaveData);
  document.getElementById('mockFormatJsonBtn')?.addEventListener('click', mockFormatJson);
  document.getElementById('mockSimulateSyncEmptyBtn')?.addEventListener('click', mockSimulateSyncEmpty);
  document.getElementById('mockSimulateSyncAddBtn')?.addEventListener('click', mockSimulateSyncAdd);
  document.getElementById('mockSimulateSyncDeleteBtn')?.addEventListener('click', mockSimulateSyncDelete);
  document.getElementById('viewDebugLogsBtn2')?.addEventListener('click', viewDebugLogs);
  document.getElementById('clearDebugLogsBtn2')?.addEventListener('click', clearDebugLogs);
  document.getElementById('clearMockLogsBtn')?.addEventListener('click', clearMockLogs);
  
  setTimeout(mockCheckConnection, 500);
}

function addMockLog(method, url, status, statusText) {
  const logs = document.getElementById('mockLogs');
  if (!logs) return;
  
  const now = new Date().toLocaleTimeString('pt-BR');
  const statusClass = status >= 200 && status < 300 ? 'ok' : 'error';
  
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-time">${now}</span>
    <span class="log-method ${method.toLowerCase()}">${method}</span>
    <span class="log-url">${url}</span>
    <span class="log-status ${statusClass}">${status} ${statusText || ''}</span>
  `;
  
  logs.insertBefore(entry, logs.firstChild);
}

async function mockCheckConnection() {
  try {
    const url = getMockUrl();
    const response = await fetch(`${url}/data`);
    if (response.ok) {
      setMockConnected(true);
      addMockLog('GET', '/data', 200, 'OK');
      await mockFetchData();
    }
  } catch (e) {
    setMockConnected(false);
    addMockLog('GET', '/data', 0, 'Connection failed');
    showStatus('❌ Servidor mock desconectado', 'error');
  }
};

async function mockFetchData() {
  try {
    const url = getMockUrl();
    const response = await fetch(`${url}/data`);
    const data = await response.json();
    mockCurrentData = data;
    
    document.getElementById('jsonEditor').value = JSON.stringify(data, null, 2);
    document.getElementById('bookmarkCount').textContent = `${data.bookmarks?.length || 0} favoritos`;
    
    addMockLog('GET', '/data', 200, 'OK');
  } catch (e) {
    addMockLog('GET', '/data', 0, e.message);
  }
};

async function mockResetData() {
  if (!confirm('Tem certeza que deseja resetar todos os dados do mock?')) return;
  
  try {
    const url = getMockUrl();
    const response = await fetch(`${url}/reset`, { method: 'POST' });
    const result = await response.json();
    
    addMockLog('POST', '/reset', 200, result.message || 'OK');
    await mockFetchData();
    showStatus('✅ Dados do mock resetados', 'success');
  } catch (e) {
    addMockLog('POST', '/reset', 0, e.message);
  }
};

async function mockLoadTestData() {
  try {
    const url = getMockUrl();
    const response = await fetch(`${url}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    addMockLog('POST', '/load', response.ok ? 200 : 500, response.ok ? 'OK' : 'Error');
    await mockFetchData();
    showStatus('✅ Dados de teste carregados', 'success');
  } catch (e) {
    addMockLog('POST', '/load', 0, e.message);
  }
};

async function mockSaveData() {
  const json = document.getElementById('jsonEditor').value;
  
  try {
    const data = JSON.parse(json);
    const url = getMockUrl();
    const response = await fetch(`${url}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    addMockLog('POST', '/load (save)', response.ok ? 200 : 500, result.message || (response.ok ? 'OK' : 'Error'));
    
    if (response.ok) {
      mockCurrentData = data;
      document.getElementById('bookmarkCount').textContent = `${data.bookmarks?.length || 0} favoritos`;
      showStatus('✅ Dados salvos no mock', 'success');
    }
  } catch (e) {
    addMockLog('POST', '/load (save)', 0, 'Invalid JSON: ' + e.message);
    showStatus('❌ JSON inválido', 'error');
  }
};

function mockFormatJson() {
  try {
    const json = document.getElementById('jsonEditor').value;
    const data = JSON.parse(json);
    document.getElementById('jsonEditor').value = JSON.stringify(data, null, 2);
  } catch (e) {
    showStatus('❌ JSON inválido!', 'error');
  }
};

async function mockSimulateSyncEmpty() {
  await fetch(`${getMockUrl()}/reset`, { method: 'POST' });
  await mockFetchData();
  showStatus('✅ Simulação: dados vazios', 'success');
};

async function mockSimulateSyncAdd() {
  await mockFetchData();
  if (!mockCurrentData) return;
  
  const newBookmark = {
    id: 'bm_test_' + Date.now(),
    title: 'Novo Link de Teste',
    url: 'https://example.com/test',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    parentTitle: null,
    deleted: false
  };
  
  mockCurrentData.bookmarks = mockCurrentData.bookmarks || [];
  mockCurrentData.bookmarks.push(newBookmark);
  
  await fetch(`${getMockUrl()}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mockCurrentData)
  });
  
  await mockFetchData();
  showStatus('✅ Simulação: +1 favorito', 'success');
};

async function mockSimulateSyncDelete() {
  await mockFetchData();
  if (!mockCurrentData || !mockCurrentData.bookmarks || mockCurrentData.bookmarks.length === 0) return;
  
  mockCurrentData.bookmarks.pop();
  
  await fetch(`${getMockUrl()}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mockCurrentData)
  });
  
  await mockFetchData();
  showStatus('✅ Simulação: -1 favorito', 'success');
};

function clearMockLogs() {
  const logs = document.getElementById('mockLogs');
  if (logs) {
    logs.innerHTML = `
      <div class="log-entry">
        <span class="log-time">--:--:--</span>
        <span class="log-url">Logs limpos</span>
      </div>
    `;
  }
};

function setMockConnected(connected) {
  const dot = document.getElementById('mockStatusDot');
  const text = document.getElementById('mockStatusText');
  const url = document.getElementById('mockServerUrl');
  
  if (url) url.textContent = getMockUrl();
  if (dot && text) {
    if (connected) {
      dot.className = 'status-dot connected';
      text.textContent = 'Conectado';
    } else {
      dot.className = 'status-dot error';
      text.textContent = 'Desconectado';
    }
  }
}

async function viewDebugLogs() {
  const config = await chrome.storage.local.get(['githubToken', 'gistId', 'useMockServer', 'mockServerUrl']);
  
  if (!config.gistId) {
    showStatus('Configure o Gist ID primeiro!', 'error');
    return;
  }
  
  showStatus('Carregando logs...', 'testing');
  
  try {
    let debugData;
    
    if (config.useMockServer && config.mockServerUrl) {
      const response = await fetch(`${config.mockServerUrl}/gists/${config.gistId}`);
      if (response.status === 404) {
        debugData = { logs: [] };
      } else {
        const gist = await response.json();
        const file = gist.files['sync-debug.json'];
        debugData = file && file.content ? JSON.parse(file.content) : { logs: [] };
      }
    } else {
      const response = await fetch(`https://api.github.com/gists/${config.gistId}`, {
        headers: {
          'Authorization': `token ${config.githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      const gist = await response.json();
      const file = gist.files['sync-debug.json'];
      debugData = file && file.content ? JSON.parse(file.content) : { logs: [] };
    }
    
    const section = document.getElementById('debugLogsSection');
    const output = document.getElementById('debugLogsOutput');
    
    if (debugData.logs && debugData.logs.length > 0) {
      output.value = JSON.stringify(debugData, null, 2);
      section.style.display = 'block';
      showStatus(`✅ ${debugData.logs.length} logs carregados`, 'success');
    } else {
      output.value = 'Nenhum log encontrado.';
      section.style.display = 'block';
      showStatus('Nenhum log encontrado', 'success');
    }
  } catch (error) {
    showStatus(`❌ Erro: ${error.message}`, 'error');
  }
};

async function clearDebugLogs() {
  if (!confirm('Limpar todos os logs de debug?')) return;
  
  const config = await chrome.storage.local.get(['githubToken', 'gistId', 'useMockServer', 'mockServerUrl']);
  
  if (!config.gistId) {
    showStatus('Configure o Gist ID primeiro!', 'error');
    return;
  }
  
  const debugData = { logs: [] };
  
  try {
    if (config.useMockServer && config.mockServerUrl) {
      await fetch(`${config.mockServerUrl}/gists/${config.gistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: {
            'bookmarks.json': { content: '{}' },
            'sync-debug.json': { content: JSON.stringify(debugData, null, 2) }
          }
        })
      });
    } else {
      await fetch(`https://api.github.com/gists/${config.gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${config.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: {
            'bookmarks.json': { content: '{}' },
            'sync-debug.json': { content: JSON.stringify(debugData, null, 2) }
          }
        })
      });
    }
    
    document.getElementById('debugLogsSection').style.display = 'none';
    showStatus('✅ Logs limpos', 'success');
  } catch (error) {
    showStatus(`❌ Erro: ${error.message}`, 'error');
  }
};
