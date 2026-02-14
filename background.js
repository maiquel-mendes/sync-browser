// ============================================
// GitHub Gist Bookmark Sync - Background Service Worker
// Manifest V3
// ============================================

let isSyncing = false;

const FILE_NAME = 'bookmarks.json';

// ============================================
// Message Handler (recebe comandos do popup)
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sync') {
    handleSync()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Indica resposta assíncrona
  }
});

// ============================================
// Bookmark Event Listeners
// ============================================

chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  console.log('[Bookmark] Criado:', bookmark.title);
  if (!isSyncing) {
    debouncedSync();
  }
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  console.log('[Bookmark] Removido:', removeInfo.node.title);
  if (!isSyncing) {
    debouncedSync();
  }
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  console.log('[Bookmark] Alterado:', changeInfo.title);
  if (!isSyncing) {
    debouncedSync();
  }
});

chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  console.log('[Bookmark] Movido:', moveInfo.node.title);
  if (!isSyncing) {
    debouncedSync();
  }
});

// ============================================
// Debounce para evitar múltiplos sync rápidos
// ============================================

let syncTimeout = null;
function debouncedSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    handleSync();
  }, 2000); // Espera 2 segundos após última mudança
}

// ============================================
// Função Principal de Sincronização
// ============================================

async function handleSync() {
  if (isSyncing) {
    console.log('[Sync] Ja esta em andamento, ignorando...');
    return;
  }

  const config = await chrome.storage.local.get(['githubToken', 'gistId']);
  if (!config.githubToken || !config.gistId) {
    throw new Error('Configuracao incompleta. Configure o Token e Gist ID.');
  }

  isSyncing = true;
  console.log('[Sync] Iniciando sincronizacao...');

  try {
    // 1. Ler favoritos locais
    const localBookmarks = await chrome.bookmarks.getTree();
    const localData = simplifyBookmarks(localBookmarks);
    const localTimestamp = Date.now();

    // 2. Buscar Gist
    const gistData = await fetchGist(config.githubToken, config.gistId);

    if (!gistData) {
      // Gist vazio - criar novo
      console.log('[Sync] Gist vazio, criando...');
      await updateGist(config.githubToken, config.gistId, {
        version: 2,
        lastSync: localTimestamp,
        bookmarks: localData
      });
    } else {
      // 3. Comparar timestamps
      const gistTimestamp = gistData.lastSync || 0;
      
      console.log(`[Sync] Local: ${localTimestamp}, Gist: ${gistTimestamp}`);

      if (localTimestamp > gistTimestamp) {
        // Local mais recente - subir para Gist
        console.log('[Sync] Subindo mudancas locais para Gist...');
        await updateGist(config.githubToken, config.gistId, {
          version: 2,
          lastSync: localTimestamp,
          bookmarks: localData
        });
      } else if (gistTimestamp > localTimestamp) {
        // Gist mais recente - baixar para local
        console.log('[Sync] Gist mais recente, baixando...');
        await restoreBookmarks(gistData.bookmarks);
      } else {
        console.log('[Sync] Ja sincronizados.');
      }
    }

    // 4. Atualizar ultimo sync
    await chrome.storage.local.set({ lastSync: Date.now() });
    console.log('[Sync] Sincronizacao concluida!');

  } catch (error) {
    console.error('[Sync] Erro:', error.message);
    throw error;
  } finally {
    isSyncing = false;
  }
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
    return null;
  }

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Erro ao buscar Gist');
  }

  const gist = await response.json();
  const file = gist.files[FILE_NAME];
  
  if (!file || !file.content) {
    return null;
  }

  return JSON.parse(file.content);
}

async function updateGist(token, gistId, data) {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: 'Bookmark Sync - Updated by GitHub Gist Bookmark Sync Extension',
      files: {
        [FILE_NAME]: {
          content: JSON.stringify(data, null, 2)
        }
      }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Erro ao atualizar Gist');
  }

  return response.json();
}

// ============================================
// Funções de Conversão e Restauração
// ============================================

function simplifyBookmarks(tree) {
  // Converte a árvore de favoritos em formato simplificado
  // Preserva ID, title, url, e children
  function processNode(node) {
    const result = {
      id: node.id,
      title: node.title || 'Sem Titulo',
      dateAdded: node.dateAdded
    };
    
    if (node.url) {
      result.url = node.url;
    }
    
    if (node.children && node.children.length > 0) {
      result.children = node.children.map(processNode);
    }
    
    return result;
  }
  
  // Pegamos apenas a pasta Bookmarks Bar e Other Bookmarks
  // ou a raiz completa dependendo da preferência
  return tree.map(processNode);
}

async function restoreBookmarks(simplifiedData) {
  if (!simplifiedData || !Array.isArray(simplifiedData)) {
    console.warn('[Restore] Dados invalidos');
    return;
  }

  // Primeiro,.remove todos os favoritos existentes (exceto pastas do sistema)
  const existing = await chrome.bookmarks.getTree();
  
  // Marca que estamos sincronizando para evitar loop
  await chrome.storage.local.set({ isRestoring: true });

  // Remove todos os favoritos (cuidado: isso remove tudo!)
  for (const node of existing) {
    if (node.children) {
      for (const child of node.children) {
        try {
          await chrome.bookmarks.removeTree(child.id);
        } catch (e) {
          console.log('[Restore] Erro ao remover:', e.message);
        }
      }
    }
  }

  // Restaura favoritos do Gist
  for (const node of simplifiedData) {
    await restoreNode(node, null);
  }

  // Remove flag de restauração
  await chrome.storage.local.set({ isRestoring: false });
  console.log('[Restore] Favoritos restaurados do Gist!');
}

async function restoreNode(node, parentId) {
  let createdNode;
  
  try {
    if (node.url) {
      // É um favorito
      createdNode = await chrome.bookmarks.create({
        parentId: parentId || undefined,
        title: node.title,
        url: node.url
      });
    } else {
      // É uma pasta
      createdNode = await chrome.bookmarks.create({
        parentId: parentId || undefined,
        title: node.title
      });
    }
  } catch (error) {
    console.error('[Restore] Erro ao criar:', node.title, error.message);
    return null;
  }

  // Processa filhos recursivamente
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      await restoreNode(child, createdNode.id);
    }
  }

  return createdNode;
}

console.log('[Background] Service Worker iniciado!');
