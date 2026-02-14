// ============================================
// GitHub Gist Bookmark Sync - Background Service Worker
// Sincronização Bidirecional com Merge (Manifest V3)
// ============================================

let isSyncing = false;
const FILE_NAME = 'bookmarks.json';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Mensagem recebida:', message);
  if (message.action === 'sync') {
    handleSync(false)
      .then(result => {
        console.log('[Background] Sync OK');
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error('[Background] Sync ERRO:', err.message);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    console.log('[Extensão] Instalada/atualizada, verificando sincronização inicial...');
    const config = await chrome.storage.local.get(['autoSync', 'syncOnStartup']);
    if (config.autoSync !== false && config.syncOnStartup !== false) {
      setTimeout(() => handleSync(true), 3000);
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Browser] Navegador iniciou...');
  chrome.storage.local.get(['autoSync', 'syncOnStartup']).then(config => {
    if (config.autoSync !== false && config.syncOnStartup !== false) {
      console.log('[Browser] Sync automático ativado, esperando 5s...');
      setTimeout(() => handleSync(true), 5000);
    } else {
      console.log('[Browser] Sync automático desativado');
    }
  });
});

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  const config = await chrome.storage.local.get('autoSync');
  if (config.autoSync !== false) {
    debouncedSync();
  }
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  const config = await chrome.storage.local.get('autoSync');
  if (config.autoSync !== false) {
    trackDeletedBookmark(removeInfo.node);
    debouncedSync();
  }
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  const config = await chrome.storage.local.get('autoSync');
  if (config.autoSync !== false) {
    debouncedSync();
  }
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  const config = await chrome.storage.local.get('autoSync');
  if (config.autoSync !== false) {
    debouncedSync();
  }
});

async function trackDeletedBookmark(node) {
  const key = generateBookmarkId(node.url, node.title);
  const result = await chrome.storage.local.get('deletedBookmarks');
  const deleted = result.deletedBookmarks || {};
  
  deleted[key] = {
    title: node.title,
    url: node.url,
    deletedAt: Date.now()
  };
  
  // Limpar registros antigos (mais de 24 horas)
  const now = Date.now();
  for (const k in deleted) {
    if (now - deleted[k].deletedAt > 24 * 60 * 60 * 1000) {
      delete deleted[k];
    }
  }
  
  await chrome.storage.local.set({ deletedBookmarks: deleted });
  console.log('[Sync] Favorito deletado rastreado:', key);
}

async function getDeletedBookmarks() {
  const result = await chrome.storage.local.get('deletedBookmarks');
  return result.deletedBookmarks || {};
}

async function clearDeletedBookmark(key) {
  const result = await chrome.storage.local.get('deletedBookmarks');
  const deleted = result.deletedBookmarks || {};
  delete deleted[key];
  await chrome.storage.local.set({ deletedBookmarks: deleted });
}

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  debouncedSync();
});

chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  debouncedSync();
});

let syncTimeout = null;
function debouncedSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => handleSync(false), 2000);
}

// ============================================
// Funções de Identificação do Dispositivo
// ============================================

async function getDeviceId() {
  const result = await chrome.storage.local.get('deviceId');
  if (result.deviceId) {
    return result.deviceId;
  }
  const newId = 'device_' + Math.random().toString(36).substr(2, 9);
  await chrome.storage.local.set({ deviceId: newId });
  return newId;
}

async function getDeviceName() {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';

  if (ua.includes('Brave')) browser = 'Brave';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';

  if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';

  return `${browser} (${os})`;
}

// ============================================
// Funções de Timestamp Real
// ============================================

async function getLocalTimestamp() {
  const tree = await chrome.bookmarks.getTree();
  let maxModified = 0;
  
  function findMaxModified(nodes) {
    for (const node of nodes) {
      if (node.dateGroupModified && node.dateGroupModified > maxModified) {
        maxModified = node.dateGroupModified;
      }
      if (node.children) {
        findMaxModified(node.children);
      }
    }
  }
  
  findMaxModified(tree);
  return maxModified || Date.now();
}

// ============================================
// Funções de Notificação
// ============================================

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/48x48.png',
    title: title,
    message: message
  }, (notificationId) => {
    console.log('[Notification] Criada:', notificationId);
  });
}

// ============================================
// Funções de Manipulação de Favoritos
// ============================================

function generateBookmarkId(url, title) {
  const str = `${url || ''}|${title || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'bm_' + Math.abs(hash).toString(36);
}

function buildLocalBookmarkMap(tree, map = new Map(), parentTitle = null) {
  for (const node of tree) {
    // Pular raízes
    if (node.id === '0' || node.id === '1') {
      if (node.children) {
        const rootTitle = node.title === 'Bookmarks Bar' ? 'Barra de favoritos' : 
                         node.title === 'Other Bookmarks' ? 'Outros favoritos' : node.title;
        buildLocalBookmarkMap(node.children, map, rootTitle);
      }
      continue;
    }
    
    const key = generateBookmarkId(node.url, node.title);
    // Se parentTitle é "Barra de favoritos" ou "Outros favoritos", não incluir
    // (o destino padrão já é a raiz dessas pastas)
    const finalParentTitle = (parentTitle === 'Barra de favoritos' || parentTitle === 'Outros favoritos') 
      ? null 
      : parentTitle;
    
    map.set(key, {
      key,
      title: node.title,
      url: node.url,
      dateAdded: node.dateAdded,
      dateModified: node.dateGroupModified || node.dateAdded,
      parentTitle: finalParentTitle,
      localId: node.id,
      deleted: false
    });
    
    if (node.children) {
      buildLocalBookmarkMap(node.children, map, node.title);
    }
  }
  return map;
}

function buildGistBookmarkMap(bookmarks, map = new Map()) {
  if (!bookmarks || !Array.isArray(bookmarks)) return map;
  
  for (const bm of bookmarks) {
    const key = generateBookmarkId(bm.url, bm.title);
    map.set(key, {
      key,
      title: bm.title,
      url: bm.url,
      dateAdded: bm.dateAdded,
      dateModified: bm.dateModified || bm.dateAdded,
      parentTitle: bm.parentTitle || 'Barra de favoritos',
      deleted: bm.deleted || false
    });
  }
  return map;
}

function getParentIdFromTitle(title, folderMap) {
  if (!title || title === 'Barra de favoritos' || title === 'Bookmarks Bar') {
    return '1'; // Barra de favoritos
  }
  if (title === 'Outros favoritos' || title === 'Other Bookmarks') {
    return '2'; // Outros favoritos
  }
  return folderMap.get(title) || '1';
}

async function buildFolderMap() {
  const tree = await chrome.bookmarks.getTree();
  const map = new Map();
  
  function processNode(nodes) {
    for (const node of nodes) {
      if (node.id !== '0' && node.id !== '1' && !node.url) {
        map.set(node.title, node.id);
      }
      if (node.children) {
        processNode(node.children);
      }
    }
  }
  
  processNode(tree);
  return map;
}

async function getOrCreateFolder(title, folderMap) {
  let parentId = getParentIdFromTitle(title, folderMap);
  
  if (folderMap.has(title)) {
    return folderMap.get(title);
  }
  
  try {
    const folder = await chrome.bookmarks.create({
      parentId: parentId,
      title: title
    });
    folderMap.set(title, folder.id);
    return folder.id;
  } catch (e) {
    console.error('[Sync] Erro ao criar pasta:', e);
    return parentId;
  }
}

// ============================================
// Funções de Merge
// ============================================

function mergeBookmarks(localMap, gistMap, deletedBookmarks) {
  const merged = new Map();
  const now = Date.now();
  
  // Processar todos os favoritos do Gist
  for (const [key, gistBm] of gistMap) {
    const localBm = localMap.get(key);
    const wasDeletedLocally = !!deletedBookmarks[key];
    
    if (!localBm && !wasDeletedLocally) {
      // Existe no Gist, não existe local E não foi deletado localmente → criar no local
      merged.set(key, { ...gistBm, action: 'create' });
    } else if (!localBm && wasDeletedLocally) {
      // Existe no Gist mas foi deletado localmente → marcar como delete no Gist
      merged.set(key, { 
        ...gistBm, 
        action: 'delete',
        title: deletedBookmarks[key].title,
        url: deletedBookmarks[key].url
      });
    } else if (localBm) {
      // Existe em ambos - verificar deleted e dateModified
      if (gistBm.deleted && !localBm.deleted) {
        // Deletado no Gist → deletar local
        merged.set(key, { ...localBm, action: 'delete' });
      } else if (localBm.deleted && !gistBm.deleted) {
        // Deletado local → deletar Gist
        merged.set(key, { ...gistBm, action: 'delete' });
      } else if (!gistBm.deleted && !localBm.deleted) {
        // Ambos existem e não deletados - usar o mais recente
        const winner = gistBm.dateModified > localBm.dateModified ? gistBm : localBm;
        merged.set(key, { ...winner, action: 'keep' });
      }
    }
  }
  
  // Processar favoritos locais que não estão no Gist
  for (const [key, localBm] of localMap) {
    if (!gistMap.has(key) && !localBm.deleted) {
      // Existe local, não existe no Gist → enviar para Gist
      merged.set(key, { ...localBm, action: 'upload' });
    }
  }
  
  return merged;
}

// ============================================
// Funções de Execução do Merge
// ============================================

async function executeLocalMerge(merged, folderMap) {
  let created = 0, deleted = 0;
  
  for (const [key, bm] of merged) {
    if (bm.action === 'create') {
      const parentId = await getOrCreateFolder(bm.parentTitle, folderMap);
      try {
        await chrome.bookmarks.create({
          parentId: parentId,
          title: bm.title,
          url: bm.url
        });
        // Limpar registro de deletado se foi criado novamente
        await clearDeletedBookmark(key);
        created++;
      } catch (e) {
        console.error('[Sync] Erro ao criar favorito:', e);
      }
    } else if (bm.action === 'delete') {
      try {
        // Primeiro tentar encontrar por URL (favorito)
        const result = await chrome.bookmarks.search({ title: bm.title, url: bm.url });
        for (const node of result) {
          if (node.id && node.id !== '0' && node.id !== '1') {
            if (node.url) {
              // É um favorito comum
              await chrome.bookmarks.remove(node.id);
            } else {
              // É uma pasta - verificar se tem filhos
              const children = await chrome.bookmarks.getChildren(node.id);
              if (children.length > 0) {
                await chrome.bookmarks.removeTree(node.id);
              } else {
                await chrome.bookmarks.remove(node.id);
              }
            }
            deleted++;
            break;
          }
        }
        // Se não encontrou por URL, tentar apenas por título (pasta)
        if (deleted === 0 && !bm.url) {
          const folders = await chrome.bookmarks.search({ title: bm.title });
          for (const node of folders) {
            if (node.id && node.id !== '0' && node.id !== '1' && !node.url) {
              const children = await chrome.bookmarks.getChildren(node.id);
              if (children.length > 0) {
                await chrome.bookmarks.removeTree(node.id);
              } else {
                await chrome.bookmarks.remove(node.id);
              }
              deleted++;
              break;
            }
          }
        }
      } catch (e) {
        console.error('[Sync] Erro ao deletar favorito:', e);
      }
    }
  }
  
  return { created, deleted };
}

function prepareGistBookmarks(merged) {
  const bookmarks = [];
  
  for (const [key, bm] of merged) {
    if (bm.action === 'upload' || bm.action === 'keep') {
      bookmarks.push({
        id: key,
        title: bm.title,
        url: bm.url,
        dateAdded: bm.dateAdded,
        dateModified: bm.dateModified,
        parentTitle: bm.parentTitle,
        deleted: false
      });
    } else if (bm.action === 'delete') {
      bookmarks.push({
        id: key,
        title: bm.title,
        url: bm.url,
        dateAdded: bm.dateAdded,
        dateModified: Date.now(),
        parentTitle: bm.parentTitle,
        deleted: true
      });
    }
  }
  
  return bookmarks;
}

// ============================================
// Funções da API GitHub
// ============================================

async function fetchGist(token, gistId) {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (response.status === 404) {
    // Gist não existe, marcar para criar
    await chrome.storage.local.set({ gistExists: false });
    return { version: 3, lastSync: 0, lastSyncBy: null, devices: {}, bookmarks: [] };
  }

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message);
  }

  // Gist existe, marcar para atualizar
  await chrome.storage.local.set({ gistExists: true });

  const gist = await response.json();
  const file = gist.files[FILE_NAME];
  
  if (!file || !file.content || file.content.trim() === '') {
    return { version: 3, lastSync: 0, lastSyncBy: null, devices: {}, bookmarks: [] };
  }

  try {
    return JSON.parse(file.content);
  } catch (e) {
    return { version: 3, lastSync: 0, lastSyncBy: null, devices: {}, bookmarks: [] };
  }
}

async function updateGist(token, gistId, data) {
  const config = await chrome.storage.local.get('gistExists');
  const gistExists = config.gistExists !== false;
  
  const method = gistExists ? 'PATCH' : 'POST';
  const url = gistExists 
    ? `https://api.github.com/gists/${gistId}`
    : 'https://api.github.com/gists';
  
  const body = JSON.stringify({
    description: 'Bookmark Sync - GitHub Gist Bookmark Sync Extension',
    public: false,
    files: {
      [FILE_NAME]: {
        content: JSON.stringify(data, null, 2)
      }
    }
  });

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message);
  }
  
  // Marcar que o Gist existe após atualização bem-sucedida
  await chrome.storage.local.set({ gistExists: true });
  return response.json();
}

// ============================================
// Função Principal de Sincronização
// ============================================

async function handleSync(isAutoSync = false) {
  if (isSyncing) {
    console.log('[Sync] Já está sincronizando, ignorando...');
    return;
  }

  const config = await chrome.storage.local.get(['githubToken', 'gistId', 'autoSync']);
  console.log('[Sync] Config:', config);
  
  if (!config.githubToken || !config.gistId) {
    console.log('[Sync] Configuração incompleta');
    if (!isAutoSync) throw new Error('Configure o Token e Gist ID nas opções.');
    return;
  }

  isSyncing = true;
  console.log('[Sync] Iniciando sincronização bidirecional...');

  try {
    const deviceId = await getDeviceId();
    const deviceName = await getDeviceName();
    
    // 1. Carregar favoritos locais
    const localTree = await chrome.bookmarks.getTree();
    const localMap = buildLocalBookmarkMap(localTree);
    const localTimestamp = await getLocalTimestamp();
    
    console.log(`[Sync] Locais: ${localMap.size} favoritos`);
    
    // 2. Carregar favoritos do Gist
    const gistData = await fetchGist(config.githubToken, config.gistId);
    const gistMap = buildGistBookmarkMap(gistData.bookmarks);
    const gistTimestamp = gistData.lastSync || 0;
    
    console.log(`[Sync] Gist: ${gistMap.size} favoritos, lastSync: ${gistTimestamp}, lastSyncBy: ${gistData.lastSyncBy}`);
    
    // 3. Verificar se este dispositivo já syncou
    const myLastSync = gistData.devices?.[deviceId]?.lastSync || 0;
    console.log(`[Sync] Meu último sync: ${myLastSync}`);
    
    // 4. Obter favoritos deletados localmente
    const deletedBookmarks = await getDeletedBookmarks();
    console.log(`[Sync] Favoritos deletados:`, Object.keys(deletedBookmarks));
    
    // 5. Fazer merge
    const merged = mergeBookmarks(localMap, gistMap, deletedBookmarks);
    
    // Separar ações
    const toCreate = [...merged.values()].filter(b => b.action === 'create');
    const toDelete = [...merged.values()].filter(b => b.action === 'delete');
    const toUpload = [...merged.values()].filter(b => b.action === 'upload');
    const toKeep = [...merged.values()].filter(b => b.action === 'keep');
    
    console.log(`[Sync] Merge: ${toCreate.length} criar, ${toDelete.length} deletar, ${toUpload.length} enviar, ${toKeep.length} manter`);
    
    // 5. Executar mudanças no local
    const folderMap = await buildFolderMap();
    const localResult = await executeLocalMerge(merged, folderMap);
    
    // 6. Atualizar Gist
    const bookmarksToSave = prepareGistBookmarks(merged);
    const now = Date.now();
    
    // Atualizar devices
    const devices = gistData.devices || {};
    devices[deviceId] = {
      name: deviceName,
      lastSync: now
    };
    
    await updateGist(config.githubToken, config.gistId, {
      version: 3,
      lastSync: now,
      lastSyncBy: deviceId,
      devices: devices,
      bookmarks: bookmarksToSave
    });
    
    // 7. Salvar lastSync local
    await chrome.storage.local.set({ lastSync: now });
    
    console.log('[Sync] Concluído!', localResult);
    
    // 8. Notificação se sync automático e houve mudanças
    if (isAutoSync && (localResult.created || localResult.deleted || toUpload.length > 0)) {
      let msg = '';
      if (localResult.created > 0) msg += `${localResult.created} criados, `;
      if (localResult.deleted > 0) msg += `${localResult.deleted} deletados, `;
      if (toUpload.length > 0) msg += `${toUpload.length} exportados`;
      msg = msg.replace(/, $/, '');
      
      if (msg) {
        showNotification('Favoritos Sincronizados', msg);
      }
    }

  } catch (error) {
    console.error('[Sync] Erro:', error.message);
    if (!isAutoSync) throw error;
  } finally {
    isSyncing = false;
  }
}

console.log('[Background] Service Worker iniciado!');
