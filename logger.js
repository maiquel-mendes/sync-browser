const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_TXT_FILE = path.join(LOG_DIR, 'app.log');
const LOG_JSON_FILE = path.join(LOG_DIR, 'app.json');
const MAX_LOG_SIZE = 10 * 1024 * 1024;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getTimestamp() {
  return new Date().toISOString();
}

function formatLogLevel(level) {
  const levels = { DEBUG: 'DEBUG', INFO: 'INFO ', WARN: 'WARN ', ERROR: 'ERRO ' };
  return levels[level] || 'INFO ';
}

function formatTxtMessage(data) {
  const { level, message, context, timestamp } = data;
  const time = new Date(timestamp).toLocaleString('pt-BR');
  const contextStr = context ? ` [${context}]` : '';
  return `${time} | ${formatLogLevel(level)} | ${message}${contextStr}\n`;
}

function readJsonLogs() {
  try {
    if (fs.existsSync(LOG_JSON_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_JSON_FILE, 'utf8'));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error reading JSON logs:', e);
  }
  return { logs: [] };
}

function writeJsonLogs(data) {
  try {
    const jsonData = JSON.stringify(data, null, 2);
    if (Buffer.byteLength(jsonData, 'utf8') > MAX_LOG_SIZE) {
      const trimmed = { ...data, logs: data.logs.slice(-1000) };
      fs.writeFileSync(LOG_JSON_FILE, JSON.stringify(trimmed, null, 2));
    } else {
      fs.writeFileSync(LOG_JSON_FILE, jsonData);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error writing JSON logs:', e);
  }
}

function appendTxtLog(message) {
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_TXT_FILE, message);
    
    const stats = fs.statSync(LOG_TXT_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      const lines = fs.readFileSync(LOG_TXT_FILE, 'utf8').split('\n');
      const trimmed = lines.slice(-1000).join('\n');
      fs.writeFileSync(LOG_TXT_FILE, trimmed + '\n');
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error writing TXT log:', e);
  }
}

const Logger = {
  write(level, message, context = null) {
    const timestamp = getTimestamp();
    const logData = { timestamp, level, message, context };
    
    appendTxtLog(formatLogMessage(logData));
    
    const logs = readJsonLogs();
    logs.logs = logs.logs || [];
    logs.logs.unshift(logData);
    if (logs.logs.length > 1000) {
      logs.logs = logs.logs.slice(0, 1000);
    }
    writeJsonLogs(logs);
  },
  
  debug(message, context = null) {
    this.write('DEBUG', message, context);
  },
  
  info(message, context = null) {
    this.write('INFO', message, context);
  },
  
  warn(message, context = null) {
    this.write('WARN', message, context);
  },
  
  error(message, context = null) {
    this.write('ERROR', message, context);
  },
  
  getLogs(limit = 100) {
    const logs = readJsonLogs();
    return logs.logs ? logs.logs.slice(0, limit) : [];
  },
  
  clear() {
    ensureLogDir();
    if (fs.existsSync(LOG_TXT_FILE)) {
      fs.unlinkSync(LOG_TXT_FILE);
    }
    if (fs.existsSync(LOG_JSON_FILE)) {
      fs.unlinkSync(LOG_JSON_FILE);
    }
  }
};

module.exports = Logger;
