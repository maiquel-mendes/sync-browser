# GitHub Gist Bookmark Sync

Extensão para navegadores Chromium (Manifest V3) que sincroniza favoritos bidirecionalmente usando um GitHub Gist privado como banco de dados.

## 🚀 Instalação

### 1. Criar um Gist Privado

1. Acesse [gist.github.com](https://gist.github.com)
2. Crie um novo Gist **secreto** (private)
3. Nome do arquivo: `bookmarks.json`
4. Conteúdo inicial: `{}`
5. Copie o **Gist ID** da URL (última parte)

### 2. Criar GitHub Personal Access Token (PAT)

1. Acesse [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Generate new token (classic)
3. Escopo necessário: `gist`
4. Copie o token gerado

### 3. Carregar a Extensão no Brave/Chrome

1. Abra `brave://extensions` (ou `chrome://extensions`)
2. Ative o **Modo de desenvolvedor** (canto superior direito)
3. Clique em **Carregar expandida**
4. Selecione a pasta onde estão os arquivos

## 📖 Configuração

1. Clique no ícone da extensão → **Configurações**
2. Cole seu **GitHub PAT**
3. Cole seu **Gist ID**
4. Clique em **Salvar Configurações**
5. Use **Testar Conexão** para verificar

## 🔄 Como Funciona

### Sincronização Automática
- A extensão detecta mudanças em favoritos (criação, remoção, edição, movimento)
- Após 2 segundos de inatividade, inicia o sync
- Usa **timestamp** para resolver conflitos (versão mais recente prevalece)

### Sincronização Manual
- Clique no ícone da extensão → **Sincronizar Agora**

### Fluxo de Dados
```
1. Ler favoritos locais (chrome.bookmarks.getTree)
2. Comparar timestamp local vs Gist
3. Se local mais novo → atualizar Gist (PATCH API)
4. Se Gist mais novo → restaurar favoritos locally
```

## 🎯 Prevenção de Loop Infinito

A extensão usa uma flag `isSyncing` para evitar loops:
- Quando está sincronizando, ignora eventos de mudança
- Evita que uma mudança vinda do Gist dispare um novo upload

## 🔧 Debug

1. Abra `brave://extensions`
2. Ative o **Modo de desenvolvedor**
3. Clique em **Inspecionar visualização de fundo** (Service Worker)
4. Use o console para ver logs

## 📁 Estrutura de Arquivos

```
sync-browser/
├── manifest.json      # Manifesto MV3
├── background.js     # Service Worker + lógica de sync
├── popup.html/js     # Interface de sync manual
├── options.html/js   # Configurações (PAT + Gist ID)
└── icons/            # Ícones da extensão
```

## ⚠️ Limitações

- **Uma via**: Sincroniza TODOS os favoritos (não suporta pastas específicas)
- **Sobrescrita**: Ao restaurar do Gist, APAGA favoritos locais primeiro
- **Rate Limit**: GitHub API tem limites (60 req/hora para não autenticado)

## 🔐 Segurança

- Token salvo em `chrome.storage.local` (escopo da extensão)
- **NUNCA** faça commit do token no código
- Para produção, considere criptografar o token
