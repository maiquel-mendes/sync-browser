// ============================================
// GitHub Gist Bookmark Sync - Background Service Worker
// Sincronização Granular (Manifest V3)
// ============================================

let isSyncing = false;
let isRestoring = false;
const FILE_NAME = 'bookmarks.json';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Mensagem recebida:', message);
  if (message.action === 'sync') {
    handleSync()
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
    setTimeout(() => handleSync(false), 3000);
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Browser] Navegador iniciou, sync em 5s...');
  setTimeout(() => handleSync(true), 5000);
});

chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (!isSyncing && !isRestoring) {
    debouncedSync();
  }
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  if (!isSyncing && !isRestoring) {
    debouncedSync();
  }
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  if (!isSyncing && !isRestoring) {
    debouncedSync();
  }
});

chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  if (!isSyncing && !isRestoring) {
    debouncedSync();
  }
});

let syncTimeout = null;
function debouncedSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => handleSync(false), 2000);
}

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

async function handleSync(isAutoSync = false) {
  if (isSyncing) return;

  const config = await chrome.storage.local.get(['githubToken', 'gistId']);
  console.log('[Sync] Config recuperada no background:', config);
  
  if (!config.githubToken || !config.gistId) {
    if (!isAutoSync) throw new Error('Configure o Token e Gist ID nas opções.');
    return;
  }

  isSyncing = true;
  console.log('[Sync] Iniciando sincronização granular...');

  try {
    const localBookmarks = await chrome.bookmarks.getTree();
    const localFlat = flattenBookmarks(localBookmarks);
    const hasRealBookmarks = localFlat.some(b => b.url);
    const localTimestamp = await getLocalTimestamp();

    const gistData = await fetchGist(config.githubToken, config.gistId);
    const gistBookmarks = gistData?.bookmarks || [];
    const hasGistBookmarks = gistBookmarks.length > 0;
    const gistTimestamp = gistData?.lastSync || 0;

    console.log(`[Sync] Local: ${localTimestamp}, Gist: ${gistTimestamp}, hasRealBookmarks: ${hasRealBookmarks}, GistBookmarks: ${hasGistBookmarks}`);

    let syncResult = { changed: false, imported: 0, exported: 0 };

    // PRIORIDADE 1: Navegador vazio (sem favoritos reais) - sempre importar do Gist
    if (!hasRealBookmarks && hasGistBookmarks) {
      console.log('[Sync] Navegador vazio - importando do Gist...');
      const count = await syncGistToLocal(gistBookmarks, localFlat, gistTimestamp);
      syncResult.imported = count;
      syncResult.changed = true;
      await chrome.storage.local.set({ lastSync: gistTimestamp });
    } 
    // PRIORIDADE 2: Gist mais recente - baixar
    else if (gistTimestamp > localTimestamp) {
      console.log('[Sync] Baixando do Gist...');
      const count = await syncGistToLocal(gistBookmarks, localFlat, gistTimestamp);
      syncResult.imported = count;
      syncResult.changed = true;
      await chrome.storage.local.set({ lastSync: gistTimestamp });
    }
    // PRIORIDADE 3: Local mais recente - subir APENAS se houver favoritos novos
    else if (localTimestamp > gistTimestamp) {
      const newCount = await syncLocalToGist(localBookmarks, gistBookmarks, config.githubToken, config.gistId, localTimestamp);
      if (newCount > 0) {
        syncResult.exported = newCount;
        syncResult.changed = true;
        await chrome.storage.local.set({ lastSync: localTimestamp });
      } else {
        await chrome.storage.local.set({ lastSync: gistTimestamp });
        console.log('[Sync] Sem favoritos novos, mantendo sync com Gist');
      }
    } else {
      console.log('[Sync] Já sincronizados.');
    }

    console.log('[Sync] Concluído!');

    // Mostrar notificação se for sync automático e houve mudanças
    if (isAutoSync && syncResult.changed) {
      let msg = '';
      if (syncResult.imported > 0 && syncResult.exported > 0) {
        msg = `${syncResult.imported} importados, ${syncResult.exported} exportados`;
      } else if (syncResult.imported > 0) {
        msg = `${syncResult.imported} favoritos importados`;
      } else if (syncResult.exported > 0) {
        msg = `${syncResult.exported} favoritos exportados`;
      }
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

function flattenBookmarks(tree, result = [], parentId = null) {
  for (const node of tree) {
    const item = {
      id: node.id,
      parentId: parentId,
      title: node.title || 'Sem Título',
      url: node.url || null,
      dateAdded: node.dateAdded
    };
    result.push(item);
    if (node.children) {
      flattenBookmarks(node.children, result, node.id);
    }
  }
  return result;
}

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

function simplifyTree(nodes, parentTitle = null) {
  const result = [];
  for (const node of nodes) {
    if (node.id === '0' || node.id === '1') {
      // Pular pastas raiz
      if (node.children) {
        result.push(...simplifyTree(node.children, node.title));
      }
      continue;
    }
    
    const item = {
      title: node.title,
      dateAdded: node.dateAdded
    };
    
    if (node.url) {
      item.url = node.url;
    }
    
    if (node.children && node.children.length > 0) {
      item.children = simplifyTree(node.children, node.title);
    }
    
    result.push(item);
  }
  return result;
}

async function syncLocalToGist(localTree, gistTree, token, gistId, timestamp) {
  // Converter árvore local para formato simplificado preservando estrutura
  const simplifiedTree = simplifyTree(localTree);

  await updateGist(token, gistId, {
    version: 2,
    lastSync: timestamp,
    bookmarks: simplifiedTree
  });

  console.log(`[Sync] ${simplifiedTree.length} itens enviados para o Gist`);
  return simplifiedTree.length;
}

async function syncGistToLocal(gistTree, localFlat, syncTimestamp) {
  isRestoring = true;
  console.log('[Sync] syncGistToLocal chamado, timestamp:', syncTimestamp);

  const localMap = new Map();
  for (const b of localFlat) {
    if (b.url) {
      const key = generateBookmarkId(b.url, b.title);
      localMap.set(key, b);
    }
  }

  let created = 0;

  // Criar uma pasta raiz para receber os favoritos sincronizados
  const rootFolder = await chrome.bookmarks.create({
    title: 'Favoritos Sincronizados'
  });
  const parentId = rootFolder.id;
  
  console.log('[Sync] Pasta raiz criada:', parentId);

  async function importNode(nodes, parentId) {
    for (const node of nodes) {
      if (node.url) {
        // É um favorito
        const key = generateBookmarkId(node.url, node.title);
        if (!localMap.has(key)) {
          try {
            await chrome.bookmarks.create({
              parentId: parentId,
              title: node.title,
              url: node.url
            });
            created++;
          } catch (e) {
            console.error('[Sync] Erro ao criar favorito:', e);
          }
        }
      } else if (node.children && node.children.length > 0) {
        // É uma pasta - criar e importar filhos
        try {
          const folder = await chrome.bookmarks.create({
            parentId: parentId,
            title: node.title
          });
          console.log('[Sync] Pasta criada:', node.title);
          await importNode(node.children, folder.id);
        } catch (e) {
          console.error('[Sync] Erro ao criar pasta:', e);
        }
      }
    }
  }

  // Importar a estrutura mantendo hierarquia dentro da pasta raiz
  await importNode(gistTree, parentId);

  isRestoring = false;
  console.log(`[Sync] ${created} favoritos criados`);
  return created;
}

async function fetchGist(token, gistId) {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (response.status === 404) {
    return { version: 2, lastSync: 0, bookmarks: [] };
  }

  if (response.status === 404) {
    return { version: 2, lastSync: 0, bookmarks: [] };
  }

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message);
  }

  gistExists = true;
  const gist = await response.json();
  const file = gist.files[FILE_NAME];
  
  if (!file || !file.content || file.content.trim() === '') {
    return { version: 2, lastSync: 0, bookmarks: [] };
  }

  try {
    return JSON.parse(file.content);
  } catch (e) {
    return { version: 2, lastSync: 0, bookmarks: [] };
  }
}

let gistExists = false;

async function updateGist(token, gistId, data) {
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
  
  gistExists = true;
  return response.json();
}

console.log('[Background] Service Worker iniciado!');
