const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'test-data', 'bookmarks.json');
const DEBUG_FILE = path.join(__dirname, 'test-data', 'sync-debug.json');

function loadDebugData() {
  try {
    if (fs.existsSync(DEBUG_FILE)) {
      const content = fs.readFileSync(DEBUG_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error loading debug data:', e);
  }
  return { logs: [] };
}

function saveDebugData(data) {
  try {
    fs.writeFileSync(DEBUG_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving debug data:', e);
    return false;
  }
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return { version: 3, lastSync: 0, lastSyncBy: null, devices: {}, bookmarks: [] };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving data:', e);
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

  console.log(`[${req.method}] ${req.url}`);

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
          console.error('Error parsing content:', e);
        }
      }
      
      const debugFile = requestBody.files['sync-debug.json'];
      if (debugFile && debugFile.content) {
        try {
          Object.assign(debugData, JSON.parse(debugFile.content));
        } catch (e) {
          console.error('Error parsing debug content:', e);
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
          console.error('Error parsing content:', e);
        }
      }
      
      const debugFile = requestBody.files['sync-debug.json'];
      if (debugFile && debugFile.content) {
        try {
          Object.assign(debugData, JSON.parse(debugFile.content));
        } catch (e) {
          console.error('Error parsing debug content:', e);
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Test data loaded' }));
      } catch (e) {
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

  if (req.url === '/debug' && req.method === 'GET') {
    const debugData = loadDebugData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(debugData));
    return;
  }

  if (req.url === '/debug/clear' && req.method === 'POST') {
    saveDebugData({ logs: [] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Debug logs cleared' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Mock Gist Server running on http://localhost:${PORT}`);
  console.log(`========================================`);
  console.log(`Endpoints:`);
  console.log(`  GET  /gists/:id     - Get gist data`);
  console.log(`  POST /gists         - Create new gist`);
  console.log(`  PATCH /gists/:id    - Update gist`);
  console.log(`  GET  /data          - View current data`);
  console.log(`  GET  /debug         - View debug logs`);
  console.log(`  POST /debug/clear   - Clear debug logs`);
  console.log(`  POST /reset         - Reset to empty state`);
  console.log(`  POST /load          - Load test data (JSON in body)`);
  console.log(`========================================`);
});
