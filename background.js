// ============================================
// GitHub Gist Bookmark Sync - Background Service Worker
// Sincronização Bidirecional com Merge (Manifest V3)
// ============================================

const Logger = {
  async log(level, message, context = null) {
    const config = await chrome.storage.local.get(['mockServerUrl', 'useMockServer']);
    const logEntry = { level, message, context };
    
    if (config.useMockServer && config.mockServerUrl) {
      try {
        await fetch(`${config.mockServerUrl}/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logEntry)
        });
      } catch (e) {
        // Silently fail if logging server is unavailable
      }
    }
  },
  
  debug(message, context = null) {
    this.log('DEBUG', message, context);
  },
  
  info(message, context = null) {
    this.log('INFO', message, context);
  },
  
  warn(message, context = null) {
    this.log('WARN', message, context);
  },
  
  error(message, context = null) {
    this.log('ERROR', message, context);
  }
};

let isSyncing = false;
const FILE_NAME = 'bookmarks.json';
const DEBUG_FILE_NAME = 'sync-debug.json';
const MAX_DEBUG_LOGS = 10;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  Logger.info('Mensagem recebida: ' + message.action, 'Background');
  if (message.action === 'sync') {
    handleSync(false)
      .then(result => {
        Logger.info('Sync OK', 'Background');
        sendResponse({ success: true });
      })
      .catch(err => {
        Logger.error('Sync ERRO: ' + err.message, 'Background');
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    Logger.info('[Extensão] Instalada/atualizada, verificando sincronização inicial...');
    const config = await chrome.storage.local.get(['autoSync', 'syncOnStartup']);
    if (config.autoSync !== false && config.syncOnStartup !== false) {
      setTimeout(() => handleSync(true), 3000);
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  Logger.info('[Browser] Navegador iniciou...');
  chrome.storage.local.get(['autoSync', 'syncOnStartup']).then(config => {
    if (config.autoSync !== false && config.syncOnStartup !== false) {
      Logger.info('[Browser] Sync automático ativado, esperando 5s...');
      setTimeout(() => handleSync(true), 5000);
    } else {
      Logger.info('[Browser] Sync automático desativado');
    }
  });
});

// ============================================
// Event Listeners (consolidado)
// ============================================

function shouldAutoSync() {
  // Helper para verificar se autoSync está ativado
  // Retorna promise para uso em listeners
  return chrome.storage.local.get('autoSync').then(config => config.autoSync !== false);
}

async function handleBookmarkChange(id, extra) {
  if (await shouldAutoSync()) {
    debouncedSync();
  }
}

async function handleBookmarkRemove(id, removeInfo) {
  if (await shouldAutoSync()) {
    trackDeletedBookmark(removeInfo.node);
    debouncedSync();
  }
}

chrome.bookmarks.onCreated.addListener(handleBookmarkChange);
chrome.bookmarks.onRemoved.addListener(handleBookmarkRemove);
chrome.bookmarks.onChanged.addListener(handleBookmarkChange);
chrome.bookmarks.onMoved.addListener(handleBookmarkChange);

async function trackDeletedBookmark(node) {
  try {
    // Obter o título do nó pai para gerar a chave correta
    let parentTitle = null;
    if (node.parentId) {
      const parentNode = await chrome.bookmarks.get(node.parentId);
      if (parentNode && parentNode[0]) {
        // Para pastas na raiz, parentTitle é null
        // Para pastas em subpastas, parentTitle é o título da pasta pai
        if (!ROOT_FOLDERS.includes(parentNode[0].title)) {
          parentTitle = parentNode[0].title;
        }
      }
    }
    
    // Normalizar parentTitle para consistente com buildLocalBookmarkMap
    const normalizedParentTitle = normalizeParentTitle(parentTitle);
    const key = generateBookmarkId(node.url, node.title, normalizedParentTitle);
    Logger.info('[TrackDelete] Key gerada:', key, 'title:', node.title, 'url:', node.url, 'parentTitle:', normalizedParentTitle);
    
    const result = await chrome.storage.local.get('deletedBookmarks');
    const deleted = result.deletedBookmarks || {};
    
    deleted[key] = {
      title: node.title,
      url: node.url,
      parentTitle: parentTitle,
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
    Logger.info('[Sync] Favorito deletado rastreado:', key, 'parentTitle:', parentTitle);
  } catch (e) {
    Logger.error('[Sync] Erro ao rastrear favorito deletado:', e);
  }
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

let syncTimeout = null;
function debouncedSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => handleSync(false), 2000);
}

// ============================================
// Funções de Identificação do Dispositivo
// ============================================

const ROOT_FOLDERS = ['Barra de favoritos', 'Outros favoritos', 'Bookmarks Bar', 'Other Bookmarks'];

function normalizeParentTitle(parentTitle) {
  if (!parentTitle || parentTitle === '' || ROOT_FOLDERS.includes(parentTitle)) {
    return null;
  }
  return parentTitle;
}

function getDefaultGistData() {
  return { version: 3, lastSync: 0, lastSyncBy: null, devices: {}, bookmarks: [], deletedBookmarks: {} };
}

async function getDeviceId() {
  const result = await chrome.storage.local.get('deviceId');
  if (result.deviceId) {
    return result.deviceId;
  }
  const newId = 'device_' + Math.random().toString(36).substr(2, 9);
  await chrome.storage.local.set({ deviceId: newId });
  return newId;
}

function detectOS(userAgent) {
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  return 'Unknown';
}

async function getDeviceName() {
  const ua = navigator.userAgent;
  let browser = 'Unknown';

  // Verificar Brave primeiro (navigator.brave é mais confiável)
  if (navigator.brave) {
    try {
      const isBrave = await navigator.brave.isBrave();
      if (isBrave) browser = 'Brave';
    } catch (e) {
      // Fallback para userAgent
      if (ua.includes('Brave')) browser = 'Brave';
    }
  } else if (ua.includes('Brave')) {
    browser = 'Brave';
  } else if (ua.includes('Chrome')) {
    browser = 'Chrome';
  } else if (ua.includes('Firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('Safari')) {
    browser = 'Safari';
  }

  return `${browser} (${detectOS(ua)})`;
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
    Logger.info('[Notification] Criada:', notificationId);
  });
}

// ============================================
// Funções de Manipulação de Favoritos
// ============================================

function generateBookmarkId(url, title, parentTitle = null) {
  // Se tem URL, usar URL como identificador único
  // Isso garante que renomear ou mover favoritos não cause duplicação
  if (url) {
    // Normalizar URL para evitar variações (remover trailing slash, etc)
    const normalizedUrl = url.replace(/\/$/, '').trim();
    // Usar hash simples para URL (btoa pode falhar com Unicode)
    return 'bm_url_' + simpleHash(normalizedUrl);
  }
  
  // Se não tem URL (é uma pasta), usar título + parentTitle
  const safeTitle = title || '';
  const safeParent = parentTitle || '';
  return 'bm_folder_' + simpleHash(safeParent + '|' + safeTitle);
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
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
    
    const normalizedParentTitle = normalizeParentTitle(parentTitle);
    const key = generateBookmarkId(node.url, node.title, normalizedParentTitle);
    
    map.set(key, {
      key,
      title: node.title,
      url: node.url,
      dateAdded: node.dateAdded,
      dateModified: node.dateGroupModified || node.dateAdded,
      parentTitle: normalizedParentTitle,
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
    const normalizedParentTitle = normalizeParentTitle(bm.parentTitle);
    const key = generateBookmarkId(bm.url, bm.title, normalizedParentTitle);
    map.set(key, {
      key,
      title: bm.title,
      url: bm.url,
      dateAdded: bm.dateAdded,
      dateModified: bm.dateModified || bm.dateAdded,
      parentTitle: normalizedParentTitle,
      deleted: bm.deleted || false
    });
  }
  return map;
}

function findFolderByTitle(tree, title) {
  function search(nodes) {
    for (const node of nodes) {
      if (!node.url && node.title === title && node.id !== '0' && node.id !== '1') {
        return node;
      }
      if (node.children) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return null;
  }
  return search(tree);
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
  if (!title || title === '') {
    return getParentIdFromTitle(title, folderMap);
  }
  
  let parentId = getParentIdFromTitle(title, folderMap);
  
  if (folderMap.has(title)) {
    return folderMap.get(title);
  }
  
  const tree = await chrome.bookmarks.getTree();
  const existingFolder = findFolderByTitle(tree, title);
  if (existingFolder) {
    folderMap.set(title, existingFolder.id);
    return existingFolder.id;
  }
  
  try {
    const folder = await chrome.bookmarks.create({
      parentId: parentId,
      title: title
    });
    folderMap.set(title, folder.id);
    return folder.id;
  } catch (e) {
    Logger.error('[Sync] Erro ao criar pasta:', e);
    return parentId;
  }
}

async function cleanDuplicateFolders() {
  const tree = await chrome.bookmarks.getTree();
  const folderMap = new Map();
  const duplicates = [];
  
  function processNode(nodes, parentPath = '') {
    for (const node of nodes) {
      if (node.id !== '0' && node.id !== '1' && !node.url) {
        const fullPath = parentPath ? `${parentPath}/${node.title}` : node.title;
        
        if (folderMap.has(node.title)) {
          duplicates.push({
            originalId: folderMap.get(node.title),
            duplicateId: node.id,
            title: node.title,
            path: fullPath
          });
        } else {
          folderMap.set(node.title, node.id);
        }
      }
      if (node.children) {
        const newPath = parentPath ? `${parentPath}/${node.title}` : node.title;
        processNode(node.children, newPath);
      }
    }
  }
  
  processNode(tree);
  
  if (duplicates.length > 0) {
    Logger.info(`[Clean] Found ${duplicates.length} duplicate folders:`, duplicates.map(d => d.title));
    
    for (const dup of duplicates) {
      try {
        const children = await chrome.bookmarks.getChildren(dup.duplicateId);
        
        for (const child of children) {
          await chrome.bookmarks.move(child.id, { parentId: dup.originalId });
          Logger.info(`[Clean] Moved "${child.title}" from duplicate to original folder`);
        }
        
        await chrome.bookmarks.removeTree(dup.duplicateId);
        Logger.info(`[Clean] Removed duplicate folder: ${dup.title}`);
      } catch (e) {
        Logger.error(`[Clean] Error cleaning folder ${dup.title}:`, e);
      }
    }
    
    return duplicates.length;
  }
  
  return 0;
}

// ============================================
// Funções de Merge (Baseado no Dogear Algorithm)
// ============================================

function mergeBookmarks(localMap, gistMap, deletedBookmarks, myLastSync = 0) {
  const merged = new Map();
  const now = Date.now();
  
  Logger.info('[Merge] deletedBookmarks keys:', Object.keys(deletedBookmarks));
  Logger.info('[Merge] myLastSync:', myLastSync);
  Logger.info('[Merge] gistMap keys (not deleted):', [...gistMap.keys()].filter(k => !gistMap.get(k).deleted));
  
  // Processar todos os favoritos do Gist
  for (const [key, gistBm] of gistMap) {
    const localBm = localMap.get(key);
    const wasDeletedLocally = !!deletedBookmarks[key];
    const deleteInfo = deletedBookmarks[key];
    
    // Se está deletado no Gist
    if (gistBm.deleted) {
      // Se existe localmente
      if (localBm) {
        // Dogear Rule: Se deletado remotamente mas modificado localmente depois do último sync → REVIVER
        // Se não foi modificado localmente depois do último sync → deletar localmente
        if (localBm.dateModified > myLastSync) {
          Logger.info('[Merge] Reviver (modificado local depois do sync):', key);
          merged.set(key, { ...localBm, action: 'keep' });
        } else {
          Logger.info('[Merge] Deletar local (gist tem deleted=true):', key);
          merged.set(key, { ...localBm, action: 'delete' });
        }
      }
      // Se não existe localmente, não fazer nada
      continue;
    }
    
    // Dogear Rule: Se deletado de um lado mas modificado do outro → IGNORAR DELEÇÃO, REVIVER
    if (!localBm && wasDeletedLocally) {
      Logger.info('[Merge] Encontrado deletado localmente:', key, 'gistBm.dateModified:', gistBm.dateModified, 'deleteInfo.deletedAt:', deleteInfo?.deletedAt);
      // Verificar se foi modificado no Gist depois da deleção local
      if (deleteInfo && gistBm.dateModified > deleteInfo.deletedAt) {
        // Modificado no Gist depois da deleção local → REVIVER (ignorar delete)
        merged.set(key, { ...gistBm, action: 'create' });
      } else {
        // Gist não foi modificado depois da deleção → marcar como deleted (soft delete)
        merged.set(key, { 
          ...gistBm, 
          action: 'delete',
          title: deleteInfo?.title || gistBm.title,
          url: deleteInfo?.url || gistBm.url
        });
      }
    } else if (!localBm && !wasDeletedLocally) {
      // Existe no Gist, não existe local E não foi deletado localmente
      // Sempre criar - é um favorito novo do Gist
      merged.set(key, { ...gistBm, action: 'create' });
    } else if (localBm) {
      // Existe em ambos - verificar deleted e dateModified
      
      // Dogear Rule: Se modificado de um lado e deletado do outro → IGNORAR DELEÇÃO, REVIVER
      if (localBm.deleted && !gistBm.deleted) {
        // Deletado local, existe no Gist → marcar como deleted no Gist (soft delete)
        merged.set(key, { ...gistBm, action: 'delete' });
      } else if (!gistBm.deleted && !localBm.deleted) {
        // Ambos existem e não deletados - usar o mais recente
        const winner = gistBm.dateModified > localBm.dateModified ? gistBm : localBm;
        merged.set(key, { ...winner, action: 'keep' });
      }
      // Se ambos deletados → não fazer nada (já está deletado no Gist)
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
      Logger.info('[Create] Trying to create:', bm.title, 'parentTitle:', bm.parentTitle);
      let parentId = await getOrCreateFolder(bm.parentTitle, folderMap);
      Logger.info('[Create] ParentId for', bm.parentTitle, ':', parentId);
      
      // Verificar se o parentId ainda é válido
      try {
        const parent = await chrome.bookmarks.get(parentId);
        if (!parent || parent.length === 0) {
          Logger.info('[Create] Parent não existe, tentando recriar:', bm.parentTitle);
          folderMap.delete(bm.parentTitle); // Remove do cache
          parentId = await getOrCreateFolder(bm.parentTitle, folderMap);
          Logger.info('[Create] Novo parentId:', parentId);
        }
      } catch (e) {
        Logger.info('[Create] Erro ao verificar parent, recriando:', bm.parentTitle);
        folderMap.delete(bm.parentTitle);
        parentId = await getOrCreateFolder(bm.parentTitle, folderMap);
      }
      
      try {
        await chrome.bookmarks.create({
          parentId: parentId,
          title: bm.title,
          url: bm.url
        });
        await clearDeletedBookmark(key);
        created++;
      } catch (e) {
        Logger.error('[Sync] Erro ao criar favorito:', bm.title, bm.url, 'parentId:', parentId, 'parentTitle:', bm.parentTitle, e);
      }
    } else if (bm.action === 'delete') {
      try {
        const result = await chrome.bookmarks.search({ title: bm.title, url: bm.url });
        for (const node of result) {
          if (node.id && node.id !== '0' && node.id !== '1') {
            if (node.url) {
              await chrome.bookmarks.remove(node.id);
            } else {
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
        Logger.error('[Sync] Erro ao deletar favorito:', e);
      }
    }
  }
  
  return { created, deleted };
}

function prepareGistBookmarks(merged) {
  const bookmarks = [];
  const deleteCount = [...merged.values()].filter(b => b.action === 'delete').length;
  Logger.info('[PrepareGist] Total merged:', merged.size, 'To delete:', deleteCount);
  
  for (const [key, bm] of merged) {
    const parentTitle = normalizeParentTitle(bm.parentTitle);
    
    if (bm.action === 'upload' || bm.action === 'keep' || bm.action === 'create') {
      bookmarks.push({
        id: key,
        title: bm.title,
        url: bm.url,
        dateAdded: bm.dateAdded,
        dateModified: bm.dateModified,
        parentTitle: parentTitle,
        deleted: false
      });
    } else if (bm.action === 'delete') {
      bookmarks.push({
        id: key,
        title: bm.title,
        url: bm.url,
        dateAdded: bm.dateAdded,
        dateModified: Date.now(),
        parentTitle: parentTitle,
        deleted: true
      });
    }
  }
  
  return bookmarks;
}

// ============================================
// Funções da API GitHub
// ============================================

async function getMockConfig() {
  const config = await chrome.storage.local.get(['useMockServer', 'mockServerUrl']);
  return config;
}

async function fetchGist(token, gistId) {
  const mockConfig = await getMockConfig();
  
  if (mockConfig.useMockServer && mockConfig.mockServerUrl) {
    Logger.info('[Mock] Fetching from mock server');
    try {
      const response = await fetch(`${mockConfig.mockServerUrl}/gists/${gistId}`);
      if (response.status === 404) {
        await chrome.storage.local.set({ gistExists: false });
        return getDefaultGistData();
      }
      await chrome.storage.local.set({ gistExists: true });
      const gist = await response.json();
      const file = gist.files[FILE_NAME];
      if (!file || !file.content || file.content.trim() === '') {
        return getDefaultGistData();
      }
      try {
        return JSON.parse(file.content);
      } catch (e) {
        return getDefaultGistData();
      }
    } catch (e) {
      Logger.error('[Mock] Error fetching from mock server:', e);
      throw new Error('Mock server unavailable. Execute "node mock-server.js"');
    }
  }
  
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (response.status === 404) {
    await chrome.storage.local.set({ gistExists: false });
    return getDefaultGistData();
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
    return getDefaultGistData();
  }

  try {
    return JSON.parse(file.content);
  } catch (e) {
    return getDefaultGistData();
  }
}

async function updateGist(token, gistId, data) {
  const mockConfig = await getMockConfig();
  const config = await chrome.storage.local.get('gistExists');
  const gistExists = config.gistExists !== false;
  
  if (mockConfig.useMockServer && mockConfig.mockServerUrl) {
    Logger.info('[Mock] Updating mock server');
    try {
      const method = gistExists ? 'PATCH' : 'POST';
      const url = gistExists 
        ? `${mockConfig.mockServerUrl}/gists/${gistId}`
        : `${mockConfig.mockServerUrl}/gists`;
      
      const body = JSON.stringify({
        description: 'Bookmark Sync - Mock Server',
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
          'Content-Type': 'application/json'
        },
        body
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Mock server error');
      }
      
      await chrome.storage.local.set({ gistExists: true });
      return response.json();
    } catch (e) {
      Logger.error('[Mock] Error updating mock server:', e);
      throw new Error('Mock server unavailable. Execute "node mock-server.js"');
    }
  }
  
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

async function fetchDebugGist(token, gistId) {
  const mockConfig = await getMockConfig();
  
  if (mockConfig.useMockServer && mockConfig.mockServerUrl) {
    try {
      const response = await fetch(`${mockConfig.mockServerUrl}/gists/${gistId}`);
      if (response.status === 404) {
        return { logs: [] };
      }
      const gist = await response.json();
      const file = gist.files[DEBUG_FILE_NAME];
      if (!file || !file.content || file.content.trim() === '') {
        return { logs: [] };
      }
      try {
        return JSON.parse(file.content);
      } catch (e) {
        return { logs: [] };
      }
    } catch (e) {
      Logger.error('[Debug] Error fetching debug gist:', e);
      return { logs: [] };
    }
  }
  
  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.status === 404) {
      return { logs: [] };
    }
    
    const gist = await response.json();
    const file = gist.files[DEBUG_FILE_NAME];
    
    if (!file || !file.content || file.content.trim() === '') {
      return { logs: [] };
    }
    
    return JSON.parse(file.content);
  } catch (e) {
    Logger.error('[Debug] Error fetching debug gist:', e);
    return { logs: [] };
  }
}

async function updateDebugGist(token, gistId, debugData) {
  const mockConfig = await getMockConfig();
  const config = await chrome.storage.local.get('gistExists');
  const gistExists = config.gistExists !== false;
  
  if (mockConfig.useMockServer && mockConfig.mockServerUrl) {
    try {
      let currentData = { version: 3, lastSync: 0, lastSyncBy: null, devices: {}, bookmarks: [], deletedBookmarks: {} };
      
      if (gistExists) {
        try {
          const response = await fetch(`${mockConfig.mockServerUrl}/gists/${gistId}`);
          if (response.ok) {
            const gist = await response.json();
            const file = gist.files[FILE_NAME];
            if (file && file.content) {
              try {
                currentData = JSON.parse(file.content);
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
      
      const method = gistExists ? 'PATCH' : 'POST';
      const url = gistExists 
        ? `${mockConfig.mockServerUrl}/gists/${gistId}`
        : `${mockConfig.mockServerUrl}/gists`;
      
      const body = JSON.stringify({
        description: 'Bookmark Sync - Debug Logs',
        public: false,
        files: {
          [FILE_NAME]: {
            content: JSON.stringify(currentData, null, 2)
          },
          [DEBUG_FILE_NAME]: {
            content: JSON.stringify(debugData, null, 2)
          }
        }
      });
      
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body
      });
      return;
    } catch (e) {
      Logger.error('[Debug] Error updating debug gist:', e);
    }
  }
  
  try {
    let currentData = { version: 3, lastSync: 0, lastSyncBy: null, devices: {}, bookmarks: [], deletedBookmarks: {} };
    
    if (gistExists) {
      try {
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
          headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (response.ok) {
          const gist = await response.json();
          const file = gist.files[FILE_NAME];
          if (file && file.content) {
            try {
              currentData = JSON.parse(file.content);
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
    
    const method = gistExists ? 'PATCH' : 'POST';
    const url = gistExists 
      ? `https://api.github.com/gists/${gistId}`
      : 'https://api.github.com/gists';
    
    const body = JSON.stringify({
      description: 'Bookmark Sync - Debug Logs',
      public: false,
      files: {
        [FILE_NAME]: {
          content: JSON.stringify(currentData, null, 2)
        },
        [DEBUG_FILE_NAME]: {
          content: JSON.stringify(debugData, null, 2)
        }
      }
    });
    
    await fetch(url, {
      method,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body
    });
  } catch (e) {
    Logger.error('[Debug] Error updating debug gist:', e);
  }
}

async function saveSyncLog(data) {
  const config = await chrome.storage.local.get(['githubToken', 'gistId', 'useMockServer', 'mockServerUrl']);
  
  if (!config.gistId) {
    if (config.useMockServer) {
      config.gistId = 'mock-test-gist';
    } else {
      Logger.info('[Debug] No gistId configured, skipping debug log');
      return;
    }
  }
  
  try {
    const debugData = await fetchDebugGist(config.githubToken || '', config.gistId);
    
    if (!debugData.logs) {
      debugData.logs = [];
    }
    
    debugData.logs.unshift(data);
    
    if (debugData.logs.length > MAX_DEBUG_LOGS) {
      debugData.logs = debugData.logs.slice(0, MAX_DEBUG_LOGS);
    }
    
    await updateDebugGist(config.githubToken || '', config.gistId, debugData);
    Logger.info('[Debug] Sync log saved');
  } catch (e) {
    Logger.error('[Debug] Error saving sync log:', e);
  }
}

// ============================================
// Função Principal de Sincronização
// ============================================

async function handleSync(isAutoSync = false) {
  if (isSyncing) {
    Logger.info('[Sync] Já está sincronizando, ignorando...');
    return;
  }

  const config = await chrome.storage.local.get(['githubToken', 'gistId', 'autoSync', 'useMockServer', 'mockServerUrl']);
  Logger.info('[Sync] Config:', config);
  
  if (config.useMockServer && config.mockServerUrl) {
    Logger.info('[Sync] Modo MOCK ativado:', config.mockServerUrl);
  }
  
  const isMockMode = config.useMockServer && config.mockServerUrl;
  
  if (!isMockMode && (!config.githubToken || !config.gistId)) {
    Logger.info('[Sync] Configuração incompleta');
    if (!isAutoSync) throw new Error('Configure o Token e Gist ID nas opções.');
    return;
  }
  
  if (isMockMode && !config.mockServerUrl) {
    Logger.info('[Sync] Configuração de mock incompleta');
    if (!isAutoSync) throw new Error('Configure a URL do Servidor Mock nas opções.');
    return;
  }
  
  if (isMockMode && !config.gistId) {
    Logger.info('[Sync] Usando modo mock - definindo Gist ID padrão');
    config.gistId = 'mock-test-gist';
    await chrome.storage.local.set({ gistId: config.gistId });
  }

  isSyncing = true;
  const syncStartTime = Date.now();
  Logger.info('[Sync] Iniciando sincronização bidirecional...');

  try {
    const deviceId = await getDeviceId();
    const deviceName = await getDeviceName();
    
    // 1. Carregar favoritos locais
    const localTree = await chrome.bookmarks.getTree();
    const localMap = buildLocalBookmarkMap(localTree);
    const localTimestamp = await getLocalTimestamp();
    
    Logger.info(`[Sync] Locais: ${localMap.size} favoritos`);
    
    // 2. Carregar favoritos do Gist
    const gistData = await fetchGist(config.githubToken, config.gistId);
    const gistMap = buildGistBookmarkMap(gistData.bookmarks);
    const gistTimestamp = gistData.lastSync || 0;
    
    Logger.info(`[Sync] Gist: ${gistMap.size} favoritos, lastSync: ${gistTimestamp}, lastSyncBy: ${gistData.lastSyncBy}`);
    
    // 3. Verificar se este dispositivo já syncou
    const myLastSync = gistData.devices?.[deviceId]?.lastSync || 0;
    Logger.info(`[Sync] Meu último sync: ${myLastSync}`);
    
    // 4. Obter favoritos deletados localmente E do Gist
    const localDeletedBookmarks = await getDeletedBookmarks();
    const gistDeletedBookmarks = gistData.deletedBookmarks || {};
    
    // Mesclar: locais têm preferência sobre os do Gist
    const allDeletedBookmarks = { ...gistDeletedBookmarks, ...localDeletedBookmarks };
    Logger.info(`[Sync] Favoritos deletados (local):`, Object.keys(localDeletedBookmarks));
    Logger.info(`[Sync] Favoritos deletados (Gist):`, Object.keys(gistDeletedBookmarks));
    Logger.info(`[Sync] Todos deletados:`, Object.keys(allDeletedBookmarks));
    
    // 5. Fazer merge
    const merged = mergeBookmarks(localMap, gistMap, allDeletedBookmarks, myLastSync);
    
    // Separar ações
    const toCreate = [...merged.values()].filter(b => b.action === 'create');
    const toDelete = [...merged.values()].filter(b => b.action === 'delete');
    const toUpload = [...merged.values()].filter(b => b.action === 'upload');
    const toKeep = [...merged.values()].filter(b => b.action === 'keep');
    
    Logger.info(`[Sync] Merge: ${toCreate.length} criar, ${toDelete.length} deletar, ${toUpload.length} enviar, ${toKeep.length} manter`);
    
    // 5. Limpar pastas duplicadas antes de executar merge
    const cleanedCount = await cleanDuplicateFolders();
    if (cleanedCount > 0) {
      Logger.info(`[Sync] Limpas ${cleanedCount} pastas duplicadas`);
    }
    
    // 6. Executar mudanças no local
    const folderMap = await buildFolderMap();
    const localResult = await executeLocalMerge(merged, folderMap);
    
    // 6. Atualizar Gist
    const bookmarksToSave = prepareGistBookmarks(merged);
    const deletedBookmarksToSave = await getDeletedBookmarks();
    Logger.info(`[Sync] Salvando ${bookmarksToSave.length} bookmarks e ${Object.keys(deletedBookmarksToSave).length} deletados no Gist`);
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
      bookmarks: bookmarksToSave,
      deletedBookmarks: deletedBookmarksToSave
    });
    
    // 7. Salvar lastSync local
    await chrome.storage.local.set({ lastSync: now });
    
    // 8. Salvar log de debug
    const syncDuration = Date.now() - syncStartTime;
    
    // Incluir estrutura local e do Gist para debug (limitado a 50 items cada)
    const localStructure = [...localMap.values()].slice(0, 50).map(b => ({
      key: b.key,
      title: b.title,
      url: b.url,
      parentTitle: b.parentTitle,
      dateModified: b.dateModified
    }));
    const gistStructure = [...gistMap.values()].slice(0, 50).map(b => ({
      key: b.key,
      title: b.title,
      url: b.url,
      parentTitle: b.parentTitle,
      deleted: b.deleted,
      dateModified: b.dateModified
    }));
    
    await saveSyncLog({
      timestamp: now,
      deviceId: deviceId,
      deviceName: deviceName,
      localCount: localMap.size,
      gistCount: gistMap.size,
      deletedLocal: Object.keys(localDeletedBookmarks).length,
      deletedGist: Object.keys(gistDeletedBookmarks).length,
      merged: {
        create: toCreate.length,
        delete: toDelete.length,
        upload: toUpload.length,
        keep: toKeep.length
      },
      result: localResult,
      duration: syncDuration,
      localStructure,
      gistStructure
    });
    
    Logger.info('[Sync] Concluído!', localResult);
    
    // 9. Notificação se sync automático e houve mudanças
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
    Logger.error('[Sync] Erro:', error.message);
    if (!isAutoSync) throw error;
  } finally {
    isSyncing = false;
  }
}

Logger.info('[Background] Service Worker iniciado!');
