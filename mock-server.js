const http = require('http');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'test-data', 'bookmarks.json');
const DEBUG_FILE = path.join(__dirname, 'test-data', 'sync-debug.json');

function loadDebugData() {
  try {
    if (fs.existsSync(DEBUG_FILE)) {
      return JSON.parse(fs.readFileSync(DEBUG_FILE, 'utf8'));
    }
  } catch (e) {
    Logger.error('Error loading debug data', e.message);
  }
  return { logs: [] };
}

function saveDebugData(data) {
  try {
    fs.writeFileSync(DEBUG_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    Logger.error('Error saving debug data', e.message);
    return false;
  }
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    Logger.error('Error loading data', e.message);
  }
  return { version: 3, lastSync: 0, lastSyncBy: null, devices: {}, bookmarks: [] };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    Logger.error('Error saving data', e.message);
    return false;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  Logger.debug(`${req.method} ${req.url}`, 'HTTP');

  const urlParts = req.url.split('/').filter(Boolean);
  
  if (req.url === '/gists' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = loadData();
      const debugData = loadDebugData();
      const gistId = 'mock-gist-' + Date.now();
      const requestBody = JSON.parse(body);
      
      const bookmarksFile = requestBody.files['bookmarks.json'];
      if (bookmarksFile && bookmarksFile.content) {
        try {
          Object.assign(data, JSON.parse(bookmarksFile.content));
        } catch (e) {
          Logger.error('Error parsing content', e.message);
        }
      }
      
      const debugFile = requestBody.files['sync-debug.json'];
      if (debugFile && debugFile.content) {
        try {
          Object.assign(debugData, JSON.parse(debugFile.content));
        } catch (e) {
          Logger.error('Error parsing debug content', e.message);
        }
      }
      
      saveData(data);
      saveDebugData(debugData);
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: gistId,
        files: {
          'bookmarks.json': { content: JSON.stringify(data, null, 2) },
          'sync-debug.json': { content: JSON.stringify(debugData, null, 2) }
        }
      }));
    });
    return;
  }

  if (urlParts[0] === 'gists' && req.method === 'GET') {
    const gistId = urlParts[1];
    const data = loadData();
    const debugData = loadDebugData();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: gistId,
      files: {
        'bookmarks.json': { content: JSON.stringify(data, null, 2) },
        'sync-debug.json': { content: JSON.stringify(debugData, null, 2) }
      }
    }));
    return;
  }

  if (urlParts[0] === 'gists' && req.method === 'PATCH') {
    const gistId = urlParts[1];
    let body = '';
    
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = loadData();
      const debugData = loadDebugData();
      const requestBody = JSON.parse(body);
      
      const bookmarksFile = requestBody.files['bookmarks.json'];
      if (bookmarksFile && bookmarksFile.content) {
        try {
          Object.assign(data, JSON.parse(bookmarksFile.content));
        } catch (e) {
          Logger.error('Error parsing content', e.message);
        }
      }
      
      const debugFile = requestBody.files['sync-debug.json'];
      if (debugFile && debugFile.content) {
        try {
          Object.assign(debugData, JSON.parse(debugFile.content));
        } catch (e) {
          Logger.error('Error parsing debug content', e.message);
        }
      }
      
      saveData(data);
      saveDebugData(debugData);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: gistId,
        files: {
          'bookmarks.json': { content: JSON.stringify(data, null, 2) },
          'sync-debug.json': { content: JSON.stringify(debugData, null, 2) }
        }
      }));
    });
    return;
  }

  if (req.url === '/reset' && req.method === 'POST') {
    const initialData = {
      version: 3,
      lastSync: 0,
      lastSyncBy: null,
      devices: {},
      bookmarks: []
    };
    const initialDebugData = { logs: [] };
    saveData(initialData);
    saveDebugData(initialDebugData);
    Logger.info('Data reset to initial state', 'MOCK');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Data reset to initial state' }));
    return;
  }

  if (req.url === '/load' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const testData = JSON.parse(body);
        saveData(testData);
        Logger.info('Test data loaded', 'MOCK');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Test data loaded' }));
      } catch (e) {
        Logger.error('Error loading test data', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  if (req.url === '/data' && req.method === 'GET') {
    const data = loadData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.url === '/logs' && req.method === 'GET') {
    const limit = parseInt(urlParts[1]) || 100;
    const logs = Logger.getLogs(limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ logs }));
    return;
  }

  if (req.url === '/logs/txt' && req.method === 'GET') {
    const logPath = path.join(__dirname, 'logs', 'app.log');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No logs yet');
    }
    return;
  }

  if (req.url === '/logs' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { level, message, context } = JSON.parse(body);
        Logger.write(level, message, context);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        Logger.error('Error receiving log', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  if (req.url === '/logs/clear' && req.method === 'POST') {
    Logger.clear();
    Logger.info('Logs cleared', 'MOCK');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  Logger.info(`Mock server running on http://localhost:${PORT}`, 'SERVER');
  // eslint-disable-next-line no-console
  console.log(`Mock server running on http://localhost:${PORT}`);
});
