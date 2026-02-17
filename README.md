# GitHub Gist Bookmark Sync

Extensão para navegadores Chromium (Manifest V3) que sincroniza favoritos bidirecionalmente usando um GitHub Gist privado como banco de dados.

## ✨ Funcionalidades

- **Sincronização Bidirecional** - Mantém favoritos sincronizados entre múltiplos dispositivos
- **Algoritmo Dogear** - Resolve conflitos automaticamente baseado em timestamps
- **Modo Mock** - Teste local sem precisar de conta GitHub
- **Logging Estruturado** - Logs em TXT (legível) e JSON (programático)
- **Cleanup Automático** - Remove pastas duplicadas durante sincronização
- **Rastreamento de Deleções** - Soft delete com possibilidade de recuperação

## 🚀 Instalação

### Opção 1: Modo Mock (Teste Local)

Ideal para testar a extensão sem precisar de conta GitHub:

```bash
# Iniciar servidor mock
node mock-server.js

# O servidor rodará em http://localhost:3000
```

Na página de configurações da extensão:
1. Ative **"Usar servidor mock"**
2. URL do servidor: `http://localhost:3000`
3. Clique em **Salvar Configurações**

### Opção 2: GitHub Gist (Produção)

#### 1. Criar um Gist Privado

1. Acesse [gist.github.com](https://gist.github.com)
2. Crie um novo Gist **secreto** (private)
3. Nome do arquivo: `bookmarks.json`
4. Conteúdo inicial: `{}`
5. Copie o **Gist ID** da URL (última parte)

#### 2. Criar GitHub Personal Access Token (PAT)

1. Acesse [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Generate new token (classic)
3. Escopo necessário: `gist`
4. Copie o token gerado

#### 3. Configurar Extensão

1. Clique no ícone da extensão → **Configurações**
2. Desative **"Usar servidor mock"**
3. Cole seu **GitHub PAT**
4. Cole seu **Gist ID**
5. Clique em **Salvar Configurações**
6. Use **Testar Conexão** para verificar

## 📖 Como Usar

### Carregar a Extensão

1. Abra `brave://extensions` (ou `chrome://extensions`)
2. Ative o **Modo de desenvolvedor** (canto superior direito)
3. Clique em **Carregar expandida**
4. Selecione a pasta do projeto

### Sincronização

**Automática:**
- Detecta mudanças em favoritos automaticamente
- Sincroniza após 2 segundos de inatividade
- Executa na inicialização do navegador (se ativado)

**Manual:**
- Clique no ícone da extensão → **Sincronizar Agora**

### Visualizar Logs

**Via API do servidor mock:**
```bash
# Logs em formato TXT (legível)
curl http://localhost:3000/logs/txt

# Logs em formato JSON
curl http://localhost:3000/logs

# Limpar logs
curl -X POST http://localhost:3000/logs/clear
```

**Arquivos locais:**
- `logs/app.log` - Formato texto legível
- `logs/app.json` - Formato JSON estruturado
- `test-data/sync-debug.json` - Debug detalhado do último sync

## 🔄 Como Funciona

### Algoritmo de Merge (Baseado no Dogear)

A sincronização usa um algoritmo sofisticado para resolver conflitos:

```
1. Carrega favoritos locais e do Gist
2. Carrega lista de deletados (tombstones)
3. Para cada favorito, aplica regras:
   
   Se existe nos dois lados:
   - Mantém versão mais recente (por timestamp)
   
   Se deletado em um lado:
   - Deleta no outro lado também
   - Se foi modificado depois da deleção → REVIVE
   
   Se existe só no Gist:
   - Cria localmente
   
   Se existe só localmente:
   - Envia para o Gist

4. Limpa pastas duplicadas automaticamente
5. Executa mudanças em batch
```

### Estrutura de Dados

**bookmarks.json (Gist):**
```json
{
  "version": 3,
  "lastSync": 1771208594168,
  "lastSyncBy": "device_xxx",
  "devices": {
    "device_xxx": {
      "name": "Chrome (Linux)",
      "lastSync": 1771208594168
    }
  },
  "bookmarks": [
    {
      "id": "bm_xxx",
      "title": "Example",
      "url": "https://example.com",
      "parentTitle": "Pasta",
      "dateAdded": 1234567890,
      "dateModified": 1234567890,
      "deleted": false
    }
  ],
  "deletedBookmarks": {
    "bm_xxx": {
      "deletedAt": 1234567890,
      "title": "Example",
      "url": "https://example.com"
    }
  }
}
```

## 🛠️ Desenvolvimento

### Arquivos Principais

```
sync-browser/
├── manifest.json          # Manifesto MV3
├── background.js          # Service Worker + lógica de sync
├── popup.html/js          # Interface de sync manual
├── options.html/js        # Configurações
├── logger.js              # Sistema de logging
├── mock-server.js         # Servidor mock para testes
├── test-data/             # Dados de teste
│   ├── bookmarks.json
│   └── sync-debug.json
├── logs/                  # Logs gerados
│   ├── app.log
│   └── app.json
└── icons/                 # Ícones da extensão
```

### Comandos Úteis

```bash
# Iniciar servidor mock
node mock-server.js

# Resetar dados de teste
curl -X POST http://localhost:3000/reset

# Ver logs em tempo real
tail -f logs/app.log
```

## 🔧 Debug

### Console do Service Worker

1. Abra `brave://extensions`
2. Ative o **Modo de desenvolvedor**
3. Clique em **Inspecionar visualização de fundo** (Service Worker)
4. Use o console para ver logs em tempo real

### Logs Estruturados

O sistema de logging salva automaticamente:
- Operações de sync (criar, deletar, upload, manter)
- Estrutura local e do Gist
- Duração do sync
- Erros e exceções

Exemplo de log:
```
15/02/2026, 23:47:51 | INFO  | [Sync] Merge: 15 criar, 0 deletar, 2 enviar, 333 manter
15/02/2026, 23:47:51 | INFO  | [Clean] Limpas 2 pastas duplicadas
15/02/2026, 23:47:51 | INFO  | [Sync] Concluído! created: 15, deleted: 0
```

## ⚠️ Limitações

- **Rate Limit GitHub**: 60 req/hora não autenticado, 5000 autenticado
- **Tamanho do Gist**: Máximo 100MB por arquivo
- **Navegadores**: Apenas Chromium (Chrome, Brave, Edge, etc.)

## 🔐 Segurança

- Token GitHub salvo em `chrome.storage.local` (escopo da extensão)
- Gist deve ser **secreto** (private) para não ser público
- Comunicação HTTPS com GitHub API
- Em modo MOCK, dados ficam apenas localmente

## 📝 Changelog

### v1.0.0
- Sincronização bidirecional completa
- Algoritmo de merge baseado em Dogear
- Sistema de logging TXT + JSON
- Mock server para testes
- Cleanup automático de pastas duplicadas
- Rastreamento de deleções (soft delete)

## 🤝 Contribuição

Sinta-se à vontade para abrir issues e pull requests!

## 📄 Licença

MIT
